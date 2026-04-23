import { ensureDep } from '@ebdp-script/node-va-utils'
import type { CAC } from 'cac'
import { execa } from 'execa'
import process from 'node:process'

export function defineUpgradeCommand(cac: CAC) {
  cac
    .command('upgrade [args...]', 'Upgrade dependencies interactively.')
    .allowUnknownOptions()
    .action(async () => {
      await ensureDep('taze')
      const args = process.argv.slice(3).length ? process.argv.slice(3) : ['major', '-r', '-I']
      await execa('pnpm', ['taze', ...args], {
        stdio: 'inherit',
      })
    })
}
