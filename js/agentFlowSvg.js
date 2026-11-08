/**
 * Flow charts for the Agents tab: a flow from js/agentRegistry.js (resolveFlow) -> an inline SVG string. Pure (no DOM, no libraries), so it is
 * testable in node and the same code draws it in the browser.
 *
 *   layoutFlow(flow, opts)            -> { width, height, boxes: { id: {x,y,w,h} }, edges: [{ key, d, lx, ly, ... }] }
 *   flowSvg(flow, { models, caps, selected })  -> '<svg ...>...</svg>'
 *
 * Boxes sit on a grid (node.col, node.row). An edge leaves the right side of its box and enters the left side of the next one; an edge that goes
 * back (or stays in a column) leaves from the top or bottom. Colours come from CSS classes the page defines (ag-g-<Group>, ag-point, ag-e-*), so the
 * chart follows the page's light and dark themes. Optional edges are dashed; planned agents and the edges to them are dashed and faded.
 */
export const BOX = { w: 156, h: 58, gapX: 112, gapY: 38, pad: 14, labelMax: 20 };

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

export function layoutFlow(flow, o = {}) {
  const B = { ...BOX, ...o };
  const cols = Math.max(...flow.nodes.map(n => n.col)) + 1, rows = Math.max(...flow.nodes.map(n => n.row)) + 1;
  const width = B.pad * 2 + cols * B.w + (cols - 1) * B.gapX, height = B.pad * 2 + rows * B.h + (rows - 1) * B.gapY + 6;
  const boxes = {};
  for (const n of flow.nodes) boxes[n.id] = { x: B.pad + n.col * (B.w + B.gapX), y: B.pad + n.row * (B.h + B.gapY), w: B.w, h: B.h, col: n.col, row: n.row };
  const edges = flow.edges.map(e => {
    const a = boxes[e.from], b = boxes[e.to];
    let x1, y1, x2, y2, d, lx, ly;
    if (b.col > a.col) {                       // forward: right side -> left side
      x1 = a.x + a.w; y1 = a.y + a.h / 2; x2 = b.x; y2 = b.y + b.h / 2;
      const k = Math.max(24, (x2 - x1) / 2);
      d = `M${x1},${y1} C${x1 + k},${y1} ${x2 - k},${y2} ${x2},${y2}`; lx = (x1 + x2) / 2; ly = (y1 + y2) / 2;
    } else if (b.col === a.col) {              // same column: bottom -> top (or top -> bottom)
      const down = b.row > a.row;
      x1 = a.x + a.w / 2; y1 = down ? a.y + a.h : a.y; x2 = b.x + b.w / 2; y2 = down ? b.y : b.y + b.h;
      d = `M${x1},${y1} L${x2},${y2}`; lx = x1; ly = (y1 + y2) / 2;
    } else {                                   // backwards: out of the top of the source, into the top of the target, over an arc
      x1 = a.x + a.w / 2 - 14; y1 = a.y; x2 = b.x + b.w / 2 + 14; y2 = b.y;
      const top = Math.min(y1, y2) - 22;
      d = `M${x1},${y1} C${x1},${top} ${x2},${top} ${x2},${y2}`; lx = (x1 + x2) / 2; ly = top + 8;
    }
    return { key: `${e.from}>${e.to}`, from: e.from, to: e.to, label: e.label, kind: e.kind, optional: !!e.optional, planned: !!e.planned, d, lx, ly };
  });
  return { width, height, boxes, edges };
}

/** The short model name for a box: 'deepseek-chat' stays, 'claude-sonnet-5' -> 'sonnet-5'. */
export const modelBadge = m => (m?.model ? clip(String(m.model).replace(/^claude-/, ''), 20) : null);

export function flowSvg(flow, { models = {}, agents = {}, selected = null, uid = 'f' } = {}) {
  const L = layoutFlow(flow), mk = `${uid}-arrow`, mkc = `${uid}-arrow-c`;
  const out = [];
  out.push(`<svg class="ag-svg" xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}" role="img" aria-label="${esc(flow.name)} flow chart">`);
  out.push(`<defs><marker id="${mk}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ag-arrow"/></marker>`
    + `<marker id="${mkc}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ag-arrow ag-arrow-c"/></marker></defs>`);
  // edges first, so a box drawn later hides the part of a long edge that passes behind it
  for (const e of L.edges) {
    const cls = ['ag-e', e.kind === 'control' ? 'ag-e-control' : 'ag-e-data', e.optional ? 'ag-e-opt' : '', e.planned ? 'ag-e-planned' : '', selected && (e.from === selected || e.to === selected) ? 'ag-e-hot' : ''].filter(Boolean).join(' ');
    out.push(`<path class="${cls}" d="${e.d}" fill="none" marker-end="url(#${e.kind === 'control' ? mkc : mk})"><title>${esc(e.from)} → ${esc(e.to)}: ${esc(e.label)}${e.optional ? ' (optional)' : ''}</title></path>`);
  }
  // a label is written once where several edges leave or enter the same box with the same words (three 'answer' arrows into the Head need one label)
  const seen = new Set();
  for (const e of L.edges) {
    if (seen.has(`o|${e.from}|${e.label}`) || seen.has(`i|${e.to}|${e.label}`)) continue;
    seen.add(`o|${e.from}|${e.label}`); seen.add(`i|${e.to}|${e.label}`);
    const t = clip(e.label, 20), w = Math.max(18, t.length * 5.6 + 8);
    out.push(`<g class="ag-elabel${selected && (e.from === selected || e.to === selected) ? ' ag-e-hot' : ''}" pointer-events="none"><rect x="${(e.lx - w / 2).toFixed(1)}" y="${(e.ly - 7).toFixed(1)}" width="${w.toFixed(1)}" height="13" rx="3"/><text x="${e.lx.toFixed(1)}" y="${(e.ly + 3).toFixed(1)}" text-anchor="middle">${esc(t)}</text></g>`);
  }
  for (const n of flow.nodes) {
    const b = L.boxes[n.id], ag = agents[n.id] ?? null, isAgent = n.kind === 'agent';
    const m = isAgent && ag?.modelTask ? models[ag.modelTask] : null;
    const sub = !isAgent ? n.kind : (ag?.modelTask ? (modelBadge(m) ? (String(m.model).toLowerCase().includes(String(m.provider ?? '#').toLowerCase()) ? modelBadge(m) : `${m.provider ?? ''} · ${modelBadge(m)}`) : ag.modelTask) : 'no model call');
    const cls = ['ag-node', isAgent ? `ag-g-${esc(n.group)}` : 'ag-point', n.planned ? 'ag-planned' : '', selected === n.id ? 'ag-sel' : ''].filter(Boolean).join(' ');
    out.push(`<g class="${cls}" data-node="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.name)}${n.planned ? ' (planned)' : ''}">`
      + `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${isAgent ? 9 : 22}"/>`
      + `<text class="ag-t1" x="${b.x + b.w / 2}" y="${b.y + 24}" text-anchor="middle">${esc(clip(n.name, BOX.labelMax))}</text>`
      + `<text class="ag-t2" x="${b.x + b.w / 2}" y="${b.y + 42}" text-anchor="middle">${esc(clip(sub, 30))}</text>`
      + (isAgent && ag?.spends && !n.planned ? `<g class="ag-spend"><circle cx="${b.x + 12}" cy="${b.y + 12}" r="8"/><text x="${b.x + 12}" y="${b.y + 15.5}" text-anchor="middle">$</text><title>can spend model money</title></g>` : '')
      + (n.planned ? `<text class="ag-plan" x="${b.x + 8}" y="${b.y + 12}">planned</text>` : '')
      + `</g>`);
  }
  out.push('</svg>');
  return out.join('');
}
