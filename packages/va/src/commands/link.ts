import type { Package } from '@ebdp-script/node-va-utils';
import { getPackages, patchViteConfigForDir } from '@ebdp-script/node-va-utils';
import type { CAC } from "cac";
import { execa } from "execa";
import fs from 'node:fs';
import path from "node:path";
import { detect as detectPM } from 'package-manager-detector';

type LinkTarget = { key: string, value: string }

const LOCAL_DEPENDENCY_TYPES = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const

export async function defineSymlinkCommand(cac: CAC) {
  cac.command('link', 'By symlink package to joint debugging component package and business package')
    .option('-p,--packagePath <packagePath>', 'Specify the package name of the component to be tested')
    .option('-n,--packageName <packageName>', 'Specify the package name of the component to be tested')
    .action(async (options) => {
      const cwd = process.cwd();
      const localDev = fs.existsSync(path.join(cwd, '.pnpm-local-dev.json'))
        && JSON.parse(fs.readFileSync(path.join(cwd, '.pnpm-local-dev.json'), 'utf-8'));
      const devDepend = Object.entries(localDev)
        .map(([key, value]) => ({ key, value })) as LinkTarget[];

      const { packages } = await getPackages();
      if (!packages || packages.length === 0) {
        console.log('No packages found, please check the workspace root.');
        return;
      }

      const targets = new Map<string, string>();

      if (devDepend.length > 0) {
        for (const { key, value } of devDepend) {
          const resolvedTargets = await resolveLinkTargets(key, value);
          for (const target of resolvedTargets) {
            targets.set(target.key, target.value);
          }
        }
      } else {
        if (!options.packageName) {
          console.log('Please specify the package name to link.');
          return;
        }
        if (!options.packagePath) {
          console.log('Please specify the package path to link.');
          return;
        }

        const resolvedTargets = await resolveLinkTargets(options.packageName, options.packagePath);
        for (const target of resolvedTargets) {
          targets.set(target.key, target.value);
        }
      }

      for (const [name, targetPath] of targets) {
        changeDepend(packages, name, targetPath);
      }

      syncLinkedPackagesViteConfig(packages, [...targets.entries()].map(([name, targetPath]) => ({
        name,
        path: targetPath,
      })));

      const { agent } = await detectPM({
        cwd,
        onUnknown: () => {
          return undefined
        },
      }) || {}
      agent && await execa(agent, ['install'], { cwd, stdio: 'inherit' });
    })
}

export async function resolveLinkTargets(packageName: string, packagePath: string): Promise<LinkTarget[]> {
  const normalizedPath = normalizePath(packagePath);
  const fallbackTargets = [{ key: packageName, value: normalizedPath }];

  try {
    const { packages } = await getPackages(normalizedPath);
    if (!packages.length) {
      return fallbackTargets;
    }

    const packageMap = new Map(
      packages
        .filter(pkg => pkg.packageJson?.name)
        .map(pkg => [pkg.packageJson.name, pkg]),
    );

    const rootPackage = packageMap.get(packageName)
      || packages.find(pkg => normalizePath(pkg.dir) === normalizedPath);

    if (!rootPackage?.packageJson?.name) {
      return fallbackTargets;
    }

    const targets: LinkTarget[] = [];
    const queue = [rootPackage.packageJson.name];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentName = queue.shift();
      if (!currentName || visited.has(currentName)) {
        continue;
      }

      const currentPackage = packageMap.get(currentName);
      if (!currentPackage?.packageJson?.name) {
        continue;
      }

      visited.add(currentName);
      targets.push({
        key: currentName,
        value: currentName === packageName ? normalizedPath : normalizePath(currentPackage.dir),
      });

      for (const dependencyType of LOCAL_DEPENDENCY_TYPES) {
        const dependencies = currentPackage.packageJson[dependencyType] || {};
        for (const dependencyName of Object.keys(dependencies)) {
          if (packageMap.has(dependencyName)) {
            queue.push(dependencyName);
          }
        }
      }
    }

    return targets.length > 0 ? targets : fallbackTargets;
  } catch {
    return fallbackTargets;
  }
}

export function changeDepend(packages: Package[], name: string, path: string) {
  for (const pkg of packages) {
    if (!pkg.packageJson) {
      console.warn(`Skip ${pkg.dir}: missing package.json`);
      continue;
    }

    const pkgJsonPath = `${pkg.dir}/package.json`;
    let changeMark = false
    const updateDependency = (
      dependencyType: 'dependencies' | 'devDependencies' | 'peerDependencies'
    ): boolean => {
      if (!pkg.packageJson[dependencyType]?.[name] || pkg.packageJson[dependencyType]?.[name] === `link:${path}`) return false;

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
      console.log(`Linked ${pkg.dir} ${name}: (link:${path})`);
    }
  }
}

function syncLinkedPackagesViteConfig(
  packages: Package[],
  targets: Array<{ name: string, path: string }>,
) {
  const packageNames = targets.map(target => target.name);
  const packagePaths = targets.map(target => target.path);

  for (const pkg of packages) {
    if (!pkg.packageJson || !usesAnyLinkedPackage(pkg, packageNames)) {
      continue;
    }

    const changed = patchViteConfigForDir(pkg.dir, {
      packageNames,
      packagePaths,
    });

    if (changed) {
      console.log(`Patched Vite config for ${pkg.dir}`);
    }
  }
}

function usesAnyLinkedPackage(pkg: Package, linkedPackageNames: string[]) {
  return (['dependencies', 'devDependencies', 'peerDependencies'] as const)
    .some((dependencyType) => linkedPackageNames.some((name) => pkg.packageJson?.[dependencyType]?.[name]));
}

function normalizePath(input: string) {
  return input.replaceAll('\\', "/");
}
