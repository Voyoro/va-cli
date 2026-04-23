import * as p from '@clack/prompts'
import type { Package } from '@ebdp-script/node-va-utils'
import { color, getGitBranch, getPackages, gitCommit, gitPush, gitTag, readPackageJSON, spinner, writePackageJSON } from '@ebdp-script/node-va-utils'
import type { CAC } from 'cac'
import consola from 'consola'
import { execa } from 'execa'
import process from 'node:process'
import { join } from 'pathe'
import { SemVer } from 'semver'
import type { ReleaseType } from '../types'
import { EXCLUDE_DIRS, PADDING, RELEASE_TYPES } from './constants'

interface BumpCommandOptions {
  /**
   * The version to release.
   */
  version?: string
  /**
   * Whether to perform git operations.
   * @default true
   */
  git?: boolean
  /**
   * Whether to publish packages to npm registry.
   * @default true
   */
  publish?: boolean
  /**
   * Whether to dry run the command.
   * @default false
   */
  dry?: boolean
}

export function defineBumpCommand(cac: CAC) {
  cac
    .command('release [version]', 'Bumpp all workspace packages.')
    .option('--git', 'Automatically perform git operations (add, commit, tag, push).', { default: true })
    .option('--publish', 'Publish packages to npm registry.', { default: true })
    .option('--dry', 'Dry run.', { default: false })
    .action(async (version?: string, options?: BumpCommandOptions) => {
      const { git = true, publish = true, dry = false } = options || {}

      spinner(
        {
          successText: color.green(`All packages bumped successfully.`),
          title: `${color.dim(`Bumping and publishing packages...`)}`,
        },
        async () => {
          let releaseType: ReleaseType | 'none' = 'none'
          if (!version) {
            const currentVersion = await getCurrentVersion()
            releaseType = await promptForNewVersion(currentVersion)
            version = releaseType === 'none' ? currentVersion : getNextVersion(currentVersion, releaseType)
          }
          if (!dry) {
            await updatePackagesVersion(version!)
            if (publish)
              await releasePackages(releaseType)

            // Git operations after successful release
            if (git && !releaseType.startsWith('pre'))
              await performGitOperations(version!)
          }
        },
      )
    })
}

async function getCurrentVersion(): Promise<string> {
  const { rootDir } = await getPackages()
  const data = await readPackageJSON(join(rootDir, 'package.json'))
  return data.version ?? '0.0.0'
}

function getNextVersion(version: string, type: ReleaseType): string {
  const semver = new SemVer(version)
  type = type === 'next'
    ? semver.prerelease.length ? 'prerelease' : 'patch'
    : type
  return semver.inc(type).version
}

function getNextVersions(currentVersion: string) {
  const next: Record<string, string> = {}
  for (const type of RELEASE_TYPES)
    next[type] = getNextVersion(currentVersion, type)
  return next
}

async function promptForNewVersion(version: string) {
  const next = getNextVersions(version)
  const result = await p.select({
    message: `Current version ${color.green(version)}`,
    options: [
      { value: 'major', label: `${'major'.padStart(PADDING, ' ')} ${color.bold(next.major)}` },
      { value: 'minor', label: `${'minor'.padStart(PADDING, ' ')} ${color.bold(next.minor)}` },
      { value: 'patch', label: `${'patch'.padStart(PADDING, ' ')} ${color.bold(next.patch)}` },
      { value: 'next', label: `${'next'.padStart(PADDING, ' ')} ${color.bold(next.next)}` },
      { value: 'prepatch', label: `${'pre-patch'.padStart(PADDING, ' ')} ${color.bold(next.prepatch)}` },
      { value: 'preminor', label: `${'pre-minor'.padStart(PADDING, ' ')} ${color.bold(next.preminor)}` },
      { value: 'premajor', label: `${'pre-major'.padStart(PADDING, ' ')} ${color.bold(next.premajor)}` },
      { value: 'none', label: `${'as-is'.padStart(PADDING, ' ')} ${color.bold(version)}` },
    ],
    initialValue: 'next',
  })
  if (p.isCancel(result) || !result) {
    p.cancel(color.red(`aborting`))
    process.exit(0)
  }
  return result as ReleaseType | 'none'
}

async function getReleasePackages(): Promise<{ packages: Package[], rootDir: string }> {
  const { packages, rootDir } = await getPackages()
  const pkgs = packages.filter(
    async (pkg: Package) => {
      const data = await readPackageJSON(join(pkg.dir, 'package.json'))
      return data.private !== true
    },
  )
  return { packages: pkgs, rootDir }
}

async function updatePackagesVersion(version: string) {
  const { packages, rootDir } = await getReleasePackages()
  const dirs = [...packages, { dir: rootDir }]
  await Promise.all(dirs.map(
    async (pkg) => {
      const pkgPath = join(pkg.dir, 'package.json')
      const pkgJson = await readPackageJSON(pkgPath)
      pkgJson.version = version
      await writePackageJSON(pkgPath, pkgJson)
    },
  ))
}

async function releasePackages(releaseType: ReleaseType | 'none') {
  try {
    const { packages, rootDir } = await getReleasePackages()

    // run build script at root directory
    await execa('pnpm', ['build'], {
      cwd: rootDir,
      stdio: 'inherit',
    })

    const dirs = packages.filter((pkg: Package) => !EXCLUDE_DIRS.includes(pkg.dir.split('/').pop() ?? ''))

    // not a monorepo, publish the root package
    if (!dirs.length) {
      await publishPackage(rootDir, releaseType)
      return
    }

    const errors: string[] = []
    await Promise.all(dirs.map(async (pkg: Package) => {
      if (pkg.packageJson.private) {
        p.log.info(color.yellow(`skip ${pkg.dir} because it is private.`))
        return
      }

      try {
        await publishPackage(pkg.dir, releaseType)
      }
      catch (error) {
        p.log.error(color.red(`release ${pkg.dir} failed`))
        consola.error(error)
        errors.push(pkg.dir)
      }
    }))

    if (errors.length)
      p.log.warn(`${color.yellow(errors.join(', '))} packages release failed`)
  }
  catch (error) {
    p.outro(color.red(`release failed`))
    consola.error(error)
    process.exit(1)
  }
}

async function publishPackage(cwd: string, releaseType: ReleaseType | 'none') {
  const args = ['publish', '--no-git-checks']
  if (releaseType.startsWith('pre')) {
    args.push('--tag', 'beta')
  }

  await execa('pnpm', args, {
    cwd,
    stdio: 'inherit',
  })
}

async function performGitOperations(version: string) {
  const { rootDir } = await getPackages()

  try {
    const branch = await getGitBranch(rootDir)

    await gitCommit(version, rootDir)
    await gitTag(version, rootDir)
    await gitPush(version, branch)

    p.log.success(color.green(`git operations completed successfully.`))
  }
  catch (error) {
    p.log.error(color.yellow(`git operations failed`))
    consola.error(error)
    process.exit(1)
  }
}
