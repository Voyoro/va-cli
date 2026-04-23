export interface ImportItem {
  source: string
  specifiers: string[]
  defaultImport?: string
  namespaceImport?: string
}

export interface CallItem {
  callee: string
  args: string[]
}

export interface FileScanResult {
  filePath: string
  fileType: 'vue' | 'script'
  imports: ImportItem[]
  calls: CallItem[]
}
