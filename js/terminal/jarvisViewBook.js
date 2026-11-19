// js/terminal/jarvisViewBook.js: Jarvis's BOOK view: the desk's written morning calls as glowing towers on the same street grid as CANDLES. A long call rises above the floor in green, a short call hangs below it in red,
// a flat card is a low plinth drawn in the card's own wording ("Not reviewed" dashed, "Neutral - reviewed" solid). Height = the card's conviction. Beside each tower, a thin cyan bar is what the market actually did today
// (open-to-close against its usual move, the same ratio CANDLES uses), so "the call" and "what happened" sit side by side without either implying the other is right.
// DESCRIPTION ONLY: these are the desk's own written calls, not ours and not a forecast. The bias engine's lean (no proven direction skill) is deliberately NOT drawn here.
import { registerJarvisModule } from './jarvisModules.js';
import { registerShowScene } from './showCore.js';
import { candleRows, candleLayout, ROWS } from './jarvisCandles.js';
import { bookRows, bookSummary, bookScript, towerBox, moveBar, convWord } from './jarvisBookCore.js';

const S = { book: null, layout: null, at: 0, busy: null, err: false };
const todayLondon = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
const word = r => (r.state === 'long' ? 'LONG' : r.state === 'short' ? 'SHORT' : r.state === 'neutral' ? 'Neutral - reviewed' : r.state === 'unreviewed' ? 'Not reviewed' : 'Flat');
const lerp = (a, b, p) => a + (b - a) * p, ease = p => p * p * (3 - 2 * p);

/** Load the desk's book (full run, else the ratings-only summary) and today's move per market. Cached for 5 minutes; never throws. */
export function loadBook(api, force = false) {
  if (!force && S.book && Date.now() - S.at < 300000) return Promise.resolve(S.book);
  if (S.busy) return S.busy;
  S.busy = (async () => {
    let run = null; for (const u of ['/api/desk-run', '/api/desk-run?summary=1']) { try { const j = await api.jf(u); if (j?.ok && j.head && j.head.ok !== false) { run = j; break; } } catch (e) { /* try the next */ } }
    let moves = {}; try { const v = await api.jf('/api/vol-forecast/live'); moves = Object.fromEntries(candleRows(v?.instruments ?? {}, {}).map(r => [r.key, r.ratio])); } catch (e) { /* the day's move is optional */ }
    const b = run ? bookRows(run, moves) : { rows: [], partial: false, date: null };
    S.book = b.rows.length ? { ...b, sum: bookSummary(b.rows) } : null; S.layout = S.book ? candleLayout(b.rows.map(r => r.key)) : null; S.at = Date.now(); S.err = !S.book;
    return S.book;
  })().finally(() => { S.busy = null; });
  return S.busy;
}

const wrap = (ctx, text, w) => { const out = []; let line = ''; for (const wd of String(text).split(/\s+/)) { const t = line ? `${line} ${wd}` : wd; if (ctx.measureText(t).width > w && line) { out.push(line); line = wd; } else line = t; } if (line) out.push(line); return out; };

function draw(ctx, g, api) {
  const { C, fade, W, H, t } = g, st = api.st, B = S.book;
  ctx.save(); ctx.globalAlpha = fade; ctx.textAlign = 'center'; ctx.font = '13px ui-monospace,monospace'; ctx.fillStyle = C.tx2;
  if (!B) { ctx.fillText(S.busy || !S.at ? 'Reading the desk book...' : 'No desk book for today yet', W / 2, H / 2); ctx.font = '11px ui-monospace,monospace'; if (!S.busy && S.at) ctx.fillText('The desk run has not written its calls, or the feed is unavailable. Nothing is drawn rather than guessed.', W / 2, H / 2 + 22); ctx.restore(); return; }
  const P = (x, y, z) => g.proj([x, y, z]);
  // the floor: the same street grid as CANDLES, with a faint scan line sweeping across it
  ctx.lineWidth = 1; ctx.strokeStyle = C.blue;
  for (let i = -11; i <= 11; i++) { const u = i * 0.19; for (const [a, b] of [[[-2.2, 0, u], [2.2, 0, u]], [[u, 0, -1.4], [u, 0, 1.4]]]) { const p = P(...a), q = P(...b); ctx.globalAlpha = 0.08 * fade; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); } }
  { const z = ((t * 0.18) % 1) * 2.8 - 1.4, p = P(-2.2, 0, z), q = P(2.2, 0, z); ctx.globalAlpha = 0.35 * fade; ctx.strokeStyle = C.cy; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
  ctx.font = '10px ui-monospace,monospace'; ctx.textAlign = 'right'; ctx.fillStyle = C.tx2;
  ROWS.forEach(([title], ri) => { if (!title) return; const p = P(-1.55, 0, (ri - (ROWS.length - 1) / 2) * 0.45); ctx.globalAlpha = 0.6 * fade; ctx.fillText(title, p.x, p.y); });
  // the towers, far to near
  const items = B.rows.map(r => { const pos = S.layout[r.key]; if (!pos) return null; const bx = towerBox(r, pos), pts = bx.pts.map(q => P(q[0], q[1], q[2])), tip = P(...bx.tip), base = P(pos.x, 0, pos.z), mb = moveBar(r, pos); return { r, pos, bx, pts, tip, base, mb, mpts: mb?.pts.map(q => P(q[0], q[1], q[2])) }; }).filter(Boolean).sort((a, b) => b.base.z - a.base.z);
  const selK = st.sel;
  for (const o of items) {
    const { r } = o, call = r.call !== 0, c = r.state === 'long' ? C.up : r.state === 'short' ? C.dn : r.state === 'neutral' ? C.tx : C.tx2, fa = fade * Math.min(1, Math.max(0.3, o.base.s * 0.9));
    if (call) { const rr = (16 + 6 * Math.sin(t * 2.2 + o.pos.x * 9)) * o.base.s; ctx.globalAlpha = 0.28 * fa; ctx.strokeStyle = c; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(o.base.x, o.base.y, rr * 1.6, rr * 0.7, 0, 0, 6.2832); ctx.stroke(); }
    for (const sd of o.bx.faces.sides) g.poly(sd, o.pts, c, (call ? 0.4 : 0.14) * fa, c);
    // today's move first (it stands beside the tower, not in front of it)
    if (o.mb) for (const sd of o.bx.faces.sides) g.poly(sd, o.mpts, C.cy, 0.65 * fa, C.cy);
    if (r.state === 'unreviewed' || r.state === 'unknown') { ctx.save(); ctx.setLineDash([4, 3]); g.poly(o.bx.faces.top, o.pts, c, 0.1 * fa, c); ctx.restore(); }
    else g.poly(o.bx.faces.top, o.pts, c, (call ? 0.8 : 0.3) * fa, c);
    if (r.state === 'neutral') { ctx.globalAlpha = 0.9 * fa; ctx.strokeStyle = c; ctx.lineWidth = 1.6; const p = o.pts; ctx.beginPath(); ctx.moveTo(p[4].x, p[4].y); for (const i of [5, 6, 7]) ctx.lineTo(p[i].x, p[i].y); ctx.closePath(); ctx.stroke(); }
    if (call) { const gr = ctx.createRadialGradient(o.tip.x, o.tip.y, 1, o.tip.x, o.tip.y, 30 * o.tip.s); gr.addColorStop(0, c); gr.addColorStop(1, 'transparent'); ctx.globalAlpha = (0.4 + 0.12 * Math.sin(t * 3 + o.pos.z * 7)) * fa; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(o.tip.x, o.tip.y, 30 * o.tip.s, 0, 6.2832); ctx.fill(); }
    if (call || selK === r.key || g.zoom > 1.5) {
      ctx.globalAlpha = fa * (call ? 1 : 0.6); ctx.fillStyle = C.tx; ctx.font = `${Math.round(9 + 3 * Math.min(1.6, o.tip.s))}px ui-monospace,monospace`; ctx.textAlign = 'center';
      ctx.fillText(r.key, o.tip.x, o.tip.y + (r.call < 0 ? 14 * o.tip.s + 8 : -16 * o.tip.s));
    }
    g.hit(r.key, o.tip.x, o.tip.y);
  }
  // the selected card: the desk's own words, kept apart from everything else
  const sel = B.rows.find(r => r.key === selK);
  ctx.textAlign = 'right'; ctx.fillStyle = C.tx2; ctx.font = '11px ui-monospace,monospace'; ctx.globalAlpha = 0.85 * fade;
  const L = ['BOOK  ·  the desk\'s own written calls' + (B.date ? `, ${B.date}` : '') + (B.date && B.date !== todayLondon() ? '  (not today: the latest run)' : ''), B.partial ? 'HEIGHT  ·  conviction is not in the summary feed: every call stands one step tall' : 'HEIGHT  ·  the card\'s conviction: low, medium or high (thickness = its size)', 'GREEN rises = long  ·  RED hangs = short  ·  low plinth = flat: solid "Neutral - reviewed", dashed "Not reviewed"', 'CYAN BAR  ·  what the market actually did today against its usual move (not a verdict on the call)', 'Not shown: the bias engine\'s lean (no proven direction skill). This is a description, not a forecast.'];
  L.forEach((s, i) => ctx.fillText(s, W - 24, H - 205 + i * 16));
  if (sel) {
    const x = W - 380, y = 130; ctx.font = '12px ui-monospace,monospace'; ctx.globalAlpha = 0.95 * fade; ctx.fillStyle = C.tx; ctx.textAlign = 'left';
    ctx.fillText(`${sel.key}  ·  the desk's call: ${word(sel)}${sel.strong ? ' (strong)' : ''}`, x, y); ctx.fillStyle = C.tx2; ctx.font = '11px ui-monospace,monospace';
    ctx.fillText(`conviction ${convWord({ conviction: sel.conv }) ?? 'n/a'}${sel.size != null ? `  ·  size ${sel.size}` : ''}  ·  today ${sel.move == null ? 'no read' : `${sel.move >= 0 ? '+' : ''}${sel.move.toFixed(1)}x usual move`}`, x, y + 16);
    wrap(ctx, sel.why || 'The card carries no written thesis.', 340).slice(0, 5).forEach((s, i) => ctx.fillText(s, x, y + 36 + i * 14));
  }
  ctx.restore();
}

registerShowScene({
  id: 'book', after: 'lean',
  prepare: api => loadBook(api),
  build(inp, book) {
    const text = bookScript(book); if (!text) return null;
    return { title: "The desk's calls", view: 'book', cam: null, text, motion: (api, p) => { api.st.spin = false; api.st.yaw = lerp(0.1, 0.75, ease(p)); api.st.pitch = lerp(-0.5, -0.38, ease(p)); api.st.zoom = 1 + 0.2 * ease(p); } };
  },
});

registerJarvisModule({
  id: 'book', label: 'BOOK',
  render(pane, api) {
    const { esc } = api; pane.innerHTML = "<h3>THE DESK'S BOOK</h3><p class=\"jv-sub\">Reading the desk's morning calls...</p>";
    loadBook(api, true).then(B => {
      if (!B) { pane.innerHTML = "<h3>THE DESK'S BOOK</h3><p>No desk book for today yet.</p>"; return; }
      const s = B.sum, order = { long: 0, short: 1, neutral: 2, unreviewed: 3, unknown: 3 }, rows = [...B.rows].sort((a, b) => order[a.state] - order[b.state] || b.h - a.h || a.key.localeCompare(b.key));
      const calls = rows.filter(r => r.call !== 0);
      pane.innerHTML = `<h3>THE DESK'S BOOK${B.date ? ` · ${esc(B.date)}` : ''}</h3><p>The desk's own written calls, not a forecast and not the bias engine. ${s.calls} calls (${s.long} long, ${s.short} short); ${s.neutral} reviewed and neutral; ${s.unreviewed + s.unknown} ${B.partial ? 'flat' : 'not reviewed'}.</p>
<div class="jv-row"><button type="button" data-b="go">SHOW THE TOWERS</button></div>
<table class="jv-tab"><thead><tr><th>market</th><th>the desk's call</th><th>conviction</th></tr></thead><tbody>${calls.map(r => `<tr><td>${esc(r.key)}</td><td>${esc(word(r))}${r.strong ? ' (strong)' : ''}</td><td>${esc(r.conv ?? 'n/a')}</td></tr>`).join('') || '<tr><td colspan="3">No long or short calls today.</td></tr>'}</tbody></table>`;
      pane.querySelector('[data-b="go"]').onclick = () => api.setView('book');
    });
  },
  views: [{ id: 'book', label: 'BOOK', draw: (ctx, g, api) => draw(ctx, { ...g, zoom: api.st.zoom }, api), onEnter: api => { loadBook(api, true); } }],
});
