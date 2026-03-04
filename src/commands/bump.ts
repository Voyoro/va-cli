import type { CAC } from "cac";
import { spinner } from "../utils/spinner";
import { join } from "path";
import { readPackageJSON } from "pkg-types";
import { getPackages } from "../utils/monorepo";

export function defineBumpCommand(cac: CAC) {
  cac.command('release [version]', 'Bumpp all workspace packages.')
    .option('--git', 'Automatically perform git operations (add, commit, tag).', { default: true })
    .option('--publish', 'Automatically publish to npm registry', { default: true })
    .action(async (version?: string, options?: any) => {
      const { git = true, publish = true } = options || {}
      spinner({ title: 'Bump all packages' }, async () => {
        //执行版本选择
        if (!version) {
          const { rootDir } = await getPackages()
          const data = await readPackageJSON(join(rootDir, 'package.json'))
          const currentVersion = data.version ?? '0.0.0'


        }
      })
    })
}
