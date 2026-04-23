import * as p from '@clack/prompts'
import type { PackageJson, PnpmWorkspaceYaml } from '@ebdp-script/node-va-utils'
import {
  color,
  findMonorepoRoot,
  getPackages,
  parsePnpmWorkspaceYaml,
  readPackageJSON,
  spinner,
  writePackageJSON,
} from '@ebdp-script/node-va-utils'
import type { CAC } from 'cac'
import consola from 'consola'
import { execa } from 'execa'
import { getPackageInfo } from 'local-pkg'
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { basename, join, resolve } from 'pathe'
import { diffHighlight } from '../diff'
import { cleanSpec, isGreaterThan } from '../version'
import { DEP_TYPES, MAJOR_PACKAGES } from './constants'

interface SyncpackCommandOptions {
  /**
   * The package to sync dependencies.
   */
  package?: string
  /**
   * The dependencies to sync.
   */
  dependencies?: string[]
  /**
   * Whether to install dependencies after syncing.
   * @default true
   */
  install?: string
  /**
   * Whether to dry run.
   * @default false
   */
  dry?: boolean
}

export function defineSyncpackCommand(cac: CAC) {
  cac
    .command('syncpack', 'Sync dependencies specified by a package to resolutions.')
    .option('--package <pkg>', 'The package to sync dependencies.', { default: '@ebdp/bdp-base' })
    .option('--dependencies [...deps]', 'The dependencies to sync.', { default: MAJOR_PACKAGES })
    .option('--install', 'Install dependencies after syncing.', { default: true })
    .option('--dry', 'Dry run.', { default: false })
    .action(async (options: SyncpackCommandOptions) => {
      const {
        package: pkg = '@ebdp/bdp-base',
        dependencies: overrides = MAJOR_PACKAGES,
        install = true,
        dry = false,
      } = options

      spinner({
        successText: `Sync dependencies specified by a package to resolutions.`,
        title: `Syncing dependencies...`,
      }, async () => {
        const root = findMonorepoRoot()
        const dependencies = await getTargetDependencies(pkg, overrides)

        const pnpmWorkspaceYamlPath = join(root, 'pnpm-workspace.yaml')
        const pnpmWorkspaceYaml = await getPnpmWorkspaceYAML(root)
        const rawWorkspaceYaml = pnpmWorkspaceYaml.toString()

        const workspaceDependencies = getWorkspaceDependencies(pnpmWorkspaceYaml, overrides)
        // compare version and generate resolutions
        const resolutions = generateResolutions(dependencies, workspaceDependencies, pnpmWorkspaceYaml)

        const filepath = join(root, 'package.json')
        const packageJson = await readPackageJSON(filepath)
        const rawResolutions = structuredClone(packageJson.resolutions)
        packageJson.resolutions = { ...(packageJson.resolutions ?? {}), ...resolutions }

        if (!dry) {
          await updateResolutions(filepath, packageJson, rawResolutions)
          await updatePnpmWorkspaceYAML(pnpmWorkspaceYamlPath, pnpmWorkspaceYaml, rawWorkspaceYaml)
        }
        else {
          consola.box(JSON.stringify(packageJson.resolutions, null, 2))
          consola.box(pnpmWorkspaceYaml.toString())
        }

        if (install) {
          await execa('pnpm', ['install'], {
            cwd: root,
            stdio: 'inherit',
          })
        }
      })
    })
}

async function updateResolutions(filepath: string, packageJson: PackageJson, rawResolutions: Record<string, string>) {
  const rawStr = JSON.stringify(rawResolutions, null, 2)
  const str = JSON.stringify(packageJson.resolutions, null, 2)
  if (rawStr === str) {
    p.log.warn(color.yellow('No changes to resolutions'))
    return
  }

  p.note(color.reset(diffHighlight(rawStr, str)), filepath)
  const result = await p.confirm({
    message: 'looks good?',
    initialValue: true,
  })
  if (p.isCancel(result) || !result) {
    p.outro(color.red('aborting'))
    process.exit(1)
  }
  writePackageJSON(filepath, packageJson)
}

async function updatePnpmWorkspaceYAML(
  filepath: string,
  pnpmWorkspaceYaml: PnpmWorkspaceYaml,
  rawWorkspaceYaml: string,
) {
  const content = pnpmWorkspaceYaml.toString()
  if (content === rawWorkspaceYaml) {
    p.log.warn(color.yellow('No changes to pnpm-workspace.yaml'))
    return
  }

  p.note(color.reset(diffHighlight(rawWorkspaceYaml, content)), filepath)

  const result = await p.confirm({
    message: 'looks good?',
    initialValue: true,
  })
  if (p.isCancel(result) || !result) {
    p.outro(color.red('aborting'))
    process.exit(1)
  }
  await writeFile(filepath, pnpmWorkspaceYaml.toString())
}

async function getTargetDependencies(pkg: string, overrides: string[]) {
  const { rootDir, packages } = await getPackages()
  const data = await getPackageInfo(pkg, {
    paths: [rootDir, ...packages.map(pkg => resolve(rootDir, basename(pkg.dir)))],
  })

  const dependencies: Record<string, unknown> = {}
  for (const depType of DEP_TYPES) {
    const deps = data?.packageJson[depType]
    if (deps) {
      for (const [pkg, spec] of Object.entries(deps)) {
        if (overrides.includes(pkg))
          dependencies[pkg] = cleanSpec(spec as string) || await getLatestVersion(pkg)
      }
    }
  }

  return dependencies
}

async function getLatestVersion(pkg: string): Promise<string | null> {
  try {
    const { getLatestVersion: get } = await import('fast-npm-meta')
    const resp = await get(pkg)
    return resp.version
  }
  catch {
    consola.warn(`Failed to get latest version for ${pkg}`)
    return null
  }
}

async function getPnpmWorkspaceYAML(cwd: string = process.cwd()): Promise<PnpmWorkspaceYaml> {
  const filepath = join(cwd, 'pnpm-workspace.yaml')
  const content = await readFile(filepath, 'utf-8')
  return parsePnpmWorkspaceYaml(content)
}

function getWorkspaceDependencies(pnpmWorkspaceYaml: PnpmWorkspaceYaml, overrides: string[]) {
  const workspaceJson = pnpmWorkspaceYaml.toJSON()
  const dependencies: Record<string, unknown> = {}

  overrides.forEach((dep) => {
    const [catalog] = pnpmWorkspaceYaml.getPackageCatalogs(dep)
    if (catalog === 'default')
      dependencies[dep] = workspaceJson.catalog?.[dep]
    else
      dependencies[dep] = workspaceJson.catalogs?.[catalog]?.[dep]
  })
  return dependencies
}

function generateResolutions(
  dependencies: Record<string, unknown>,
  workspaceDependencies: Record<string, unknown>,
  pnpmWorkspaceYaml: PnpmWorkspaceYaml,
) {
  if (!Object.keys(workspaceDependencies).length)
    return dependencies

  const resolutions: Record<string, unknown> = {}
  Object.entries(dependencies).forEach(([pkg, version]) => {
    const currentVersion = workspaceDependencies[pkg]

    if (!currentVersion) {
      resolutions[pkg] = version
    }
    else {
      const [catalog] = pnpmWorkspaceYaml.getPackageCatalogs(pkg)
      const gt = isGreaterThan(version as string, currentVersion as string)
      if (gt) {
        consola.warn(`${pkg} is greater than current version ${currentVersion}, using ${version}`)
        pnpmWorkspaceYaml.setPackage(catalog, pkg, version as string)
      }
      if (catalog === 'default')
        resolutions[pkg] = `catalog:`
      else
        resolutions[pkg] = `catalog:${catalog}`
    }
  })
  return resolutions
}
