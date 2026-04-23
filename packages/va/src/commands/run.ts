import * as p from '@clack/prompts'
import type { Package, PackageJson } from '@ebdp-script/node-va-utils'
import { color, getPackages } from '@ebdp-script/node-va-utils'
import type { CAC } from 'cac'
import { execa } from 'execa'

export function defineRunCommand(cac: CAC) {
  cac
    .command('[script]', 'Run a script in the workspace with interactive selection.')
    .action(async (command: string) => {
      if (!command) {
        console.error(color.yellow('Please enter the command to run'))
        process.exit(1)
      }

      const { packages } = await getPackages()
      const choices = packages.filter((pkg: Package) =>
        (pkg?.packageJson as PackageJson)?.scripts?.[command],
      )

      const data = await p.select({
        message: `Select the app you need to run [${command}]:`,
        options: choices.map((i: Package) => ({
          label: i?.packageJson.name,
          value: i?.packageJson.name,
        })),
      })
      if (p.isCancel(data) || !data) {
        p.cancel(color.red('aborting'))
        process.exit(0)
      }

      execa('pnpm', ['--filter', data, 'run', command], {
        stdio: 'inherit',
      })
    })
}
