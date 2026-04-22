import fs from 'node:fs/promises'
import { scanScript } from './scanScript'
import { scanVue } from './scanVue'
import type { FileScanResult } from './types'

export async function scanFile(filePath: string): Promise<FileScanResult> {
  if (filePath.endsWith('.vue')) {
    return scanVue(filePath)
  }

  const code = await fs.readFile(filePath, 'utf-8')
  return scanScript(filePath, code)
}
