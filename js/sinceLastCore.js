/**
 * "Since you last looked" (Desk Terminal, preview): the pure part. Compares two saved CORE snapshots of the terminal (js/deskSnapshot.js, one a little before the moment the owner last
 * looked, one the latest) and writes what moved as ranked, plain sentences: the stress lights, the risk flags and VIX, the currency strength leaders, the Fed path's next meeting, the growth
 * and inflation regime, central-bank statements, the curve, the vol gauges, the term premium, the wider market state, feeds that went missing, and the releases that printed in between
 * (from the Release Reaction record, with the move in the 30 minutes after against that kind's typical size).
 *
 * It DESCRIBES what changed. It never says what the change means for direction (the Evidence Book has no validated direction rule for any of these), and every point is point in time:
 * each side is the saved record as it was published then, nothing is rebuilt. No model call.
 */
import { listReleases, unitFor, familyLabel, marketLabel, niceDay, hhmm, fin } from './eventReplayCore.js';

/** The snapshot sections this comparison needs (the `fields` of /api/desk-snapshots). */
export const FIELDS = ['stress', 'risk', 'strength', 'fed', 'regime', 'cb', 'curve', 'vol', 'termprem', 'market'];

const LEVEL = { ok: 0, watch: 1, stress: 2 };
const TILE = { risk: 'Risk flags', credit: 'Credit', funding: 'Dollar funding', em: 'EM carry', liquidity: 'Fed liquidity', tp: 'Term premium', cycle: 'Global rate cycle' };
const FLAG = { vix_level: 'VIX level', vix_term: 'VIX term structure', hy_speed: 'the speed of the high-yield spread', jpy_bid: 'the yen bid', evz_stress: 'euro vol stress', stock_bond_corr: 'the stock-bond correlation' };
const BANK = { fomc: 'the Fed', ecb: 'the ECB', boe: 'the Bank of England', boj: 'the Bank of Japan', boc: 'the Bank of Canada', rba: 'the RBA', rbnz: 'the RBNZ', snb: 'the SNB' };
const WINDOW = { '1H': 'the last hour', '4H': 'the last four hours', '1D': 'the last day', '1W': 'the last week' };
const word = l => (l === 2 ? 'stress' : l === 1 ? 'watch' : 'OK');
const sg = (v, d = 1) => (fin(v) ? `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}` : '–');
const num = v => (fin(v) ? v : null);

/** The point of `points` (ascending or not) that was in force at `ts`: the latest at or before it; if all are later, the earliest (and `early` is true). */
export function pickPoint(points, ts) {
  const ok = (points ?? []).filter(p => p && fin(p.ts) && p.d).sort((a, b) => a.ts - b.ts); if (!ok.length) return null;
  const before = ok.filter(p => p.ts <= ts); return before.length ? { point: before.at(-1), early: false } : { point: ok[0], early: true };
}

/** The ranges the card offers: label, and the start time for a given "now". `lastLook` is the stored time of the previous visit (ms) or null. */
export function ranges(now, lastLook) {
  const out = [];
  if (fin(lastLook) && now - lastLook >= 10 * 60e3) out.push({ id: 'last', label: `Since your last visit (${ago(now - lastLook)} ago)`, from: lastLook });
  out.push({ id: '1h', label: 'Last hour', from: now - 3600e3 }, { id: '4h', label: 'Last 4 hours', from: now - 4 * 3600e3 }, { id: '24h', label: 'Last 24 hours', from: now - 24 * 3600e3 });
  return out;
}
export const ago = ms => { const m = Math.round(ms / 60e3); return m < 90 ? `${m} min` : m < 36 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`; };

/** All the changes between two CORE points as { kind, key, weight, title, detail }, unsorted. `ctx.printed` are Release Reaction rows that printed between them, `ctx.rows` the whole record (for units). */
export function compare(a, b, ctx = {}) {
  const out = [], A = a?.d ?? {}, B = b?.d ?? {}, push = (kind, key, weight, title, detail = '') => out.push({ kind, key, weight, title, detail });
  // the stress lights
  if (A.stress && B.stress) {
    const la = LEVEL[A.stress.overall], lb = LEVEL[B.stress.overall];
    if (la != null && lb != null && la !== lb) push('stress', 'overall', 7 + (lb > la ? 1 : 0), `World stress went from ${word(la)} to ${word(lb)}`, `score ${A.stress.score ?? '?'} to ${B.stress.score ?? '?'}`);
    for (const k of new Set([...Object.keys(A.stress.tiles ?? {}), ...Object.keys(B.stress.tiles ?? {})])) {
      const x = LEVEL[A.stress.tiles?.[k]], y = LEVEL[B.stress.tiles?.[k]]; if (x == null || y == null || x === y) continue;
      push('stress', `tile-${k}`, 4 + (y > x ? 1.5 : 0), `${TILE[k] ?? k} went from ${word(x)} to ${word(y)}`);
    }
  }
  // the risk flags and VIX
  if (A.risk && B.risk) {
    for (const k of new Set([...Object.keys(A.risk.flags ?? {}), ...Object.keys(B.risk.flags ?? {})])) {
      const x = A.risk.flags?.[k], y = B.risk.flags?.[k]; if (!x || !y || x[0] === y[0]) continue;
      push('risk', `flag-${k}`, 6, `${FLAG[k] ? FLAG[k][0].toUpperCase() + FLAG[k].slice(1) : k} flag turned ${y[0] ? 'on' : 'off'}`, `reading ${x[1] ?? '–'} to ${y[1] ?? '–'}`);
    }
    const va = A.risk.flags?.vix_level?.[1], vb = B.risk.flags?.vix_level?.[1];
    if (fin(va) && fin(vb) && Math.abs(vb - va) >= 1) push('risk', 'vix', 3 + Math.abs(vb - va) * 0.6, `VIX ${vb > va ? 'rose' : 'fell'} from ${va} to ${vb}`);
    if (A.risk.level && B.risk.level && A.risk.level !== B.risk.level) push('risk', 'level', 6, `The risk-flag level went from ${A.risk.level.toLowerCase()} to ${B.risk.level.toLowerCase()}`, `${A.risk.active ?? '?'} to ${B.risk.active ?? '?'} of ${B.risk.available ?? '?'} flags on`);
  }
  // currency strength
  if (A.strength?.h && B.strength?.h) {
    for (const w of ['4H', '1D']) {
      const x = A.strength.h[w], y = B.strength.h[w]; if (!x?.s || !y?.s) continue;
      if (x.lead && y.lead && x.lead !== y.lead) push('strength', `lead-${w}`, 4, `${y.lead} now leads ${WINDOW[w]}`, `${x.lead} did before; ${y.lag} is last (spread ${y.spread ?? '–'}σ)`);
      if (x.lag && y.lag && x.lag !== y.lag) push('strength', `lag-${w}`, 3, `${y.lag} is now the weakest over ${WINDOW[w]}`, `it was ${x.lag}`);
      for (const c of Object.keys(y.s)) { const d = (y.s[c] ?? NaN) - (x.s[c] ?? NaN); if (fin(d) && Math.abs(d) >= 1.2) push('strength', `${w}-${c}`, 2 + Math.abs(d), `${c} moved ${sg(d)}σ against the other seven over ${WINDOW[w]}`, `${sg(x.s[c])}σ to ${sg(y.s[c])}σ`); }
    }
  }
  // the Fed path's next meeting
  const fa = A.fed?.meetings?.[0], fb = B.fed?.meetings?.[0];
  if (fa && fb && fa[0] === fb[0] && fin(fa[2]) && fin(fb[2]) && Math.abs(fb[2] - fa[2]) >= 5) push('fed', 'fed', 5 + Math.min(3, Math.abs(fb[2] - fa[2]) / 8), `The Fed path's chance of a move at ${fb[0]} went from ${fa[2]}% to ${fb[2]}%`, `priced, not forecast: the futures-implied move is ${sg(fb[1])} bp`);
  // the regime
  if (A.regime && B.regime) {
    if (A.regime.quadrant && B.regime.quadrant && A.regime.quadrant !== B.regime.quadrant) push('regime', 'quad', 6, `The growth and inflation regime went from ${A.regime.qName ?? A.regime.quadrant} to ${B.regime.qName ?? B.regime.quadrant}`);
    if (A.regime.corr?.state && B.regime.corr?.state && A.regime.corr.state !== B.regime.corr.state) push('regime', 'corr', 4, `Correlation between markets went from ${A.regime.corr.state.toLowerCase()} to ${B.regime.corr.state.toLowerCase()}`);
  }
  // central-bank statements
  for (const k of new Set([...Object.keys(A.cb ?? {}), ...Object.keys(B.cb ?? {})])) {
    const x = A.cb?.[k], y = B.cb?.[k]; if (!x || !y) continue;
    if (x.date !== y.date) push('cb', `cb-${k}`, 5.5, `${(BANK[k] ?? k.toUpperCase())[0].toUpperCase() + (BANK[k] ?? k.toUpperCase()).slice(1)}: a newer statement (${y.date}) has been read`, `tone ${String(y.regime ?? '?').toLowerCase()}, score ${y.score ?? '?'}${fin(y.delta) ? ` (${sg(y.delta, 2)} on the previous one)` : ''}`);
    else if (x.regime !== y.regime) push('cb', `cbr-${k}`, 4, `${(BANK[k] ?? k)} tone read changed from ${String(x.regime).toLowerCase()} to ${String(y.regime).toLowerCase()}`);
  }
  // the curve
  if (A.curve?.slopes && B.curve?.slopes) for (const k of Object.keys(B.curve.slopes)) {
    const x = A.curve.slopes[k]?.[0], y = B.curve.slopes[k]?.[0]; if (fin(x) && fin(y) && Math.abs(y - x) >= 4) push('curve', `curve-${k}`, 3 + Math.abs(y - x) / 4, `The ${k} slope ${y > x ? 'steepened' : 'flattened'} by ${Math.abs(y - x).toFixed(0)} bp`, `${x} bp to ${y} bp`);
  }
  // the vol gauges (only where the gauge's own data date moved, so a stale one is not a change)
  if (A.vol?.gauges && B.vol?.gauges) for (const k of Object.keys(B.vol.gauges)) {
    const x = A.vol.gauges[k], y = B.vol.gauges[k]; if (!x || !y || x[3] === y[3]) continue;
    const dp = (y[1] ?? NaN) - (x[1] ?? NaN); if (fin(dp) && Math.abs(dp) >= 10) push('vol', `vol-${k}`, 3 + Math.abs(dp) / 10, `${k} went from ${x[0]} to ${y[0]}`, `${x[1]}th to ${y[1]}th percentile of its own five years`);
  }
  if (A.termprem && B.termprem && fin(A.termprem.value) && fin(B.termprem.value) && Math.abs(B.termprem.value - A.termprem.value) >= 0.04) push('termprem', 'tp', 2.5, `The term premium moved from ${A.termprem.value}% to ${B.termprem.value}%`);
  if (A.market && B.market && A.market.name && B.market.name && A.market.name !== B.market.name) push('market', 'mkt', 4, `The wider-market state went from ${A.market.name} to ${B.market.name}`);
  // feeds that went missing or came back
  const ga = new Set(a?.gaps ?? []), gb = new Set(b?.gaps ?? []);
  for (const g of gb) if (!ga.has(g)) push('feed', `gap-${g}`, 3, `The ${g} feed went missing from the capture`, 'its section is a gap, not a carried value');
  for (const g of ga) if (!gb.has(g)) push('feed', `back-${g}`, 1, `The ${g} feed is back`);
  // releases that printed in between, with the move in the 30 minutes after
  for (const r of ctx.printed ?? []) {
    const mk = r.family === 'BOE' ? 'gbpusd' : r.family === 'BOJ' ? 'usdjpy' : r.family === 'ECB' ? 'eurusd' : 'nq', m = num(r.M?.[mk]?.m30), u = unitFor(ctx.rows ?? [], r.family, mk);
    const surprise = fin(r.actual) && fin(r.consensus) ? `${r.actual} against ${r.consensus} expected${fin(r.surprise) ? ` (${r.surprise > 0 ? '+' : ''}${r.surprise})` : ''}` : 'no stored consensus';
    push('release', `rel-${r.id}`, 9, `${familyLabel(r.family)} printed at ${hhmm(r.t)} UTC: ${r.name}`, `${surprise}${m != null ? `; ${marketLabel(mk)} moved ${sg(m, 2)}% in the next 30 minutes${u ? ` (a typical reaction to this kind of release is ${u.toFixed(2)}%)` : ''}` : ''}`);
  }
  return out;
}

/** The ranked list, at most `n`, with a plain header: from, to, and how many snapshots the span covers. */
export function rank(items, n = 14) { return [...items].sort((x, y) => y.weight - x.weight).slice(0, n); }

/** The releases (Release Reaction rows) that printed after `fromMs` and up to `toMs`. */
export function printedBetween(rows, fromMs, toMs) { return listReleases(rows, toMs).filter(r => Date.parse(r.t) > fromMs && Date.parse(r.t) <= toMs); }

const fmtT = ms => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
/** One sentence about what was compared, honest about an early start. */
export function spanText(a, b, early, n) {
  const t = `${fmtT(a.ts)} to ${fmtT(b.ts)} (${ago(b.ts - a.ts)})`;
  return `${t}. ${early ? `The saved record only begins ${fmtT(a.ts)}, so the comparison starts there. ` : ''}${n} snapshot${n === 1 ? '' : 's'} held for the span. Each side is the record as it was published then.`;
}

/** The context line for an empty result, so "nothing moved" is not read as "nothing was checked". */
export function quietText(a, b) {
  const checked = FIELDS.filter(f => a?.d?.[f] && b?.d?.[f]);
  return `Nothing moved by more than the usual amount across ${checked.length} of ${FIELDS.length} sections checked (${checked.join(', ')}).`;
}
