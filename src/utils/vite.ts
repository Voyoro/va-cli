import fs from 'node:fs'
import path from 'node:path'
import {
  Identifier,
  Node,
  ObjectLiteralExpression,
  Project,
  SourceFile,
  QuoteKind,
  SyntaxKind,
} from 'ts-morph'
import { findMonorepoRoot } from './monorepo'

const project = new Project({
  manipulationSettings: {
    quoteKind: QuoteKind.Single,
    useTrailingCommas: false,
  },
  skipAddingFilesFromTsConfig: true,
})

const VITE_CONFIG_NAMES = [
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mts',
  'vite.config.mjs',
] as const

export type ViteConfigPatchInput = {
  packageNames: string[]
  packagePaths: string[]
}

export function patchViteConfigForDir(dir: string, input: ViteConfigPatchInput) {
  const configPath = findViteConfigPath(dir)
  if (!configPath) {
    return false
  }

  const source = fs.readFileSync(configPath, 'utf8')
  const configDir = normalizePath(path.dirname(configPath))
  const workspaceRoot = normalizePath(findMonorepoRoot(configDir))
  const result = updateViteConfigSource(configPath, source, {
    ...input,
    packagePaths: uniqueSorted([
      ...input.packagePaths,
      configDir,
      workspaceRoot,
    ]),
  })
  if (!result.changed) {
    return false
  }

  fs.writeFileSync(configPath, result.code, 'utf8')
  return true
}

export function updateViteConfigSource(
  filePath: string,
  source: string,
  input: ViteConfigPatchInput,
) {
  const sourceFile = project.createSourceFile(filePath, source, { overwrite: true })
  const configObject = findViteConfigObject(sourceFile)
  if (!configObject) {
    return { changed: false, code: source }
  }

  const targetConfigObject = getEffectiveViteConfigObject(configObject)

  const normalizedPaths = uniqueSorted(input.packagePaths.map(normalizePath))
  const packageNames = uniqueSorted(input.packageNames)
  let changed = false

  if (mergeArrayIntoProperty(
    ensureObjectProperty(ensureObjectProperty(targetConfigObject, 'server'), 'fs'),
    'allow',
    normalizedPaths,
  )) {
    changed = true
  }

  if (mergeArrayIntoProperty(
    ensureObjectProperty(targetConfigObject, 'optimizeDeps'),
    'exclude',
    packageNames,
  )) {
    changed = true
  }

  if (!changed) {
    return { changed: false, code: source }
  }

  sourceFile.formatText()
  return { changed: true, code: sourceFile.getFullText() }
}

function findViteConfigPath(dir: string) {
  for (const filename of VITE_CONFIG_NAMES) {
    const fullPath = path.join(dir, filename)
    if (fs.existsSync(fullPath)) {
      return fullPath
    }
  }

  return undefined
}

function findViteConfigObject(sourceFile: ReturnType<Project['createSourceFile']>) {
  const exportAssignment = sourceFile.getExportAssignment(node => !node.isExportEquals())
  if (!exportAssignment) {
    return undefined
  }

  return unwrapConfigObject(exportAssignment.getExpression(), sourceFile)
}

function unwrapConfigObject(node: Node | undefined, sourceFile: SourceFile): ObjectLiteralExpression | undefined {
  if (!node) {
    return undefined
  }

  if (Node.isObjectLiteralExpression(node)) {
    return node
  }

  if (Node.isIdentifier(node)) {
    return resolveIdentifierObject(node, sourceFile)
  }

  if (Node.isParenthesizedExpression(node) || Node.isAsExpression(node) || Node.isSatisfiesExpression(node)) {
    return unwrapConfigObject(node.getExpression(), sourceFile)
  }

  if (Node.isCallExpression(node)) {
    const [firstArg] = node.getArguments()
    return unwrapConfigObject(firstArg, sourceFile)
  }

  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
    const body = node.getBody()
    if (Node.isBlock(body)) {
      const returned = body.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0]?.getExpression()
      return unwrapConfigObject(returned, sourceFile)
    }

    return unwrapConfigObject(body, sourceFile)
  }

  return undefined
}

function resolveIdentifierObject(node: Identifier, sourceFile: SourceFile) {
  const definitions = node.getDefinitions()
  for (const definition of definitions) {
    const declarationNode = definition.getDeclarationNode()
    if (declarationNode && Node.isVariableDeclaration(declarationNode)) {
      return unwrapConfigObject(declarationNode.getInitializer(), sourceFile)
    }
  }

  return undefined
}

function getEffectiveViteConfigObject(configObject: ObjectLiteralExpression) {
  const viteProperty = configObject.getProperty('vite')
  if (viteProperty && Node.isPropertyAssignment(viteProperty)) {
    const initializer = viteProperty.getInitializer()
    if (initializer && Node.isObjectLiteralExpression(initializer)) {
      return initializer
    }
  }

  return configObject
}

function ensureObjectProperty(parent: ObjectLiteralExpression, propertyName: string) {
  const existing = parent.getProperty(propertyName)
  if (existing && Node.isPropertyAssignment(existing)) {
    const initializer = existing.getInitializer()
    if (initializer && Node.isObjectLiteralExpression(initializer)) {
      return initializer
    }
  }

  const property = parent.addPropertyAssignment({
    initializer: '{}',
    name: propertyName,
  })

  return property.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression)
}

function mergeArrayIntoProperty(
  parent: ObjectLiteralExpression,
  propertyName: string,
  values: string[],
) {
  if (values.length === 0) {
    return false
  }

  const existing = parent.getProperty(propertyName)
  if (existing && Node.isPropertyAssignment(existing)) {
    const initializer = existing.getInitializer()
    if (initializer && Node.isArrayLiteralExpression(initializer)) {
      const currentValues = initializer.getElements().map(element => stripQuotes(element.getText()))
      const mergedValues = uniqueSorted([...currentValues, ...values])
      if (mergedValues.length === currentValues.length && mergedValues.every((value, index) => value === currentValues[index])) {
        return false
      }

      initializer.replaceWithText(`[${mergedValues.map(value => `'${escapeSingleQuotes(value)}'`).join(', ')}]`)
      return true
    }
  }

  parent.addPropertyAssignment({
    initializer: `[${values.map(value => `'${escapeSingleQuotes(value)}'`).join(', ')}]`,
    name: propertyName,
  })

  return true
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort()
}

function stripQuotes(value: string) {
  return value.replace(/^['"`]/, '').replace(/['"`]$/, '')
}

function escapeSingleQuotes(value: string) {
  return value.replaceAll("'", "\\'")
}

function normalizePath(input: string) {
  return input.replaceAll('\\', '/')
}
