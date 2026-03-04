import { getPackages } from "@manypkg/get-packages";
import type { CAC } from "cac";
import { execa } from "execa";
import fs from 'node:fs';
import { join } from "path";
import { rimraf } from 'rimraf';
import { spinner } from "../utils/spinner";

interface CleanOptions {
  dirs: string[];
  deep: boolean;
  lock: boolean;
}


export function defineCleanCommand(cac: CAC) {
  cac.command('clean [dirs...]', 'Clean the dist directory')
    .option('--deep', 'Deep detail depend includes pnpm symbolic link', { default: false })
    .option('--lock', 'Delete the project lock.json file', { default: true })
    .action(async (dirs: string[] = [], options: Partial<CleanOptions>) => {
      await spinner({
        title: 'Cleaning...',
        successText: 'Clean success',
        failedText: 'Clean failed'
      }, async () => {
        await clean(dirs, options)
      })
    })
}

const DEFAULT_DIRS = [
  'node_modules',
  'dist',
  // 'build',
  // '.output',
  // '.turbo',
  // '.vite',
  // 'coverage',
]

const LOCK_FILES = [
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
]

async function clean(dirs: string[] = [], options: Partial<CleanOptions>) {
  const cwd = process.cwd()
  const delDirs = dirs.length > 0 ? dirs : DEFAULT_DIRS
  if (options.lock) {
    await Promise.all(
      LOCK_FILES.map(file => {
        const filePath = join(cwd, file);
        if (fs.existsSync(filePath)) {
          return rimraf(filePath, {
            preserveRoot: true
          });
        }
        return Promise.resolve();
      }),
    )
  }
  if (options.deep) {
    await deepCleanDirs()
  }
  await removeDirs(cwd, delDirs)
  const packages = await getPackages(cwd)
  await Promise.all(
    packages.packages.map(pkg => {
      return removeDirs(pkg.dir, delDirs)
    }),
  )
}

async function removeDirs(base: string, dirs: string[]) {
  await Promise.all(
    dirs.map(dir =>
      rimraf(join(base, dir), {
        preserveRoot: true
      }),
    ),
  )
}

async function deepCleanDirs() {
  const cwd = process.cwd()
  //pnpm
  if (fs.existsSync(join(cwd, 'pnpm-workspace.yaml'))) {
    await execa('pnpm', ['store', 'prune'], {
      cwd,
      stdio: 'pipe',
    })
    return
  }
  if (fs.existsSync(join(cwd, 'yarn.lock'))) {
    await execa('yarn', ['cache', 'clean'], {
      cwd,
      stdio: 'pipe',
    })
    return
  }
}
