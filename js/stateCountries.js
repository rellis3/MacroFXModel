/**
 * Country position for the Market State Engine (owner, 2026-11-01: "global position, country position, then
 * asset position").
 *
 * Pure: reads the per-economy stores the server already builds (KV, refreshed by its release pollers) and the
 * central-bank analyses, and returns one row per currency. Nothing here is fetched; nothing is filled in.
 *
 *   cpi_v1 (pressure)        ppi_v1 (pressure)        gdp_v1 (score, latestGrowth)
 *   ism_v1 (activity)        labor_market_v1 (strength, flag)
 *   retail_sales_v1 (spending)   consumer_confidence_v1 (score)   trade_balance_v1 (score, surplus)
 *   real_yield_v1 (latestReal)   yield_curve_v1 (latestSlope, inverted)   rate_diff_v1 (latestRate)
 *   <cb>/latest  (analysis.hawkishScore, regime, headline)    <cb>/calendar (meetings)
 *
 * Scores are the stores' own: z of the latest print against the series' recent history, /2.5, clipped to ±1
 * (inflation: distance from target). Composites are plain means of what is present, and say what they used.
 * Evidence: macro-direction, regime-divergence-fx, cb-tone-direction are tested NULL as FX direction here; this is the
 * description a desk reads, never a lean.
 */

export const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
export const CB_FOR = { USD: 'fomc', EUR: 'ecb', GBP: 'boe', JPY: 'boj', AUD: 'rba', CAD: 'boc', CHF: 'snb', NZD: 'rbnz' };
export const ECONOMY = { USD: 'United States', EUR: 'Euro area', GBP: 'United Kingdom', JPY: 'Japan', AUD: 'Australia', CAD: 'Canada', CHF: 'Switzerland', NZD: 'New Zealand' };

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const r2 = v => (v == null ? null : Math.round(v * 100) / 100);
const mean = xs => { const v = xs.filter(x => x != null); return v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null; };

/** The newest date found anywhere in a store row (stores keep latestDate on the row or on each dim). */
export function newestDate(o, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 3) return null;
  let best = null;
  for (const [k, v] of Object.entries(o)) {
    const d = (k === 'latestDate' || k === 'date') && typeof v === 'string' && /^\d{4}-\d{2}/.test(v) ? v : typeof v === 'object' ? newestDate(v, depth + 1) : null;
    if (d && (!best || d > best)) best = d;
  }
  return best;
}

const cell = (score, extra = {}) => (score == null && !Object.values(extra).some(v => v != null) ? null : { score: r2(num(score)), ...extra });

/** Next meeting on or after `today` from a CB calendar payload ({meetings:[{date|meetingDate|...}]}). */
export function nextMeeting(cal, today) {
  const ms = (cal?.meetings ?? []).map(m => (typeof m === 'string' ? m : m?.date ?? m?.meetingDate ?? m?.decisionDate ?? null)).filter(d => typeof d === 'string').map(d => d.slice(0, 10)).sort();
  return ms.find(d => d >= today) ?? null;
}

/**
 * stores: { cpi, ppi, gdp, ism, labor, retail, confidence, trade, realYield, curve, rateDiff } — each a store payload
 *   with byCcy. cb: { USD: { latest, calendar }, ... }. surprise: /api/econ-surprise payload (byCcy score).
 * cpiFallback: optional { GBP: {date, value, via}, CAD: {...} } CPI y/y from the national sources the regime study
 *   already reads (ONS, StatCan), used only where the CPI store's FRED/OECD mirror is discontinued.
 */
export function summariseCountries({ stores = {}, cb = {}, surprise = null, cpiFallback = {}, today = new Date().toISOString().slice(0, 10) } = {}) {
  const by = k => stores[k]?.byCcy ?? {};
  const rows = CCYS.map(ccy => {
    const cpi = by('cpi')[ccy], ppi = by('ppi')[ccy], gdp = by('gdp')[ccy], ism = by('ism')[ccy], lab = by('labor')[ccy];
    const ret = by('retail')[ccy], conf = by('confidence')[ccy], tb = by('trade')[ccy], ry = by('realYield')[ccy], yc = by('curve')[ccy], rd = by('rateDiff')[ccy];

    const growthParts = { gdp: num(gdp?.score), business: num(ism?.activity), spending: num(ret?.spending), confidence: num(conf?.score) };
    let inflation = cell(num(cpi?.pressure), { headlineYoy: num(cpi?.dims?.headlineLevel?.latestYoy), coreYoy: num(cpi?.dims?.coreLevel?.latestYoy), ppi: num(ppi?.pressure), asOf: newestDate(cpi) });
    if (cpi?.discontinued || (!cpi && cpiFallback?.[ccy])) {
      inflation = cpi?.discontinued ? { score: null, discontinued: cpi.discontinued, asOf: null } : null;
      const fb = cpiFallback?.[ccy];
      // Same scale as the store's levelVsTargetScore: (y/y − 2% target) / 4, clipped.
      if (num(fb?.value) != null) inflation = { score: r2(Math.max(-1, Math.min(1, (fb.value - 2) / 4))), headlineYoy: r2(fb.value), asOf: fb.date, via: `${fb.via ?? 'national source'} (FRED mirror discontinued)` };
    }
    const cbL = cb[ccy]?.latest, a = cbL?.analysis ?? null;
    const policy = {
      bank: CB_FOR[ccy].toUpperCase(), rate: num(rd?.latestRate), rateAsOf: rd?.latestDate ?? null,
      stance: num(a?.hawkishScore), regime: a?.regime ?? null, headline: a?.headline ?? null, meetingDate: cbL?.meetingDate ?? null, kind: cbL?.kind ?? null,
      next: nextMeeting(cb[ccy]?.calendar, today),
      realYield: num(ry?.latestReal) ?? (num(yc?.latestLong) != null && num(inflation?.headlineYoy) != null && inflation?.via ? r2(yc.latestLong - inflation.headlineYoy) : null),
      realYieldDerived: num(ry?.latestReal) == null && num(yc?.latestLong) != null && num(inflation?.headlineYoy) != null && !!inflation?.via,
      curveSlope: num(yc?.latestSlope), inverted: yc?.inverted ?? null,
    };
    const growth = mean(Object.values(growthParts));
    const infl = inflation?.score ?? null;
    const quadrant = growth == null || infl == null ? null
      : growth >= 0 && infl < 0 ? 'Goldilocks (growth up, inflation below trend)'
      : growth >= 0 ? 'Reflation (growth and inflation up)'
      : infl >= 0 ? 'Stagflation risk (growth down, inflation up)' : 'Disinflationary slowdown (both down)';
    return {
      ccy, economy: ECONOMY[ccy],
      growth: { score: growth, parts: growthParts, gdpYoy: num(gdp?.latestGrowth), recession: !!gdp?.recessionFlag, asOf: [gdp, ism, ret, conf].map(newestDate).filter(Boolean).sort().at(-1) ?? null },
      inflation,
      labour: cell(num(lab?.strength), { flag: lab?.flag ?? null, asOf: newestDate(lab) }),
      external: cell(num(tb?.score), { surplus: tb?.surplus ?? null, asOf: tb?.latestDate ?? null }),
      surprise: cell(num(surprise?.byCcy?.[ccy]?.score ?? surprise?.byCcy?.[ccy]?.index), { asOf: surprise?.generatedAt?.slice(0, 10) ?? null }),
      policy, quadrant,
      coverage: [growth != null && 'growth', infl != null && 'inflation', lab?.strength != null && 'labour', tb?.score != null && 'external', policy.stance != null && 'central bank', policy.rate != null && 'rate'].filter(Boolean),
    };
  });

  // Relative position: each economy against the US, in score units. Description of divergence, not a forecast.
  const us = rows.find(r => r.ccy === 'USD');
  for (const r of rows) {
    if (r.ccy === 'USD') { r.vsUsd = null; continue; }
    const d = (a, b) => (a == null || b == null ? null : r2(a - b));
    r.vsUsd = { growth: d(r.growth.score, us.growth.score), inflation: d(r.inflation?.score ?? null, us.inflation?.score ?? null),
      stance: d(r.policy.stance, us.policy.stance), rate: d(r.policy.rate, us.policy.rate), realYield: d(r.policy.realYield, us.policy.realYield) };
  }

  // Global aggregate: how many economies sit in each quadrant, and the spread of policy stances.
  const quadrants = {};
  for (const r of rows) if (r.quadrant) quadrants[r.quadrant] = (quadrants[r.quadrant] ?? []).concat(r.ccy);
  const stances = rows.filter(r => r.policy.stance != null);
  const upcoming = rows.filter(r => r.policy.next).map(r => ({ ccy: r.ccy, bank: r.policy.bank, date: r.policy.next })).sort((a, b) => (a.date < b.date ? -1 : 1));
  const storesAsOf = Object.fromEntries(Object.entries(stores).map(([k, v]) => [k, v?.generatedAt ?? v?.updatedAt ?? null]));
  return {
    rows, quadrants, upcoming,
    stanceRange: stances.length ? { hawkish: stances.reduce((a, b) => (b.policy.stance > a.policy.stance ? b : a)).ccy, dovish: stances.reduce((a, b) => (b.policy.stance < a.policy.stance ? b : a)).ccy } : null,
    storesAsOf,
    missingStores: Object.entries(stores).filter(([, v]) => !v?.byCcy).map(([k]) => k),
    note: 'Each economy from the stores the server already builds (FRED/OECD/ONS/Eurostat/StatCan via the release pollers) and the central-bank statement reads. Scores −1…+1 vs each series\' own recent history (inflation: vs target). Macro divergence and CB tone are tested NULL as FX direction here (macro-direction, regime-divergence-fx, cb-tone-direction): read as position, not a lean.',
  };
}
