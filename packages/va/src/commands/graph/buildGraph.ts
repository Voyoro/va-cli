import path from 'node:path'
import type { FileScanResult } from './types'

export interface WorkspacePackage {
  name: string
  dir: string
}

export interface GraphNode {
  id: string
  type: 'file' | 'package' | 'workspace-group' | 'workspace-package'
  label: string
  shortLabel: string
  workspace?: string
  parent?: string
}

export interface GraphEdge {
  source: string
  target: string
  type: 'import' | 'dynamic-import' | 'workspace-import' | 'workspace-bridge'
}

export interface DependencyGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

function normalizePath(input: string) {
  return input.replaceAll('\\', '/')
}

function normalizeFsPath(input: string) {
  const normalized = normalizePath(path.resolve(input))
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function shortLabel(input: string, max = 22) {
  if (input.length <= max) return input
  return `${input.slice(0, max - 1)}…`
}

function parseStringLiteral(input?: string): string | undefined {
  if (!input) return
  const matched = input.trim().match(/^['"`](.+)['"`]$/)
  return matched?.[1]
}

function stripQueryAndHash(source: string) {
  return source.split('?')[0].split('#')[0]
}

function normalizeImportSource(source: string) {
  return stripQueryAndHash(source).replace(/\/+$/, '')
}

function getPackageRoot(source: string) {
  const normalized = normalizeImportSource(source)
  if (!normalized) return normalized
  if (normalized.startsWith('@')) {
    const [scope, name] = normalized.split('/')
    if (scope && name) return `${scope}/${name}`
    return normalized
  }
  return normalized.split('/')[0]
}

function resolveRelativeImport(filePath: string, source: string, fileIndex: Map<string, string>) {
  const cleanSource = normalizeImportSource(source)
  const base = path.resolve(path.dirname(filePath), cleanSource)
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.vue`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
    path.join(base, 'index.jsx'),
    path.join(base, 'index.vue'),
  ]

  for (const candidate of candidates) {
    const normalized = normalizeFsPath(candidate)
    const resolved = fileIndex.get(normalized)
    if (resolved) return resolved
  }
}

function buildRelativeFallbackPath(filePath: string, source: string, rootDir: string) {
  const cleanSource = normalizeImportSource(source)
  const base = path.resolve(path.dirname(filePath), cleanSource)
  const rel = normalizePath(path.relative(rootDir, base))
  if (/\.[a-zA-Z0-9]+$/.test(rel)) return rel
  return normalizePath(path.join(rel, 'index'))
}

function toPackageNodeId(source: string) {
  return `pkg:${getPackageRoot(source)}`
}

function shouldIgnoreImportSource(source: string) {
  const normalized = normalizeImportSource(source).toLowerCase()
  return /\.(png|jpe?g|gif|svg|webp|avif|bmp|ico|mp4|webm|mp3|wav|ogg|css|scss|less)$/.test(normalized)
}

function shouldIgnorePackageImport(source: string) {
  const normalized = normalizeImportSource(source).toLowerCase()
  return normalized === 'vue'
    || normalized.startsWith('vue/')
    || normalized === 'ant-design-vue'
    || normalized.startsWith('ant-design-vue/')
    || normalized === 'vue-router'
    || normalized.startsWith('vue-router/')
}

function resolveWorkspaceImport(source: string, workspaceNames: string[]) {
  const normalized = normalizeImportSource(source)
  const sorted = [...workspaceNames].sort((a, b) => b.length - a.length)
  return sorted.find(name => normalized === name || normalized.startsWith(`${name}/`))
}

function findFileWorkspace(filePath: string, workspaces: WorkspacePackage[]) {
  const normalizedFilePath = normalizePath(path.resolve(filePath))
  const sorted = [...workspaces].sort((a, b) => b.dir.length - a.dir.length)

  for (const ws of sorted) {
    const wsDir = `${normalizePath(path.resolve(ws.dir))}/`
    if (normalizedFilePath.startsWith(wsDir)) return ws.name
  }
}

export function buildDependencyGraph(
  results: FileScanResult[],
  rootDir: string,
  workspaces: WorkspacePackage[] = []
): DependencyGraph {
  const nodes = new Map<string, GraphNode>()
  const edges = new Map<string, GraphEdge>()
  const fileIndex = new Map<string, string>()
  for (const item of results) {
    fileIndex.set(normalizeFsPath(item.filePath), item.filePath)
  }
  const workspaceNames = workspaces.map(item => item.name)

  const ensureNode = (node: GraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node)
  }

  const addEdge = (source: string, target: string, type: GraphEdge['type']) => {
    const edgeId = `${source}|${target}|${type}`
    if (!edges.has(edgeId)) edges.set(edgeId, { source, target, type })
  }

  const toFileNodeId = (absFilePath: string) => normalizePath(path.relative(rootDir, absFilePath))

  const ensureWorkspaceGroup = (workspaceName: string) => {
    const groupId = `group:${workspaceName}`
    ensureNode({
      id: groupId,
      type: 'workspace-group',
      label: workspaceName,
      shortLabel: shortLabel(workspaceName, 30),
      workspace: workspaceName,
    })

    const packageId = `ws:${workspaceName}`
    ensureNode({
      id: packageId,
      type: 'workspace-package',
      label: workspaceName,
      shortLabel: shortLabel(workspaceName, 30),
      workspace: workspaceName,
      parent: groupId,
    })

    return groupId
  }

  for (const file of results) {
    const workspaceName = findFileWorkspace(file.filePath, workspaces)
    const groupId = workspaceName ? ensureWorkspaceGroup(workspaceName) : undefined

    const fromNode = toFileNodeId(file.filePath)
    ensureNode({
      id: fromNode,
      type: 'file',
      label: fromNode,
      shortLabel: shortLabel(path.basename(fromNode), 24),
      workspace: workspaceName,
      parent: groupId,
    })

    const linkToResolvedFile = (resolvedFile: string, importType: 'import' | 'dynamic-import') => {
      const targetWorkspace = findFileWorkspace(resolvedFile, workspaces)
      const targetGroupId = targetWorkspace ? ensureWorkspaceGroup(targetWorkspace) : undefined
      const toNode = toFileNodeId(resolvedFile)

      ensureNode({
        id: toNode,
        type: 'file',
        label: toNode,
        shortLabel: shortLabel(path.basename(toNode), 24),
        workspace: targetWorkspace,
        parent: targetGroupId,
      })

      // Cross-workspace import is bridged via the workspace package node:
      // B component -> A workspace node -> A component.
      if (workspaceName && targetWorkspace && workspaceName !== targetWorkspace) {
        addEdge(fromNode, `ws:${targetWorkspace}`, 'workspace-import')
        addEdge(`ws:${targetWorkspace}`, toNode, 'workspace-bridge')
      } else {
        addEdge(fromNode, toNode, importType)
      }
    }

    for (const item of file.imports) {
      const source = item.source
      if (!source) continue
      if (shouldIgnoreImportSource(source)) continue
      if (shouldIgnorePackageImport(source)) continue

      if (source.startsWith('.')) {
        const resolved = resolveRelativeImport(file.filePath, source, fileIndex)
        if (resolved) {
          linkToResolvedFile(resolved, 'import')
        } else {
          const toNode = `unresolved:${buildRelativeFallbackPath(file.filePath, source, rootDir)}`
          ensureNode({
            id: toNode,
            type: 'package',
            label: `unresolved:${buildRelativeFallbackPath(file.filePath, source, rootDir)}`,
            shortLabel: shortLabel(path.basename(buildRelativeFallbackPath(file.filePath, source, rootDir))),
          })
          addEdge(fromNode, toNode, 'import')
        }
      } else {
        const workspaceImport = resolveWorkspaceImport(source, workspaceNames)
        if (workspaceImport) {
          ensureWorkspaceGroup(workspaceImport)
          const pkgNodeId = toPackageNodeId(workspaceImport)
          ensureNode({
            id: pkgNodeId,
            type: 'package',
            label: workspaceImport,
            shortLabel: shortLabel(workspaceImport),
          })
          addEdge(fromNode, pkgNodeId, 'import')
          addEdge(pkgNodeId, `ws:${workspaceImport}`, 'workspace-import')
        } else {
          const toNode = toPackageNodeId(source)
          ensureNode({
            id: toNode,
            type: 'package',
            label: source,
            shortLabel: shortLabel(source),
          })
          addEdge(fromNode, toNode, 'import')
        }
      }
    }

    for (const call of file.calls) {
      if (call.callee !== 'import') continue

      const source = parseStringLiteral(call.args[0])
      if (!source) continue
      if (shouldIgnoreImportSource(source)) continue
      if (shouldIgnorePackageImport(source)) continue

      if (source.startsWith('.')) {
        const resolved = resolveRelativeImport(file.filePath, source, fileIndex)
        if (resolved) {
          linkToResolvedFile(resolved, 'dynamic-import')
        } else {
          const toNode = `unresolved:${buildRelativeFallbackPath(file.filePath, source, rootDir)}`
          ensureNode({
            id: toNode,
            type: 'package',
            label: `unresolved:${buildRelativeFallbackPath(file.filePath, source, rootDir)}`,
            shortLabel: shortLabel(path.basename(buildRelativeFallbackPath(file.filePath, source, rootDir))),
          })
          addEdge(fromNode, toNode, 'dynamic-import')
        }
      } else {
        const workspaceImport = resolveWorkspaceImport(source, workspaceNames)
        if (workspaceImport) {
          ensureWorkspaceGroup(workspaceImport)
          const pkgNodeId = toPackageNodeId(workspaceImport)
          ensureNode({
            id: pkgNodeId,
            type: 'package',
            label: workspaceImport,
            shortLabel: shortLabel(workspaceImport),
          })
          addEdge(fromNode, pkgNodeId, 'dynamic-import')
          addEdge(pkgNodeId, `ws:${workspaceImport}`, 'workspace-import')
        } else {
          const toNode = toPackageNodeId(source)
          ensureNode({
            id: toNode,
            type: 'package',
            label: source,
            shortLabel: shortLabel(source),
          })
          addEdge(fromNode, toNode, 'dynamic-import')
        }
      }
    }
  }

  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  }
}

