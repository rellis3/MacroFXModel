// Proof packs on vol-layer-system.html: what was tested, what was found, the thresholds, the checks and the charts.
// Numbers come from backtest-data/vol-layer/<id>.json, written by scripts/vol-layer/proof.py. Words come from PROOF.

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (v, d = 3) => (Number.isFinite(+v) ? (+v).toFixed(d) : 'not computed');
const signed = (v, d = 3) => (Number.isFinite(+v) ? `${+v >= 0 ? '+' : ''}${(+v).toFixed(d)}` : 'not computed');
const W = 640;

export const PROOF_CSS = `
.pf-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
.pf-card { text-align: left; background: var(--s1); border: 1.5px solid var(--border); border-radius: 12px; padding: 10px 12px; cursor: pointer; color: var(--text2); font-family: 'DM Sans', sans-serif; }
.pf-card:hover { border-color: var(--blue); } .pf-card b { color: var(--text); display: block; font-size: 13px; margin-bottom: 4px; }
.pf-lines { margin: 0; padding: 0; list-style: none; } .pf-lines li { font-size: 12.5px; line-height: 1.55; color: var(--text2); padding: 2px 0; }
.pf-k { font-size: 11px; color: var(--text3); font-family: 'DM Mono', monospace; text-transform: uppercase; letter-spacing: .05em; margin: 12px 0 4px; }
.pf-ok { color: var(--green); font-weight: 700; } .pf-bad { color: var(--red); font-weight: 700; }
.viz { --series-1: #3987e5; --series-2: #d95926; --series-3: #199e70; --grid: rgba(255,255,255,.08); --ink: var(--text2); --ink2: var(--text3); }
.viz svg { width: 100%; height: auto; display: block; } .viz text { fill: var(--ink2); font: 10.5px 'DM Mono', monospace; }
.viz .lbl { fill: var(--ink); } .viz h4 { margin: 0 0 2px; font-size: 13px; color: var(--text); } .viz .sub { font-size: 11.5px; color: var(--text3); margin: 0 0 6px; }
.viz .hit:hover { opacity: .7; } .viz details { margin-top: 4px; font-size: 11px; color: var(--text3); } .viz summary { cursor: pointer; }
.legend { display: flex; gap: 12px; font-size: 11px; color: var(--text2); margin-bottom: 4px; flex-wrap: wrap; } .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 4px; vertical-align: -1px; }
.tr-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; }
.tr-card { border: 1px solid var(--border); border-radius: 10px; padding: 6px 8px; font-size: 11px; color: var(--text2); }
`;

const legend = names => (names.length < 2 ? '' : `<div class="legend">${names.map((n, i) => `<span><i style="background:var(--series-${i + 1})"></i>${esc(n)}</span>`).join('')}</div>`);
const table = (head, rows) => `<details><summary>Show the numbers</summary><div class="scroll"><table class="t"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;

function barsSvg(c) {
  const rows = c.rows, rowH = 20, left = 122, right = 48, plot = W - left - right;
  const vals = rows.flatMap(r => [r.value, r.lo, r.hi]).concat(c.ref ?? 0, 0).filter(Number.isFinite);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const x = v => left + ((v - lo) / span) * plot;
  const h = rows.length * rowH + 22;
  let s = `<svg viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(c.title)}">`;
  s += `<line x1="${x(0)}" x2="${x(0)}" y1="0" y2="${h - 18}" stroke="var(--ink2)"/>`;
  if (c.ref) s += `<line x1="${x(c.ref)}" x2="${x(c.ref)}" y1="0" y2="${h - 18}" stroke="var(--series-2)" stroke-dasharray="4 3"/><text x="${x(c.ref)}" y="${h - 6}" text-anchor="middle">${esc(c.refLabel ?? '')}</text>`;
  rows.forEach((r, i) => {
    const y = i * rowH + 3, a = x(Math.min(0, r.value)), b = x(Math.max(0, r.value));
    s += `<g class="hit"><title>${esc(r.label)}: ${r.value}${r.lo != null ? ` [${r.lo}, ${r.hi}]` : ''} ${esc(c.unit)}</title><rect x="0" y="${y - 2}" width="${W}" height="${rowH}" fill="transparent"/>`;
    s += `<text class="lbl" x="${left - 6}" y="${y + 11}" text-anchor="end">${esc(r.label)}</text><rect x="${a}" y="${y + 2}" width="${Math.max(1.5, b - a)}" height="11" rx="3" fill="var(--series-1)"/>`;
    if (r.lo != null) s += `<line x1="${x(r.lo)}" x2="${x(r.hi)}" y1="${y + 7.5}" y2="${y + 7.5}" stroke="var(--ink)" stroke-width="1.5"/>`;
    s += `<text x="${W - 4}" y="${y + 11}" text-anchor="end">${r.value}</text></g>`;
  });
  return s + '</svg>';
}

function linesSvg(c) {
  const H = 210, L = 44, R = 12, T = 8, B = 22;
  const dateAxis = c.type === 'line';
  const all = c.series.flatMap(s => s.points);
  const key = p => (dateAxis ? Date.parse(p[0]) : p[0]);
  const xs = all.map(key), ys = all.map(p => p[1]).concat(dateAxis ? [0] : []);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = v => L + ((v - x0) / ((x1 - x0) || 1)) * (W - L - R), Y = v => T + (1 - (v - y0) / ((y1 - y0) || 1)) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.title)}">`;
  for (let i = 0; i <= 3; i++) { const v = y0 + (i / 3) * (y1 - y0); s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${L - 5}" y="${Y(v) + 3}" text-anchor="end">${v.toFixed(Math.abs(y1 - y0) < 2 ? 3 : 0)}</text>`; }
  if (dateAxis && y0 < 0 && y1 > 0) s += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--ink2)"/>`;
  const a = dateAxis ? all[0][0].slice(0, 4) : x0, b = dateAxis ? new Date(x1).getUTCFullYear() : x1;
  s += `<text x="${L}" y="${H - 7}">${esc(a)}</text><text x="${W - R}" y="${H - 7}" text-anchor="end">${esc(b)}${c.xlabel ? ` ${esc(c.xlabel)}` : ''}</text>`;
  c.series.forEach((se, i) => {
    const d = se.points.map((p, j) => `${j ? 'L' : 'M'}${X(key(p)).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join('');
    s += `<path d="${d}" fill="none" stroke="var(--series-${i + 1})" stroke-width="2"/>`;
    const last = se.points.at(-1);
    s += `<circle class="hit" cx="${X(key(last))}" cy="${Y(last[1])}" r="4" fill="var(--series-${i + 1})"><title>${esc(se.name)}: ${last[1]}</title></circle>`;
    if (!dateAxis) se.points.forEach(p => { s += `<circle class="hit" cx="${X(key(p))}" cy="${Y(p[1])}" r="4" fill="var(--series-${i + 1})"><title>${esc(se.name)} at ${p[0]}: ${p[1]}</title></circle>`; });
  });
  return s + '</svg>';
}

function histSvg(c) {
  const H = 180, L = 40, B = 22, T = 6, b = c.bins, n = b.length, bw = (W - L - 8) / n, mx = Math.max(...b.map(x => x[1]));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.title)}">`;
  b.forEach((x, i) => { const h = (x[1] / mx) * (H - T - B); s += `<rect class="hit" x="${L + i * bw + 1}" y="${H - B - h}" width="${Math.max(1, bw - 2)}" height="${h}" rx="3" fill="var(--series-1)"><title>From ${x[0]} ${esc(c.unit)}: ${x[1]} trades</title></rect>`; });
  [0, Math.floor(n / 2), n - 1].forEach(i => { s += `<text x="${L + i * bw}" y="${H - 7}">${b[i][0]}</text>`; });
  s += `<text x="${L - 5}" y="${T + 9}" text-anchor="end">${mx}</text><line x1="${L}" x2="${W}" y1="${H - B}" y2="${H - B}" stroke="var(--ink2)"/>`;
  return s + '</svg>';
}

function groupsSvg(c) {
  const rows = c.rows, H = 190, L = 40, B = 22, T = 8, vals = rows.flatMap(r => r.values), y0 = Math.min(...vals) - 0.01, y1 = Math.max(...vals) + 0.01;
  const Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B), gw = (W - L - 8) / rows.length, bw = Math.min(16, gw / 3);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.title)}">`;
  for (let i = 0; i <= 3; i++) { const v = y0 + (i / 3) * (y1 - y0); s += `<line x1="${L}" x2="${W}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${L - 5}" y="${Y(v) + 3}" text-anchor="end">${v.toFixed(2)}</text>`; }
  rows.forEach((r, i) => {
    const cx = L + i * gw + gw / 2;
    r.values.forEach((v, j) => { s += `<circle class="hit" cx="${cx + (j ? 6 : -6)}" cy="${Y(v)}" r="5" fill="var(--series-${j + 1})"><title>${esc(r.label)}, ${esc(c.names[j])}: ${v}</title></circle>`; });
    s += `<line x1="${cx - 6}" x2="${cx + 6}" y1="${Y(r.values[0])}" y2="${Y(r.values[1])}" stroke="var(--ink2)"/><text class="lbl" x="${cx}" y="${H - 7}" text-anchor="middle">${esc(r.label)}</text>`;
  });
  return s + `</svg>`;
}

function tradeSvg(t) {
  const w = 200, h = 110, ys = t.path.map(p => p[1]).concat(t.stop, t.target, 0), xs = t.path.map(p => p[0]);
  const y0 = Math.min(...ys), y1 = Math.max(...ys), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = v => 4 + ((v - x0) / ((x1 - x0) || 1)) * (w - 8), Y = v => 4 + (1 - (v - y0) / ((y1 - y0) || 1)) * (h - 8);
  const d = t.path.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(t.inst)} ${esc(t.date)}"><line x1="4" x2="${w - 4}" y1="${Y(t.target)}" y2="${Y(t.target)}" stroke="var(--series-3)" stroke-dasharray="3 3"/><line x1="4" x2="${w - 4}" y1="${Y(t.stop)}" y2="${Y(t.stop)}" stroke="var(--series-2)" stroke-dasharray="3 3"/><line x1="${X(0)}" x2="${X(0)}" y1="4" y2="${h - 4}" stroke="var(--grid)"/><path d="${d}" fill="none" stroke="var(--series-1)" stroke-width="1.5"/></svg>`;
}

function chartHtml(c) {
  let body = '', tbl = '';
  if (c.type === 'bars') { body = barsSvg(c); tbl = table(['Item', c.unit, 'Low', 'High'], c.rows.map(r => [r.label, r.value, r.lo ?? '', r.hi ?? ''])); }
  if (c.type === 'line' || c.type === 'lines') { body = legend(c.series.map(s => s.name)) + linesSvg(c); tbl = table(['Series', 'Start', 'End'], c.series.map(s => [s.name, s.points[0][1], s.points.at(-1)[1]])); }
  if (c.type === 'hist') { body = histSvg(c); tbl = table([`From (${c.unit})`, 'Trades'], c.bins); }
  if (c.type === 'groups') { body = legend(c.names) + groupsSvg(c); tbl = table(['Item', ...c.names], c.rows.map(r => [r.label, ...r.values])); }
  if (c.type === 'trades') {
    body = `<div class="tr-grid">${c.trades.map(t => `<div class="tr-card"><b>${esc(t.inst)}</b> ${esc(t.date)}<br>${esc(t.side)} · result ${signed(t.r, 2)} R${tradeSvg(t)}</div>`).join('')}</div>`;
  }
  return `<div class="card viz" style="margin-top:12px"><h4>${esc(c.title)}</h4><p class="sub">${esc(c.note ?? '')} Unit: ${esc(c.unit)}.</p>${body}${tbl}</div>`;
}

const NAMES = { VALIDATED: 'v-ok', CONTEXT: 'v-ctx', NULL: 'v-null', UNDERPOWERED: 'v-ctx', INVALID: 'v-bad', INCOMPLETE: 'v-bad' };

function checksTable(ch) {
  if (!ch) return '<p class="empty">Proof checks not computed yet.</p>';
  const mark = ok => (ok ? '<span class="pf-ok">Pass</span>' : '<span class="pf-bad">Fail</span>');
  const rows = Object.entries(ch).map(([q, c]) => {
    const pl = c.planted_large ?? {}, pm = c.planted_min ?? {}, sh = c.shuffle ?? {};
    const shOk = sh.real_beats_all != null ? sh.real_beats_all : (sh.lo <= 0 && 0 <= sh.hi);
    const shTxt = sh.real_beats_all != null ? `real ${fmt(sh.real, 4)}, best shuffle ${fmt(sh.best_shuffle, 4)}` : `[${signed(sh.lo)}, ${signed(sh.hi)}]`;
    return `<tr><td>${esc(q.replaceAll('_', ' '))}</td><td class="num">${signed(c.effect, 4)} [${signed(c.lo, 4)}, ${signed(c.hi, 4)}]</td><td class="num">${signed(c.min_effect, 3)}</td><td class="num">${fmt(c.power, 2)}</td><td>${mark(pl.shift >= 0.5 * pl.injected)} put in ${pl.injected}, got ${signed(pl.shift)}</td><td>${mark(pm.shift >= 0.5 * pm.injected)} put in ${pm.injected}, got ${signed(pm.shift, 4)}</td><td>${mark(shOk)} ${shTxt}</td><td><span class="pill ${NAMES[c.verdict] ?? ''}">${esc(c.verdict)}</span></td></tr>`;
  }).join('');
  const how = Object.values(ch)[0];
  return `<div class="scroll"><table class="t"><thead><tr><th>Question</th><th class="num">Result [95%]</th><th class="num">Smallest effect worth having</th><th class="num">Power</th><th>Large planted edge</th><th>Planted edge at minimum</th><th>Shuffle</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table></div>
  <ul class="pf-lines" style="margin-top:8px"><li><b>Large plant:</b> ${esc(how.planted_large?.how)}.</li><li><b>Minimum plant:</b> ${esc(how.planted_min?.how)}.</li><li><b>Shuffle:</b> ${esc(how.shuffle?.how)}. It should find nothing.</li><li><b>Data used:</b> ${esc(how.rows?.used)} rows. ${esc(how.rows?.note ?? '')}</li><li><b>Model check:</b> ${esc(how.diagnostics?.note ?? '')}</li></ul>`;
}

function theoryHtml(rows) {
  if (!rows?.length) return '';
  const body = rows.map(t => `<tr><td><b>${esc(t.name)}</b><br>${t.lesson ? `<a href="theory-lab/lessons/${esc(t.lesson)}.html" target="_blank">Theory Lab lesson</a>` : '<span class="muted">No lesson yet</span>'}</td><td>${esc(t.says)}</td><td>${esc(t.how)}<div class="muted" style="font-size:10.5px;font-family:'DM Mono',monospace;margin-top:3px">${esc(t.formula)}</div><div class="muted" style="font-size:10.5px">${esc(t.code)}</div></td><td>${esc(t.result)}</td></tr>`).join('');
  return `<div class="card" style="margin-top:12px"><h3>The theory, and how this tested it</h3><div class="scroll"><table class="t"><thead><tr><th>Theory</th><th>What it says</th><th>How we tested it</th><th>What we found</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
}

export function cogReviewHtml(d) {
  if (!d) return '<p class="empty">Loading the review…</p>';
  const cls = { 'LIKELY MISTESTED': 'v-bad', PARTLY: 'v-ctx', 'TEST LOOKS FAIR': 'v-ok' };
  const rows = d.rows.map(r => `<tr><td>${esc(r.area)}</td><td>${esc(r.test)}</td><td>${esc(r.mismatch)}</td><td><span class="pill ${cls[r.rating] ?? ''}">${esc(r.rating)}</span><br>${esc(r.why)}</td><td>${esc(r.retest)}</td></tr>`).join('');
  return `<div class="note"><b>Did we test what C.OG describes?</b> ${esc(d.pattern)} A rating judges the match between his words and our test, not whether he is right. Written by a read-only audit, 7 Nov 2026. Reviewers: please challenge these.</div>
  <div class="card" style="margin-top:12px"><h3>Every area, and the retest that would change our view</h3><div class="scroll"><table class="t"><thead><tr><th>His area</th><th>Our test</th><th>The mismatch</th><th>Rating</th><th>Retest</th></tr></thead><tbody>${rows}</tbody></table></div></div>
  <div class="grid"><div class="card"><h3>Retests, ranked</h3><table class="t"><tbody>${d.top.map(t => `<tr><td class="num">${esc(t[0])}</td><td>Row ${esc(t[1])}: ${esc(t[2])}</td></tr>`).join('')}</tbody></table><p class="muted" style="margin-top:6px">${esc(d.risk)}</p></div>
  <div class="card"><h3>Where his claim is only his statement</h3><table class="t"><tbody>${d.claims.map(t => `<tr><td>${esc(t[0])}</td><td>${esc(t[1])}</td></tr>`).join('')}</tbody></table></div></div>`;
}

export function proofListHtml(PROOF, TESTS) {
  const cards = TESTS.map(t => { const p = PROOF[t.id]; return `<button class="pf-card" data-t="proof-${esc(t.id)}"><b>${esc(p?.title ?? t.id)}</b>${esc(t.date)} · <span class="pill">${esc(t.verdict)}</span><br>${esc(p?.found?.[0] ?? t.output)}</button>`; }).join('');
  return `<div class="note"><b>Proof packs.</b> One per test, so you can see what we ran, what came out and whether the test could have found an edge. Share any pack by its link. Each lists what we did not test, so a reviewer can say what we missed.</div><div class="pf-list">${cards}</div>`;
}

export function proofHtml(id, p, data) {
  const list = (k, rows) => (rows?.length ? `<div class="pf-k">${k}</div><ul class="pf-lines">${rows.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : '');
  return `<div class="v-h" style="padding-top:12px"><span class="v-title">${esc(p.title)}</span><span class="pill">${esc(p.verdict)}</span></div>
  <div class="grid"><div class="card">${list('What we tested', p.tested)}${list('Why we tested it', p.why)}${list('What we found', p.found)}${list('Why it did not work', p.whyNot)}</div>
  <div class="card">${list('Thresholds, set before running', p.thresholds)}${list('How C.OG might use this that we did not test', p.cogGap)}${list('Where to check it', p.docs)}</div></div>
  ${theoryHtml(p.theory)}
  <div class="card" style="margin-top:12px"><h3>Could this test have found an edge?</h3>${checksTable(data?.checks)}</div>
  ${(data?.charts ?? []).map(chartHtml).join('') || '<p class="empty" style="margin-top:12px">Charts are not built yet.</p>'}`;
}
