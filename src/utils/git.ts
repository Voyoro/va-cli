import { execa } from "execa";
import { COMMIT_TYPES } from "../contants";

export async function getGitBranch(cwd: string = process.cwd()): Promise<string> {
  return await execa('git', ['branch', '--show-current'], {
    cwd,
    stdio: 'pipe',
  }).then(result => result.stdout.trim())
}


export async function gitCommit(message: string, cwd: string = process.cwd()): Promise<void> {
  if (!message) {
    console.log('[Error] Please enter a valid commit message')
    return
  }
  const startsWithValidType = COMMIT_TYPES.some(type => message.startsWith(type));
  if (!startsWithValidType) {
    return;
  }
  await execa('git', ['add', '.'], { cwd, stdio: 'inherit' })
  await execa('git', ['commit', '-m', message], {
    cwd,
    stdio: 'inherit',
  })
}

export async function gitTag(version: string, cwd: string = process.cwd()) {
  await execa('git', ['tag', `v${version}`], { cwd, stdio: 'inherit' })
}

export async function gitPush(branch: string, cwd: string = process.cwd()) {
  await execa('git', ['push', 'origin', branch], { cwd, stdio: 'inherit' })
}

export async function gitPushForGerrit(branch: string, cwd: string = process.cwd()) {
  await execa('git', ['push', 'origin', `HEAD:refs/for/${branch}`], { cwd, stdio: 'inherit' });
}
export async function gitStatus(cwd: string = process.cwd()) {
  const result = await execa('git status --porcelain', { cwd, stdio: 'pipe' });
  return result.stdout;
}
export async function gitHead(cwd: string = process.cwd()) {
  const result = await execa('git rev-parse HEAD', { cwd, stdio: 'pipe' });
  return result.stdout;
}
export async function gitBranch(cwd: string = process.cwd()) {
  const result = await execa('git rev-parse --abbrev-ref HEAD', { cwd, stdio: 'pipe' });
  return result.stdout;
}

export async function gitStash(content: string, cwd: string = process.cwd()) {
  const result = await execa(
    'git',
    ['stash', 'push', '-u', '-m', content],
    { cwd, stdio: 'pipe' }
  );
  return result.stdout;
}

export async function gitDiff(cwd: string = process.cwd()) {
  const result = await execa('git', ['diff'], { cwd, stdio: 'pipe' });
  return result.stdout;
}
