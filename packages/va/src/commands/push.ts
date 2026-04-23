import { getGitBranch, gitPushForGerrit } from '@ebdp-script/node-va-utils'
import type { CAC } from "cac"

export async function definePushCommand(cac: CAC) {
  cac.command('push [branch...]', 'Push packages to npm')
    .option('--current -c', 'Push to the current branch', { default: true })
    .action(async (branch: string) => {
      try {
        let pushBranch = branch ? branch : (await getGitBranch())
        await gitPushForGerrit(pushBranch)
      } catch (error) {
        console.log(error)
      } finally {
        process.exit(1)
      }
    })
}
