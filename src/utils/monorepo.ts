import type { Package, Packages } from '@manypkg/get-packages'
import { getPackages as getPackagesFunc, getPackagesSync as getPackagesSyncFunc } from '@manypkg/get-packages'
import { findUpSync } from "find-up"
import { dirname } from 'node:path'

export function findMonorepoRoot(cwd: string = process.cwd()): string {
  const lockFile = findUpSync(
    ['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json'],
    {
      cwd,
      type: 'file',
    },
  )
  return dirname(lockFile || '')
}

export function getPackagesSync(): Packages {
  return getPackagesSyncFunc(findMonorepoRoot())
}

export async function getPackages(): Promise<Packages> {
  return await getPackagesFunc(findMonorepoRoot())
}

export async function getPackage(pkgName: string): Promise<Package | undefined> {
  const { packages } = await getPackages()
  return packages.find(pkg => pkg.packageJson.name === pkgName)
}

export type { Package } from '@manypkg/get-packages'
export { readPackageJSON, writePackageJSON } from 'pkg-types'
export type { PackageJson } from 'pkg-types'
export { parsePnpmWorkspaceYaml } from 'pnpm-workspace-yaml'
export type { PnpmWorkspaceYaml } from 'pnpm-workspace-yaml'

