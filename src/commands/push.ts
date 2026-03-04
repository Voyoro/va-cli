import type { CAC } from "cac"
import { getGitBranch, gitPushForGerrit } from "../utils/git"

export async function definePushCommand(cac: CAC) {
  cac.command('push [branch...]', 'Push packages to npm')
    .option('--current', 'Push to the current branch', { default: true })
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
