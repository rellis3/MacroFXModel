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
import { PATH_HORIZON_DAYS, sourceChoices, sourceAsOf, normaliseSource } from '../pathSourceMeta.js';
import * as PZ from './pathZoom.js';
import { ownerLink } from './links.js';
export { zoneWalk };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fin = v => v != null && Number.isFinite(+v);
const sg = (v, dp = 2) => (fin(v) ? `${+v > 0 ? '+' : ''}${(+v).toFixed(dp)}` : '–');
const big = v => (fin(v) ? Math.round(+v).toLocaleString('en-GB') : '–');
const pxf = v => (!fin(v) ? '–' : Math.abs(v) >= 100 ? Math.round(+v).toLocaleString('en-GB') : (+v).toPrecision(5));

// ── names: the OI feed's pair keys ↔ the terminal's market ids ──
export const OI_TO_ID = { 'EUR/USD': 'EURUSD', 'GBP/USD': 'GBPUSD', 'USD/JPY': 'USDJPY', 'AUD/USD': 'AUDUSD', 'XAU/USD': 'GOLD', 'USD/CAD': 'USDCAD', 'USD/CHF': 'USDCHF', NAS100_USD: 'NQ', SPX500_USD: 'SPX500', US30_USD: 'US30', US2000_USD: 'US2000',
  'XAG/USD': 'SILVER', 'XCU/USD': 'COPPER', WTICO_USD: 'WTI', BCO_USD: 'BRENT', NATGAS_USD: 'NATGAS' };
const HEDGE_TO_ID = { EUR_USD: 'EURUSD', GBP_USD: 'GBPUSD', USD_JPY: 'USDJPY', AUD_USD: 'AUDUSD', XAU_USD: 'GOLD', USD_CAD: 'USDCAD', USD_CHF: 'USDCHF', NAS100_USD: 'NQ', SPX500_USD: 'SPX500', US30_USD: 'US30', US2000_USD: 'US2000' };
export const NAME = { EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY', AUDUSD: 'AUD/USD', GOLD: 'Gold', USDCAD: 'USD/CAD', USDCHF: 'USD/CHF', NQ: 'Nasdaq 100', SPX500: 'S&P 500', US30: 'Dow', US2000: 'Russell 2000',
  NZDUSD: 'NZD/USD', GBPJPY: 'GBP/JPY', SILVER: 'Silver', COPPER: 'Copper', WTI: 'WTI crude', BRENT: 'Brent crude', NATGAS: 'Natural gas' };
/** The markets the Swing Map (and so "The path") covers: SWING_MAP_INSTRUMENTS in server.js, DESK_SUBSETS.swingMap in js/deskPack.js. */
export const PATH_MARKETS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'GBPJPY', 'GOLD', 'NQ', 'SPX500'];
/** The Options tab's one market list (owner 2026-11-10: one selector per tab), in a fixed order: metals, indices, FX, energy. */
const ORDER = ['GOLD', 'SILVER', 'COPPER', 'NQ', 'SPX500', 'US30', 'US2000', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'GBPJPY', 'WTI', 'BRENT', 'NATGAS'];
export function optionMarkets(...keyLists) {
  const ids = new Set(keyLists.flat().filter(Boolean).map(idOf));
  return [...ids].sort((a, b) => ((ORDER.indexOf(a) + 1) || 99) - ((ORDER.indexOf(b) + 1) || 99) || a.localeCompare(b));
}
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
const LCOL = { call_wall: 'var(--up)', put_wall: 'var(--dn)', max_pain: 'var(--gold)', gamma_flip: 'var(--pur3)', gex_flip: 'var(--pur3)', hvl: 'var(--pur3)', oi_volume: 'var(--blue)', oi_cluster: 'var(--blue)' };

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
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="calls against puts gauge">${arc(0.02, Math.PI / 2 - 0.03, 'var(--up)')}${arc(Math.PI / 2 + 0.03, Math.PI - 0.02, 'var(--dn)')}${tick}${a == null ? '' : `<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--tx)" stroke-width="3" stroke-linecap="round"/>`}<circle cx="${cx}" cy="${cy}" r="5" fill="var(--tx)"/><text x="8" y="${h - 1}" font-size="9" fill="var(--up)">calls</text><text x="${w - 8}" y="${h - 1}" font-size="9" text-anchor="end" fill="var(--dn)">puts</text></svg>`;
}
export function spark(vals, w = 120, h = 26, col = 'var(--pur2)') {
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
  const tr = l => `<tr><td><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${LCOL[l.type] ?? 'var(--flat)'};margin-right:5px"></i>${esc(LTYPE[l.type] ?? l.type)}${l.tier ? ` <span class="muted" style="font-size:10px">${esc(l.tier)}</span>` : ''}</td><td class="n mono">${px(l.price)}</td><td class="n mono ${l.distPips > 0 ? 'up' : 'dn'}">${sg(l.distPips, 0)}</td><td class="n mono">${fin(l.touchPct) ? `${l.touchPct}%` : '–'}</td><td>${evChip(l.type)}</td></tr>`;
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
<div class="grid g4" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px"><div><span class="lbl">VIX</span><div class="mono" style="font-size:22px">${(+last.value).toFixed(1)}</div><span class="muted mono">${pctl}th pct, 1 year</span></div><div><span class="lbl">VIX 3-month</span><div class="mono" style="font-size:22px">${fin(l3) ? (+l3).toFixed(1) : '–'}</div></div><div><span class="lbl">VIX ÷ 3-month</span><div class="mono ${ratio > 1 ? 'dn' : ratio > 0.9 ? 'gold' : 'up'}" style="font-size:22px">${ratio == null ? '–' : ratio.toFixed(2)}</div></div><div>${spark(v.map(p => p.value), 140, 40, 'var(--gold)')}<div class="muted" style="font-size:10px">VIX, 1 year</div></div></div>
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
//   volOv: today's volume centre per Cboe expiry (faint; descriptive, untested). Only the Cboe sources have intraday volume.
export const WALK_OPTS_DEFAULT = { reach: false, implied: false, noView: false, gFlip: false, cFlip: false, vega: false, volOv: false };
// ── Sources (owner 2026-11-06): CME, the Cboe chain (GLD for gold, SPX / NDX) or both. Each dot is drawn by its source:
//    ● CME   ◆ Cboe   ◎ the two books merged on one date.
const srcOf = p => p?.source ?? 'cme';
const srcLbl = p => p?.sourceLabel ?? 'CME';
function srcMark(p, x, y, r, col, fill) {
  const s = srcOf(p), X = x.toFixed(1), Y = y.toFixed(1);
  if (s === 'cboe') { const a = r * 1.25; return `<path class="opt-walk-dot src-cboe" d="M${X} ${(y - a).toFixed(1)} L${(x + a).toFixed(1)} ${Y} L${X} ${(y + a).toFixed(1)} L${(x - a).toFixed(1)} ${Y} Z" fill="${fill}" stroke="${col}" stroke-width="2">`; }
  const ring = s === 'combined' ? `<circle cx="${X}" cy="${Y}" r="${(r + 3).toFixed(1)}" fill="none" stroke="${col}" stroke-width="1.2" stroke-dasharray="2 2"/>` : '';
  return `${ring}<circle class="opt-walk-dot src-${s}" cx="${X}" cy="${Y}" r="${r.toFixed(1)}" fill="${fill}" stroke="${col}" stroke-width="2">`;
}
/** The session's chosen source for a market: 'cme' | 'cboe' | 'combined' (CME where the market has no Cboe book). */
export const pathSourceFor = (inst, want) => normaliseSource(inst, want);
const srcClose = p => (srcOf(p) === 'cboe' ? '</path>' : '</circle>');
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
  return { close: A.px, anchor, includeThin: true, vol, date: A.date, maxDte: PATH_HORIZON_DAYS,
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
/** The chart's price and date formats, shared with the zoom controller (js/terminal/pathChart.js). */
export { pxs as fmtPx, dm as fmtDay };

/** Everything about the chart that does not change with the zoom: the plot box, the base time scale, the points.
 *  Drawn at the box's real width (no scaling), so the text stays readable on a phone; narrow = taller, less history. */
export function walkModel(sm, walk, { w = 460, h = null, back = null, o = WALK_OPTS_DEFAULT } = {}) {
  w = Math.max(300, Math.min(1000, Math.round(w))); const narrow = w < 520; h ??= narrow ? 400 : 380; back ??= narrow ? 22 : 40;
  const ser = (sm?.series ?? []).slice(-back), A = walkAnchor(sm); if (ser.length < 5 || !fin(A.px)) return null;
  // join the price line to the "now" dot (owner 2026-11-09): the stored series stops at the last close, so a weekend or an intraday move left a gap between
  // the line and the dot. The line now runs on to today's price: appended when the series ends before today, and moved to the live price when it ends on today.
  { const last = ser.at(-1), tl = dayN(last[0]), tA = dayN(A.date);
    if (tl < tA) ser.push([A.date, A.px]); else if (tl === tA) ser[ser.length - 1] = [last[0], A.px]; }
  const pts = (walk?.points ?? []).filter(p => fin(p.px)); const vol = walkVol(sm);
  const mixed = pts.some(p => srcOf(p) !== 'cme');   // a Cboe source is on: the dot labels carry their source, one more legend line
  const tNow = dayN(A.date), t0 = dayN(ser[0][0]), tEnd = Math.max(tNow + 14, ...pts.map(p => dayN(p.expiry)));
  const L = narrow ? 44 : 52, R = w - (narrow ? 14 : 18), top = mixed ? 76 : 62, bot = h - 30, xNow = L + (R - L) * (narrow ? 0.18 : 0.22);
  const base = PZ.baseScale({ t0, tNow, tEnd, L, xNow, R });
  const imp = useImplied(sm, o);   // the shading follows each date's implied vol when the implied reach is chosen
  const sigAt = t => { const n = Math.max(0, (t - tNow) * 5 / 7), v = imp ? (ivDaily(sm, Math.round(t - tNow)) ?? vol) : vol; return v * Math.sqrt(n); };
  const exs = (sm?.expiries ?? []).filter(e => dayN(e.expiry) > tNow && dayN(e.expiry) <= tEnd), vg = o?.vega ? vegaByExpiry(sm) : null;
  const maxS = Math.max(0.01, ...pts.map(p => p.strength ?? 0));
  return { w, h, narrow, ser, serT: ser.map(s => dayN(s[0])), A, pts, mixed, tNow, t0, tEnd, L, R, top, bot, xNow, base, imp, sigAt, exs, vg, maxS, o,
    lim: { kMin: 1, kMax: PZ.maxZoom(base, 5) } };
}
const interpAt = (arr, t) => { for (let i = 1; i < arr.length; i++) if (arr[i][0] >= t && arr[i - 1][0] <= t) { const [t0, v0] = arr[i - 1], [t1, v1] = arr[i]; return t1 > t0 ? v0 + (v1 - v0) * (t - t0) / (t1 - t0) : v1; } return null; };
const dotCol = p => (p.dir === 'down' ? 'var(--dn)' : p.dir === 'up' ? 'var(--up)' : 'var(--tx2)');

/** The chart through a zoom transform { k, x }: returns { svg, dots: [{ x, y, r, p }], ta, tb, lo, hi, X, Xinv, Y, Yinv }.
 *  hideSmall: small books lose their dot, label and expiry line (the walk line still runs through them, faint);
 *  hl: an expiry to highlight. */
export function renderWalk(m, tr = PZ.IDENTITY, { hideSmall = false, hl = null } = {}) {
  const { w, h, narrow, ser, serT, A, pts, mixed, tNow, tEnd, L, R, top, bot, imp, sigAt, exs, vg, maxS, o } = m;
  const z = PZ.zoomScale(m.base, tr), X = z.f, ta = z.inv(L), tb = z.inv(R), inT = t => t >= ta - 1e-6 && t <= tb + 1e-6;
  const shown = pts.filter(p => !(hideSmall && p.thin)), vis = shown.filter(p => inT(dayN(p.expiry)));
  const nHid = hideSmall ? pts.filter(p => p.thin && inT(dayN(p.expiry))).length : 0;   // said on the chart, so an empty stretch is not mistaken for no book
  // the y axis follows what is in view: the price history, the walk, the dots, the start price, and the shading
  const [i0, i1] = PZ.visibleRange(serT, ta, tb), sv = i0 <= i1 ? ser.slice(i0, i1 + 1) : [];
  const path = [[tNow, A.px], ...pts.map(p => [dayN(p.expiry), p.px])];
  const histPts = ser.map((s, i) => [serT[i], s[1]]);
  const vals = [...ser.filter((s, i) => inT(serT[i])).map(s => s[1]), ...vis.map(p => p.px), inT(tNow) ? A.px : null,
    interpAt(histPts, ta), interpAt(histPts, tb), interpAt(path, ta), interpAt(path, tb)].filter(fin);
  if (!vals.length) vals.push(A.px);
  const te = Math.min(tb, tEnd), sh = tb > tNow ? [1, 2].flatMap(k => [A.px * Math.exp(k * sigAt(te)), A.px * Math.exp(-k * sigAt(te))]) : [];
  const [lo, hi] = PZ.yDomain(vals, sh);
  const Y = v => top + (hi - v) / (hi - lo) * (bot - top), Yinv = y => hi - (y - top) / (bot - top) * (hi - lo), f1 = v => v.toFixed(1);
  // the 1σ / 2σ shading from now, sampled across what is in view
  const c0 = Math.max(tNow, ta), c1 = Math.min(tEnd, tb);
  const cone = k => [...Array(25)].map((_, i) => { const t = c0 + (c1 - c0) * i / 24; return [t, A.px * Math.exp(k * sigAt(t))]; });
  const poly = (a, b) => a.map(([t, v], i) => `${i ? 'L' : 'M'}${f1(X(t))},${f1(Y(v))}`).join('') + b.slice().reverse().map(([t, v]) => `L${f1(X(t))},${f1(Y(v))}`).join('') + 'Z';
  const band = (k, op) => (c1 > c0 ? `<path d="${poly(cone(k), cone(-k))}" fill="var(--pur2)" fill-opacity="${op}" stroke="none"/>` : '');
  const clip = `<defs><clipPath id="optWalkClip"><rect x="${L}" y="${top - 12}" width="${R - L}" height="${bot - top + 12}"/></clipPath></defs>`;
  // y grid on round prices
  const grid = PZ.niceTicks(lo, hi, narrow ? 4 : 5).map(v => `<line x1="${L}" x2="${R}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" stroke="var(--line2)" stroke-opacity=".35"/><text x="${L - 6}" y="${f1(Y(v) + 3)}" font-size="10" text-anchor="end" fill="var(--tx3)">${pxs(v)}</text>`).join('');
  const hist = sv.length > 1 ? `<path d="${sv.map((s, i) => `${i ? 'L' : 'M'}${f1(X(dayN(s[0])))},${f1(Y(s[1]))}`).join('')}" fill="none" stroke="var(--pur2)" stroke-width="2"/>` : '';
  const nowIn = inT(tNow), xN = X(tNow), yN = Y(A.px);
  const nowLine = nowIn ? `<line x1="${f1(xN)}" x2="${f1(xN)}" y1="${top - 10}" y2="${bot}" stroke="var(--tx3)" stroke-dasharray="2 3"/><circle cx="${f1(xN)}" cy="${f1(yN)}" r="5" fill="var(--tx)"/>` : '';
  // expiry lines; their "Nd" labels thinned for the visible range, bigger books first
  const exp = shown.filter(p => inT(dayN(p.expiry))).map(p => { const x = f1(X(dayN(p.expiry))), on = p.expiry === hl;
    return `<line x1="${x}" x2="${x}" y1="${top - 4}" y2="${bot}" stroke="var(--gold)" stroke-opacity="${on ? 0.95 : p.thin ? 0.2 : 0.5}" ${on ? 'stroke-width="1.5"' : 'stroke-dasharray="3 4"'}/>`; }).join('');
  const dte = PZ.thinTicks([...(nowIn ? [{ x: xN, w: PZ.textW('now', 10), pri: Infinity }] : []), ...vis.map(p => ({ x: X(dayN(p.expiry)), w: PZ.textW(`${p.dte}d`, 10, true), pri: (p.strength ?? 0) + (p.expiry === hl ? 10 : 0), p }))], { gap: 5, x0: L - 30, x1: w - 2 }).filter(q => q.p)
    .map(({ x, p }) => `<text x="${f1(x)}" y="${top - 18}" font-size="10" text-anchor="middle" fill="var(--gold)" font-weight="700"${p.thin ? ' opacity=".6"' : ''}>${p.dte}d</text>`).join('');
  // the date axis: calendar ticks for the visible range, thinned so no two collide
  const tt = PZ.thinTicks(PZ.timeTicks(ta, tb, R - L, { minPx: narrow ? 64 : 70 }).map(t => ({ x: X(t), t, w: PZ.textW(dm(PZ.isoOfDay(t)), 9) })), { gap: 8, x0: L - 10, x1: w - 2 });
  const axis = `<line x1="${L}" x2="${R}" y1="${bot}" y2="${bot}" stroke="var(--line2)" stroke-opacity=".6"/>` + tt.map(({ x, t }) => `<line x1="${f1(x)}" x2="${f1(x)}" y1="${bot}" y2="${bot + 4}" stroke="var(--tx3)"/><text x="${f1(x)}" y="${bot + 15}" font-size="9" text-anchor="middle" fill="var(--tx3)">${esc(dm(PZ.isoOfDay(t)))}</text>`).join('');
  // the walk: segments from now through every dot, then the spark along it
  const d = path.map(([t, v], i) => `${i ? 'L' : 'M'}${f1(X(t))},${f1(Y(v))}`).join('');
  const segs = pts.map((p, i) => { const [ts, v0] = path[i], t1 = dayN(p.expiry); if (t1 < ta || ts > tb) return '';
    return `<line x1="${f1(X(ts))}" y1="${f1(Y(v0))}" x2="${f1(X(t1))}" y2="${f1(Y(p.px))}" stroke="${p.dir === 'down' ? 'var(--dn)' : p.dir === 'up' ? 'var(--up)' : 'var(--tx3)'}" stroke-width="${p.thin ? 1.5 : 2.5}" ${p.thin ? 'stroke-dasharray="5 4" stroke-opacity=".7"' : ''} stroke-linecap="round"/>`; }).join('');
  const spark = `<path class="opt-walk-spark" d="${d}" fill="none" stroke="var(--tx)" stroke-width="2.5" stroke-linecap="round"/>`;
  // dots: a small book is drawn smaller and fainter
  const dg = vis.map(p => { const s = Math.sqrt((p.strength ?? 0) / maxS); return { p, x: X(dayN(p.expiry)), y: Y(p.px), r: p.thin ? 3 + 2.5 * s : 4.5 + 6.5 * s, col: dotCol(p) }; });
  const dots = dg.map(({ p, x, y, r, col }) => `<g class="opt-walk-pt${p.thin ? ' thin' : ''}" data-exp="${esc(p.expiry)}"${p.thin ? ' opacity=".6"' : ''}>${p.thin ? '' : `<circle class="opt-walk-glow" cx="${f1(x)}" cy="${f1(y)}" r="${f1(r + 4)}" fill="${col}" fill-opacity=".18"/>`}${p.expiry === hl ? `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r + 5)}" fill="none" stroke="var(--tx)" stroke-width="1.5"/>` : ''}${srcMark(p, x, y, r, col, p.thin ? 'var(--bg2)' : col)}<title>${esc(srcLbl(p))} · ${p.dte} days · ${esc(dm(p.expiry))}: ${pxs(p.px)} (${sg(p.movePct, 2)}% from the step before)</title>${srcClose(p)}</g>`).join('');
  // the price labels: drawn only where they collide with nothing already drawn, biggest books first; the rest on tap
  const nowLbl = pxs(A.px), nlW = PZ.textW(nowLbl, 11, true), nlLeft = xN - 8 - nlW >= 2;
  const nowBox = { x0: nlLeft ? xN - 8 - nlW : xN + 8, x1: nlLeft ? xN - 8 : xN + 8 + nlW, y0: yN - 21, y1: yN - 6 };
  const obstacles = [...dg.map(q => ({ id: q.p.expiry, x0: q.x - q.r, x1: q.x + q.r, y0: q.y - q.r, y1: q.y + q.r })), ...(nowIn ? [nowBox, { x0: xN - 6, x1: xN + 6, y0: yN - 6, y1: yN + 6 }] : [])];
  const placed = PZ.placeLabels(dg.map(q => ({ id: q.p.expiry, x: q.x, y: q.y, r: q.r, w: PZ.textW(pxs(q.p.px), q.p.thin ? 9 : 11, true) + (mixed ? PZ.textW(` ${srcLbl(q.p)}`, 9) : 0), h: q.p.thin ? 10 : 12, pri: (q.p.strength ?? 0) + (q.p.expiry === hl ? 10 : 0) })),
    { bounds: { x0: L, x1: w - 2, y0: top - 2, y1: bot }, obstacles });
  const labels = dg.filter(q => placed.has(q.p.expiry)).map(({ p, col }) => { const pl = placed.get(p.expiry);
    return `<text x="${f1(pl.x)}" y="${f1(pl.y)}" text-anchor="${pl.anchor}" font-size="${p.thin ? 9 : 11}" fill="${col}" font-weight="700" class="opt-walk-lbl"${p.thin ? ' opacity=".7"' : ''}>${pxs(p.px)}${mixed ? `<tspan font-size="9" font-weight="400" fill="var(--tx3)"> ${esc(srcLbl(p))}</tspan>` : ''}</text>`; }).join('');
  const nowText = nowIn ? `<text x="${f1(xN)}" y="${top - 14}" font-size="10" text-anchor="middle" fill="var(--tx2)">now</text><text x="${f1(nlLeft ? xN - 8 : xN + 8)}" y="${f1(yN - 9)}" font-size="11" text-anchor="${nlLeft ? 'end' : 'start'}" fill="var(--tx)" font-weight="700" class="opt-walk-lbl">${nowLbl}</text>` : '';
  // optional context marks at each expiry's date: no-view line, gamma flip (bar), charm/vanna flip (diamond), peak vega (ring)
  const inY = v => fin(v) && v >= lo && v <= hi;
  let ctx = o?.noView ? `<line x1="${f1(Math.max(L, xN))}" x2="${R}" y1="${f1(yN)}" y2="${f1(yN)}" stroke="var(--tx2)" stroke-width="1.2" stroke-dasharray="8 5" opacity=".7"><title>no view: price stays at ${pxs(A.px)}. A walk is only worth reading if it beats this</title></line><text x="${R - 2}" y="${f1(yN - 4)}" font-size="10" text-anchor="end" fill="var(--tx2)">no view</text>` : '';
  for (const e of exs) {
    if (!inT(dayN(e.expiry))) continue;
    const x = X(dayN(e.expiry));
    if (o?.gFlip && inY(e.gamma?.flipPx)) { const y = Y(e.gamma.flipPx); ctx += `<line x1="${f1(x - 9)}" x2="${f1(x + 9)}" y1="${f1(y)}" y2="${f1(y)}" stroke="var(--gold)" stroke-width="2.5" stroke-linecap="round"><title>${esc(dm(e.expiry))} gamma flip ${pxs(e.gamma.flipPx)}: hedging calms moves on one side and adds to them on the other. A boundary, not a target</title></line>`; }
    if (o?.cFlip && inY(e.greeks?.charmFlipPx)) { const y = Y(e.greeks.charmFlipPx); ctx += `<path d="M${f1(x)} ${f1(y - 5)} L${f1(x + 5)} ${f1(y)} L${f1(x)} ${f1(y + 5)} L${f1(x - 5)} ${f1(y)} Z" fill="var(--blue)" opacity=".85"><title>${esc(dm(e.expiry))} charm/vanna flip ${pxs(e.greeks.charmFlipPx)}: where the daily time-decay and vol hedging flows change sign. Untested</title></path>`; }
    if (o?.volOv && inY(e.volCentre?.px)) { const y = Y(e.volCentre.px); ctx += `<g class="opt-walk-vol" opacity=".45"><line x1="${f1(x - 8)}" x2="${f1(x + 8)}" y1="${f1(y)}" y2="${f1(y)}" stroke="var(--tx2)" stroke-width="1.5" stroke-dasharray="2 2"/><text x="${f1(x - 10)}" y="${f1(y + 3)}" font-size="8" text-anchor="end" fill="var(--tx2)">v</text><title>${esc(e.sourceLabel ?? '')} ${esc(dm(e.expiry))}: today's volume centre ${pxs(e.volCentre.px)} (${big(e.volCentre.volume)} contracts traded). Descriptive, untested</title></g>`; }
    const v = vg?.get(e.expiry); if (inY(v?.peakPx)) ctx += `<circle cx="${f1(x)}" cy="${f1(Y(v.peakPx))}" r="5" fill="none" stroke="var(--pur2)" stroke-width="1.6"><title>${esc(dm(e.expiry))} peak vega ${pxs(v.peakPx)}; ${Math.round((v.share ?? 0) * 100)}% of all vega. Where hedging flow comes from if implied vol moves. Not a target</title></circle>`;
  }
  const legend = `<text x="6" y="12" font-size="10" fill="var(--tx3)"><tspan fill="var(--pur2)">━</tspan> price  <tspan fill="var(--gold)">┆</tspan> expiry (days left)  <tspan fill="var(--up)">●</tspan><tspan fill="var(--dn)">●</tspan> walk up / down</text><text x="6" y="25" font-size="10" fill="var(--tx3)">small, faint = small book · shading = 1 and 2 expected moves${imp ? ' (implied vol)' : ''}</text>${mixed ? `<text x="6" y="38" font-size="10" fill="var(--tx3)">● CME  ◆ ${esc([...new Set(pts.filter(p => srcOf(p) === 'cboe').map(srcLbl))].join('/') || 'Cboe')} (Cboe)  ◎ both books, same date${o?.volOv ? '  ┄v today\'s volume centre (descriptive, untested)' : ''}</text>` : ''}`;
  const svg = `<svg class="opt-walk-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;margin:0 auto" role="img" aria-label="price and the option walk by expiry">${clip}${legend}${grid}${axis}<g clip-path="url(#optWalkClip)">${band(2, 0.06)}${band(1, 0.10)}${exp}${hist}${ctx}${segs}${spark}${dots}${nowLine}</g>${labels}${dte}${nowText}${nHid ? `<text class="opt-walk-lbl opt-walk-hid" x="${R - 4}" y="${bot - 6}" font-size="10" text-anchor="end" fill="var(--tx3)">${nHid} small book${nHid > 1 ? "s" : ""} hidden here${vis.length ? "" : ": untick \"hide small books\""}</text>` : ""}</svg>`;
  return { svg, dots: dg.map(({ p, x, y, r }) => ({ p, x, y, r })), ta, tb, lo, hi, X, Xinv: z.inv, Y, Yinv };
}

/** walk = zoneWalk(...) result; returns the SVG (view: a zoom transform { k, x }, the full view by default). */
export function walkSvg(sm, walk, { w = 460, h = null, back = null, o = WALK_OPTS_DEFAULT, view = null, hideSmall = false, hl = null } = {}) {
  const m = walkModel(sm, walk, { w, h, back, o }); if (!m) return '';
  return renderWalk(m, view ? PZ.clampTransform(view, m.base, m.lim) : PZ.IDENTITY, { hideSmall, hl }).svg;
}

/** Calls ÷ puts across an expiry's whole book: { c, p, r } or null. */
export function cpOfExpiry(sm, ex) {
  const l = (sm?.expiries ?? []).find(e => e.expiry === ex)?.ladder; if (!l?.length) return null;
  let c = 0, q = 0; for (const r of l) { c += r[1] || 0; q += r[2] || 0; } return q > 0 ? { c, p: q, r: c / q } : null;
}
/** The tap / hover card for one walk point. */
export function walkTip(sm, p, anchor = 'gammaCentre') {
  if (!p) return '';
  const A = walkAnchor(sm), cp = cpOfExpiry(sm, p.expiry), col = p.dir === 'up' ? 'up' : p.dir === 'down' ? 'dn' : '';
  const row = (k, v, cls = '') => `<div class="opt-tip-r"><span>${esc(k)}</span><b class="mono ${cls}">${v}</b></div>`;
  return `<div class="opt-tip-h"><b>${esc(dm(p.expiry))}</b> <span class="muted">${esc(srcLbl(p))} · ${p.dte} days${p.thin ? ' · small book' : ''}</span></div>`
    + row(WALK_ANCHORS[anchor] ?? anchor, `${p.dir === 'up' ? '▲' : p.dir === 'down' ? '▼' : '·'} ${pxs(p.px)}`, col)
    + row('from now', `${sg((p.px / A.px - 1) * 100, 2)}%`) + row('step', `${sg(p.movePct, 2)}%`)
    + row('book', fin(p.strength) ? `${(p.strength * 100).toFixed(1)}%` : '–')
    + row('C/P', cp ? cp.r.toFixed(2) : '–', cp ? (cp.r >= 1.5 ? 'up' : cp.r <= 0.67 ? 'dn' : '') : '')
    + row('biggest strike', p.biggest ? `${pxs(p.biggest.px)} <span class="muted" style="font-weight:400">(${((p.biggest.strength ?? 0) * 100).toFixed(1)}%)</span>` : '–');
}

/** The table under the walk: one row per expiry, how it was worked out. */
export function walkTable(sm, walk, anchor = 'gammaCentre', o = WALK_OPTS_DEFAULT) {
  const A = walkAnchor(sm), pts = walk?.points ?? []; if (!pts.length) return '<p class="muted">No expiry has a readable book.</p>';
  // calls / puts per expiry from its whole book (spot terms: an inverted pair's futures calls already count as puts), and
  // which capture a book comes from when that expiry was missing from the latest one (the walk keeps its last book)
  const exOf = new Map((sm?.expiries ?? []).map(e => [e.expiry, e])), capNow = (sm?.expiries ?? []).reduce((a, e) => (e.date > a ? e.date : a), '');
  const cpOf = ex => cpOfExpiry(sm, ex);
  const age = ex => { const d = exOf.get(ex)?.date; return d && capNow && d < capNow ? `book from the ${dm(d)} capture` : ''; };
  const vg = o?.vega ? vegaByExpiry(sm) : null, imp = !!o?.reach && useImplied(sm, o);
  const extra = p => { const e = exOf.get(p.expiry); return [
    imp && ivDaily(sm, p.dte) ? `implied move to here ±${((Math.exp(1.645 * ivDaily(sm, p.dte) * Math.sqrt(Math.max(1, Math.round((dayN(p.expiry) - dayN(A.date)) * 5 / 7)))) - 1) * 100).toFixed(1)}% (90%)` : '',
    o?.gFlip && fin(e?.gamma?.flipPx) ? `gamma flip ${pxs(e.gamma.flipPx)} (${e.gamma.regime === 'PIN' ? 'calming at price' : e.gamma.regime === 'BREAKOUT' ? 'amplifying at price' : 'neutral'})` : '',
    o?.cFlip && fin(e?.greeks?.charmFlipPx) ? `charm/vanna flip ${pxs(e.greeks.charmFlipPx)}` : '',
    o?.volOv && fin(e?.volCentre?.px) ? `today's volume centre ${pxs(e.volCentre.px)} (${big(e.volCentre.volume)} traded; descriptive, untested)` : '',
    e?.source === 'combined' && e.parts ? `merged: ${e.parts.cme.code ?? 'CME'} + ${e.parts.cboe.code ?? 'Cboe'}, ${Math.round(100 * e.parts.cboe.notional / Math.max(1, e.parts.cme.notional + e.parts.cboe.notional))}% of the notional from Cboe` : '',
    fin(vg?.get(p.expiry)?.peakPx) ? `peak vega ${pxs(vg.get(p.expiry).peakPx)}` : ''].filter(Boolean); };
  const note = p => [age(p.expiry), ...extra(p), p.thin ? 'small book' : '', p.biggest ? `biggest strike ${pxs(p.biggest.px)} (${((p.biggest.strength ?? 0) * 100).toFixed(1)}% of OI)` : '', p.building ? 'building' : '', fin(p.pullShare) ? `${Math.round(p.pullShare * 100)}% of the pull near it` : ''].filter(Boolean).join(' · ');
  return `<div class="opt-walk-tw" style="overflow-x:auto;max-width:100%"><table class="opt-walk-t" style="width:100%;font-size:13px"><thead><tr><th class="n">Days</th><th title="the expiry date, and under it where the book comes from: the CME capture, the Cboe chain, or both merged on that date">Expiry</th><th class="n">${esc(WALK_ANCHORS[anchor] ?? anchor)}</th><th class="n">From now</th><th class="n">Step</th><th class="n" title="${anchor === 'gammaCentre' ? 'the whole expiry\'s share of all live open interest' : 'that strike\'s share of all live open interest'}">Book</th><th class="n" title="calls ÷ puts across the expiry's whole book. Context only: untested, and a put can be protection rather than a bet on a fall">C/P</th>${vg ? '<th class="n" title="this expiry\'s share of all expiries\' vega">Vega</th>' : ''}</tr></thead><tbody>${pts.map(p => { const n = note(p);
    return `<tr class="opt-walk-row${p.thin ? ' muted' : ''}" data-exp="${esc(p.expiry)}" tabindex="0" title="show on the chart" style="cursor:pointer;${n ? 'border-bottom:0' : ''}"><td class="n mono"><b>${p.dte}</b></td><td style="white-space:nowrap">${esc(dm(p.expiry))}<br><span class="opt-walk-src" style="font-size:10px;color:var(--tx3)">${esc(srcLbl(p))}</span></td><td class="n mono ${p.dir === 'up' ? 'up' : p.dir === 'down' ? 'dn' : ''}" style="white-space:nowrap">${p.dir === 'up' ? '▲' : p.dir === 'down' ? '▼' : '·'} ${pxs(p.px)}</td><td class="n mono">${sg((p.px / A.px - 1) * 100, 2)}%</td><td class="n mono">${sg(p.movePct, 2)}%</td><td class="n mono">${fin(p.strength) ? `${(p.strength * 100).toFixed(1)}%` : '–'}</td>${(() => { const v = cpOf(p.expiry); return v ? `<td class="n mono ${v.r >= 1.5 ? 'up' : v.r <= 0.67 ? 'dn' : ''}" title="${Math.round(v.c).toLocaleString('en-GB')} calls / ${Math.round(v.p).toLocaleString('en-GB')} puts">${v.r.toFixed(2)}</td>` : '<td class="n mono">–</td>'; })()}${vg ? `<td class="n mono">${fin(vg.get(p.expiry)?.share) ? Math.round(vg.get(p.expiry).share * 100) + '%' : '–'}</td>` : ''}</tr>${n ? `<tr class="muted opt-walk-note" data-exp="${esc(p.expiry)}"><td></td><td colspan="${vg ? 7 : 6}" style="font-size:11px;padding-top:0">${esc(n)}</td></tr>` : ''}`; }).join('')}</tbody></table></div>`
    + (w2 => (w2?.skipped?.length ? `<p class="tt-note">Out of reach, left out: ${w2.skipped.map(k => `${esc(dm(k.expiry))} ${pxs(k.px)} (${sg(k.movePct, 1)}%, range ±${(k.capPct ?? 0).toFixed(1)}%)`).join(' · ')}.</p>` : ''))(walk);
}

/** The chart's toolbar: range chips, Reset, and the small-book toggle (wired by js/terminal/pathChart.js). */
export function walkBar(hideSmall = false) {
  return `<div class="opt-walk-bar"><span class="opt-walk-chips" role="group" aria-label="time range">${['2W', '1M', '3M', 'All'].map(p => `<button type="button" class="opt-chip" data-wview="${p}" aria-pressed="false">${p}</button>`).join('')}</span><button type="button" class="opt-chip" data-wreset title="back to the starting view">Reset</button><label class="opt-walk-small" title="Expiries under 10% of live open interest: hide their dots, labels and expiry lines (the walk line still runs through them)"><input type="checkbox" data-wsmall${hideSmall ? ' checked' : ''}> hide small books</label><span class="opt-walk-hint">pinch or scroll to zoom · drag to move · tap a dot</span></div>`;
}
export function pathHtml(sm, inst, { walk = null, anchor = 'gammaCentre', width = 460, o = WALK_OPTS_DEFAULT, hideSmall = false, view = null, pickMarket = true } = {}) {
  if (!sm) return '';
  if (!sm.ok) return `<div class="muted">${esc(sm.error ?? 'No path data for this market.')}</div>`;
  const insts = sm.instruments ?? [], A = walkAnchor(sm), sel = 'background:var(--bg3);color:var(--tx);border:1px solid var(--line2);border-radius:5px;padding:3px';
  const word = WALK_VERDICT[anchor] ?? 'UNTESTED';
  const ps = sm.pathSource ?? null, choices = sourceChoices(inst), src = ps?.selected ?? 'cme';
  const srcSel = choices.length > 1 ? `<select id="opt-path-src" aria-label="where the open interest comes from" style="${sel}">${choices.map(c => `<option value="${c.id}"${c.id === src ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select>` : '';
  const cap = (sm.expiries ?? []).reduce((a, e) => (e.source && e.source !== 'cme' ? a : e.date > a ? e.date : a), '');
  const asOf = (ps?.asOf ?? [sourceAsOf({ id: 'cme', captureDate: cap || null })]).filter(Boolean);
  const cb = ps?.cboe;
  const how = !cb ? '' : cb.error ? `${esc(cb.label)} (Cboe) not available: ${esc(cb.error)}.`
    : fin(cb.ratio) ? `${esc(cb.label)} strikes × ${(+cb.ratio).toFixed(3)} (XAU ${pxs(cb.xauSpot)} ÷ GLD ${(+cb.spot).toFixed(2)}, ${esc(cb.xauAt ?? '')}) = XAU/USD; one contract = 100 shares = ${(+cb.ozPerContract).toFixed(2)} oz. Calls and puts are in ounces${src === 'combined' ? '; CME is weighed at 100 oz a contract' : ''}.`
    : `${esc(cb.label)} cash strikes ${fin(cb.cfdOffset) ? `${cb.cfdOffset >= 0 ? '+' : ''}${(+cb.cfdOffset).toFixed(2)} (the measured CFD − cash gap)` : 'with no CFD − cash offset measured (levels = the cash index)'}.${src === 'combined' ? ' Weighed by notional: Cboe $100 a point a contract, CME at its own contract size.' : ''}`;
  const asOfHtml = `<p class="opt-path-asof" style="margin:0 0 6px;font-size:11px;color:var(--tx3)">${asOf.map(a => `<b>${esc(a.label)}</b>: ${[a.oi, a.greeks].filter(Boolean).map(esc).join(' · ') || 'no as-of'}`).join(' &nbsp;|&nbsp; ')}${cb?.stale ? ' · <span class="dn">stale copy</span>' : ''}${how ? `<br>${how}` : ''}</p>`;
  return `<div class="ch"><span class="lbl">The path · ${esc(inst)}</span><span class="r" style="display:flex;gap:6px;flex-wrap:wrap">${pickMarket ? `<select id="opt-path-inst" aria-label="market" style="${sel}">${insts.map(i => `<option${i === inst ? ' selected' : ''}>${esc(i)}</option>`).join('')}</select>` : ''}${srcSel}<select id="opt-path-anchor" aria-label="what each step goes to" style="${sel}">${Object.entries(WALK_ANCHORS).map(([k, l]) => `<option value="${k}"${k === anchor ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></span></div>
<div class="opt-walk-opts" style="display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--tx3);margin:2px 0 6px">${[
    ['reach', 'within reach', 'Only step to a level price could plausibly reach by that expiry: inside the 90% range of a random walk'],
    ['implied', 'reach from implied vol', `Use each expiry's own implied vol from last night's CME capture for the range and the shading (implied-vol ranges are VALIDATED here)${sm.ivTerm?.points?.length ? '' : '. No implied vol in the last capture: realised is used'}`],
    ['noView', 'no-view line', 'A flat line from the start price: the baseline a walk has to beat'],
    ['gFlip', 'gamma flips', 'Each expiry\'s zero-gamma price: a boundary between calmer and wilder moves, not a target'],
    ['cFlip', 'charm/vanna flips', 'Where each expiry\'s daily hedging flows change sign. Untested'],
    ['vega', 'vega', 'Each expiry\'s share of all vega and its peak-vega strike: where flow comes from if implied vol moves. Not a target'],
    ...(src !== 'cme' ? [['volOv', 'today\'s volume', 'Cboe sources only: per expiry, where today\'s traded volume concentrates (the volume-weighted strike), drawn faintly. Descriptive, untested']] : [])]
    .map(([k, l, t]) => `<label title="${esc(t)}" style="white-space:nowrap;cursor:pointer"><input type="checkbox" data-wopt="${k}"${o?.[k] ? ' checked' : ''}> ${esc(l)}</label>`).join('')}</div>
${asOfHtml}<p style="margin:2px 0 8px;font-size:13px">${A.live ? 'Live' : 'Last close'} <b>${pxs(A.px)}</b>. ${walk?.text ? `The walk: ${esc(walk.text.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, m => dm(m)).replace(/(\d+\.\d{4,})/g, m => pxs(+m)))}.` : ''}</p>
${walkBar(hideSmall)}<div class="opt-walk" style="border-radius:8px;background:var(--bg2);padding:4px 0;overflow:hidden"><div class="opt-walk-plot" style="position:relative;width:${Math.max(300, Math.min(1000, Math.round(width)))}px;max-width:100%;margin:0 auto;touch-action:pan-y">${walkSvg(sm, walk, { w: width, o, hideSmall, view })}</div></div>
${walkTable(sm, walk, anchor, o)}
<p class="tt-note"><b>How each dot is worked out (${esc(WALK_ANCHORS[anchor])}):</b> ${esc(WALK_HOW[anchor] ?? '')}. The line starts at ${A.live ? 'the live price' : 'the last close'} and steps to each expiry in date order; a small book (under 10% of live open interest) is hollow and dashed. <span class="chip ${word === 'UNDERPOWERED' ? 'gold' : 'dn'}" style="font-size:9px">${esc(word)}</span> Tested on 6 FX majors, NQ and ES, 2020-10 to 2026-08: ${word === 'UNDERPOWERED' ? 'the gamma centre\'s pull on price is too uncertain to call (UNDERPOWERED)' : 'price did not walk to these levels (NULL)'}. Read it as where the book leans, not where price must go. More expiries fill the picture; they do not make the pull a tested signal.${o?.volOv && src !== 'cme' ? ' Faint ┄v marks: today\'s volume centre per Cboe expiry (descriptive, untested).' : ''}${o?.gFlip || o?.cFlip || o?.vega || o?.noView ? ` On the chart: ${[o.noView ? 'dashed line = no view' : '', o.gFlip ? 'gold bar = gamma flip' : '', o.cFlip ? 'blue diamond = charm/vanna flip' : '', o.vega ? 'violet ring = peak-vega strike' : ''].filter(Boolean).join(' · ')}; context only, untested as targets.` : ''} ${ownerLink(`swing-map.html?inst=${encodeURIComponent(inst)}`, 'Full Swing Map', { suffix: ' →', hide: true })}</p>`;
}

/** The Pair tab's options card for one market. */
export function pairCard(inst, { oi, hist, hs } = {}) {
  const id = String(inst ?? '').toUpperCase(), row = (oi?.pairs ?? []).find(p => idOf(p.pair) === id), dm = (hs?.markets ?? []).find(m => idOf(m.pair) === id);
  const hd = '<div class="ch"><span class="lbl">Options · positioning and lines</span></div>';
  if (!row && !dm) return `${hd}<div class="muted">No listed options book for this market in the CME open-interest feed.</div>`;
  const st = row ? pcStats(hist?.markets?.[row.pair]) : null, rd = pcRead(st);
  return `${hd}${row ? `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">${gaugeSvg(row.pcRatio, { w: 130, pct: st?.pct })}<div><div class="mono" style="font-size:18px">${fin(row.pcRatio) ? (+row.pcRatio).toFixed(2) : '–'} <span class="muted" style="font-size:11px">puts per call</span></div><div class="${rd.cls}">${esc(rd.word)}${st?.pct != null ? ` (${st.pct}th pct)` : ''}</div>${evChip('pc')}</div></div>` : ''}
${dm ? `<p style="margin:8px 0 0"><span class="chip ${dm.state === 'calms' ? 'up' : 'gold'}">${dm.state === 'calms' ? 'hedging calms moves' : 'hedging speeds moves'}</span> switch point ${pxf(dm.switchPoint)} (${sg(dm.switchDistPct, 2)}%). ${esc(dm.lines?.[4] ?? '')}</p>` : ''}
${row ? `<div class="mono" style="font-size:12px;margin-top:6px">call wall ${fin(row.callWall) ? (+row.callWall).toPrecision(6) : '–'} · put wall ${fin(row.putWall) ? (+row.putWall).toPrecision(6) : '–'} · max pain ${fin(row.maxPain) ? (+row.maxPain).toPrecision(6) : '–'} ${evChip('call_wall')}</div>` : ''}
<p class="tt-note">More on the <a href="#" data-goto-options="1">Options tab</a>.</p>`;
}
