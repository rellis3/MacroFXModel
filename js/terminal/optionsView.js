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

/** The path picture: price so far, then open interest by expiry and strike ahead of it (Swing Map data). */
export function pathSvg(sm, { w = 420, h = 300, back = 60 } = {}) {
  if (!sm?.ok) return '';
  const ser = (sm.series ?? []).slice(-back), px0 = sm.livePrice?.price ?? ser.at(-1)?.[1]; if (ser.length < 5 || !fin(px0)) return '';
  const day = d => Date.parse(`${d}T00:00:00Z`) / 864e5, t0 = day(ser[0][0]), tNow = day(ser.at(-1)[0]);
  const exps = (sm.expiries ?? []).filter(e => !e.stale && e.dte >= 1 && e.dte <= 100 && (e.zones ?? []).length).slice(0, 8);
  const zones = exps.flatMap(e => (e.zones ?? []).filter(z => fin(z.px) && Math.abs(z.px / px0 - 1) < 0.08).sort((a, b) => b.oi - a.oi).slice(0, 4).map(z => ({ ...z, t: day(e.expiry), expiry: e.expiry })));
  const paths = (sm.paths ?? []).slice(0, 2);
  const tMax = Math.max(tNow + (tNow - t0) * 0.7, ...zones.map(z => z.t), ...paths.flatMap(p => p.points.map(q => day(q.date))));
  const ys = [...ser.map(s => s[1]), ...zones.map(z => z.px), ...paths.flatMap(p => p.points.map(q => q.px))], lo = Math.min(...ys), hi = Math.max(...ys), pad = (hi - lo) * 0.06 || 1;
  const X = t => 34 + (t - t0) / (tMax - t0) * (w - 44), Y = v => 8 + (hi + pad - v) / (hi - lo + 2 * pad) * (h - 30);
  const maxOi = Math.max(1, ...zones.map(z => z.oi));
  const line = `<path d="${ser.map((s, i) => `${i ? 'L' : 'M'}${X(day(s[0])).toFixed(1)},${Y(s[1]).toFixed(1)}`).join('')}" fill="none" stroke="var(--pur2,#9b8cff)" stroke-width="2"/>`;
  const now = `<line x1="${X(tNow).toFixed(1)}" x2="${X(tNow).toFixed(1)}" y1="6" y2="${h - 22}" stroke="var(--line2)" stroke-dasharray="3 3"/><text x="${(X(tNow) - 3).toFixed(1)}" y="${h - 12}" font-size="9" text-anchor="end" fill="var(--tx3)">now</text>`;
  let lastLbl = -1e9;   // label an expiry only when it clears the last label and the "now" mark
  const exLines = exps.map(e => { const x = X(day(e.expiry)), lbl = x - lastLbl >= 30 && x - X(tNow) >= 18; if (lbl) lastLbl = x; return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="6" y2="${h - 22}" stroke="var(--gold,#e8b85a)" stroke-opacity=".35"><title>expiry ${esc(e.expiry)}</title></line>${lbl ? `<text x="${x.toFixed(1)}" y="${h - 12}" font-size="8" text-anchor="middle" fill="var(--gold,#e8b85a)">${esc(String(e.expiry).slice(5))}</text>` : ''}`; }).join('');
  const bub = zones.map(z => { const callish = (z.call ?? 0) >= (z.put ?? 0); return `<circle cx="${X(z.t).toFixed(1)}" cy="${Y(z.px).toFixed(1)}" r="${(3 + 11 * Math.sqrt(z.oi / maxOi)).toFixed(1)}" fill="${callish ? 'var(--up,#2fd39a)' : 'var(--dn,#ff5d78)'}" fill-opacity=".45" stroke="${callish ? 'var(--up,#2fd39a)' : 'var(--dn,#ff5d78)'}"><title>${esc(z.expiry)}: ${(+z.px).toFixed(2)}, ${big(z.oi)} contracts (${callish ? 'mostly calls' : 'mostly puts'})</title></circle>`; }).join('');
  const pth = paths.map((p, i) => `<path d="${p.points.map((q, j) => `${j ? 'L' : 'M'}${X(day(q.date)).toFixed(1)},${Y(q.px).toFixed(1)}`).join('')}" fill="none" stroke="${i ? 'var(--dn,#ff5d78)' : 'var(--up,#2fd39a)'}" stroke-width="1.5" stroke-dasharray="5 4"><title>${esc(p.name)}: ${Math.round((p.prob ?? 0) * 100)}%</title></path>`).join('');
  const yl = [lo, (lo + hi) / 2, hi].map(v => `<text x="2" y="${(Y(v) + 3).toFixed(1)}" font-size="9" fill="var(--tx3)">${v >= 100 ? Math.round(v) : (+v).toFixed(3)}</text>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px" role="img" aria-label="price and open interest by expiry">${yl}${exLines}${now}${line}${pth}${bub}</svg>`;
}
export function pathHtml(sm, inst) {
  if (!sm) return '';
  if (!sm.ok) return `<div class="muted">${esc(sm.error ?? 'No path data for this market.')}</div>`;
  const insts = sm.instruments ?? [];
  return `<div class="ch"><span class="lbl">The path · open interest by expiry and strike</span><span class="r"><select id="opt-path-inst" aria-label="market" style="background:var(--bg3);color:var(--tx);border:1px solid var(--line2);border-radius:5px;padding:3px">${insts.map(i => `<option${i === inst ? ' selected' : ''}>${esc(i)}</option>`).join('')}</select></span></div>
${pathSvg(sm)}
<p style="margin:6px 0 0;font-size:13px">${esc(sm.pull?.summary ?? '')}</p>
<p class="tt-note">Purple: the price over the last 60 sessions. Gold lines: option expiries. Bubbles: the biggest strikes in each expiry, sized by open interest, <span class="up">green</span> mostly calls, <span class="dn">red</span> mostly puts. Dashed: the two paths the Swing Map weighs (${(sm.paths ?? []).slice(0, 2).map(p => `${esc(p.name)} ${Math.round((p.prob ?? 0) * 100)}%`).join(', ')}). ${evChip('zones')} ${esc(EVIDENCE.zones.line)} <a href="swing-map.html">Full Swing Map →</a></p>`;
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
