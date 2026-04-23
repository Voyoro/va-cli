import { ensureDep } from '@ebdp-script/node-va-utils';
import type { CAC } from "cac";
import { execa } from "execa";

export function defineSpellCommand(cac: CAC) {
  cac.command('spell', 'Spell check all workspace packages.')
    .action(async () => {
      await ensureDep('cspell')
      await execa('npx', ['cspell', 'lint', '**/*.ts', '**/README.md', '**/*.vue', '--no-progress'], {
        stdio: 'inherit',
      })
    })
}
