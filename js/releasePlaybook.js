/**
 * Phases 6 and 15: the economist's release briefs and the "if hot / if cold" scenario playbooks
 * (plans/DESK_ANALYST_PIPELINE.md §9q).
 *
 * The history is the release study's own record (analysis/output/release_layer1/summary.json): about 150 releases since
 * 2024-04 (NFP, CPI, FOMC, ECB, BoE, BoJ, retail sales, PCE, refunding, UK fiscal), each with the actual, the
 * consensus, the surprise and how ~20 markets moved 1 to 240 minutes after it (% for prices, bp for rates).
 *
 * For each high-impact release coming up, this file works out from that history:
 *   - how big the move usually is (median absolute move at 30 minutes and 4 hours, per market),
 *   - how fast it happens (median minutes to the peak, how much of the peak is kept),
 *   - and, where the surprise is recorded, the median signed move after a hot print against a cold one.
 * It is history, labelled with its count: never a forecast of which way the next surprise goes.
 *
 * Pure. Tested in js/releasePlaybook.test.mjs.
 */

/** Release family by event name and country (the release study's families). */
const FAMILIES = [
  ['NFP', /non-?farm|payrolls/i, 'US'], ['CPI', /\bCPI\b|consumer price/i, 'US'], ['PCE', /\bPCE\b/i, 'US'], ['RETAIL', /retail sales/i, 'US'],
  ['FOMC', /FOMC|federal funds|fed interest rate|fed rate decision/i, 'US'], ['REFUNDING', /refunding/i, 'US'],
  ['ECB', /\bECB\b|main refinancing|deposit facility/i, 'EU'], ['BOE', /\bBoE\b|bank rate|official bank rate|MPC/i, 'GB'],
  ['BOJ', /\bBoJ\b|BOJ policy rate|bank of japan/i, 'JP'], ['UKFISCAL', /\bbudget\b/i, 'GB'],
];
const CC = { 'United States': 'US', USD: 'US', US: 'US', 'Euro Zone': 'EU', EUR: 'EU', EU: 'EU', EZ: 'EU', 'United Kingdom': 'GB', GBP: 'GB', GB: 'GB', UK: 'GB', Japan: 'JP', JPY: 'JP', JP: 'JP' };
export function familyOf(event, country) {
  const c = CC[country] ?? country;
  return FAMILIES.find(([, re, cc]) => re.test(event ?? '') && cc === c)?.[0] ?? null;
}

export const MARKET_LABEL = { dx: 'Dollar index', eurusd: 'EUR/USD', gbpusd: 'GBP/USD', usdjpy: 'USD/JPY', gold: 'Gold', nq: 'Nasdaq', es: 'S&P 500', dax: 'DAX', ftse: 'FTSE 100', nikkei: 'Nikkei',
  zt: 'US 2y future', zn: 'US 10y future', sofr: 'SOFR (bp)', eur: 'Euribor (bp)', spr: 'Spread (bp)', gilt: 'Gilt future', bund: 'Bund future', vix: 'VIX', vxn: 'VXN' };
const RATE_BP = new Set(['sofr', 'eur', 'spr']);
const med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r = (x, d = 2) => (Number.isFinite(x) ? +x.toFixed(d) : null);

/** The playbook for one family from the history rows. */
export function playbook(rows, family, { minN = 4 } = {}) {
  const past = (rows ?? []).filter(x => x.family === family && x.M);
  if (!past.length) return null;
  const known = past.filter(x => Number.isFinite(x.surprise) && x.surprise !== 0);
  const hot = known.filter(x => x.surprise > 0), cold = known.filter(x => x.surprise < 0);
  const markets = {};
  for (const m of Object.keys(MARKET_LABEL)) {
    const xs = past.map(x => x.M?.[m]).filter(v => v && Number.isFinite(v.m30));
    if (xs.length < minN) continue;
    const side = set => { const v = set.map(x => x.M?.[m]).filter(y => y && Number.isFinite(y.m30)); return v.length >= Math.ceil(minN / 2) ? { n: v.length, m30: r(med(v.map(y => y.m30))), m240: r(med(v.map(y => y.m240))) } : null; };
    markets[m] = { label: MARKET_LABEL[m], unit: RATE_BP.has(m) ? 'bp' : '%', n: xs.length, abs30: r(med(xs.map(v => Math.abs(v.m30)))), abs240: r(med(xs.map(v => Math.abs(v.m240)))),
      peakMin: r(med(xs.map(v => v.t_peak)), 0), kept: r(med(xs.map(v => v.retain))), hot: side(hot), cold: side(cold) };
  }
  const ranked = Object.entries(markets).sort((a, b) => (b[1].abs30 ?? 0) / (b[1].unit === 'bp' ? 10 : 1) - (a[1].abs30 ?? 0) / (a[1].unit === 'bp' ? 10 : 1));
  return { family, n: past.length, from: past[0].t?.slice(0, 10), to: past.at(-1).t?.slice(0, 10), surprises: { known: known.length, hot: hot.length, cold: cold.length }, markets: Object.fromEntries(ranked) };
}

/** Upcoming high-impact releases with a family and a history, merged from the calendar feeds, next `hours`. */
export function upcoming(events, rows, now, { hours = 36 } = {}) {
  const seen = new Set(), out = [];
  for (const e of events ?? []) {
    const ms = Number(e.ms ?? Date.parse(e.time)); if (!(ms > now && ms <= now + hours * 3600e3)) continue;
    if (!/high/i.test(String(e.impact ?? ''))) continue;
    const fam = familyOf(e.event, e.country); if (!fam) continue;
    const key = `${fam}|${Math.round(ms / 60e3)}`; if (seen.has(key)) continue; seen.add(key);
    const pb = playbook(rows, fam); if (!pb) continue;
    out.push({ family: fam, event: e.event, country: e.country, at: new Date(ms).toISOString(), estimate: e.estimate ?? null, prev: e.prev ?? null, playbook: pb });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at)).slice(0, 6);
}

/** Compact text of a playbook for a model prompt: the six biggest movers, with hot/cold where known. */
export function playbookText(p) {
  const m = Object.entries(p.markets).slice(0, 6).map(([, v]) => `${v.label}: typical move ${v.abs30}${v.unit} at 30 min, ${v.abs240}${v.unit} at 4 h; peak after ~${v.peakMin} min, ${Math.round((v.kept ?? 0) * 100)}% kept${v.hot && v.cold ? `; after hot prints (n ${v.hot.n}) ${v.hot.m30 > 0 ? '+' : ''}${v.hot.m30}${v.unit} at 30 min, after cold (n ${v.cold.n}) ${v.cold.m30 > 0 ? '+' : ''}${v.cold.m30}${v.unit}` : ''}`);
  return `${p.family}: ${p.n} releases ${p.from} to ${p.to}; surprise recorded for ${p.surprises.known} (${p.surprises.hot} hot, ${p.surprises.cold} cold).\n${m.join('\n')}`;
}
