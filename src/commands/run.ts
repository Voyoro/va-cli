import type { CAC } from "cac";
import color from 'ansis'
import process from 'node:process'
import { getPackages } from '@manypkg/get-packages'
import type { PackageJson } from "pncat";
import * as p from '@clack/prompts'
import { execa } from 'execa'


export function defineRunCommand(cac: CAC) {
  cac.command('[script]', 'Run a script')
    .action(async (script) => {
      if (!script) {
        console.error(color.red('[Error]'))
        process.exit(1)

      }
      const { packages } = await getPackages(process.cwd())
      const choices = packages.filter(pkg => {
        return (pkg?.packageJson as PackageJson)?.scripts && (pkg?.packageJson as PackageJson)?.scripts[script]
      })

      const data = await p.select({
        message: `Select the app you need to run [${script}]:`,
        options: choices.map(pkg => ({
          label: pkg.packageJson.name,
          value: pkg.packageJson.name
        }))
      })
      if(p.isCancel(data) || !data){
        process.exit(1)
      }
      execa('pnpm', ['--filter', data, 'run', script], {
        stdio: 'inherit',
      })
    });
}
