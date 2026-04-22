import { parse } from '@vue/compiler-sfc'
import fs from 'node:fs/promises'
import { scanScript } from './scanScript'
import type { FileScanResult } from './types'

export async function scanVue(filePath: string): Promise<FileScanResult> {
  const code = await fs.readFile(filePath, 'utf-8')
  const { descriptor } = parse(code, { filename: filePath })

  const parts: string[] = []

  if (descriptor.script?.content) {
    parts.push(descriptor.script.content)
  }

  if (descriptor.scriptSetup?.content) {
    parts.push(descriptor.scriptSetup.content)
  }

  const mergedScript = parts.join('\n')

  return {
    ...scanScript(`${filePath}.ts`, mergedScript),
    filePath,
    fileType: 'vue',
  }
}
