import { ensureDep } from '@ebdp-script/node-va-utils'
import type { CAC } from 'cac'
import { execa } from 'execa'

export function defineCheckSpellCommand(cac: CAC) {
  cac
    .command('cspell', 'Run spell check on the workspace.')
    .action(async () => {
      await ensureDep('cspell')
      await execa('cspell', ['lint', '**/*.ts', '**/README.md', '**/*.vue', '--no-progress'], {
        stdio: 'inherit',
      })
    })
}
