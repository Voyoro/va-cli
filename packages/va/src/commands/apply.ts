import { gitStash, gitStatus } from '@ebdp-script/node-va-utils'
import AdmZip from 'adm-zip'
import type { CAC } from 'cac'
import cliProgress from 'cli-progress'
import fs from 'node:fs'
import path from 'node:path'

type PatchManifest = {
  files?: Array<{ path: string; size: number }>
  deleted?: string[]
}

export function defineApplyCommand(cac: CAC) {
  cac.command('apply [version]', 'Extract and use the current patch')
    .action(async (version: string) => {
      const cwd = process.cwd()
      const absZip = path.join(cwd, 'dev-dist', `patch-${version}.zip`)
      if (!fs.existsSync(absZip)) {
        console.error('Patch package not found:', absZip)
        process.exit(1)
      }

      const zip = new AdmZip(absZip)
      const entries = zip.getEntries()
      const getJson = <T>(name: string): T | null => {
        const entry = entries.find(item => item.entryName === name)
        if (!entry) return null
        return JSON.parse(entry.getData().toString('utf8')) as T
      }

      const meta = getJson<Record<string, unknown>>('meta.json')
      const manifest = getJson<PatchManifest>('manifest.json')
      if (!meta || !manifest) {
        console.error('Invalid patch package: missing meta.json or manifest.json')
        process.exit(1)
      }

      const status = await gitStatus()
      if (status) {
        console.log('Local changes detected. Stashing them before applying patch.')
        const res = await gitStash('Patch conflicts temporarily stored')
        console.log(res)
      }

      console.log('Preparing to apply patch:')
      console.log('baseCommit:', meta.baseCommit)
      console.log('branch:', meta.branch)
      console.log('createdAt:', meta.createdAt)

      const entryMap = new Map(entries.map(item => [item.entryName, item]))
      const totalWrite = manifest.files?.length || 0
      const totalDelete = manifest.deleted?.length || 0
      const total = totalWrite + totalDelete
      const bar = new cliProgress.SingleBar(
        {
          format: 'Applying patch |{bar}| {percentage}% | {value}/{total}',
          hideCursor: true,
          clearOnComplete: false,
          stopOnComplete: true,
        },
        cliProgress.Presets.shades_classic,
      )

      bar.start(total || 1, 0, { task: 'init' })
      let changedCount = 0
      let deletedCount = 0

      for (const file of manifest.files || []) {
        const entryName = `files/${file.path}`
        const entry = entryMap.get(entryName)
        if (!entry) {
          bar.increment(1)
          continue
        }

        const out = path.join(cwd, file.path)
        fs.mkdirSync(path.dirname(out), { recursive: true })
        fs.writeFileSync(out, entry.getData())
        changedCount++
        bar.increment(1)
      }

      for (const rel of manifest.deleted || []) {
        const abs = path.join(cwd, rel)
        if (fs.existsSync(abs)) {
          fs.rmSync(abs, { force: true })
          deletedCount++
        }
        bar.increment(1)
      }

      bar.stop()
      console.log('Patch apply completed')
      console.log(`Written: ${changedCount} files`)
      console.log(`Deleted: ${deletedCount} files`)
    })
}
