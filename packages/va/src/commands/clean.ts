import type { Package } from '@ebdp-script/node-va-utils'
import { color, getPackages, spinner } from '@ebdp-script/node-va-utils'
import type { CAC } from 'cac'
import { join } from 'pathe'
import { rimraf } from 'rimraf'
import { CLEAN_DIRS } from './constants'

interface CleanCommandOptions {
  dirs?: string[]
  recursive?: boolean
  delLock?: boolean
}

export function defineCleanCommand(cac: CAC) {
  cac
    .command('clean [dirs...]', 'Clean specified directories under the workspace.')
    .option('--recursive, -r', 'Recursively clean packages in a workspace.', { default: true })
    .option('--del-lock', 'Delete the project pnpm-lock.yaml file.', { default: false })
    .action(async (dirs: string[] = [], options: Partial<CleanCommandOptions>) => {
      const { recursive = true, delLock = false } = options

      const cleanDirs = dirs.length === 0 ? CLEAN_DIRS : dirs
      const cleanDirsText = JSON.stringify(cleanDirs)
      spinner(
        {
          successText: color.green(`clean up all \`${cleanDirsText}\` success.`),
          title: `${color.dim(cleanDirsText)} cleaning in progress...`,
        },
        async () => {
          await clean({ delLock, dirs: cleanDirs, recursive })
        },
      )
    })
}

async function clean({ delLock, dirs = [], recursive }: CleanCommandOptions) {
  const { packages, rootDir } = await getPackages()

  if (delLock)
    await rimraf(join(rootDir, 'pnpm-lock.yaml'))

  if (recursive) {
    await Promise.all(
      packages.map(
        (pkg: Package) => rimraf(dirs.map(i => join(pkg.dir, i)), { preserveRoot: true }),
      ),
    )
  }

  await Promise.all(
    dirs.map(dir => rimraf(join(process.cwd(), dir), { preserveRoot: true })),
  )
}
