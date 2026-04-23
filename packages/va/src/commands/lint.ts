import { findMonorepoRoot } from '@ebdp-script/node-va-utils'
import type { CAC } from 'cac'
import { execa } from 'execa'
import { existsSync } from 'node:fs'
import { resolve } from 'pathe'
import { GLOB_VUE } from './constants'

interface LintCommandOptions {
  fix?: boolean
}

export function defineLintCommand(cac: CAC) {
  cac
    .command('lint', 'Batch execute project lint check.')
    .option('--fix', 'Fix lint problem.')
    .action(async ({ fix }: LintCommandOptions) => {
      const stylelint = existsSync(resolve(findMonorepoRoot(), 'stylelint.config.mjs'))

      if (fix) {
        await execa('eslint', ['.', '--fix'], {
          stdio: 'inherit',
        })
        if (stylelint) {
          await execa('stylelint', [GLOB_VUE, '--fix'], {
            stdio: 'inherit',
          })
        }
      }
      else {
        await execa('eslint', ['.'], {
          stdio: 'inherit',
        })
        if (stylelint) {
          await execa('stylelint', [GLOB_VUE], {
            stdio: 'inherit',
          })
        }
      }
    })
}
