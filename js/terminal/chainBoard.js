/**
 * The chain, for the Desk Terminal (desk-terminal.html, "Chain" tab).
 *
 * today.html builds the macro chain from page state it loads itself (FRED history, OANDA daily closes, the gilt /
 * Bund / JGB 10Y, the seven extra chips, the crack spread, and /api/chain-live for the Live window). This module is
 * that same assembly as pure functions over the raw API payloads, so the terminal draws exactly the links and
 * verdicts today.html draws (js/macroChain.js does the judging in both places) and the maths is testable in Node.
 *
 * It explains; it does not predict. None of these links is a validated forward signal on this desk.
 */
import { CHAIN_NODES, CHAIN_LAYOUT, evaluateChain, nodeDelta, summariseChain, chainForPrompt, leanOf, tintStrength } from '../macroChain.js';
import { mergeLive } from '../chainLive.js';

/** OANDA daily series behind the market chips (same map as today.html). */
export const CHAIN_OHLC = { oil: 'WTICO_USD', gold: 'XAU_USD', copper: 'XCU_USD', audusd: 'AUD_USD', usdcad: 'USD_CAD', usdjpy: 'USD_JPY', btc: 'BTC_USD', nq: 'NAS100_USD', spx: 'SPX500_USD', gbpusd: 'GBP_USD', eurusd: 'EUR_USD' };
/** /api/fredhistory keys the chain needs (today.html loads a superset). */
export const CHAIN_FRED_KEYS = 'us10y,us2y,us30y,tips,bei,vix,dxy,hy,sofr,iorb,ioer,tp10,fy10';
export const CHAIN_EXTRA = ['smh', 'xle', 'xlre', 'move', 'ccc', 'emdollar', 'emoas'];
export const WINDOWS = ['live', 1, 5, 20];

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/**
 * /api/ohlc payload (NEWEST FIRST, prices as strings) -> ascending [{date, value}]. OANDA stamps a daily candle by its
 * OPEN (17:00 New York the evening before), so the date moves forward one day to the session it closes, as today.html does.
 */
export function ohlcAscending(oh) {
  const sessionDate = d => { const t = Date.parse(`${d}T00:00:00Z`); return Number.isFinite(t) ? new Date(t + 864e5).toISOString().slice(0, 10) : ''; };
  return (oh?.values ?? [])
    .map(v => ({ date: sessionDate(String(v.datetime ?? v.time ?? '').slice(0, 10)), value: num(v.close) }))
    .filter(v => v.date && v.value != null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** SOFR against the Fed's floor (IORB, IOER before 2021-07-29), point by point. */
export function fundingSpread(fred) {
  const sofr = fred?.sofr, iorb = fred?.iorb, ioer = fred?.ioer;
  if (!Array.isArray(sofr) || !sofr.length || !(iorb?.length || ioer?.length)) return [];
  const fl = new Map([...(ioer ?? []).map(p => [p.date, p.value]), ...(iorb ?? []).map(p => [p.date, p.value])]);
  let lastFloor = null;
  return sofr.map(p => { if (fl.has(p.date)) lastFloor = fl.get(p.date); return lastFloor == null ? null : { date: p.date, value: p.value - lastFloor }; }).filter(Boolean);
}

/** A foreign 10Y minus the Treasury 10Y on common dates. */
export function gapSeries(foreign, ust) {
  const by = new Map((ust ?? []).map(p => [p.date, p.value]));
  if (!Array.isArray(foreign) || !foreign.length || !by.size) return [];
  return foreign.filter(p => by.has(p.date)).map(p => ({ date: p.date, value: p.value - by.get(p.date) }));
}

/**
 * Every node's move over the window. inputs: { fred: /api/fredhistory, ohlc: { node: ascending series },
 * intl: /api/intl-yields .series, extra: /api/chain-extra .series, crack: /api/crack .series, live: /api/chain-live }.
 * win: 1 | 5 | 20 | 'live'. Live = the live nodes over the 1-day last prints (a node with no live price keeps its
 * last print, tagged, and is never judged live).
 */
export function chainVals(inputs = {}, win = 20) {
  if (win === 'live') {
    const merged = mergeLive(inputs.live?.nodes ?? {}, chainVals(inputs, 1));
    const tl = inputs.fred?.tips?.at?.(-1)?.value;
    if (merged?.real && typeof merged.real.basis === 'string' && merged.real.basis.startsWith('implied') && tl != null) merged.real = { ...merged.real, last: tl + merged.real.delta / 100 };
    return merged;
  }
  const { fred = {}, ohlc = {}, intl = {}, extra = {}, crack = null } = inputs, out = {};
  const d = (pts, node) => (Array.isArray(pts) && pts.length ? nodeDelta(pts, CHAIN_NODES[node], win) : null);
  for (const [node, key] of Object.entries({ bei: 'bei', us2y: 'us2y', us10y: 'us10y', us30y: 'us30y', real: 'tips', dxy: 'dxy', vix: 'vix', hy: 'hy' })) out[node] = d(fred[key], node);
  for (const node of Object.keys(CHAIN_OHLC)) out[node] = d(ohlc[node], node);
  const fs = fundingSpread(fred); out.funding = fs.length ? d(fs, 'funding') : null;
  for (const [node, key] of [['giltgap', 'gb10y'], ['bundgap', 'de10y'], ['jgbgap', 'jp10y']]) { const g = gapSeries(intl?.[key], fred.us10y); out[node] = g.length ? d(g, node) : null; }
  for (const node of CHAIN_EXTRA) { const pts = extra?.[node]; out[node] = Array.isArray(pts) && pts.length > 20 ? d(pts, node) : null; }
  out.crack = d(crack, 'crack');
  return out;
}

/** The evaluated chain for one window. */
export function chainLinks(inputs, win = 20) { return evaluateChain(chainVals(inputs, win), undefined, undefined, win); }

/** The 10Y's move split by the ACM model into term premium and the expected path (bp). */
export function termPremiumSplit(fred, win = 20) {
  const tp = fred?.tp10, fy = fred?.fy10; if (!Array.isArray(tp) || !tp.length || !Array.isArray(fy) || !fy.length || win === 'live') return null;
  const stub = { unit: 'bp', floor: 0, dp: 0 }, a = nodeDelta(tp, stub, win), b = nodeDelta(fy, stub, win); if (!a || !b) return null;
  return { tp: a.delta, path: b.delta - a.delta, fitted: b.delta, level: tp.at(-1)?.value ?? null };
}

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const winWord = w => (w === 'live' ? 'live' : w === 1 ? '1-day' : `${w}-day`);
export const overWord = w => (w === 'live' ? 'since the last close' : `over ${w} day${w === 1 ? '' : 's'}`);

/** Short pill labels that fit between the chips (today.html's, so both pages name a link the same). */
export const EDGE_LABEL = { 'oil-bei': 'oil→infl.', 'bei-us10y': 'infl.→10Y', 'us10y-real': 'nom→real', 'us2y-us30y': 'front→long', 'real-dxy': 'real→$', 'dxy-audusd': '$→AUD', 'real-gold': 'real→gold', 'dxy-gold': '$→gold', 'dxy-usdjpy': '$→yen', 'real-nq': 'real→growth', 'real-spx': 'real→broad', 'oil-usdcad': 'oil→CAD', 'copper-audusd': 'Cu→AUD', 'vix-usdjpy': 'fear→yen', 'vix-hy': 'fear→HY', 'dxy-btc': '$→BTC', 'funding-dxy': 'fund→$', 'funding-vix': 'fund→fear', 'giltgap-gbpusd': 'gilts→£', 'bundgap-eurusd': 'bunds→€', 'jgbgap-usdjpy': 'JGBs→yen', 'crack-bei': 'crack→infl.', 'hy-nq': 'HY→growth', 'hy-spx': 'HY→broad', 'smh-nq': 'chips→Nasdaq', 'oil-xle': 'oil→energy', 'us10y-xlre': '10Y→property', 'move-vix': 'bond fear→VIX', 'hy-ccc': 'HY→CCC', 'ccc-nq': 'CCC→growth', 'dxy-emdollar': '$→EM FX', 'emdollar-copper': 'EM→Cu', 'emoas-hy': 'EM credit→HY' };

/** One-line pictograms on a 24-unit box (the same marks as today.html, single weight, currentColor). */
export const CHAIN_ICON = {
  smh: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
  xle: '<path d="M12 3c3 4 6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 9 7 12 3z"/>',
  xlre: '<path d="M4 11.5 12 4l8 7.5V20H4z M10 20v-5h4v5"/>',
  move: '<path d="M3 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/>',
  ccc: '<path d="M12 4 21 19H3z M12 10v4.5"/>',
  emdollar: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17"/>',
  emoas: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5"/>',
  oil: '<path d="M7 3h10v3l2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8l2-2z M5 12h14 M5 16h14"/>',
  bei: '<path d="M12 3a2 2 0 0 0-2 2v9.5a4 4 0 1 0 4 0V5a2 2 0 0 0-2-2z M12 8v8"/>',
  us2y: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  us10y: '<path d="M3 18 9 11l4 3 8-9 M15 5h6v6"/>',
  us30y: '<path d="M4 20h16 M5 9h14 M12 3 4 8h16z M7 9v11 M12 9v11 M17 9v11"/>',
  real: '<path d="M12 3v18 M5 8h14 M5 8l-3 6a3 3 0 0 0 6 0z M19 8l-3 6a3 3 0 0 0 6 0z"/>',
  dxy: '<path d="M12 3v18 M16 7.5a4 4 0 0 0-4-2.5H11a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-1.5a4 4 0 0 1-3.5-2"/>',
  gold: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>',
  copper: '<path d="M13 2 5 13h6l-1 9 8-12h-6z"/>',
  audusd: '<path d="M4 15c2-6 6-8 9-8 3 0 5 2 5 4l3 1-3 2c0 3-3 5-6 5H9l-2 3"/>',
  usdcad: '<path d="M12 3l2 4 3-1-1 4 4 2-4 2 1 4-3-1-2 4-2-4-3 1 1-4-4-2 4-2-1-4 3 1z"/>',
  usdjpy: '<path d="M3 6h18 M5 6c0 1 0 2-1 3 M19 6c0 1 0 2 1 3 M6 9h12 M8 9v11 M16 9v11 M6 14h12"/>',
  vix: '<path d="M7 16a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.5 1A3.5 3.5 0 0 1 17 16H7z M13 16l-2 4h4l-2 4"/>',
  hy: '<path d="M3 21h18 M5 10h14 M12 3 3 9h18z M7 10v8 M12 10v8 M17 10v8 M5 18h14"/>',
  nq: '<path d="M12 3c3 3 4 7 4 11l3 3v3l-4-2-1 3h-4l-1-3-4 2v-3l3-3c0-4 1-8 4-11z"/>',
  spx: '<path d="M4 21V9l8-6 8 6v12 M9 21v-6h6v6"/>',
  btc: '<path d="M9 4v16 M13 4v2 M13 18v2 M8 6h6a3 3 0 0 1 0 6H8 M8 12h7a3 3 0 0 1 0 6H8"/>',
  funding: '<path d="M4 6h8a4 4 0 0 1 4 4v2h4v3h-4v2a2 2 0 0 1-2 2h-2v-4H4z"/>',
  crack: '<path d="M5 20V9l3-5h8l3 5v11z M5 13h14 M10 4v5 M14 4v5"/>',
  giltgap: '<text x="12" y="17.5" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor" stroke="none">£</text>',
  bundgap: '<text x="12" y="17.5" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor" stroke="none">€</text>',
  jgbgap: '<text x="12" y="17.5" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor" stroke="none">¥</text>',
  gbpusd: '<text x="12" y="16.5" text-anchor="middle" font-size="10" font-weight="800" fill="currentColor" stroke="none">£/$</text>',
  eurusd: '<text x="12" y="16.5" text-anchor="middle" font-size="10" font-weight="800" fill="currentColor" stroke="none">€/$</text>',
  _: '<circle cx="12" cy="12" r="4"/>',
};

export const VCLS = { holding: 'hold', broken: 'broke', quiet: 'quiet', unmeasured: 'none', notlive: 'none' };
export const VWORD = { holding: 'holding', broken: 'broken', quiet: 'quiet', unmeasured: 'no data', notlive: 'not live' };

/** A chip's short name (today.html's shortening, so the two pages read the same). */
export const shortLabel = n => n.label.replace(/ \(.*\)$/, '').replace('Inflation expectations', 'Infl. pricing').replace('Credit spreads', 'Credit (HY)').replace('Growth stocks', 'Nasdaq').replace('Broad stocks', 'S&P 500').replace('Fear gauge', 'VIX').replace('Funding', 'Funding (repo)');

/**
 * The chain as an SVG string, in the terminal's palette: chips glow green / red by the DIRECTION their node moved
 * (gold ring = the end of a broken link), links glow purple and flow cause -> effect when holding, pulse gold when
 * broken, and sit dim and dashed when quiet. opts: { win, nodeSel, linkSel, showQuiet }.
 * Every chip carries data-node and every link data-link, so the page can hang hover and click on them.
 */
export function chainSvg(links, { win = 20, nodeSel = null, linkSel = null, showQuiet = true } = {}) {
  if (!links?.length) return '';
  const POS = CHAIN_LAYOUT, PX = 232, PY = 98, BW = 156, BH = 46, OX = 14, OY = 12, R = 14;
  const ROWS = Math.max(...Object.values(POS).map(p => p[1])) + 1, W = OX * 2 + PX * 5 + BW, H = OY * 2 + PY * (ROWS - 1) + BH;
  const cx = k => OX + POS[k][0] * PX + BW / 2, cy = k => OY + POS[k][1] * PY + BH / 2;
  const ends = {}; for (const l of links) { if (l.a?.key) ends[l.a.key] = l.a; if (l.b?.key) ends[l.b.key] = l.b; }
  const wrongEnd = new Set(links.filter(l => l.verdict === 'broken').map(l => l.b?.key));
  const clip = (x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0, tx = dx ? (BW / 2) / Math.abs(dx) : Infinity, ty = dy ? (BH / 2) / Math.abs(dy) : Infinity, t = Math.min(tx, ty); return [x0 + dx * t, y0 + dy * t]; };
  const show = l => showQuiet || l.verdict === 'holding' || l.verdict === 'broken' || l.id === linkSel || (nodeSel && (l.a?.key === nodeSel || l.b?.key === nodeSel));
  const edges = links.filter(l => POS[l.a?.key] && POS[l.b?.key] && show(l)).map(l => {
    const [sx, sy] = clip(cx(l.a.key), cy(l.a.key), cx(l.b.key), cy(l.b.key)), [ex, ey] = clip(cx(l.b.key), cy(l.b.key), cx(l.a.key), cy(l.a.key));
    const straightOn = Math.abs(ex - sx) < 2 || Math.abs(ey - sy) < 2, horiz = Math.abs(ex - sx) >= Math.abs(ey - sy);
    const h = horiz ? Math.max(30, Math.abs(ex - sx) * 0.4) : 0, v = horiz ? 0 : Math.max(24, Math.abs(ey - sy) * 0.4);
    const d = straightOn
      ? `M${sx.toFixed(1)},${sy.toFixed(1)} C${(sx + (horiz ? h * Math.sign(ex - sx) : 0)).toFixed(1)},${(sy + (horiz ? 0 : v * Math.sign(ey - sy))).toFixed(1)} ${(ex - (horiz ? h * Math.sign(ex - sx) : 0)).toFixed(1)},${(ey - (horiz ? 0 : v * Math.sign(ey - sy))).toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`
      : `M${sx.toFixed(1)},${sy.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}`;
    const mx = (sx + ex) / 2, my = (sy + ey) / 2, lbl = EDGE_LABEL[l.id] ?? String(l.short ?? l.id).replace(/\s*→\s*/g, '→'), lw = lbl.length * 6.3 + 12;
    const vc = VCLS[l.verdict] ?? 'none', lean = leanOf(l), sel = linkSel === l.id ? ' sel' : '';
    return `<g class="cg-e ${vc}${lean ? ` lean-${lean}` : ''}${sel}" data-link="${esc(l.id)}" tabindex="0" role="button" aria-label="${esc(`${l.textbook}: ${VWORD[l.verdict] ?? l.verdict}`)}"><path class="cg-hit" d="${d}"/><path class="cg-glow" d="${d}"/><path class="cg-line" d="${d}" marker-end="url(#cg-ah-${vc})"/><rect class="cg-pill" x="${(mx - lw / 2).toFixed(1)}" y="${(my - 8).toFixed(1)}" width="${lw.toFixed(1)}" height="16" rx="8"/><text class="cg-pt" x="${mx.toFixed(1)}" y="${(my + 3.5).toFixed(1)}" text-anchor="middle">${esc(lbl)}</text></g>`;
  }).join('');
  const arrow = d => (d === 'up' ? '↑' : d === 'down' ? '↓' : '');
  const nodes = Object.keys(POS).map(k => {
    const n = CHAIN_NODES[k]; if (!n) return '';
    const e = ends[k], x = cx(k) - BW / 2, y = cy(k) - BH / 2, stale = win === 'live' && e?.basis === 'last-print';
    const moved = e?.delta != null && e.moved && !stale;
    let ring = stale ? 'none' : wrongEnd.has(k) ? 'wrong' : moved ? (e.dir === 'up' ? 'up' : 'dn') : e?.delta == null ? 'none' : 'quiet';
    const tint = !stale && ring === 'quiet' ? tintStrength(e) : null; if (tint != null) ring = e.dir === 'up' ? 'tu' : 'td';
    const dirCls = !stale && e?.dir ? (e.dir === 'up' ? 'up' : 'dn') : '';
    const val = e?.delta == null ? 'no data' : stale ? `${e.text} · last print` : `${e.text} ${moved ? arrow(e.dir) : '· quiet'}`;
    return `<g class="cg-n ${ring}${stale ? ' stale' : ''}${nodeSel === k ? ' sel' : ''}"${tint != null ? ` style="--s:${tint.toFixed(2)}"` : ''} data-node="${k}" tabindex="0" role="button" aria-label="${esc(`${n.label}: ${val}`)}"><rect class="cg-chip" x="${x}" y="${y}" width="${BW}" height="${BH}" rx="23"/><circle class="cg-ring" cx="${x + 23}" cy="${y + BH / 2}" r="${R}"/><g class="cg-ic" transform="translate(${x + 23 - 8},${y + BH / 2 - 8}) scale(0.667)">${CHAIN_ICON[k] ?? CHAIN_ICON._}</g><text class="cg-nl" x="${x + 44}" y="${y + 19}">${esc(shortLabel(n))}</text><text class="cg-nv ${moved ? dirCls : ''}" x="${x + 44}" y="${y + 35}">${esc(val)}</text></g>`;
  }).join('');
  const defs = `<defs><filter id="cg-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2"/></filter>${['hold', 'broke', 'quiet', 'none'].map(c => `<marker id="cg-ah-${c}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9 Z" class="cg-ah ${c}"/></marker>`).join('')}</defs>`;
  return `<svg class="cg" viewBox="0 0 ${W} ${H}" role="img" aria-label="The macro chain: each chip is a thing that moves, each line a textbook link">${defs}<g class="cg-edges">${edges}</g><g class="cg-nodes">${nodes}</g></svg>`;
}

/** A reduced snapshot for POST /api/chain-read (the read is written only on a click: a paid model call). */
export function chainSnapshot({ links, vals, win, policy = null, events = [], setups = null, now = Date.now() }) {
  const fmt = (v, dp = 0) => (v == null ? '?' : `${v > 0 ? '+' : ''}${Number(v).toFixed(dp)}`);
  const assets = ['oil', 'gold', 'copper', 'btc', 'audusd', 'usdcad', 'usdjpy', 'eurusd', 'gbpusd', 'nq', 'spx', 'dxy']
    .filter(k => vals?.[k] && !(win === 'live' && vals[k].basis === 'last-print'))
    .map(k => { const n = CHAIN_NODES[k], v = vals[k]; return `  ${n.label}: ${win === 'live' ? 'live' : `${win}d`} ${fmt(v.delta, n.unit === 'pct' ? 1 : 0)}${n.unit === 'pct' ? '%' : n.unit === 'bp' ? 'bp' : ''}${v.last != null ? ` (last ${Number(v.last).toFixed(2)}${v.asOf ? `, ${String(v.asOf).slice(0, 10)}` : ''})` : ''}`; }).join('\n');
  const q = links.filter(l => l.verdict === 'quiet').length, nl = links.filter(l => l.verdict === 'notlive').length;
  const caveats = [q ? `  ${q} of ${links.length} chain links are QUIET ${overWord(win)} -- do not chain through them` : null,
    win === 'live' && nl ? `  LIVE SNAPSHOT: ${nl} of ${links.length} links are NOT JUDGED because an end has no live price.` : null,
    '  Written from the Desk Terminal: the macro-moves strip, the risk board and the currency-strength row were not sent.'].filter(Boolean).join('\n');
  const evs = (events ?? []).filter(e => /high/i.test(e.impact ?? '') && e.ms > now - 3 * 3600e3 && e.ms < now + 48 * 3600e3).sort((a, b) => a.ms - b.ms).slice(0, 6)
    .map(e => { const h = Math.round((e.ms - now) / 3600e3); return `  ${e.country} ${e.event}${e.estimate != null && e.estimate !== '' ? ` (consensus ${e.estimate})` : ''} -- ${h < 0 ? `${-h}h ago` : h === 0 ? 'now' : `in ${h}h`}`; }).join('\n') || null;
  const pol = policy ? `  2Y ${policy.twoYear}% vs policy rate ${policy.policyRate}% (${fmt(policy.gapBp)}bp): roughly ${Math.abs(policy.movesPriced ?? 0).toFixed(1)} ${policy.direction === 'cuts' ? 'cuts' : policy.direction === 'hikes' ? 'hikes' : 'moves'} already priced` : null;
  return { asOf: new Date(now).toISOString(), window: win, moved: null, chain: chainForPrompt(links, win) || null, ratesSplit: null, policy: pol, assets: assets || null, risk: null, equities: null, setups, ccy: null, divergences: null, caveats, events: evs, evidence: null };
}

export { summariseChain, CHAIN_NODES, CHAIN_LAYOUT };
