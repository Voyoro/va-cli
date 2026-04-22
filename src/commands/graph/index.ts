import { getPackages } from '@manypkg/get-packages'
import type { CAC } from 'cac'
import http from 'node:http'
import path from 'node:path'
import open from 'open'
import { buildDependencyGraph, type WorkspacePackage } from './buildGraph'
import { collectSourceFiles } from './collectFiles'
import { scanFile } from './core'
import { buildStaticViewerHtml } from './viewer'

async function loadWorkspacePackages(cwd: string): Promise<WorkspacePackage[]> {
  try {
    const { packages } = await getPackages(cwd)
    return packages
      .map((item) => ({
        name: item.packageJson.name || path.basename(item.dir),
        dir: item.dir,
      }))
      .filter(item => Boolean(item.name))
  } catch {
    return []
  }
}

export async function defineGraphCommand(cac: CAC) {
  cac.command('scan', 'scan dependencies and open graph viewer via local http server')
    .option('--port <port>', 'preferred port for local server', { default: 5500 })
    .action(async ({ port }) => {
      const absRoot = path.resolve(process.cwd(), '.')
      const files = await collectSourceFiles(absRoot)

      const results = await Promise.all(files.map(file => scanFile(file)))
      const workspaces = await loadWorkspacePackages(process.cwd())
      const graph = buildDependencyGraph(results, absRoot, workspaces)

      const html = buildStaticViewerHtml(graph)
      const servePort = Number(port) || 5500
      const server = http.createServer((req, res) => {
        const url = req.url || '/'
        if (url === '/' || url === '/graph.html') {
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(html)
          return
        }

        res.statusCode = 404
        res.end('Not Found')
      })

      server.listen(servePort, () => {
        const url = `http://localhost:${servePort}/graph.html`
        console.log('Graph viewer running at:', url)
        open(url)
      })
    })
}
