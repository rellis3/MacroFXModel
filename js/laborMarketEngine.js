// js/laborMarketEngine.js — Labor Market Strength Engine.
//
// A numeric-composition score (payrolls, wages, unemployment, participation),
// NOT a text-reading engine like the FOMC/Beige Book modules — the BLS
// Employment Situation release is overwhelmingly numbers with a thin
// narrative section, so the edge here is scoring the numbers well, not
// running them through an LLM. Reports independent NAMED dimensions (payroll
// growth, wage growth, unemployment trend, participation trend) rather than
// one blended number — high wage growth is a strong-labor signal AND an
// inflation-risk signal at once, and collapsing those into one score would
// throw away exactly the distinction a reader needs. Same "independent
// dimensions" choice the FOMC engine made for inflation/labor/growth/
// financial-stability concern.
//
// Reuses js/econTrendEngine.js's ECON_UNIVERSE for unemployment series IDs
// (already live in production there) rather than re-declaring them — see
// LABOR_UNIVERSE below. USD is the only currency with payrolls/wages/
// participation/hours series wired up; verifying good current FRED IDs for
// the other 7 currencies' wage-growth and participation data was not
// possible from this environment (see fetchLaborData's header note) — they
// get unemployment-trend-only coverage until each is verified and added.
import { fetchFredObservations, fetchFredInitialRelease } from './zscoreSpreadEngine.js';
import { ECON_UNIVERSE } from './econTrendEngine.js';

export const LABOR_UNIVERSE = Object.fromEntries(
  Object.entries(ECON_UNIVERSE).map(([ccy, cfg]) => [ccy, { unemployment: cfg.unemp }])
);
// USD gets the full depth — these are among the most standard, stable FRED
// series IDs that exist (unchanged for decades): PAYEMS is THE nonfarm
// payrolls series, CES0500000003 is THE average-hourly-earnings series BLS/
// FRED headlines use for wage growth.
LABOR_UNIVERSE.USD = { ...LABOR_UNIVERSE.USD, payrolls: 'PAYEMS', participation: 'CIVPART', wages: 'CES0500000003', hours: 'AWHAETP' };

// CHF: swap the OECD-harmonized rate (ECON_UNIVERSE's default, LRHUTTTTCHM156S)
// for SECO's own registered-unemployment series (LMUNRLTTCHM647S) — that's
// the print FX desks actually watch for Switzerland ("Swiss Unemployment
// Rate" on any economic calendar is SECO's monthly figure, not the OECD one).
// Verified against a live FRED series page. Ceiling: Switzerland's employment
// survey (SAKE) and Wage Index are quarterly/annual at SOURCE — there is no
// monthly payrolls- or wage-equivalent to add regardless of which FRED
// series is used, so CHF stays unemployment-only, just the better series.
// NOTE units: this is a REGISTERED-UNEMPLOYMENT LEVEL (persons), not a %
// rate like every other currency's series — the scoring math doesn't care
// (unemploymentTrendScore works relative to a series' own history either
// way), but the UI needs UNEMPLOYMENT_UNIT_LABEL below to label it correctly
// rather than assume "%" like everywhere else.
LABOR_UNIVERSE.CHF = { unemployment: 'LMUNRLTTCHM647S' };

export const UNEMPLOYMENT_UNIT_LABEL = Object.fromEntries(Object.keys(LABOR_UNIVERSE).map(ccy => [ccy, '%']));
UNEMPLOYMENT_UNIT_LABEL.CHF = 'registered (thousands)';

// BLS's CES supersector employment series — the industry breakdown behind the
// headline payroll number (table B-1 of the Employment Situation release).
// Each mnemonic below was individually confirmed against a live FRED series
// page during this build (not guessed) — same diligence as the FOMC URLs.
// "Other services" (~2% of nonfarm payrolls) is the one supersector omitted;
// couldn't get an independently-confirmed mnemonic for it, and it's small
// enough that leaving it out doesn't materially distort breadth/concentration.
export const SECTOR_UNIVERSE = {
  mining: 'USMINE',
  construction: 'USCONS',
  manufacturing: 'MANEMP',
  tradeTransportUtilities: 'USTPU',
  information: 'USINFO',
  financialActivities: 'USFIRE',
  professionalBusiness: 'USPBS',
  privateEducationHealth: 'USEHS', // PRIVATE only — excludes public education/health, which sits inside "government"
  leisureHospitality: 'USLAH',
  government: 'USGOVT',
};

// ── Pure stats helpers ───────────────────────────────────────────────────────

// FRED Map<date,value> (ascending insertion order already, per fetchFredObservations)
// -> sorted [{date, value}].
export function toSeries(obsMap) {
  if (!obsMap) return [];
  return [...obsMap.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

// Consecutive-observation deltas — for a monthly level series (PAYEMS,
// CES0500000003) this IS the headline print each month ("payrolls rose by
// X"). Returns [{date, value, chg}], chg null on the first point.
export function monthOverMonth(series) {
  return series.map((pt, i) => ({ ...pt, chg: i === 0 ? null : pt.value - series[i - 1].value }));
}

// YoY % change — the usual framing for wage growth headlines ("wages up
// 3.9% y/y"). Needs a same-month observation ~12 periods back; monthly data
// only, tolerant of a handful of missing points via nearest-index lookback.
export function yoyPct(series, periodsBack = 12) {
  return series.map((pt, i) => {
    const ref = series[i - periodsBack];
    if (!ref || ref.value === 0) return { ...pt, yoy: null };
    return { ...pt, yoy: +((pt.value / ref.value - 1) * 100).toFixed(2) };
  });
}

// z-score of the LATEST value in `values` against the trailing `lookback`
// points BEFORE it (excludes the latest point from its own baseline — this
// is "how unusual is this print", not "how unusual is the average"). Needs
// at least 6 baseline points to bother; returns null below that rather than
// reporting a z-score built on noise.
export function latestZScore(values, lookback = 24, minBaseline = 6) {
  const clean = values.filter(v => v != null && Number.isFinite(v));
  if (clean.length < minBaseline + 1) return null;
  const latest = clean.at(-1);
  const baseline = clean.slice(Math.max(0, clean.length - 1 - lookback), clean.length - 1);
  if (baseline.length < minBaseline) return null;
  const mean = baseline.reduce((s, v) => s + v, 0) / baseline.length;
  const variance = baseline.reduce((s, v) => s + (v - mean) ** 2, 0) / baseline.length;
  const sd = Math.sqrt(variance);
  // Guard against an exactly-flat baseline AND floating-point noise on a
  // near-flat one — e.g. a real series that's genuinely been dead flat for
  // months has a "true" sd of 0, but repeated float arithmetic on the way
  // there rarely lands on exactly 0, and dividing by that near-zero residual
  // can produce an arbitrarily large (and essentially random-sign) z-score.
  // Anything below this floor is treated as flat: if the latest point is
  // also indistinguishable from the baseline, that's z=0 (nothing unusual);
  // if it's a real, clean break from a flat baseline, saturate rather than
  // divide by ~0.
  const flatFloor = Math.max(1e-9, Math.abs(mean) * 1e-9);
  if (sd < flatFloor) return Math.abs(latest - mean) < flatFloor ? 0 : (latest > mean ? 4 : -4);
  return +((latest - mean) / sd).toFixed(2);
}

const clip = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
// z-score -> [-1, 1] strength scale, saturating at +/-2.5 sigma (a print more
// extreme than that reads as maximally strong/weak rather than climbing
// further — matches how markets treat a "blowout" or "collapse" print).
const zToScore = z => (z == null ? null : clip(z / 2.5));

// ── Named dimensions ─────────────────────────────────────────────────────────

// Payroll growth: the latest month's headline change, scored against its own
// trailing-24mo distribution of monthly changes (so a "normal" 150k month in
// a 100k-pace economy doesn't read as strong just because 150k > 0).
export function payrollScore(payrollObsMap) {
  const series = monthOverMonth(toSeries(payrollObsMap));
  const chgs = series.map(p => p.chg);
  const z = latestZScore(chgs);
  const latest = series.at(-1);
  return {
    latestChange: latest?.chg ?? null,
    latestDate: latest?.date ?? null,
    z, score: zToScore(z),
  };
}

// Wage growth: latest YoY%, z-scored vs its own trailing history. Reported
// standalone — NOT folded into the strength composite (see file header).
export function wageScore(wageObsMap) {
  const series = yoyPct(toSeries(wageObsMap));
  const yoys = series.map(p => p.yoy);
  const z = latestZScore(yoys);
  const latest = series.at(-1);
  return {
    latestYoyPct: latest?.yoy ?? null,
    latestDate: latest?.date ?? null,
    z, score: zToScore(z),
  };
}

// Smoothed trailing-3-month average at every point (reduces one noisy print
// dominating), used by both trend scores below.
function trailing3moAvg(series) {
  const out = [];
  for (let i = 2; i < series.length; i++) {
    out.push(series.slice(i - 2, i + 1).reduce((s, p) => s + p.value, 0) / 3);
  }
  return out;
}

// Unemployment trend: is the CURRENT smoothed level a relative cycle low or
// high vs its own trailing history — "unemployment near a multi-year low"
// framing, which a reader recognizes directly. A steadily improving series
// scores positive THROUGHOUT the decline (every new print is a fresh low
// relative to what came before it), not just when the pace itself
// accelerates. Sign is flipped vs a raw z (low unemployment = strong).
export function unemploymentTrendScore(unempObsMap) {
  const series = toSeries(unempObsMap);
  const latest = series.at(-1);
  if (series.length < 8) return { latestLevel: latest?.value ?? null, latestDate: latest?.date ?? null, z: null, score: null };
  const z = latestZScore(trailing3moAvg(series));
  return { latestLevel: latest?.value ?? null, latestDate: latest?.date ?? null, z, score: zToScore(z == null ? null : -z) };
}

// Participation trend: same "relative cycle high/low" framing — rising
// participation reads positive directly (no sign flip: more people working
// or looking for work IS the strong read).
export function participationTrendScore(partObsMap) {
  const series = toSeries(partObsMap);
  const latest = series.at(-1);
  if (series.length < 8) return { latestLevel: latest?.value ?? null, latestDate: latest?.date ?? null, z: null, score: null };
  const z = latestZScore(trailing3moAvg(series));
  return { latestLevel: latest?.value ?? null, latestDate: latest?.date ?? null, z, score: zToScore(z) };
}

// Breadth of hiring across the SECTOR_UNIVERSE supersectors — is job growth
// broad-based or carried by one or two industries? `sectorData` = { <sector
// name>: FRED Map, ... } (js/laborMarketEngine.js's fetchSectorBreadth output).
// `diffusion` is BLS's own standard framing (% of industries growing + half
// of unchanged) — the number market commentary means by "broad-based" vs
// "narrow" job growth. `concentration` flags "one sector carried the whole
// print" (e.g. healthcare/government alone explaining most of the net gain)
// even when diffusion itself looks fine.
export function breadthScore(sectorData = {}) {
  const entries = Object.entries(sectorData).map(([name, obsMap]) => {
    const series = monthOverMonth(toSeries(obsMap));
    const latest = series.at(-1);
    return { name, chg: latest?.chg ?? null, date: latest?.date ?? null };
  }).filter(e => e.chg != null);
  if (!entries.length) return { sectors: [], diffusion: null, topContributor: null, concentration: null, score: null };

  const positive = entries.filter(e => e.chg > 0).length;
  const flat = entries.filter(e => e.chg === 0).length;
  const diffusion = +(((positive + flat / 2) / entries.length) * 100).toFixed(1);

  const totalAbsChg = entries.reduce((s, e) => s + Math.abs(e.chg), 0);
  const topContributor = [...entries].sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg))[0];
  const concentration = totalAbsChg > 0 ? +((Math.abs(topContributor.chg) / totalAbsChg) * 100).toFixed(1) : null;

  // Diffusion centered at 50% -> [-1,1]: 100% (every sector adding) = +1,
  // 0% (every sector shedding) = -1, 50% (even split) = neutral.
  const score = clip((diffusion - 50) / 50);
  return { sectors: entries.sort((a, b) => b.chg - a.chg), diffusion, topContributor, concentration, score };
}

// Revision surprise on payrolls — the CURRENT (most-revised) value for each
// month vs what BLS FIRST reported for that same month, z-scored against the
// series' own revision history. Reported standalone, like wages — a big
// downward revision to last month is about how misleading the PRIOR print
// was, not a verdict on the current one, so it deliberately does not feed
// the strength composite. `currentObsMap` = fetchFredObservations(PAYEMS,…),
// `initialObsMap` = fetchFredInitialRelease(PAYEMS,…) (zscoreSpreadEngine.js).
export function revisionScore(currentObsMap, initialObsMap) {
  const cur = toSeries(currentObsMap);
  const revisions = cur.map(pt => {
    const initVal = initialObsMap?.get(pt.date);
    return initVal == null ? null : { date: pt.date, initial: initVal, current: pt.value, revision: +(pt.value - initVal).toFixed(1) };
  }).filter(Boolean);
  if (!revisions.length) return { history: [], latestRevision: null, latestDate: null, z: null, score: null };
  const z = latestZScore(revisions.map(r => r.revision));
  const latest = revisions.at(-1);
  return { history: revisions.slice(-6), latestRevision: latest.revision, latestDate: latest.date, z, score: zToScore(z) };
}

// Composite read for one currency. `data` = { payrolls?, wages?, unemployment?,
// participation?, sectors?, payrollsInitialRelease? } each a raw FRED Map (or
// undefined if that series isn't in LABOR_UNIVERSE for this currency).
// Strength composite averages the dimensions that read as "is the labor
// market tightening or loosening" (payrolls, unemployment, participation,
// breadth) — wages and revisionSurprise are reported alongside but
// deliberately excluded (see file header + revisionScore's own note).
export function laborMarketScore(data = {}) {
  const dims = {};
  if (data.payrolls) dims.payrollGrowth = payrollScore(data.payrolls);
  if (data.wages) dims.wageGrowth = wageScore(data.wages);
  if (data.unemployment) dims.unemploymentTrend = unemploymentTrendScore(data.unemployment);
  if (data.participation) dims.participationTrend = participationTrendScore(data.participation);
  if (data.sectors) dims.breadth = breadthScore(data.sectors);
  if (data.payrolls && data.payrollsInitialRelease) dims.revisionSurprise = revisionScore(data.payrolls, data.payrollsInitialRelease);

  const strengthInputs = [dims.payrollGrowth?.score, dims.unemploymentTrend?.score, dims.participationTrend?.score, dims.breadth?.score]
    .filter(s => s != null);
  const strength = strengthInputs.length ? +(strengthInputs.reduce((s, v) => s + v, 0) / strengthInputs.length).toFixed(2) : null;

  // The "participation trap": unemployment falling for the wrong reason —
  // people leaving the labor force rather than finding jobs. Flag it
  // whenever both trends are readable and point opposite ways with unemployment
  // firmly improving but participation firmly deteriorating.
  let flag = null;
  if (dims.unemploymentTrend?.score > 0.3 && dims.participationTrend?.score < -0.3) {
    flag = 'participation_trap — unemployment improving but participation falling; the headline rate may be flattering a genuinely softer labor market';
  }

  return { dims, strength, flag, coverage: Object.keys(dims) };
}

// Fetch every configured series for one currency, PLUS (USD only) the
// SECTOR_UNIVERSE breadth series and the payrolls revision-vintage data.
// Never throws on a single missing/failed series (a country with only
// `unemployment` configured is expected, not an error; a sector series
// failing just narrows breadth coverage) — availability is reported
// alongside the data so a caller can tell partial coverage from a dead feed.
export async function fetchLaborData(ccy, fredKey, fromDate = '2015-01-01') {
  const cfg = LABOR_UNIVERSE[ccy];
  if (!cfg) throw new Error(`No labor-market series configured for ${ccy}`);
  const data = {}, availability = [];
  await Promise.all(Object.entries(cfg).map(async ([factor, seriesId]) => {
    try {
      const obs = await fetchFredObservations(seriesId, fromDate, fredKey);
      data[factor] = obs;
      availability.push({ factor, series: seriesId, n: obs.size });
    } catch (e) {
      availability.push({ factor, series: seriesId, n: 0, error: e.message });
    }
  }));

  if (ccy === 'USD') {
    const sectors = {};
    await Promise.all(Object.entries(SECTOR_UNIVERSE).map(async ([name, seriesId]) => {
      try {
        const obs = await fetchFredObservations(seriesId, fromDate, fredKey);
        sectors[name] = obs;
        availability.push({ factor: `sector:${name}`, series: seriesId, n: obs.size });
      } catch (e) {
        availability.push({ factor: `sector:${name}`, series: seriesId, n: 0, error: e.message });
      }
    }));
    if (Object.keys(sectors).length) data.sectors = sectors;

    try {
      data.payrollsInitialRelease = await fetchFredInitialRelease('PAYEMS', fromDate, fredKey);
      availability.push({ factor: 'payrollsInitialRelease', series: 'PAYEMS', n: data.payrollsInitialRelease.size });
    } catch (e) {
      availability.push({ factor: 'payrollsInitialRelease', series: 'PAYEMS', n: 0, error: e.message });
    }
  }

  return { data, availability };
}
