/**
 * Liquidity & banking layer for the Market State Engine (owner, 2026-11-01: "banking info, movement of money").
 *
 * Pure: takes raw FRED series ({date, value}[] in FRED's own units) plus the daily Treasury TGA, returns the layer.
 *   WALCL      Fed total assets, weekly (Wed), $ millions
 *   WTREGEN    Treasury General Account, weekly, $ millions
 *   RRPONTSYD  overnight reverse repo, daily, $ billions
 *   WRESBAL    reserve balances at the Fed, weekly, $ millions
 *   SWPT       central-bank liquidity swaps, weekly, $ millions
 *   TOTBKCR    bank credit, all commercial banks, weekly, $ billions
 *   tgaDaily   Daily Treasury Statement TGA, $ billions (js/treasuryDts.js)
 *
 * Net liquidity = WALCL − TGA − RRP in $ billions, through js/netLiquidity.js (the units the banked study used).
 * Everything here is description. Evidence: net-liquidity-tailwind-spx/-nq are UNDERPOWERED (the right sign,
 * ~0.4 pp per 4 weeks, cannot be told from noise on 15 years); bank-credit-* were not verified by the 2026-10-31 audit.
 */
import { netLiquidityBn, netLiqUnitWarnings } from './netLiquidity.js';
import { EVIDENCE_AUDIT } from './evidenceAudit.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
const r1 = v => (fin(v) ? Math.round(v * 10) / 10 : null);
const clean = s => (Array.isArray(s) ? s.filter(p => p && p.date && fin(p.value)).sort((a, b) => (a.date < b.date ? -1 : 1)) : []);

/** Last value on or before `date` (series sorted ascending). */
export function asOf(series, date) {
  let lo = 0, hi = series.length - 1, hit = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (series[m].date <= date) { hit = series[m]; lo = m + 1; } else hi = m - 1; }
  return hit;
}

/** Weekly net liquidity on WALCL's dates. TGA/RRP are taken as of each Wednesday; a gap > 10 days drops the week. */
export function netLiquidityWeekly({ walcl, tga, rrp }) {
  const W = clean(walcl), T = clean(tga), R = clean(rrp);
  const stale = (p, d) => !p || (Date.parse(d) - Date.parse(p.date)) / 864e5 > 10;
  const out = [];
  for (const w of W) {
    const t = asOf(T, w.date), r = asOf(R, w.date);
    if (stale(t, w.date) || stale(r, w.date)) continue;
    const v = netLiquidityBn(w.value, t.value, r.value);
    if (fin(v)) out.push({ date: w.date, value: v, walcl: w.value / 1000, tga: t.value / 1000, rrp: r.value });
  }
  return out;
}

/** Change over `weeks` weekly points, and the percentile of the last value over the whole series. */
export function weeklyStats(series, scale = 1) {
  const s = clean(series);
  if (!s.length) return null;
  const last = s[s.length - 1];
  const back = k => (s.length > k ? s[s.length - 1 - k].value : null);
  const chg = k => (back(k) == null ? null : r1((last.value - back(k)) * scale));
  const below = s.filter(p => p.value < last.value).length, eq = s.filter(p => p.value === last.value).length;
  return {
    last: r1(last.value * scale), asOf: last.date, since: s[0].date, n: s.length,
    chg4w: chg(4), chg13w: chg(13), chg52w: chg(52),
    pctAll: Math.round(100 * (below + 0.5 * eq) / s.length),
  };
}

/** Daily → weekly: the last print of each week ending Wednesday (FRED's H.4.1 week), dated by that print. */
export function toWeekly(series) {
  const by = new Map();
  for (const p of clean(series)) {
    const d = new Date(p.date + 'T00:00:00Z'); const toWed = (3 - d.getUTCDay() + 7) % 7;
    const wk = new Date(d.getTime() + toWed * 864e5).toISOString().slice(0, 10);
    by.set(wk, p);                                   // ascending input: the last one in the week wins
  }
  return [...by.values()];
}

const ev = id => ({ id, status: EVIDENCE_AUDIT[id]?.status ?? 'untested', banked: EVIDENCE_AUDIT[id]?.banked ?? null });

/**
 * The layer. `raw` holds FRED series under their ids; `tgaDaily` is a Map or {date: $bn} of DTS closing balances.
 * Returns { rows, net: {stats, series, impulse}, warnings, evidence, note }.
 */
export function summariseLiquidity({ raw = {}, tgaDaily = null, bis = null, via = {}, sparkWeeks = 156 } = {}) {
  const warnings = netLiqUnitWarnings({ walcl: clean(raw.WALCL).map(p => p.value), tga: clean(raw.WTREGEN).map(p => p.value), rrp: clean(raw.RRPONTSYD).map(p => p.value) });
  const weekly = netLiquidityWeekly({ walcl: raw.WALCL, tga: raw.WTREGEN, rrp: raw.RRPONTSYD });
  const net = weekly.length ? weeklyStats(weekly) : null;

  // Today's estimate: last WALCL, DTS TGA (daily, $bn) and RRP (daily). Shown separately from the weekly series.
  let today = null;
  const dts = tgaDaily instanceof Map ? [...tgaDaily].map(([date, value]) => ({ date, value })) : tgaDaily ? Object.entries(tgaDaily).map(([date, value]) => ({ date, value })) : [];
  const D = clean(dts), W = clean(raw.WALCL), R = clean(raw.RRPONTSYD);
  if (D.length && W.length && R.length) {
    const t = D[D.length - 1], w = W[W.length - 1], r = R[R.length - 1];
    today = { value: r1(w.value / 1000 - t.value - r.value), walclAsOf: w.date, tgaAsOf: t.date, rrpAsOf: r.date, tga: r1(t.value), rrp: r1(r.value) };
  }

  // Impulse: 13-week change in net liquidity. Thresholds are descriptive (≈ ±1 s.d. of 13w changes since 2011 is
  // several hundred $bn; ±100 bn marks "clearly moving" without claiming a signal).
  const imp = net?.chg13w;
  const impulse = imp == null ? null : imp > 100 ? 'adding' : imp < -100 ? 'draining' : 'flat';

  const rows = [];
  const add = (id, label, series, scale, unit, why) => { const st = weeklyStats(series, scale); if (st) rows.push({ id, label, unit, why, ...st }); };
  add('net', 'Net liquidity (Fed assets − TGA − RRP)', weekly, 1, '$bn', 'Dollars the Fed has put out, less what the Treasury and money funds park back with it.');
  add('walcl', 'Fed balance sheet (WALCL)', raw.WALCL, 1 / 1000, '$bn', 'QE grows it, QT shrinks it.');
  add('tga', 'Treasury cash at the Fed (TGA, weekly)', raw.WTREGEN, 1 / 1000, '$bn', 'A rising TGA drains reserves from banks.');
  if (D.length) add('tgaDaily', 'TGA, daily (Treasury statement)', toWeekly(D), 1, '$bn', 'Same account, daily: the freshest read (changes are weekly).');
  add('rrp', 'Overnight reverse repo (RRP)', toWeekly(raw.RRPONTSYD), 1, '$bn', 'Money-fund cash parked at the Fed; falling RRP releases liquidity.');
  add('reserves', 'Bank reserves (WRESBAL)', raw.WRESBAL, 1 / 1000, '$bn', 'The banking system\'s cash; scarce reserves show up in repo rates first.');
  add('swaps', 'Fed swap lines drawn (SWPT)', raw.SWPT, 1 / 1000, '$bn', 'Dollars lent to other central banks; a jump means offshore dollar stress (2008, 2020).');
  add('bankCredit', 'Bank credit, US commercial banks (TOTBKCR)', raw.TOTBKCR, 1, '$bn', 'Loans and securities held by banks: credit creation.');
  const bc = rows.find(r => r.id === 'bankCredit');
  if (bc && bc.chg52w != null && bc.last) bc.yoyPct = r1(100 * bc.chg52w / (bc.last - bc.chg52w));

  // Global dollar credit: the BIS store the server already builds (KV bank_credit_v1, js/bankCredit.js), quarterly.
  const global = bis?.headline ? {
    latest: bis.latest, line: bis.line ?? null, source: bis.source ?? 'BIS Locational Banking Statistics',
    usdStockBn: bis.headline.usdStockBn ?? null, usdG: bis.headline.usdG ?? null, usdGPrev: bis.headline.usdGPrev ?? null, regime: bis.headline.regime ?? null,
    nbfiG: bis.headline.nbfiG ?? null, caymanUsdG: bis.headline.caymanUsdG ?? null, yenOffshoreG: bis.headline.yenOffshoreG ?? null,
    usdHistory: (bis.usdHistory ?? []).filter(x => Number.isFinite(x?.g)).map(x => ({ date: x.period, value: x.g })),
  } : null;
  for (const r of rows) { const id = { walcl: 'WALCL', tga: 'WTREGEN', rrp: 'RRPONTSYD', reserves: 'WRESBAL', swaps: 'SWPT', bankCredit: 'TOTBKCR' }[r.id]; if (id && via[id]) r.via = via[id]; }
  return {
    rows, global,
    net: net ? { ...net, impulse, today, series: weekly.slice(-sparkWeeks).map(p => ({ date: p.date, value: r1(p.value) })) } : null,
    warnings,
    evidence: [ev('net-liquidity-tailwind-spx'), ev('net-liquidity-tailwind-nq'), ev('bank-credit-dollar-dxy'), ev('bank-credit-panel-equity')],
    note: 'Context, not a forecast. Rising net liquidity → better 4-week S&P/Nasdaq returns has the right sign but is UNDERPOWERED here (+0.4 pp, inside the placebo; audit: the test stands). Bank-credit tests were not verified by the audit.',
  };
}

/** FRED ids this layer reads. */
export const LIQUIDITY_FRED = ['WALCL', 'WTREGEN', 'RRPONTSYD', 'WRESBAL', 'SWPT', 'TOTBKCR'];
