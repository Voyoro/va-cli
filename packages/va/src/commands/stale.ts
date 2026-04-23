import * as p from '@clack/prompts'
import type { Package, PackageJson } from '@ebdp-script/node-va-utils'
import { color, getPackages, parsePnpmWorkspaceYaml, readPackageJSON, writePackageJSON } from '@ebdp-script/node-va-utils'
import type { CAC } from 'cac'
import consola from 'consola'
import { execa } from 'execa'
import fg from 'fast-glob'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { join, relative } from 'pathe'

const DEPENDENCY_TYPES = ['dependencies', 'devDependencies', 'optionalDependencies'] as const
const PACKAGE_DEPENDENCY_TYPES = [...DEPENDENCY_TYPES, 'peerDependencies'] as const

const SOURCE_PATTERNS = [
  'src/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts,vue}',
  '*.{config,setup}.{ts,tsx,js,jsx,mjs,cjs,mts,cts}',
  '*.config.{ts,tsx,js,jsx,mjs,cjs,mts,cts}',
  '.*rc.{ts,tsx,js,jsx,mjs,cjs,json}',
]

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/coverage/**',
  '**/.turbo/**',
]

const KNOWN_BIN_NAMES: Record<string, string[]> = {
  '@vitejs/plugin-vue': [],
  cspell: ['cspell'],
  eslint: ['eslint'],
  prettier: ['prettier'],
  tsdown: ['tsdown'],
  tslib: [],
  tsx: ['tsx'],
  typescript: ['tsc', 'tsserver'],
  vite: ['vite'],
  vitest: ['vitest'],
  'vue-tsc': ['vue-tsc'],
}

const PROTECTED_DEPENDENCIES = new Set([
  'typescript',
])

type DependencyType = typeof DEPENDENCY_TYPES[number]

export interface StaleDependency {
  name: string
  spec: string
  type: DependencyType
}

interface FindStaleDependenciesOptions {
  packageJson: PackageJson
  usedDependencies: Set<string>
  dependencyBins?: Record<string, string[]>
  workspacePackageNames?: Set<string>
}

interface StaleCommandOptions {
  fix?: boolean
  json?: boolean
  yes?: boolean
}

interface PackageStaleReport {
  name: string
  dir: string
  relativeDir: string
  stale: StaleDependency[]
}

export function defineStaleCommand(cac: CAC) {
  cac
    .command('stale', 'Find unused external dependencies declared by workspace packages.')
    .option('--fix', 'Remove stale dependencies from package.json and run pnpm install.', { default: false })
    .option('--json', 'Print result as JSON.', { default: false })
    .option('--yes, -y', 'Skip confirmation when used with --fix.', { default: false })
    .action(async (options: StaleCommandOptions) => {
      const { fix = false, json = false, yes = false } = options
      const report = await collectStaleReports()

      if (json) {
        console.log(JSON.stringify(report, null, 2))
      }
      else {
        printReport(report)
      }

      if (!fix || report.length === 0)
        return

      const confirmed = yes || await p.confirm({
        message: `Remove ${getStaleCount(report)} stale dependencies and run pnpm install?`,
        initialValue: false,
      })

      if (p.isCancel(confirmed) || !confirmed) {
        p.cancel(color.red('aborting'))
        process.exit(0)
      }

      await removeStaleDependencies(report)
      const { rootDir } = await getPackages()
      await removeUnusedCatalogDependencies(rootDir, report)
      await execa('pnpm', ['install'], {
        cwd: rootDir,
        stdio: 'inherit',
      })
    })
}

export function collectUsedDependencyNames(content: string): Set<string> {
  const used = new Set<string>()
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const name = getDependencyNameFromSpecifier(match[1])
      if (name)
        used.add(name)
    }
  }

  return used
}

export function findStaleDependencies({
  packageJson,
  usedDependencies,
  dependencyBins = {},
  workspacePackageNames = new Set<string>(),
}: FindStaleDependenciesOptions): StaleDependency[] {
  const scriptText = Object.values(packageJson.scripts ?? {}).join('\n')
  const stale: StaleDependency[] = []

  for (const type of DEPENDENCY_TYPES) {
    const deps = packageJson[type] ?? {}
    for (const [name, spec] of Object.entries(deps)) {
      if (workspacePackageNames.has(name))
        continue
      if (isProtectedDependency(name))
        continue
      if (usedDependencies.has(name))
        continue
      if (isUsedByScript(name, dependencyBins[name] ?? KNOWN_BIN_NAMES[name] ?? [], scriptText))
        continue

      stale.push({
        name,
        spec: String(spec),
        type,
      })
    }
  }

  return stale
}

function isProtectedDependency(name: string): boolean {
  return name.startsWith('@types/') || PROTECTED_DEPENDENCIES.has(name)
}

async function collectStaleReports(): Promise<PackageStaleReport[]> {
  const { packages, rootDir } = await getPackages()
  const workspacePackageNames = new Set(
    packages
      .map(pkg => pkg.packageJson.name)
      .filter((name): name is string => Boolean(name)),
  )
  const reports = await Promise.all(
    packages.map(async (pkg) => {
      const packageJson = await readPackageJSON(join(pkg.dir, 'package.json'))
      const dependencyBins = await collectDependencyBins(pkg, rootDir, packageJson)
      const usedDependencies = await collectPackageUsedDependencies(pkg.dir)
      const stale = findStaleDependencies({
        packageJson,
        usedDependencies,
        dependencyBins,
        workspacePackageNames,
      })

      return {
        name: packageJson.name || pkg.packageJson.name || pkg.dir,
        dir: pkg.dir,
        relativeDir: relative(rootDir, pkg.dir) || '.',
        stale,
      }
    }),
  )

  return reports.filter(item => item.stale.length > 0)
}

async function collectPackageUsedDependencies(dir: string): Promise<Set<string>> {
  const files = await fg(SOURCE_PATTERNS, {
    absolute: true,
    cwd: dir,
    dot: true,
    ignore: IGNORE_PATTERNS,
    onlyFiles: true,
  })
  const used = new Set<string>()

  await Promise.all(files.map(async (file) => {
    const content = await readFile(file, 'utf-8')
    for (const name of collectUsedDependencyNames(content))
      used.add(name)
  }))

  return used
}

async function collectDependencyBins(
  pkg: Package,
  rootDir: string,
  packageJson: PackageJson,
): Promise<Record<string, string[]>> {
  const dependencyNames = DEPENDENCY_TYPES.flatMap(type => Object.keys(packageJson[type] ?? {}))
  const entries = await Promise.all(
    dependencyNames.map(async name => [name, await readDependencyBins(name, pkg.dir, rootDir)] as const),
  )

  return Object.fromEntries(entries)
}

async function readDependencyBins(name: string, packageDir: string, rootDir: string): Promise<string[]> {
  const candidates = [
    join(packageDir, 'node_modules', ...name.split('/'), 'package.json'),
    join(rootDir, 'node_modules', ...name.split('/'), 'package.json'),
  ]

  for (const filepath of candidates) {
    if (!existsSync(filepath))
      continue

    try {
      const packageJson = JSON.parse(await readFile(filepath, 'utf-8')) as PackageJson
      const bin = packageJson.bin
      if (typeof bin === 'string')
        return [name]
      if (bin && typeof bin === 'object')
        return Object.keys(bin)
    }
    catch (error) {
      consola.warn(`Failed to read ${filepath}`)
      consola.warn(error)
    }
  }

  return KNOWN_BIN_NAMES[name] ?? []
}

async function removeStaleDependencies(report: PackageStaleReport[]) {
  await Promise.all(report.map(async (item) => {
    const filepath = join(item.dir, 'package.json')
    const packageJson = await readPackageJSON(filepath)

    for (const stale of item.stale)
      delete packageJson[stale.type]?.[stale.name]

    await writePackageJSON(filepath, packageJson)
  }))
}

async function removeUnusedCatalogDependencies(rootDir: string, report: PackageStaleReport[]) {
  const removedNames = new Set(report.flatMap(item => item.stale.map(dep => dep.name)))
  if (removedNames.size === 0)
    return

  const declaredNames = await collectDeclaredDependencyNames(rootDir)
  const unusedNames = [...removedNames].filter(name => !declaredNames.has(name))
  if (unusedNames.length === 0)
    return

  const workspacePath = join(rootDir, 'pnpm-workspace.yaml')
  if (!existsSync(workspacePath))
    return

  const rawWorkspaceYaml = await readFile(workspacePath, 'utf-8')
  const workspaceYaml = parsePnpmWorkspaceYaml(rawWorkspaceYaml)
  const document = workspaceYaml.getDocument()

  let changed = false
  for (const name of unusedNames) {
    for (const catalog of workspaceYaml.getPackageCatalogs(name)) {
      if (catalog === 'default')
        changed = deleteDocumentPath(document, ['catalog', name]) || changed
      else
        changed = deleteDocumentPath(document, ['catalogs', catalog, name]) || changed

      const latest = document.toJSON() || {}
      if (catalog !== 'default' && latest.catalogs?.[catalog] && Object.keys(latest.catalogs[catalog]).length === 0)
        changed = deleteDocumentPath(document, ['catalogs', catalog]) || changed
    }
  }

  const latest = document.toJSON() || {}
  if (latest.catalog && Object.keys(latest.catalog).length === 0)
    changed = deleteDocumentPath(document, ['catalog']) || changed
  if (latest.catalogs && Object.keys(latest.catalogs).length === 0)
    changed = deleteDocumentPath(document, ['catalogs']) || changed

  if (!changed)
    return

  await writeFile(workspacePath, workspaceYaml.toString())
  p.log.info(color.green(`Removed unused catalog entries: ${unusedNames.join(', ')}`))
}

async function collectDeclaredDependencyNames(rootDir: string): Promise<Set<string>> {
  const { packages } = await getPackages(rootDir)
  const packageDirs = [rootDir, ...packages.map(pkg => pkg.dir)]
  const names = new Set<string>()

  await Promise.all(packageDirs.map(async (dir) => {
    const filepath = join(dir, 'package.json')
    if (!existsSync(filepath))
      return

    const packageJson = await readPackageJSON(filepath)
    for (const type of PACKAGE_DEPENDENCY_TYPES) {
      for (const name of Object.keys(packageJson[type] ?? {}))
        names.add(name)
    }
  }))

  return names
}

function deleteDocumentPath(
  document: ReturnType<ReturnType<typeof parsePnpmWorkspaceYaml>['getDocument']>,
  path: string[],
): boolean {
  const data = document.toJSON() || {}
  let current: unknown = data
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current))
      return false
    current = (current as Record<string, unknown>)[key]
  }

  document.deleteIn(path)
  return true
}

function getDependencyNameFromSpecifier(specifier: string): string | null {
  if (
    specifier.startsWith('.')
    || specifier.startsWith('/')
    || specifier.startsWith('node:')
    || specifier.startsWith('http:')
    || specifier.startsWith('https:')
  ) {
    return null
  }

  const [first, second] = specifier.split('/')
  if (!first)
    return null
  if (first.startsWith('@') && second)
    return `${first}/${second}`
  return first
}

function isUsedByScript(name: string, bins: string[], scriptText: string): boolean {
  if (!scriptText)
    return false

  const candidates = [name, ...bins]
  return candidates.some((candidate) => {
    if (!candidate)
      return false
    return new RegExp(`(^|\\s|["'(&|;])${escapeRegExp(candidate)}($|\\s|["')&|;:])`).test(scriptText)
  })
}

function printReport(report: PackageStaleReport[]) {
  if (report.length === 0) {
    p.log.info(color.green('No stale external dependencies found.'))
    return
  }

  p.log.warn(color.yellow(`Found ${getStaleCount(report)} stale external dependencies.`))
  for (const item of report) {
    const lines = item.stale
      .map(dep => `  ${dep.name} ${color.dim(dep.spec)} ${color.dim(`(${dep.type})`)}`)
      .join('\n')

    p.note(lines, `${item.name} ${color.dim(item.relativeDir)}`)
  }
}

function getStaleCount(report: PackageStaleReport[]): number {
  return report.reduce((count, item) => count + item.stale.length, 0)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
