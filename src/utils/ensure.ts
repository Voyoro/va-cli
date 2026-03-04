import { join } from "path";
import { readPackageJSON } from "pkg-types";
import * as p from '@clack/prompts'
import color from 'ansis'
import { DEP_TYPES } from "../contants";
import { findMonorepoRoot } from "./monorepo";

export async function ensureDep(pkg: string, isDev: boolean = true) {
  const filepath = join(await findMonorepoRoot(), 'package.json')
  const pkgJson = await readPackageJSON(filepath)

  if(DEP_TYPES.some(name => pkgJson[name]?.[pkg])){
    return
  }

  const spinner = p.spinner({ indicator: 'dots' })
  try {
    spinner.start(`正在检查 ${pkg} 是否已安装...`)
    const { installPackage } = await import('@antfu/install-pkg')
    await installPackage(pkg, {
      dev: isDev,
    })
    spinner.stop(color.green(`install ${color.cyan(pkg)} success`))
    p.outro(color.green(`install ${color.cyan(pkg)} completed`))

  } catch (error) {
    spinner.stop(color.red(`install ${color.cyan(pkg)} failed`))
    p.outro(color.red('aborting'))
    console.error(error)
    process.exit(1)
  }




}
