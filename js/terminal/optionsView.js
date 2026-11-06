/**
 * The Options tab of the Desk Terminal (owner, 2026-11-04): options as a lens on positioning, never a signal on its own.
 *
 *   Positioning   a calls-against-puts gauge per market from CME open interest (/api/oi-today), with the put/call ratio's
 *                 own history (/api/options-history): an FX future's ratio has no natural "neutral", so the read is
 *                 where today sits in that market's own past, not the raw number.
 *   Levels        the option lines (walls, max pain, gamma flip, clusters) against the price, with the 4-hour chance of
 *                 a touch, each kind carrying its Evidence Book verdict so a NULL line reads as one.
 *   Dealers       which way dealers' hedging pushes (/api/hedging-summary) and the one effect that has held: the size
 *                 of the day, not its direction.
 *   Path          the third dimension: where open interest sits by expiry and strike (/api/swing-map), drawn ahead of
 *                 the price.
 *   VIX           the VIX and the 3-month VIX: the term structure says whether fear is now or later.
 *
 * Pure HTML/SVG-string builders, no fetch. Tested in js/terminal/terminal.test.mjs.
 */
import { zoneWalk } from '../swingPaths.js';
import { bsVega } from '../greekLayers.js';
export { zoneWalk };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fin = v => v != null && Number.isFinite(+v);
const sg = (v, dp = 2) => (fin(v) ? `${+v > 0 ? '+' : ''}${(+v).toFixed(dp)}` : '–');
const big = v => (fin(v) ? Math.round(+v).toLocaleString('en-GB') : '–');
const pxf = v => (!fin(v) ? '–' : Math.abs(v) >= 100 ? Math.round(+v).toLocaleString('en-GB') : (+v).toPrecision(5));

// ── names: the OI feed's pair keys ↔ the terminal's market ids ──
export const OI_TO_ID = { 'EUR/USD': 'EURUSD', 'GBP/USD': 'GBPUSD', 'USD/JPY': 'USDJPY', 'AUD/USD': 'AUDUSD', 'XAU/USD': 'GOLD', 'USD/CAD': 'USDCAD', 'USD/CHF': 'USDCHF', NAS100_USD: 'NQ', SPX500_USD: 'SPX500', US30_USD: 'US30', US2000_USD: 'US2000' };
const HEDGE_TO_ID = { EUR_USD: 'EURUSD', GBP_USD: 'GBPUSD', USD_JPY: 'USDJPY', AUD_USD: 'AUDUSD', XAU_USD: 'GOLD', USD_CAD: 'USDCAD', USD_CHF: 'USDCHF', NAS100_USD: 'NQ', SPX500_USD: 'SPX500', US30_USD: 'US30', US2000_USD: 'US2000' };
export const NAME = { EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY', AUDUSD: 'AUD/USD', GOLD: 'Gold', USDCAD: 'USD/CAD', USDCHF: 'USD/CHF', NQ: 'Nasdaq 100', SPX500: 'S&P 500', US30: 'Dow', US2000: 'Russell 2000' };
export const idOf = k => OI_TO_ID[k] ?? HEDGE_TO_ID[k] ?? String(k ?? '').replace(/[/_]/g, '').toUpperCase();

// ── what the Evidence Book says about each kind of reading (js/deskEvidence.js ids in brackets) ──
export const EVIDENCE = {
  pc: { word: 'UNTESTED', line: 'The put/call ratio has not been tested here: positioning, not a forecast.' },
  max_pain: { word: 'NULL', line: 'Max pain does not pin price (oi-max-pain, swing-walk-max-pain).' },
  call_wall: { word: 'NULL', line: 'Walls behaved like ordinary levels in a placebo test (wall-placebo).' },
  put_wall: { word: 'NULL', line: 'Walls behaved like ordinary levels in a placebo test (wall-placebo).' },
  gamma_flip: { word: 'NULL', line: 'Trading the flip lost money in FX and indices (gamma-regime-trades, gamma-regime-trades-fx).' },
  gex_flip: { word: 'NULL', line: 'Trading the flip lost money in FX and indices (gamma-regime-trades, gamma-regime-trades-fx).' },
  hvl: { word: 'NULL', line: 'A gamma line: trading it lost money (gamma-regime-trades).' },
  oi_volume: { word: 'UNTESTED', line: 'Heavy strikes: shown as context.' },
  oi_cluster: { word: 'UNTESTED', line: 'Clusters of open interest: shown as context.' },
  dealers: { word: 'VALIDATED · range only', line: 'Dealer gamma says how far a day travels, not which way: validated on the S&P (gex-range-es), weaker on the Nasdaq (gex-range), not in FX.' },
  zones: { word: 'NULL', line: 'Price did not walk towards the big strikes or the OI centre (swing-walk-strike, swing-walk-oi-centre).' },
};
const EVC = { NULL: 'dn', UNTESTED: '', VALIDATED: 'up', 'VALIDATED · range only': 'up', UNDERPOWERED: 'gold' };
export const evChip = k => { const e = EVIDENCE[k] ?? EVIDENCE.oi_cluster; return `<span class="chip ${EVC[e.word] ?? ''}" title="${esc(e.line)}" style="font-size:9px">${esc(e.word)}</span>`; };
const LTYPE = { max_pain: 'Max pain', call_wall: 'Call wall', put_wall: 'Put wall', gamma_flip: 'Gamma flip', gex_flip: 'GEX flip', hvl: 'High-vol line', oi_volume: 'Heavy strike', oi_cluster: 'OI cluster' };
const LCOL = { call_wall: '#2fd39a', put_wall: '#ff5d78', max_pain: '#e8b85a', gamma_flip: '#9b8cff', gex_flip: '#9b8cff', hvl: '#9b8cff', oi_volume: '#7aa2ff', oi_cluster: '#7aa2ff' };

/** Put/call ratio history → { last, pct (0-100, where today sits in its own history), chg5, n, spark } */
export function pcStats(rows = []) {
  const v = (rows ?? []).map(r => r.pc).filter(fin); if (!v.length) return null;
  const last = v.at(-1), pct = Math.round((v.filter(x => x < last).length + 0.5 * (v.filter(x => x === last).length - 1)) / Math.max(1, v.length - 1) * 100);
  return { last, pct: v.length >= 20 ? Math.max(0, Math.min(100, pct)) : null, chg5: v.length > 5 ? last - v.at(-6) : null, n: v.length, spark: v.slice(-60), from: rows[0]?.date, to: rows.at(-1)?.date };
}
/** A plain reading of the ratio against its own past. */
export function pcRead(st) {
  if (!st) return { word: 'no data', cls: '' };
  if (st.pct == null) return { word: 'short history', cls: '' };
  if (st.pct >= 85) return { word: 'puts much heavier than usual', cls: 'dn' };
  if (st.pct >= 65) return { word: 'puts heavier than usual', cls: 'dn' };
  if (st.pct <= 15) return { word: 'calls much heavier than usual', cls: 'up' };
  if (st.pct <= 35) return { word: 'calls heavier than usual', cls: 'up' };
  return { word: 'a usual mix', cls: '' };
}

/** The gauge: calls (green) on the left, puts (red) on the right; the needle at the puts' share of open interest. */
export function gaugeSvg(pc, { w = 150, pct = null } = {}) {
  const h = Math.round(w * 0.6), cx = w / 2, cy = h - 8, r = w / 2 - 10;
  const arc = (a0, a1, col) => { const p = a => [cx - r * Math.cos(a), cy - r * Math.sin(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `<path d="M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round"/>`; };
  const share = fin(pc) && pc >= 0 ? pc / (1 + pc) : null, a = share == null ? null : Math.PI * share;
  const nx = a == null ? cx : cx - (r - 14) * Math.cos(a), ny = a == null ? cy : cy - (r - 14) * Math.sin(a);
  // where the ratio sits in its own history, as a tick on the arc
  const tick = fin(pct) ? (() => { const q = Math.PI * (pct / 100), x0 = cx - (r + 7) * Math.cos(q), y0 = cy - (r + 7) * Math.sin(q), x1 = cx - (r - 7) * Math.cos(q), y1 = cy - (r - 7) * Math.sin(q); return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="var(--tx3)" stroke-width="2"><title>today's ratio sits at the ${pct}th percentile of its own history</title></line>`; })() : '';
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="calls against puts gauge">${arc(0.02, Math.PI / 2 - 0.03, 'var(--up,#2fd39a)')}${arc(Math.PI / 2 + 0.03, Math.PI - 0.02, 'var(--dn,#ff5d78)')}${tick}${a == null ? '' : `<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--tx)" stroke-width="3" stroke-linecap="round"/>`}<circle cx="${cx}" cy="${cy}" r="5" fill="var(--tx)"/><text x="8" y="${h - 1}" font-size="9" fill="var(--up,#2fd39a)">calls</text><text x="${w - 8}" y="${h - 1}" font-size="9" text-anchor="end" fill="var(--dn,#ff5d78)">puts</text></svg>`;
}
export function spark(vals, w = 120, h = 26, col = 'var(--pur2,#9b8cff)') {
  const v = (vals ?? []).filter(fin); if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), sp = hi - lo || 1;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><path d="${v.map((x, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1) * w).toFixed(1)},${(h - 2 - (x - lo) / sp * (h - 4)).toFixed(1)}`).join('')}" fill="none" stroke="${col}" stroke-width="1.5"/></svg>`;
}

/** One market's positioning card. */
export function gaugeCard(row, hist, { click = true } = {}) {
  const id = idOf(row.pair), st = pcStats(hist), rd = pcRead(st), last = hist?.at(-1), prev = hist?.at(-2);
  const dC = fin(last?.calls) && fin(prev?.calls) ? last.calls - prev.calls : null, dP = fin(last?.puts) && fin(prev?.puts) ? last.puts - prev.puts : null;
  return `<div class="card opt-g${click ? ' tt-click' : ''}" ${click ? `data-pair="${esc(id)}"` : ''} style="text-align:center"><div class="lbl">${esc(NAME[id] ?? row.pair)}</div>${gaugeSvg(row.pcRatio, { pct: st?.pct })}
<div class="mono" style="font-size:18px">${fin(row.pcRatio) ? (+row.pcRatio).toFixed(2) : '–'} <span class="muted" style="font-size:11px">puts per call</span></div>
<div class="${rd.cls}" style="font-size:12px;margin:2px 0">${esc(rd.word)}${st?.pct != null ? ` <span class="muted">(${st.pct}th pct)</span>` : ''}</div>
<div>${spark(st?.spark)}</div>
<div class="muted mono" style="font-size:11px">${dC != null ? `calls ${sg(dC, 0)} · puts ${sg(dP, 0)} on the day` : ''}${row.regime ? ` · <span class="${row.regime === 'PIN' ? 'up' : 'gold'}">${row.regime === 'PIN' ? 'dealers calm' : 'dealers speed up'}</span>` : ''}${fin(row.dte) ? ` · front ${row.dte}d` : ''}</div></div>`;
}

/** Positioning: every market's gauge. */
export function positioningHtml(oi, hist) {
  if (!oi?.ok) return `<div class="card muted">${esc(oi?.error ?? 'No open-interest book loaded yet.')}</div>`;
  const rows = (oi.pairs ?? []).filter(p => fin(p.pcRatio));
  const pcs = rows.map(r => pcStats(hist?.markets?.[r.pair])).filter(Boolean), puts = pcs.filter(s => s.pct != null && s.pct >= 65).length, calls = pcs.filter(s => s.pct != null && s.pct <= 35).length;
  return `<div class="card glow"><p style="margin:0">Across ${rows.length} markets: <b class="dn">${puts}</b> lean to puts more than usual, <b class="up">${calls}</b> lean to calls more than usual, the rest are in their usual mix. A heavy put book can be speculation on a fall <i>or</i> insurance on holdings; a heavy call book, speculation on a rise. ${evChip('pc')}</p></div>
<div class="opt-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(165px,1fr));gap:10px;margin-top:10px">${rows.map(r => gaugeCard(r, hist?.markets?.[r.pair])).join('')}</div>
<p class="tt-note">CME futures options, open interest by settlement (the book is a day old when it is read). The needle is the puts' share of open interest; the grey tick is where today's ratio sits in that market's own last ${pcs[0]?.n ?? '~100'} sessions, which is the read that matters: FX futures have no natural 50/50. Zero-day options are not split out of this book.</p>`;
}

/** The levels ladder for one market: lines above and below the price, nearest first. */
export function ladderHtml(row) {
  if (!row) return '';
  const id = idOf(row.pair), L = (row.levels ?? []).filter(l => fin(l.price) && fin(l.distPips));
  const above = L.filter(l => l.distPips > 0).sort((a, b) => a.distPips - b.distPips).slice(0, 5).reverse(), below = L.filter(l => l.distPips <= 0).sort((a, b) => b.distPips - a.distPips).slice(0, 5);
  const px = v => (Math.abs(v) >= 100 ? (+v).toFixed(1) : (+v).toFixed(4));
  const tr = l => `<tr><td><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${LCOL[l.type] ?? '#888'};margin-right:5px"></i>${esc(LTYPE[l.type] ?? l.type)}${l.tier ? ` <span class="muted" style="font-size:10px">${esc(l.tier)}</span>` : ''}</td><td class="n mono">${px(l.price)}</td><td class="n mono ${l.distPips > 0 ? 'up' : 'dn'}">${sg(l.distPips, 0)}</td><td class="n mono">${fin(l.touchPct) ? `${l.touchPct}%` : '–'}</td><td>${evChip(l.type)}</td></tr>`;
  return `<div class="card"><div class="ch"><span class="lbl">${esc(NAME[id] ?? row.pair)} · option lines</span><span class="r muted">${row.savedAt ? `book ${esc(row.savedAt)}` : ''}</span></div><div class="scroll"><table><thead><tr><th>Line</th><th class="n">Price</th><th class="n">Pips/pts</th><th class="n" title="chance of a touch within 4 hours (calibrated Monte Carlo)">Touch 4h</th><th>Evidence</th></tr></thead><tbody>${above.map(tr).join('')}<tr style="background:var(--bg3)"><td><b>Price now</b></td><td class="n mono"><b>${fin(row.spot) ? px(row.spot) : '–'}</b></td><td colspan="3" class="muted" style="font-size:11px">${row.regime === 'PIN' ? 'dealers long gamma: hedging calms moves' : row.regime === 'BREAKOUT' ? 'dealers short gamma: hedging speeds moves' : ''}</td></tr>${below.map(tr).join('')}</tbody></table></div>
<p class="tt-note">The five nearest lines each side. Every kind carries the Evidence Book's word: walls and max pain tested NULL (they behave like ordinary levels), so read them as where open interest sits, not where price must go.${row.basisStale ? ' The futures-to-spot basis is over 4 hours old, so lines can be a few pips off.' : ''}</p></div>`;
}

/** Dealer hedging cards. */
export function dealersHtml(hs) {
  if (!hs?.ok) return '';
  const ms = (hs.markets ?? []).filter(m => m.state);
  return `<div class="opt-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">${ms.map(m => { const id = idOf(m.pair), up = Math.abs(m.flowUp1pct ?? 0), dn = Math.abs(m.flowDown1pct ?? 0);
    return `<div class="card tt-click" data-pair="${esc(id)}"><div class="ch"><span class="lbl">${esc(m.name ?? NAME[id] ?? m.pair)}</span><span class="r"><span class="chip ${m.state === 'calms' ? 'up' : 'gold'}">${m.state === 'calms' ? 'hedging calms moves' : 'hedging speeds moves'}</span></span></div>
<div class="mono" style="font-size:12px">switch point ${pxf(m.switchPoint)} · ${sg(m.switchDistPct, 2)}% away</div>
<div style="display:flex;gap:6px;align-items:center;margin:6px 0;font-size:11px"><span class="muted" style="width:46px">fall 1%</span><div style="flex:1;height:8px;background:var(--bg3);border-radius:4px;position:relative"><i style="position:absolute;right:50%;top:0;bottom:0;width:${(dn / Math.max(up, dn, 1) * 50).toFixed(0)}%;background:var(--dn);border-radius:4px"></i><i style="position:absolute;left:50%;top:0;bottom:0;width:${(up / Math.max(up, dn, 1) * 50).toFixed(0)}%;background:var(--up);border-radius:4px"></i></div><span class="muted" style="width:46px;text-align:right">rise 1%</span></div>
<div style="font-size:12px">${esc(m.lines?.[4] ?? m.lines?.[0] ?? '')}</div></div>`; }).join('')}</div>
<p class="tt-note">Bars: how much dealers must sell after a 1% fall against buy after a 1% rise (model upper limits; the comparison is what counts). ${evChip('dealers')} ${esc(EVIDENCE.dealers.line)}</p>`;
}

/** VIX and its term structure. */
export function vixHtml(h) {
  const v = h?.vix?.vix ?? [], v3 = h?.vix?.vix3m ?? []; if (!v.length) return '';
  const m3 = new Map(v3.map(p => [p.date, p.value])), last = v.at(-1), l3 = m3.get(last.date) ?? v3.at(-1)?.value;
  const ratio = fin(l3) ? last.value / l3 : null, pctl = Math.round(v.filter(p => p.value < last.value).length / v.length * 100);
  const state = ratio == null ? '' : ratio > 1 ? 'backwardation: fear is NOW (near-term protection dearer than 3-month)' : ratio > 0.9 ? 'flat: some near-term worry' : 'contango: calm now, uncertainty priced further out (the normal state)';
  const ratioSeries = v.map(p => (m3.has(p.date) ? p.value / m3.get(p.date) : null)).filter(fin);
  return `<div class="card"><div class="ch"><span class="lbl">VIX · the S&amp;P's implied volatility</span><span class="r muted">to ${esc(last.date)}</span></div>
<div class="grid g4" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px"><div><span class="lbl">VIX</span><div class="mono" style="font-size:22px">${(+last.value).toFixed(1)}</div><span class="muted mono">${pctl}th pct, 1 year</span></div><div><span class="lbl">VIX 3-month</span><div class="mono" style="font-size:22px">${fin(l3) ? (+l3).toFixed(1) : '–'}</div></div><div><span class="lbl">VIX ÷ 3-month</span><div class="mono ${ratio > 1 ? 'dn' : ratio > 0.9 ? 'gold' : 'up'}" style="font-size:22px">${ratio == null ? '–' : ratio.toFixed(2)}</div></div><div>${spark(v.map(p => p.value), 140, 40, 'var(--gold,#e8b85a)')}<div class="muted" style="font-size:10px">VIX, 1 year</div></div></div>
<p style="margin:8px 0 0">${esc(state)}.</p><div>${spark(ratioSeries, 300, 30)}<div class="muted" style="font-size:10px">VIX ÷ 3-month, 1 year (above 1 = backwardation)</div></div>
<p class="tt-note">The VIX is built from S&amp;P 500 options: the market's price for the next 30 days' swings. Comparing it with the 3-month VIX shows whether the worry is immediate or further out.</p></div>`;
}

/** The path, drawn like the chain (owner, 2026-11-05): the price so far, then a hashed line at every expiry (its days
 *  to expiry and date), and a line that walks from the price to each expiry's level, the same zone walk the Swing Map
 *  draws (js/swingPaths.js zoneWalk: by default the gamma centre, where dealers' hedging weight sits on balance), with a
 *  spark running along it. The cone is one and two expected moves (σ√days) from today. */
export const WALK_ANCHORS = { gammaCentre: 'gamma centre', strike: 'strongest strike', maxPain: 'max pain', centre: 'OI centre' };
const WALK_VERDICT = { gammaCentre: 'UNDERPOWERED', gamma: 'NULL', strike: 'NULL', maxPain: 'NULL', centre: 'NULL' };
const WALK_HOW = {
  gammaCentre: 'each expiry\'s strikes scored by open interest × how hard dealers must hedge them (gamma) from the step before, over the time left; the dot is the score-weighted average price',
  strike: 'the strike with the most open interest in that expiry',
  maxPain: 'the price at which that expiry\'s option holders lose the most',
  centre: 'the open-interest-weighted average strike of that expiry',
};
const dayN = d => Date.parse(`${d}T00:00:00Z`) / 864e5;
export function walkVol(sm) { const mb = sm?.bands?.[1]; return mb?.sigmaUsedPct ? mb.sigmaUsedPct / 100 / Math.sqrt(20) : (sm?.state?.sigmaDailyPct ?? 1) / 100; }
export function walkAnchor(sm) {
  const lp = sm?.livePrice, st = sm?.state ?? {};
  if (lp?.price > 0 && lp.at) { let d = lp.at.slice(0, 10); const w = new Date(`${d}T12:00:00Z`).getUTCDay(); if (w === 6 || w === 0) d = new Date(Date.parse(`${d}T12:00:00Z`) + (w === 6 ? 2 : 1) * 864e5).toISOString().slice(0, 10); if (d > (st.date ?? '')) return { px: lp.price, date: d, live: true }; }
  return { px: st.close ?? sm?.series?.at(-1)?.[1], date: st.date ?? sm?.series?.at(-1)?.[0], live: false };
}
// ── Walk options (the Swing Map's, owner 2026-11-06): all off by default, all context; none of them is a walk step.
//   o = { reach, implied, noView, gFlip, cFlip, vega }
export const WALK_OPTS_DEFAULT = { reach: false, implied: false, noView: false, gFlip: false, cFlip: false, vega: false };
/** Implied vol for an expiry: nearest point on last night's CME term structure (sm.ivTerm), as a per-session fraction. */
export function ivDaily(sm, dte) {
  const pts = sm?.ivTerm?.points; if (!pts?.length || !fin(dte)) return null;
  const p = pts.reduce((b, q) => (!b || Math.abs(q[0] - dte) < Math.abs(b[0] - dte) ? q : b), null);
  return p?.[1] > 0 ? p[1] / 100 / Math.sqrt(252) : null;
}
const useImplied = (sm, o) => !!o?.implied && !!sm?.ivTerm?.points?.length;
/** zoneWalk options for the terminal walk, with the reach limit (realised or each expiry's implied vol) when asked. */
export function walkOptsFor(sm, anchor, o = WALK_OPTS_DEFAULT) {
  const A = walkAnchor(sm), vol = walkVol(sm);
  return { close: A.px, anchor, includeThin: true, vol, date: A.date,
    ...(o?.reach ? { sigma: vol, ...(useImplied(sm, o) ? { sigmaFor: e => ivDaily(sm, e.dte) } : {}) } : {}) };
}
/** Each expiry's share of all vega (OI x Black-Scholes vega at its implied vol, realised when none) and its peak-vega strike. */
export function vegaByExpiry(sm) {
  const A = walkAnchor(sm), out = new Map(); let all = 0;
  for (const e of sm?.expiries ?? []) {
    if (!e.ladder?.length || !fin(A.px)) continue;
    const T = Math.max(1, e.dte) / 365, s = (ivDaily(sm, e.dte) ?? walkVol(sm)) * Math.sqrt(252);
    let tot = 0, peak = null;
    for (const r of e.ladder) { const v = ((r[1] || 0) + (r[2] || 0)) * bsVega(A.px, r[0], T, s); tot += v; if (!peak || v > peak.v) peak = { px: r[0], v }; }
    out.set(e.expiry, { vega: tot, peakPx: peak?.px ?? null }); all += tot;
  }
  for (const v of out.values()) v.share = all > 0 ? v.vega / all : null;
  return out;
}
const pxs = v => (!fin(v) ? '–' : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-GB') : Math.abs(v) >= 20 ? (+v).toFixed(2) : (+v).toFixed(4));
const dm = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** walk = zoneWalk(...) result; returns the SVG */
export function walkSvg(sm, walk, { w = 460, h = null, back = null, o = WALK_OPTS_DEFAULT } = {}) {
  // drawn at the box's real width (no scaling), so the text stays readable on a phone; narrow = taller, less history
  w = Math.max(300, Math.min(760, Math.round(w))); const narrow = w < 520; h ??= narrow ? 430 : 380; back ??= narrow ? 22 : 40;
  const ser = (sm?.series ?? []).slice(-back), A = walkAnchor(sm); if (ser.length < 5 || !fin(A.px)) return '';
  const pts = (walk?.points ?? []).filter(p => fin(p.px)); const vol = walkVol(sm);
  const tNow = dayN(A.date), t0 = dayN(ser[0][0]), tEnd = Math.max(tNow + 14, ...pts.map(p => dayN(p.expiry)));
  const L = narrow ? 44 : 50, R = w - (narrow ? 54 : 56), top = 62, bot = h - 34, xNow = L + (R - L) * (narrow ? 0.24 : 0.3);
  const X = t => (t <= tNow ? L + (t - t0) / Math.max(1, tNow - t0) * (xNow - L) : xNow + (t - tNow) / Math.max(1, tEnd - tNow) * (R - xNow));
  const imp = useImplied(sm, o);   // the shading follows each date's implied vol when the implied reach is chosen
  const cone = k => [...Array(13)].map((_, i) => { const t = tNow + (tEnd - tNow) * i / 12, n = Math.max(0, (t - tNow) * 5 / 7); const v = imp ? (ivDaily(sm, Math.round(t - tNow)) ?? vol) : vol; return [t, A.px * Math.exp(k * v * Math.sqrt(n))]; });
  // the scale follows the price and the walk; the cone is clipped to the plot, so a wide cone never flattens the walk
  const exs = (sm?.expiries ?? []).filter(e => dayN(e.expiry) > tNow && dayN(e.expiry) <= tEnd), vg = o?.vega ? vegaByExpiry(sm) : null;
  const ys = [...ser.map(s => s[1]), ...pts.map(p => p.px), A.px], lo = Math.min(...ys), hi = Math.max(...ys), pad = (hi - lo) * 0.12 || A.px * 0.01;
  const Y = v => top + (hi + pad - v) / (hi - lo + 2 * pad) * (bot - top);
  const poly = (arr, k2) => arr.map(([t, v], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)},${Y(v).toFixed(1)}`).join('') + (k2 ? k2.slice().reverse().map(([t, v]) => `L${X(t).toFixed(1)},${Y(v).toFixed(1)}`).join('') + 'Z' : '');
  const band = (k, op) => `<path d="${poly(cone(k), cone(-k))}" fill="var(--pur2,#9b8cff)" fill-opacity="${op}" stroke="none" clip-path="url(#optWalkClip)"/>`;
  const clip = `<defs><clipPath id="optWalkClip"><rect x="${L}" y="${top}" width="${R - L}" height="${bot - top}"/></clipPath></defs>`;
  // y grid
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => lo + (hi - lo) * f).map(v => `<line x1="${L}" x2="${R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line2)" stroke-opacity=".35"/><text x="${L - 6}" y="${(Y(v) + 3).toFixed(1)}" font-size="10" text-anchor="end" fill="var(--tx3)">${pxs(v)}</text>`).join('');
  // history
  const hist = `<path d="${ser.map((s, i) => `${i ? 'L' : 'M'}${X(dayN(s[0])).toFixed(1)},${Y(s[1]).toFixed(1)}`).join('')}" fill="none" stroke="var(--pur2,#9b8cff)" stroke-width="2"/>`;
  const now = `<line x1="${xNow}" x2="${xNow}" y1="${top - 10}" y2="${bot}" stroke="var(--tx3)" stroke-dasharray="2 3"/><text x="${xNow}" y="${top - 14}" font-size="10" text-anchor="middle" fill="var(--tx2,#bbb)">now</text>
<circle cx="${xNow}" cy="${Y(A.px).toFixed(1)}" r="5" fill="var(--tx)"/><text x="${xNow - 8}" y="${(Y(A.px) - 9).toFixed(1)}" font-size="11" text-anchor="end" fill="var(--tx)" font-weight="700">${pxs(A.px)}</text>`;
  // expiry hash lines with DTE / date labels, de-cluttered
  let lastLbl = -1e9;
  const exp = pts.map(p => { const x = X(dayN(p.expiry)), show = x - lastLbl >= 30 && x - xNow >= 16; if (show) lastLbl = x;
    return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${top - 4}" y2="${bot}" stroke="var(--gold,#e8b85a)" stroke-opacity="${p.thin ? 0.25 : 0.55}" stroke-dasharray="3 4"/>${show ? `<text x="${x.toFixed(1)}" y="${top - 18}" font-size="10" text-anchor="middle" fill="var(--gold,#e8b85a)" font-weight="700">${p.dte}d</text><text x="${x.toFixed(1)}" y="${bot + 14}" font-size="9" text-anchor="middle" fill="var(--gold,#e8b85a)">${esc(dm(p.expiry))}</text>` : ''}`; }).join('');
  // the walk: segments from now through every dot, then the spark along it
  const path = [[tNow, A.px], ...pts.map(p => [dayN(p.expiry), p.px])];
  const d = path.map(([t, v], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const segs = pts.map((p, i) => { const [t0s, v0] = path[i]; return `<line x1="${X(t0s).toFixed(1)}" y1="${Y(v0).toFixed(1)}" x2="${X(dayN(p.expiry)).toFixed(1)}" y2="${Y(p.px).toFixed(1)}" stroke="${p.dir === 'down' ? 'var(--dn,#ff5d78)' : p.dir === 'up' ? 'var(--up,#2fd39a)' : 'var(--tx3)'}" stroke-width="${p.thin ? 1.5 : 2.5}" ${p.thin ? 'stroke-dasharray="5 4"' : ''} stroke-linecap="round"/>`; }).join('');
  const spark = `<path class="opt-walk-spark" d="${d}" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`;
  const maxS = Math.max(0.01, ...pts.map(p => p.strength ?? 0));
  let flip = 1, lx = -1e9, ly = -1e9;
  const dots = pts.map(p => { const x = X(dayN(p.expiry)), y = Y(p.px), r = 4 + 7 * Math.sqrt((p.strength ?? 0) / maxS), col = p.dir === 'down' ? 'var(--dn,#ff5d78)' : p.dir === 'up' ? 'var(--up,#2fd39a)' : 'var(--tx2,#bbb)'; flip = -flip;
    const lbl = (x - lx >= 30 || Math.abs(y - ly) >= 16) && x - xNow >= 14; if (lbl) { lx = x; ly = y; }
    return `<circle class="opt-walk-glow" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r + 4).toFixed(1)}" fill="${col}" fill-opacity=".18"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${p.thin ? 'var(--bg2,#111)' : col}" stroke="${col}" stroke-width="2"><title>${p.dte} days · ${esc(dm(p.expiry))}: ${pxs(p.px)} (${sg(p.movePct, 2)}% from the step before)</title></circle>${lbl ? `<text x="${(x + r + 3).toFixed(1)}" y="${(y + (flip > 0 ? -6 : 13)).toFixed(1)}" font-size="11" fill="${col}" font-weight="700">${pxs(p.px)}</text>` : ''}`; }).join('');
  // optional context marks at each expiry's date: no-view line, gamma flip (bar), charm/vanna flip (diamond), peak vega (ring)
  const inY = v => fin(v) && v >= lo - pad && v <= hi + pad;
  let ctx = o?.noView ? `<line x1="${xNow}" x2="${R}" y1="${Y(A.px).toFixed(1)}" y2="${Y(A.px).toFixed(1)}" stroke="var(--tx2,#bbb)" stroke-width="1.2" stroke-dasharray="8 5" opacity=".7"><title>no view: price stays at ${pxs(A.px)}. A walk is only worth reading if it beats this</title></line><text x="${R - 2}" y="${(Y(A.px) - 4).toFixed(1)}" font-size="10" text-anchor="end" fill="var(--tx2,#bbb)">no view</text>` : '';
  for (const e of exs) {
    const x = X(dayN(e.expiry));
    if (o?.gFlip && inY(e.gamma?.flipPx)) { const y = Y(e.gamma.flipPx); ctx += `<line x1="${(x - 9).toFixed(1)}" x2="${(x + 9).toFixed(1)}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--gold,#e8b85a)" stroke-width="2.5" stroke-linecap="round"><title>${esc(dm(e.expiry))} gamma flip ${pxs(e.gamma.flipPx)}: hedging calms moves on one side and adds to them on the other. A boundary, not a target</title></line>`; }
    if (o?.cFlip && inY(e.greeks?.charmFlipPx)) { const y = Y(e.greeks.charmFlipPx); ctx += `<path d="M${x.toFixed(1)} ${(y - 5).toFixed(1)} L${(x + 5).toFixed(1)} ${y.toFixed(1)} L${x.toFixed(1)} ${(y + 5).toFixed(1)} L${(x - 5).toFixed(1)} ${y.toFixed(1)} Z" fill="var(--blue,#5aa9ff)" opacity=".85"><title>${esc(dm(e.expiry))} charm/vanna flip ${pxs(e.greeks.charmFlipPx)}: where the daily time-decay and vol hedging flows change sign. Untested</title></path>`; }
    const v = vg?.get(e.expiry); if (inY(v?.peakPx)) ctx += `<circle cx="${x.toFixed(1)}" cy="${Y(v.peakPx).toFixed(1)}" r="5" fill="none" stroke="var(--pur2,#9b8cff)" stroke-width="1.6"><title>${esc(dm(e.expiry))} peak vega ${pxs(v.peakPx)}; ${Math.round((v.share ?? 0) * 100)}% of all vega. Where hedging flow comes from if implied vol moves. Not a target</title></circle>`;
  }
  const legend = `<text x="6" y="12" font-size="10" fill="var(--tx3)"><tspan fill="var(--pur2,#9b8cff)">━</tspan> price  <tspan fill="var(--gold,#e8b85a)">┆</tspan> expiry (days left)  <tspan fill="var(--up,#2fd39a)">●</tspan><tspan fill="var(--dn,#ff5d78)">●</tspan> walk up / down</text><text x="6" y="25" font-size="10" fill="var(--tx3)">hollow = small book · shading = 1 and 2 expected moves from now${imp ? ' (implied vol)' : ''}</text>`;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;margin:0 auto" role="img" aria-label="price and the option walk by expiry">${clip}${legend}${grid}${band(2, 0.06)}${band(1, 0.10)}${exp}${hist}${ctx}${segs}${spark}${dots}${now}</svg>`;
}

/** The table under the walk: one row per expiry, how it was worked out. */
export function walkTable(sm, walk, anchor = 'gammaCentre', o = WALK_OPTS_DEFAULT) {
  const A = walkAnchor(sm), pts = walk?.points ?? []; if (!pts.length) return '<p class="muted">No expiry has a readable book.</p>';
  // calls / puts per expiry from its whole book (spot terms: an inverted pair's futures calls already count as puts), and
  // which capture a book comes from when that expiry was missing from the latest one (the walk keeps its last book)
  const exOf = new Map((sm?.expiries ?? []).map(e => [e.expiry, e])), capNow = (sm?.expiries ?? []).reduce((a, e) => (e.date > a ? e.date : a), '');
  const cpOf = ex => { const l = exOf.get(ex)?.ladder; if (!l?.length) return null; let c = 0, q = 0; for (const r of l) { c += r[1] || 0; q += r[2] || 0; } return q > 0 ? { c, p: q, r: c / q } : null; };
  const age = ex => { const d = exOf.get(ex)?.date; return d && capNow && d < capNow ? `book from the ${dm(d)} capture` : ''; };
  const vg = o?.vega ? vegaByExpiry(sm) : null, imp = !!o?.reach && useImplied(sm, o);
  const extra = p => { const e = exOf.get(p.expiry); return [
    imp && ivDaily(sm, p.dte) ? `implied move to here ±${((Math.exp(1.645 * ivDaily(sm, p.dte) * Math.sqrt(Math.max(1, Math.round((dayN(p.expiry) - dayN(A.date)) * 5 / 7)))) - 1) * 100).toFixed(1)}% (90%)` : '',
    o?.gFlip && fin(e?.gamma?.flipPx) ? `gamma flip ${pxs(e.gamma.flipPx)} (${e.gamma.regime === 'PIN' ? 'calming at price' : e.gamma.regime === 'BREAKOUT' ? 'amplifying at price' : 'neutral'})` : '',
    o?.cFlip && fin(e?.greeks?.charmFlipPx) ? `charm/vanna flip ${pxs(e.greeks.charmFlipPx)}` : '',
    fin(vg?.get(p.expiry)?.peakPx) ? `peak vega ${pxs(vg.get(p.expiry).peakPx)}` : ''].filter(Boolean); };
  const note = p => [age(p.expiry), ...extra(p), p.thin ? 'small book' : '', p.biggest ? `biggest strike ${pxs(p.biggest.px)} (${((p.biggest.strength ?? 0) * 100).toFixed(1)}% of OI)` : '', p.building ? 'building' : '', fin(p.pullShare) ? `${Math.round(p.pullShare * 100)}% of the pull near it` : ''].filter(Boolean).join(' · ');
  return `<table class="opt-walk-t" style="width:100%;font-size:13px"><thead><tr><th class="n">Days</th><th>Expiry</th><th class="n">${esc(WALK_ANCHORS[anchor] ?? anchor)}</th><th class="n">From now</th><th class="n">Step</th><th class="n" title="${anchor === 'gammaCentre' ? 'the whole expiry\'s share of all live open interest' : 'that strike\'s share of all live open interest'}">Book</th><th class="n" title="calls ÷ puts across the expiry's whole book. Context only: untested, and a put can be protection rather than a bet on a fall">C/P</th>${vg ? '<th class="n" title="this expiry\'s share of all expiries\' vega">Vega</th>' : ''}</tr></thead><tbody>${pts.map(p => { const n = note(p);
    return `<tr${p.thin ? ' class="muted"' : ''} style="${n ? 'border-bottom:0' : ''}"><td class="n mono"><b>${p.dte}</b></td><td style="white-space:nowrap">${esc(dm(p.expiry))}</td><td class="n mono ${p.dir === 'up' ? 'up' : p.dir === 'down' ? 'dn' : ''}" style="white-space:nowrap">${p.dir === 'up' ? '▲' : p.dir === 'down' ? '▼' : '·'} ${pxs(p.px)}</td><td class="n mono">${sg((p.px / A.px - 1) * 100, 2)}%</td><td class="n mono">${sg(p.movePct, 2)}%</td><td class="n mono">${fin(p.strength) ? `${(p.strength * 100).toFixed(1)}%` : '–'}</td>${(() => { const v = cpOf(p.expiry); return v ? `<td class="n mono ${v.r >= 1.5 ? 'up' : v.r <= 0.67 ? 'dn' : ''}" title="${Math.round(v.c).toLocaleString('en-GB')} calls / ${Math.round(v.p).toLocaleString('en-GB')} puts">${v.r.toFixed(2)}</td>` : '<td class="n mono">–</td>'; })()}${vg ? `<td class="n mono">${fin(vg.get(p.expiry)?.share) ? Math.round(vg.get(p.expiry).share * 100) + '%' : '–'}</td>` : ''}</tr>${n ? `<tr class="muted"><td></td><td colspan="${vg ? 7 : 6}" style="font-size:11px;padding-top:0">${esc(n)}</td></tr>` : ''}`; }).join('')}</tbody></table>`
    + (w2 => (w2?.skipped?.length ? `<p class="tt-note">Out of reach, left out: ${w2.skipped.map(k => `${esc(dm(k.expiry))} ${pxs(k.px)} (${sg(k.movePct, 1)}%, range ±${(k.capPct ?? 0).toFixed(1)}%)`).join(' · ')}.</p>` : ''))(walk);
}

export function pathHtml(sm, inst, { walk = null, anchor = 'gammaCentre', width = 460, o = WALK_OPTS_DEFAULT } = {}) {
  if (!sm) return '';
  if (!sm.ok) return `<div class="muted">${esc(sm.error ?? 'No path data for this market.')}</div>`;
  const insts = sm.instruments ?? [], A = walkAnchor(sm), sel = 'background:var(--bg3);color:var(--tx);border:1px solid var(--line2);border-radius:5px;padding:3px';
  const word = WALK_VERDICT[anchor] ?? 'UNTESTED';
  return `<div class="ch"><span class="lbl">The path · ${esc(inst)}</span><span class="r" style="display:flex;gap:6px;flex-wrap:wrap"><select id="opt-path-inst" aria-label="market" style="${sel}">${insts.map(i => `<option${i === inst ? ' selected' : ''}>${esc(i)}</option>`).join('')}</select><select id="opt-path-anchor" aria-label="what each step goes to" style="${sel}">${Object.entries(WALK_ANCHORS).map(([k, l]) => `<option value="${k}"${k === anchor ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></span></div>
<div class="opt-walk-opts" style="display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--tx3);margin:2px 0 6px">${[
    ['reach', 'within reach', 'Only step to a level price could plausibly reach by that expiry: inside the 90% range of a random walk'],
    ['implied', 'reach from implied vol', `Use each expiry's own implied vol from last night's CME capture for the range and the shading (implied-vol ranges are VALIDATED here)${sm.ivTerm?.points?.length ? '' : '. No implied vol in the last capture: realised is used'}`],
    ['noView', 'no-view line', 'A flat line from the start price: the baseline a walk has to beat'],
    ['gFlip', 'gamma flips', 'Each expiry\'s zero-gamma price: a boundary between calmer and wilder moves, not a target'],
    ['cFlip', 'charm/vanna flips', 'Where each expiry\'s daily hedging flows change sign. Untested'],
    ['vega', 'vega', 'Each expiry\'s share of all vega and its peak-vega strike: where flow comes from if implied vol moves. Not a target']]
    .map(([k, l, t]) => `<label title="${esc(t)}" style="white-space:nowrap;cursor:pointer"><input type="checkbox" data-wopt="${k}"${o?.[k] ? ' checked' : ''}> ${esc(l)}</label>`).join('')}</div>
<p style="margin:2px 0 8px;font-size:13px">${A.live ? 'Live' : 'Last close'} <b>${pxs(A.px)}</b>. ${walk?.text ? `The walk: ${esc(walk.text.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, m => dm(m)).replace(/(\d+\.\d{4,})/g, m => pxs(+m)))}.` : ''}</p>
<div class="opt-walk scroll" style="border-radius:8px;background:var(--bg2,rgba(0,0,0,.15));padding:4px 0">${walkSvg(sm, walk, { w: width, o })}</div>
${walkTable(sm, walk, anchor, o)}
<p class="tt-note"><b>How each dot is worked out (${esc(WALK_ANCHORS[anchor])}):</b> ${esc(WALK_HOW[anchor] ?? '')}. The line starts at ${A.live ? 'the live price' : 'the last close'} and steps to each expiry in date order; a small book (under 10% of live open interest) is hollow and dashed. <span class="chip ${word === 'UNDERPOWERED' ? 'gold' : 'dn'}" style="font-size:9px">${esc(word)}</span> Tested on 6 FX majors, NQ and ES, 2020-10 to 2026-08: ${word === 'UNDERPOWERED' ? 'the gamma centre\'s pull on price is too uncertain to call (UNDERPOWERED)' : 'price did not walk to these levels (NULL)'}. Read it as where the book leans, not where price must go.${o?.gFlip || o?.cFlip || o?.vega || o?.noView ? ` On the chart: ${[o.noView ? 'dashed line = no view' : '', o.gFlip ? 'gold bar = gamma flip' : '', o.cFlip ? 'blue diamond = charm/vanna flip' : '', o.vega ? 'violet ring = peak-vega strike' : ''].filter(Boolean).join(' · ')}; context only, untested as targets.` : ''} <a href="swing-map.html?inst=${encodeURIComponent(inst)}">Full Swing Map →</a></p>`;
}

/** The Pair tab's options card for one market. */
export function pairCard(inst, { oi, hist, hs } = {}) {
  const id = String(inst ?? '').toUpperCase(), row = (oi?.pairs ?? []).find(p => idOf(p.pair) === id), dm = (hs?.markets ?? []).find(m => idOf(m.pair) === id);
  const hd = '<div class="ch"><span class="lbl">Options · positioning and lines</span></div>';
  if (!row && !dm) return `${hd}<div class="muted">No listed options book for this market (CME open interest covers ${Object.values(OI_TO_ID).join(', ')}).</div>`;
  const st = row ? pcStats(hist?.markets?.[row.pair]) : null, rd = pcRead(st);
  return `${hd}${row ? `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">${gaugeSvg(row.pcRatio, { w: 130, pct: st?.pct })}<div><div class="mono" style="font-size:18px">${fin(row.pcRatio) ? (+row.pcRatio).toFixed(2) : '–'} <span class="muted" style="font-size:11px">puts per call</span></div><div class="${rd.cls}">${esc(rd.word)}${st?.pct != null ? ` (${st.pct}th pct)` : ''}</div>${evChip('pc')}</div></div>` : ''}
${dm ? `<p style="margin:8px 0 0"><span class="chip ${dm.state === 'calms' ? 'up' : 'gold'}">${dm.state === 'calms' ? 'hedging calms moves' : 'hedging speeds moves'}</span> switch point ${pxf(dm.switchPoint)} (${sg(dm.switchDistPct, 2)}%). ${esc(dm.lines?.[4] ?? '')}</p>` : ''}
${row ? `<div class="mono" style="font-size:12px;margin-top:6px">call wall ${fin(row.callWall) ? (+row.callWall).toPrecision(6) : '–'} · put wall ${fin(row.putWall) ? (+row.putWall).toPrecision(6) : '–'} · max pain ${fin(row.maxPain) ? (+row.maxPain).toPrecision(6) : '–'} ${evChip('call_wall')}</div>` : ''}
<p class="tt-note">More on the <a href="#" data-goto-options="1">Options tab</a>.</p>`;
}
