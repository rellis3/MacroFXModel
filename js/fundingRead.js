// js/fundingRead.js — the daily/weekly funding & leverage read (the live side of the feature-store
// funding archive, plans/FEATURE_MANIFEST.json group funding_archive).
//
// WHY: C.OG's point (2026-10-20): the value is a deep daily/weekly archive, not the quarterly BIS file.
// This reads the same series every day and says where each sits against its own history:
//   dollar shortage   Fed central-bank swap lines drawn (SWPT)
//   plumbing          SOFR − IORB, SOFR volume (repo size), ON RRP buffer, bank reserves
//   leverage          CFTC leveraged-fund net Treasury futures (2Y+5Y+10Y+bond, $bn face): the basis trade
//   offshore dollars  foreign banks' net due to head offices (H.8), foreign-official Treasury custody (H.4.1)
//
// EVIDENCE: none of these is tested as a forecast yet (funding-stress, the SOFR-above-floor episode test, is
// NULL). So every state here is a DESCRIPTION -- where the number sits in its own history -- and no
// composite score is built. Pure functions + fetchers that take fetchImpl; no DOM.

export const FRED_SERIES = {
  swaplines: { id: 'SWPT', from: '2008-01-01', scale: 1 / 1000, unit: '$bn' },          // $mn -> $bn
  sofr: { id: 'SOFR', from: '2018-04-01', scale: 1, unit: '%' },
  iorb: { id: 'IORB', from: '2021-07-29', scale: 1, unit: '%' },
  sofrVol: { id: 'SOFRVOL', from: '2018-04-01', scale: 1, unit: '$bn' },
  rrp: { id: 'RRPONTSYD', from: '2014-01-01', scale: 1, unit: '$bn' },
  reserves: { id: 'WRESBAL', from: '2008-01-01', scale: 1 / 1000, unit: '$bn' },            // $mn -> $bn
  netDueForeign: { id: 'NDFFRIW027SBOG', from: '2008-01-01', scale: 1, unit: '$bn' },
  custodyUst: { id: 'WMTSECL1', from: '2008-01-01', scale: 1 / 1000, unit: '$bn' },      // $mn -> $bn
};

const C = 'CHICAGO BOARD OF TRADE';
// Same legs as the feature store's tff_lev_ust_notional; a week counts only when every leg reported.
export const UST_LEGS = [
  { names: [`UST 2Y NOTE - ${C}`, `2-YEAR U.S. TREASURY NOTES - ${C}`], face: 200000 },
  { names: [`UST 5Y NOTE - ${C}`, `5-YEAR U.S. TREASURY NOTES - ${C}`], face: 100000 },
  { names: [`UST 10Y NOTE - ${C}`, `10-YEAR U.S. TREASURY NOTES - ${C}`], face: 100000 },
  { names: [`UST BOND - ${C}`, `U.S. TREASURY BONDS - ${C}`], face: 100000 },
];

/** Map<date,value> or [{date,value}] -> sorted [{date,value}] */
export function toPoints(x) {
  const arr = x instanceof Map ? [...x.entries()].map(([date, value]) => ({ date, value })) : (x ?? []);
  return arr.filter(p => p && p.date && Number.isFinite(p.value)).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Percentile (0-100) of v within xs (share of history at or below v). */
export function pctile(xs, v) {
  if (!xs.length || !Number.isFinite(v)) return null;
  let le = 0; for (const x of xs) if (x <= v) le++;
  return Math.round(le / xs.length * 100);
}

/** Value about `days` calendar days before the last point (the latest point on or before that date). */
export function valueDaysAgo(pts, days) {
  if (!pts.length) return null;
  const cut = new Date(Date.parse(pts.at(-1).date + 'T00:00:00Z') - days * 86400e3).toISOString().slice(0, 10);
  for (let i = pts.length - 1; i >= 0; i--) if (pts[i].date <= cut) return pts[i];
  return null;
}

/** Difference series a − b on common dates (×mult). */
export function diffSeries(a, b, mult = 1) {
  const m = new Map(b.map(p => [p.date, p.value]));
  return a.filter(p => m.has(p.date)).map(p => ({ date: p.date, value: (p.value - m.get(p.date)) * mult }));
}

function stat(pts, { changeDays = 28 } = {}) {
  if (!pts.length) return null;
  const last = pts.at(-1), ago = valueDaysAgo(pts, changeDays);
  return { date: last.date, value: last.value, change: ago ? last.value - ago.value : null, changeDays,
           pctile: pctile(pts.map(p => p.value), last.value), since: pts[0].date, n: pts.length };
}

export const ord = n => (n == null ? '–' : `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] ?? 'th'}`);
const f1 = v => (v == null ? '–' : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));
const sg = (v, d = 0) => (v == null ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(d)}`);

/**
 * Build the read. `series` keys: swaplines, sofr, iorb, sofrVol, rrp, reserves, netDueForeign, custodyUst
 * (points already in display units) and ustLev ([{date,value}] $bn, negative = net short).
 */
export function buildFundingRead(series = {}, { now = Date.now() } = {}) {
  const P = k => toPoints(series[k]);
  const items = [];
  const add = (o) => { if (o.stat) items.push(o); };

  const sw = stat(P('swaplines'));
  add({ id: 'swaplines', group: 'Dollar shortage', label: 'Fed swap lines drawn', unit: '$bn', stat: sw,
        state: !sw ? null : sw.value >= 5 ? 'stress' : sw.value >= 1 && (sw.change ?? 0) > 0 ? 'watch' : 'quiet',
        text: sw && `$${sw.value.toFixed(1)}bn drawn${sw.change != null ? ` (${sg(sw.change, 1)} over 4w)` : ''}`
              + (sw.value >= 5 ? ': foreign central banks are borrowing dollars from the Fed (2008, 2011, 2020 shape)' : ': no offshore dollar shortage showing') });

  const spread = diffSeries(P('sofr'), P('iorb'), 100);
  const sp = stat(spread, { changeDays: 7 });
  add({ id: 'sofrIorb', group: 'Plumbing', label: 'SOFR − IORB', unit: 'bp', stat: sp,
        state: !sp ? null : sp.value >= 5 ? 'tight' : sp.value <= -5 ? 'flush' : 'normal',
        text: sp && `${sg(sp.value)}bp (${ord(sp.pctile)} pct since ${sp.since.slice(0, 4)})${sp.value >= 5 ? ': repo trading above the Fed floor, reserves getting scarce (check for month-end)' : ''}` });

  const sv = stat(P('sofrVol'));
  add({ id: 'sofrVol', group: 'Plumbing', label: 'SOFR volume (repo size)', unit: '$bn', stat: sv,
        state: !sv ? null : sv.pctile >= 95 ? 'record' : 'normal',
        text: sv && `$${(sv.value / 1000).toFixed(2)}tn a day (${ord(sv.pctile)} pct${sv.change != null ? `, ${sg(sv.change)}bn over 4w` : ''})${sv.pctile >= 95 ? ': near the largest repo market on record, i.e. leverage financed overnight' : ''}` });

  const rr = stat(P('rrp'));
  add({ id: 'rrp', group: 'Plumbing', label: 'Fed overnight reverse repo (excess cash buffer)', unit: '$bn', stat: rr,
        state: !rr ? null : rr.value < 50 ? 'buffer gone' : 'buffer',
        text: rr && `$${f1(rr.value)}bn${rr.value < 50 ? ': the money-fund cash buffer is used up, so further drains hit bank reserves directly' : ''}` });

  const rs = stat(P('reserves'));
  add({ id: 'reserves', group: 'Plumbing', label: 'Bank reserves at the Fed', unit: '$bn', stat: rs, state: rs ? (rs.pctile <= 10 ? 'low' : 'normal') : null,
        text: rs && `$${(rs.value / 1000).toFixed(2)}tn (${sg(rs.change)}bn over 4w, ${ord(rs.pctile)} pct since ${rs.since.slice(0, 4)})` });

  const lv = stat(toPoints(series.ustLev));
  const lvShortPct = lv ? 100 - lv.pctile : null;     // share of history with a SMALLER short (more negative = bigger)
  add({ id: 'basisTrade', group: 'Leverage', label: 'Leveraged funds, net Treasury futures (basis-trade size)', unit: '$bn', stat: lv,
        state: !lv ? null : lv.pctile <= 5 ? 'record short' : lv.pctile <= 20 ? 'large short' : 'normal',
        text: lv && `${lv.value < 0 ? 'net short' : 'net long'} $${Math.abs(lv.value).toFixed(0)}bn face (2Y+5Y+10Y+bond; ${lv.change != null ? `${sg(lv.change)}bn over 4w; ` : ''}bigger than ${lvShortPct}% of weeks since ${lv.since.slice(0, 4)})`
              + (lv.pctile <= 5 ? ': a record basis trade, financed in repo; an unwind is what spiked Treasury vol in March 2020 and April 2025' : '') });

  const nd = stat(P('netDueForeign'));
  add({ id: 'netDueForeign', group: 'Offshore dollars', label: "Foreign banks' net due to head offices (US branches)", unit: '$bn', stat: nd, state: nd ? 'level' : null,
        text: nd && `$${f1(nd.value)}bn${nd.change != null ? ` (${sg(nd.change)}bn over 4w: ${nd.change > 0 ? 'branches owe head offices more, dollars flowing into the US' : 'branches sending dollars back to head offices abroad'})` : ''}` });

  const cu = stat(P('custodyUst'));
  add({ id: 'custodyUst', group: 'Offshore dollars', label: 'Foreign official Treasury holdings at the Fed', unit: '$bn', stat: cu,
        state: !cu ? null : (cu.change ?? 0) < -30 ? 'selling' : 'steady',
        text: cu && `$${(cu.value / 1000).toFixed(2)}tn (${sg(cu.change)}bn over 4w)${(cu.change ?? 0) < -30 ? ': reserve managers selling Treasuries, often to defend a currency or raise dollars' : ''}` });

  const flags = items.filter(i => ['stress', 'watch', 'tight', 'record', 'buffer gone', 'low', 'record short', 'selling'].includes(i.state)).map(i => i.id);
  return { builtAt: new Date(now).toISOString(), items, flags,
           evidence: 'untested as forecasts (funding-stress is NULL); descriptions against each series\' own history' };
}

/** One line for the brief / Global Read. Context wording only. */
export function fundingLine(read) {
  if (!read?.items?.length) return null;
  const g = id => read.items.find(i => i.id === id);
  const parts = [];
  const sw = g('swaplines'); if (sw) parts.push(`swap lines $${sw.stat.value.toFixed(1)}bn (${sw.state})`);
  const sp = g('sofrIorb'); if (sp) parts.push(`SOFR−IORB ${sg(sp.stat.value)}bp`);
  const rr = g('rrp'); if (rr) parts.push(`RRP $${f1(rr.stat.value)}bn`);
  const rs = g('reserves'); if (rs) parts.push(`reserves $${(rs.stat.value / 1000).toFixed(2)}tn (${sg(rs.stat.change)}bn 4w)`);
  const lv = g('basisTrade'); if (lv) parts.push(`lev funds net Treasury ${lv.stat.value < 0 ? 'short' : 'long'} $${Math.abs(lv.stat.value).toFixed(0)}bn (${lv.state})`);
  const cu = g('custodyUst'); if (cu?.stat.change != null) parts.push(`foreign official UST ${sg(cu.stat.change)}bn 4w`);
  return `Funding & leverage: ${parts.join('; ')}. Context, untested as a forecast.`;
}

// ── fetchers ─────────────────────────────────────────────────────────────
export async function fetchUstLeverage({ fetchImpl = fetch } = {}) {
  const legs = [];
  for (const leg of UST_LEGS) {
    const got = new Map();
    for (const name of leg.names) {
      const url = `https://publicreporting.cftc.gov/resource/gpe5-46if.json?market_and_exchange_names=${encodeURIComponent(name)}`
        + `&$select=report_date_as_yyyy_mm_dd,lev_money_positions_long,lev_money_positions_short&$limit=5000&$order=report_date_as_yyyy_mm_dd%20ASC`;
      const r = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`CFTC ${name} HTTP ${r.status}`);
      for (const row of await r.json()) {
        const d = String(row.report_date_as_yyyy_mm_dd ?? '').slice(0, 10);
        if (d) got.set(d, ((+row.lev_money_positions_long || 0) - (+row.lev_money_positions_short || 0)) * leg.face / 1e9);
      }
    }
    legs.push(got);
  }
  const dates = [...legs[0].keys()].filter(d => legs.every(m => m.has(d))).sort();
  return dates.map(d => ({ date: d, value: +legs.reduce((a, m) => a + m.get(d), 0).toFixed(2) }));
}

/** fetchFred(seriesId, fromDate) -> Map<date,value>; returns display-unit points per key. */
export async function fetchFundingSeries(fetchFred) {
  const out = {}, errors = {};
  await Promise.all(Object.entries(FRED_SERIES).map(async ([k, s]) => {
    try { out[k] = toPoints(await fetchFred(s.id, s.from)).map(p => ({ date: p.date, value: p.value * s.scale })); }
    catch (e) { errors[k] = e.message; }
  }));
  return { series: out, errors };
}
