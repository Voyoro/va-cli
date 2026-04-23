export const graphViewerHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VA Dependency Graph</title>
    <style>
      :root {
        color-scheme: light;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: 'Segoe UI', 'PingFang SC', sans-serif;
        background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
        color: #0f172a;
      }

      .toolbar {
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        border-bottom: 1px solid #e2e8f0;
        background: rgba(255, 255, 255, 0.92);
      }

      .title {
        font-size: 16px;
        font-weight: 600;
      }

      .hint {
        font-size: 12px;
        color: #64748b;
      }
      .tools {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .search-input {
        width: 260px;
        height: 30px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 0 10px;
        font-size: 12px;
      }
      .search-btn {
        height: 30px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 0 10px;
        background: #fff;
        cursor: pointer;
        font-size: 12px;
      }
      .search-stat {
        font-size: 12px;
        color: #475569;
        min-width: 56px;
        text-align: right;
      }

      .main {
        position: relative;
      }

      #graph {
        width: 100vw;
        height: calc(100vh - 56px);
      }

      .panel {
        position: fixed;
        right: 16px;
        top: 72px;
        width: 340px;
        max-height: calc(100vh - 96px);
        overflow: auto;
        border: 1px solid #e2e8f0;
        background: rgba(255, 255, 255, 0.94);
        border-radius: 12px;
        padding: 12px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      }

      .panel-title {
        font-size: 13px;
        color: #334155;
        margin-bottom: 8px;
      }

      .panel-pre {
        font-size: 12px;
        line-height: 1.5;
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .legend {
        margin-top: 10px;
        border-top: 1px solid #e2e8f0;
        padding-top: 10px;
        font-size: 12px;
        color: #475569;
      }

      .legend-row {
        margin-bottom: 4px;
      }
    </style>
    <script src="https://unpkg.com/force-graph"></script>
  </head>
  <body>
    <header class="toolbar">
      <div class="title">VA Dependency Graph (ForceGraph)</div>
      <div class="tools">
        <input id="searchInput" class="search-input" placeholder="Search by name or path..." />
        <button id="searchBtn" class="search-btn">Search</button>
        <button id="clearBtn" class="search-btn">Clear</button>
        <span id="searchStat" class="search-stat">0 hit</span>
      </div>
      <div class="hint">Click node to highlight trunk. Click canvas to reset.</div>
    </header>
    <main class="main">
      <div id="graph"></div>
      <aside class="panel">
        <div class="panel-title">Selected Node</div>
        <pre id="detail" class="panel-pre">Click a node to view details.</pre>
        <div class="legend">
          <div class="legend-row">Blue: source file</div>
          <div class="legend-row">Green: external package</div>
          <div class="legend-row">Amber: workspace package</div>
          <div class="legend-row">Gray: workspace group label node</div>
          <div class="legend-row">Red: selected trunk nodes/links</div>
        </div>
      </aside>
    </main>
    <script type="module" src="./graph.js"></script>
  </body>
</html>
`

export const graphViewerScript = `async function init() {
  const detail = document.getElementById('detail')
  const container = document.getElementById('graph')
  const searchInput = document.getElementById('searchInput')
  const searchBtn = document.getElementById('searchBtn')
  const clearBtn = document.getElementById('clearBtn')
  const searchStat = document.getElementById('searchStat')
  const rawGraph = window.__GRAPH_DATA__ || await (await fetch('/graph.json')).json()

  const graph = {
    nodes: rawGraph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label || node.id,
      shortLabel: node.shortLabel || node.label || node.id,
      workspace: node.workspace || '',
    })),
    links: rawGraph.edges.map((edge, index) => ({
      id: edge.source + '->' + edge.target + '-' + String(index),
      source: edge.source,
      target: edge.target,
      type: edge.type,
    })),
  }

  const workspaceCenter = new Map()
  const workspaceList = [...new Set(graph.nodes.map((n) => n.workspace).filter(Boolean))]
  const cols = Math.max(1, Math.ceil(Math.sqrt(workspaceList.length || 1)))
  const gapX = 1180
  const gapY = 920

  workspaceList.forEach((name, index) => {
    workspaceCenter.set(name, {
      x: (index % cols) * gapX,
      y: Math.floor(index / cols) * gapY,
    })
  })

  graph.nodes.forEach((node, index) => {
    if (node.workspace && workspaceCenter.has(node.workspace)) {
      const c = workspaceCenter.get(node.workspace)
      const angle = (index % 36) * (Math.PI / 18)
      const radius = 220 + (index % 16) * 24
      node.x = c.x + Math.cos(angle) * radius
      node.y = c.y + Math.sin(angle) * radius
    } else {
      node.x = (index % 16) * 120
      node.y = Math.floor(index / 16) * 120
    }
  })

  const graphInstance = ForceGraph()(container)
    .width(window.innerWidth)
    .height(window.innerHeight - 56)
    .graphData(graph)
    .nodeId('id')
    .linkSource('source')
    .linkTarget('target')
    .nodeRelSize(6)
    .autoPauseRedraw(false)
    .cooldownTicks(320)
    .linkDirectionalArrowLength(8)
    .linkDirectionalArrowRelPos(0.92)
    .linkCurvature(0.06)

  const selectedNodeIds = new Set()
  const selectedLinkIds = new Set()
  const relatedNodeIds = new Set()
  const searchMatchedNodeIds = new Set()

  graphInstance.d3Force('charge').strength(-420)
  graphInstance.d3Force('link').distance((link) => {
    const source = typeof link.source === 'object' ? link.source : { type: 'file' }
    const target = typeof link.target === 'object' ? link.target : { type: 'file' }
    if (source.type === 'workspace-group' || target.type === 'workspace-group') return 320
    if (source.type === 'workspace-package' || target.type === 'workspace-package') return 260
    return 190
  })
  graphInstance.d3VelocityDecay(0.22)

  function baseNodeColor(node) {
    if (node.type === 'workspace-package') return '#d97706'
    if (node.type === 'package') return '#0f766e'
    if (node.type === 'workspace-group') return '#64748b'
    return '#2563eb'
  }

  function baseNodeSize(node) {
    if (node.type === 'workspace-package') return 7
    if (node.type === 'package') return 6
    if (node.type === 'workspace-group') return 5
    return 5
  }

  function isNodeHighlighted(node) {
    return selectedNodeIds.has(node.id) || relatedNodeIds.has(node.id) || searchMatchedNodeIds.has(node.id)
  }

  function getLinkId(link) {
    if (link.id) return link.id
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source
    const targetId = typeof link.target === 'object' ? link.target.id : link.target
    return sourceId + '->' + targetId
  }

  function isLinkHighlighted(link) {
    if (selectedLinkIds.has(getLinkId(link))) return true
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source
    const targetId = typeof link.target === 'object' ? link.target.id : link.target
    return searchMatchedNodeIds.has(sourceId) && searchMatchedNodeIds.has(targetId)
  }

  function redraw() {
    // no-op: with autoPauseRedraw(false), canvas repaints continuously.
  }

  graphInstance
    .nodePointerAreaPaint((node, color, ctx) => {
      const radius = baseNodeSize(node) + 8
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false)
      ctx.fill()
    })
    .nodeCanvasObject((node, ctx, globalScale) => {
      const label = node.shortLabel
      const textSize = Math.max(8, 11 / globalScale)
      const radius = baseNodeSize(node) + (selectedNodeIds.has(node.id) ? 2.5 : 0)
      const highlighted = isNodeHighlighted(node)
      const hasActiveTrunk = selectedNodeIds.size > 0
      const hasSearch = searchMatchedNodeIds.size > 0
      const dimmed = hasActiveTrunk
        ? !highlighted
        : hasSearch
          ? !searchMatchedNodeIds.has(node.id)
          : false

      ctx.beginPath()
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false)
      ctx.fillStyle = selectedNodeIds.has(node.id)
        ? '#ef4444'
        : relatedNodeIds.has(node.id)
          ? '#0ea5e9'
          : baseNodeColor(node)
      ctx.globalAlpha = dimmed ? 0.15 : 1
      ctx.fill()

      if (highlighted) {
        ctx.lineWidth = 1.4 / globalScale
        ctx.strokeStyle = selectedNodeIds.has(node.id) ? '#b91c1c' : '#0369a1'
        ctx.stroke()
      }

      if (label) {
        ctx.font = textSize + 'px Sans-Serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = '#0f172a'
        ctx.globalAlpha = dimmed ? 0.2 : 0.9
        ctx.fillText(label, node.x, node.y + radius + 2)
      }

      ctx.globalAlpha = 1
    })
    .linkWidth((link) => (isLinkHighlighted(link) ? 2.6 : 1.1))
    .linkColor((link) => {
      if (isLinkHighlighted(link)) return '#ef4444'
      const hasActive = selectedNodeIds.size > 0 || searchMatchedNodeIds.size > 0
      return hasActive ? 'rgba(148,163,184,0.18)' : '#94a3b8'
    })
    .linkDirectionalArrowColor((link) => (isLinkHighlighted(link) ? '#ef4444' : '#64748b'))
    .onNodeClick((node) => {
      searchInput.value = ''
      searchMatchedNodeIds.clear()
      updateSearchStat()
      detail.textContent = 'Click a node to view details.'
      selectedNodeIds.clear()
      selectedLinkIds.clear()
      relatedNodeIds.clear()

      const clickedId = node.id
      const allLinks = graph.links

      function computeTrunk(direction, strictBridge) {
        const firstHopLinks = []
        const firstHopNodeIds = []

        allLinks.forEach((l) => {
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source
          const targetId = typeof l.target === 'object' ? l.target.id : l.target
          const hit = direction === 'out' ? sourceId === clickedId : targetId === clickedId
          if (!hit) return

          firstHopLinks.push(l)
          firstHopNodeIds.push(direction === 'out' ? targetId : sourceId)
        })

        const bridgeNodeIds = []
        const keptFirstHopLinks = []

        firstHopNodeIds.forEach((candidateId, idx) => {
          const hasDownstream = allLinks.some((l2) => {
            const s2 = typeof l2.source === 'object' ? l2.source.id : l2.source
            const t2 = typeof l2.target === 'object' ? l2.target.id : l2.target
            return direction === 'out' ? s2 === candidateId : t2 === candidateId
          })

          if (!strictBridge || hasDownstream) {
            bridgeNodeIds.push(candidateId)
            keptFirstHopLinks.push(firstHopLinks[idx])
          }
        })

        const bridgeSet = new Set(bridgeNodeIds)
        const secondHopLinks = []
        const secondHopNodeIds = []

        allLinks.forEach((l) => {
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source
          const targetId = typeof l.target === 'object' ? l.target.id : l.target
          const hit = direction === 'out' ? bridgeSet.has(sourceId) : bridgeSet.has(targetId)
          if (!hit) return
          secondHopLinks.push(l)
          secondHopNodeIds.push(direction === 'out' ? targetId : sourceId)
        })

        return {
          direction,
          bridgeNodeIds,
          secondHopNodeIds,
          links: [...keptFirstHopLinks, ...secondHopLinks],
        }
      }

      const outStrict = computeTrunk('out', true)
      const inStrict = computeTrunk('in', true)
      let best = outStrict.links.length >= inStrict.links.length ? outStrict : inStrict

      if (best.links.length === 0) {
        const outLoose = computeTrunk('out', false)
        const inLoose = computeTrunk('in', false)
        best = outLoose.links.length >= inLoose.links.length ? outLoose : inLoose
      }

      selectedNodeIds.add(clickedId)
      best.bridgeNodeIds.forEach((id) => relatedNodeIds.add(id))
      best.secondHopNodeIds.forEach((id) => relatedNodeIds.add(id))
      best.links.forEach((l) => selectedLinkIds.add(getLinkId(l)))

      const text = [
        'Type: ' + (node.type || '-'),
        'Workspace: ' + (node.workspace || '-'),
        'Full: ' + (node.label || node.id),
        'Direction: ' + best.direction,
        'Trunk nodes: ' + String(relatedNodeIds.size),
        'Trunk links: ' + String(selectedLinkIds.size),
      ].join('\\n')
      detail.textContent = text

      redraw()
    })
    .onBackgroundClick(() => {
      searchInput.value = ''
      searchMatchedNodeIds.clear()
      updateSearchStat()
      detail.textContent = 'Click a node to view details.'
      selectedNodeIds.clear()
      selectedLinkIds.clear()
      relatedNodeIds.clear()
      detail.textContent = 'Click a node to view details.'
      redraw()
    })

  function updateSearchStat() {
    const n = searchMatchedNodeIds.size
    searchStat.textContent = n + (n === 1 ? ' hit' : ' hits')
  }

  function applySearch() {
    const keyword = (searchInput.value || '').trim().toLowerCase()
    searchMatchedNodeIds.clear()
    if (!keyword) {
      updateSearchStat()
      return
    }

    const hits = graph.nodes.filter((node) => {
      return (node.id || '').toLowerCase().includes(keyword)
        || (node.label || '').toLowerCase().includes(keyword)
        || (node.shortLabel || '').toLowerCase().includes(keyword)
    })

    hits.forEach((node) => searchMatchedNodeIds.add(node.id))
    updateSearchStat()

    if (hits.length > 0) {
      const first = hits[0]
      if (typeof first.x === 'number' && typeof first.y === 'number') {
        graphInstance.centerAt(first.x, first.y, 350)
        graphInstance.zoom(2.1, 350)
      }
      detail.textContent = [
        'Search: ' + keyword,
        'Hits: ' + String(hits.length),
        'First: ' + (first.label || first.id),
      ].join('\\n')
    } else {
      detail.textContent = [
        'Search: ' + keyword,
        'Hits: 0',
      ].join('\\n')
    }
  }

  searchBtn.addEventListener('click', () => {
    applySearch()
  })
  clearBtn.addEventListener('click', () => {
    searchInput.value = ''
    searchMatchedNodeIds.clear()
    updateSearchStat()
    detail.textContent = 'Click a node to view details.'
  })
  searchInput.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter') applySearch()
  })
  updateSearchStat()

  graphInstance.onEngineStop(() => {
    const data = graphInstance.graphData()
    data.nodes.forEach((n) => {
      n.fx = n.x
      n.fy = n.y
    })
    graphInstance.graphData(data)
  })

  window.addEventListener('resize', () => {
    graphInstance.width(window.innerWidth)
    graphInstance.height(window.innerHeight - 56)
  })
}

init()
`

export function buildStaticViewerHtml(graph: unknown) {
  const dataScript = `<script>window.__GRAPH_DATA__ = ${JSON.stringify(graph)};<\/script>`
  const page = graphViewerHtml.replace(
    '<script type="module" src="./graph.js"></script>',
    `${dataScript}\n<script type="module">${graphViewerScript}</script>`
  )
  return page
}
