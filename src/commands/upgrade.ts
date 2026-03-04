import { execa } from "execa"
import { ensureDep } from "../utils/ensure"
import type { CAC } from "cac"
import process from 'node:process'

export function defineUpgradeCommand(cac: CAC) {
  cac.command('upgrade [args...]', 'Upgrade all packages')
    .allowUnknownOptions()
    .action(async () => {
      await ensureDep('taze')
      const args = process.argv.slice(3).length ? process.argv.slice(3) : ['major', '-r', '-I']
      await execa('taze', args, { stdio: 'inherit' })
    })
}
