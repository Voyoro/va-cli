import { Project, SyntaxKind } from 'ts-morph'
import type { CallItem, FileScanResult } from './types'

const propject = new Project({
  skipAddingFilesFromTsConfig: true,
})

const TARGET_CALLEES = new Set([
  '__federation_method_getRemote',
  '__federation_method_setRemote',
  'defineAsyncComponent',
  'defineComponent',
  'import'
])
export function scanScript(filePath: string, code: string): FileScanResult {
  const sourceFile = propject.createSourceFile(filePath, code, {
    overwrite: true
  })
  const imports = sourceFile.getImportDeclarations().map((item) => {
    return {
      source: item.getModuleSpecifierValue(),
      specifiers: item.getNamedImports().map(x => x.getName()),
      defaultImport: item.getDefaultImport()?.getText(),
      NamespaceImport: item.getNamespaceImport()?.getText()
    }
  })
  const calls: CallItem[] = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .map((call) => ({
      callee: call.getExpression().getText(),
      args: call.getArguments().map((arg) => arg.getText()),
    }))
    .filter((item) => TARGET_CALLEES.has(item.callee))

  return {
    filePath,
    fileType: 'script',
    imports,
    calls,
  }
}


