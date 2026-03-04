import type { CAC } from "cac"
import { execa } from 'execa'
import { existsSync } from 'node:fs'
import { resolve } from 'pathe'
import { findMonorepoRoot } from "../utils/monorepo"
import { spinner } from '../utils/spinner'

export async function defineLintCommand(cac: CAC) {
  cac.command('lint', 'Run lint')
    .option('--fix', 'Fix lint errors')
    .action(async ({ fix }) => {
      const stylelint = existsSync(resolve(findMonorepoRoot(), 'stylelint.config.mjs'))
      await spinner({
        title: 'Linting all workspace packages.',
        failedText: 'Lint failed.',
        successText: 'Lint passed.'
      }, async () => {
        if (fix) {
          await execa('npx', ['eslint', '.', '--fix'], {
            stdio: 'inherit',
          })
          if (stylelint) {
            await execa('npx', ['stylelint', '**/*.{css,scss,less}', '--fix'], {
              stdio: 'inherit',
            })
          }
        } else {
          await execa('npx', ['eslint', '.'], {
            stdio: 'inherit',
          })
          if (stylelint) {
            await execa('npx', ['stylelint', '**/*.{css,scss,less}'], {
              stdio: 'inherit',
            })
          }
        }

      })

    })
}
