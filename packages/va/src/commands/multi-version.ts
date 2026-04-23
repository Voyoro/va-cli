import * as p from '@clack/prompts'
import { color, findMonorepoRoot } from '@ebdp-script/node-va-utils'
import type { CAC } from 'cac'
import process from 'node:process'
import { resolve } from 'pathe'
import { pnpmMultiVersions, readLockfile } from 'pnpm-multi-versions'
import { MAJOR_PACKAGES } from './constants'

interface MultiVersionCommandOptions {
  /**
   * Ignore major version difference.
   */
  ignoreMajor?: boolean
  /**
   * The dependencies to include in the search.
   */
  include?: string[]
  /**
   * The dependencies to exclude from the search.
   */
  exclude?: string[]
}

export function defineMultiVersionCommand(cac: CAC) {
  cac
    .command('multi-version', 'Find multiple versions of dependencies from pnpm lockfile.')
    .option('--ignore-major', 'Ignore major version difference', { default: false })
    .option('--include [...deps]', 'The dependencies to include in the search.', { default: MAJOR_PACKAGES })
    .option('--exclude [...deps]', 'The dependencies to exclude from the search.', { default: [] })
    .action(async (options: MultiVersionCommandOptions) => {
      const { ignoreMajor = false, include = [], exclude = [] } = options

      const root = findMonorepoRoot()
      const filepath = resolve(root, 'pnpm-lock.yaml')

      const lockfile = await readLockfile(filepath)
      const { versionsMap, multipleVersions } = pnpmMultiVersions(lockfile, {
        ignoreMajor,
      })

      const packageFilter = createFilter(include, exclude)
      const packages = Array.from(multipleVersions).filter(packageFilter)
      if (!packages.length) {
        p.log.info(color.yellow('No multiple versions packages found'))
        process.exit(0)
      }

      const data: Record<string, string[]> = {}
      packages.forEach((pkg) => {
        const versions = versionsMap.get(pkg)
        if (!versions)
          return
        data[pkg] = Array.from(versions)
      })

      p.note(
        color.reset(JSON.stringify(data, null, 2)),
        color.reset(`📦 Found ${color.yellow(packages.length)} multiple versions packages`),
      )
    })
}

function createFilter(include: string[], exclude: string[]) {
  return (name: string) => {
    if (exclude.length > 0 && exclude.includes(name))
      return false
    if (include.length > 0 && !include.includes(name))
      return false
    return true
  }
}
