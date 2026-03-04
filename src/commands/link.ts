import type { Package } from "@manypkg/get-packages";
import type { CAC } from "cac";
import { execa } from "execa";
import fs from 'node:fs';
import path from "node:path";
import { detect as detectPM } from 'package-manager-detector';
import { getPackages } from '../utils/monorepo';

export async function defineSymlinkCommand(cac: CAC) {
  cac.command('link', 'By symlink package to joint debugging component package and business package')
    .option('-p,--packagePath <packagePath>', 'Specify the package name of the component to be tested')
    .option('-n,--packageName <packageName>', 'Specify the package name of the component to be tested')
    .action(async (options) => {
      const cwd = process.cwd();
      const localDev = fs.existsSync(path.join(cwd, '.pnpm-local-dev.json')) && JSON.parse(fs.readFileSync(path.join(cwd, '.pnpm-local-dev.json'), 'utf-8'));
      const devDepend = Object.entries(localDev)
        .map(([key, value]) => ({ key, value })) as { key: string, value: string }[];


      const { packages } = await getPackages();
      if (!packages || packages.length === 0) {
        console.log('未找到任何包，请检查工作目录是否正确');
        return;
      }

      if (devDepend.length > 0) {
        devDepend.forEach(({ key, value }) => {
          changeDepend(packages, key, value.replaceAll('\\', "/"));
        });
      } else {
        if (!options.packageName) {
          console.log('请指定要试用的组件包名');
          return;
        }
        if (!options.packagePath) {
          console.log('请指定要试用的组件包路径');
          return;
        }
        const normalizedPath = options.packagePath.replaceAll('\\', "/");
        changeDepend(packages, options.packageName, normalizedPath);
      }

      const { agent } = await detectPM({
        cwd,
        onUnknown: () => {
          return undefined
        },
      }) || {}
      agent && await execa(agent, ['install'], { cwd, stdio: 'inherit' });
    })
}
function changeDepend(packages: Package[], name: string, path: string) {
  for (const pkg of packages) {
    if (!pkg.packageJson) {
      console.warn(`跳过 ${pkg.dir}：缺少 package.json 文件`);
      continue;
    }
    const pkgJsonPath = `${pkg.dir}/package.json`;
    let changeMark = false
    const updateDependency = (
      dependencyType: 'dependencies' | 'devDependencies' | 'peerDependencies'
    ): boolean => {
      if (!pkg.packageJson[dependencyType]?.[name]) return false;

      pkg.packageJson[dependencyType] ??= {};

      const isPeerDep = dependencyType === 'peerDependencies';
      pkg.packageJson[dependencyType][name] = `link:${path}`

      if (isPeerDep) {
        delete pkg.packageJson.peerDependencies?.[name];
        pkg.packageJson.devDependencies ??= {};
        pkg.packageJson.devDependencies[name] = `link:${path}`;
        if (pkg.packageJson.peerDependencies && Object.keys(pkg.packageJson.peerDependencies).length === 0) {
          delete pkg.packageJson.peerDependencies;
        }
      }

      return true;
    };
    changeMark ||= updateDependency('peerDependencies');
    changeMark ||= updateDependency('dependencies');
    changeMark ||= updateDependency('devDependencies');
    if (changeMark) {
      fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg.packageJson, null, 2), 'utf8');
      console.log(`已迁移 ${pkg.dir} ${name}: (link:${path})`);
    }
  }
}
