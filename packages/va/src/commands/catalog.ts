import { ensureDep } from '@ebdp-script/node-va-utils'
import type { CAC } from 'cac'
import { execa } from 'execa'
import process from 'node:process'

export function defineCatalogCommand(cac: CAC) {
  cac
    .command('catalog [args...]', 'Migrate workspace dependencies to pnpm catalog protocol.')
    .allowUnknownOptions()
    .action(async () => {
      await ensureDep('pncat')
      const args = process.argv.slice(3).length ? process.argv.slice(3) : ['migrate', '-f']
      await execa('pnpm', ['pncat', ...args], {
        stdio: 'inherit',
      })
    })
}
