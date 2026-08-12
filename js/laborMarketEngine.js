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
// LABOR_UNIVERSE below.
//
// EXTENDED 2026-08-08: wage growth + participation-rate coverage added for
// EUR/GBP/JPY/AUD/CAD/NZD (CHF stays unemployment-only by design — no
// confirmed headline wage series exists for it; see the CHF note further
// down). Every LABOR_UNIVERSE factor is now `{ series, isIndex?, quarterly? }`
// rather than a bare series-ID string, because the newly-added series
// surfaced TWO real per-currency ambiguities that a bare string can't
// encode, both verified via web search (this sandbox can't reach FRED
// directly, same constraint as every fetch module in this codebase):
//   - UNIT: most of the new wage series (EUR/GBP/AUD/CAD/NZD) are OECD
//     series ALREADY published as YoY% change — same "don't re-derive YoY
//     on an already-YoY series" trap js/cpiEngine.js hit. JPY's wage series
//     is a raw index level needing YoY computed, like USD's always has.
//     `isIndex` marks which is which.
//   - CADENCE: EUR and GBP's participation-rate series are QUARTERLY even
//     though their unemployment series are monthly (a genuine per-factor
//     mismatch, not a search gap — confirmed no monthly variant exists for
//     either). New Zealand's labor data is quarterly across the board —
//     unemployment, participation, AND wages — consistent with NZ's CPI/GDP
//     data also being quarterly-only at the source (Stats NZ). `quarterly`
//     marks which series need the shorter lookback / no monthly-smoothing
//     treatment (see unemploymentTrendScore/participationTrendScore below).
//
// Wage coverage caveat, worth surfacing in any UI built on this: every
// non-USD wage series here is OECD's `LCEAMN01` family — MANUFACTURING-
// SECTOR hourly earnings specifically, not the whole-economy headline
// number FX desks usually quote (USD's CES0500000003 is total private, all
// sectors). No live whole-economy equivalent could be confirmed for any of
// the 6 currencies (UK ONS AWE, Australia's ABS WPI, Germany's Destatis/
// Bundesbank wage index, Canada's StatCan average hourly wages, and NZ's
// Stats NZ LCI/QES were all searched for specifically and NOT found as a
// live FRED series — several broader OECD families exist but stopped
// updating around 2023, so they're excluded rather than shipped stale).
import { fetchFredObservations, fetchFredInitialRelease } from './zscoreSpreadEngine.js';
import { ECON_UNIVERSE } from './econTrendEngine.js';

export const LABOR_UNIVERSE = Object.fromEntries(
  Object.entries(ECON_UNIVERSE).map(([ccy, cfg]) => [ccy, { unemployment: { series: cfg.unemp } }])
);
// USD gets the full depth — these are among the most standard, stable FRED
// series IDs that exist (unchanged for decades): PAYEMS is THE nonfarm
// payrolls series, CES0500000003 is THE average-hourly-earnings series BLS/
// FRED headlines use for wage growth (an index level — isIndex:true, same
// as every other currency's index-level series).
LABOR_UNIVERSE.USD = {
  ...LABOR_UNIVERSE.USD,
  payrolls: { series: 'PAYEMS' },
  participation: { series: 'CIVPART' },
  wages: { series: 'CES0500000003', isIndex: true },
  hours: { series: 'AWHAETP' },
};
LABOR_UNIVERSE.USD.quitsRate = { series: 'JTSQUR' };
LABOR_UNIVERSE.USD.jobOpenings = { series: 'JTSJOR' };

// EUR (Germany) — participation is QUARTERLY despite unemployment being
// monthly (no monthly variant exists — confirmed via repeated search).
// Wages already YoY% (isIndex explicitly false — see wageScore's opts
// default note above; every wages entry sets this explicitly rather than
// relying on a default, since USD/JPY need isIndex:true and the other 5
// need isIndex:false, and there's no single safe implicit default when
// callers span both).
LABOR_UNIVERSE.EUR.participation = { series: 'LRAC64TTDEQ156S', quarterly: true };
LABOR_UNIVERSE.EUR.wages = { series: 'LCEAMN01DEQ659S', isIndex: false, quarterly: true };

// GBP — same "participation is quarterly, unemployment isn't" pattern as
// EUR. Wages are monthly, already YoY%.
LABOR_UNIVERSE.GBP.participation = { series: 'LRACTTTTGBQ156S', quarterly: true };
LABOR_UNIVERSE.GBP.wages = { series: 'LCEAMN01GBM659S', isIndex: false };

// JPY — both monthly. Wages are a raw index level (isIndex:true), unlike
// every other non-USD currency's already-YoY wage series.
LABOR_UNIVERSE.JPY.participation = { series: 'LRACTTTTJPM156S' };
LABOR_UNIVERSE.JPY.wages = { series: 'LCEAMN01JPM661S', isIndex: true };

// AUD — participation monthly, wages quarterly (already YoY%).
LABOR_UNIVERSE.AUD.participation = { series: 'LRACTTTTAUM156S' };
LABOR_UNIVERSE.AUD.wages = { series: 'LCEAMN01AUQ659S', isIndex: false, quarterly: true };

// CAD — both monthly, wages already YoY%.
LABOR_UNIVERSE.CAD.participation = { series: 'LRACTTTTCAM156S' };
LABOR_UNIVERSE.CAD.wages = { series: 'LCEAMN01CAM659S', isIndex: false };

// CHF: swap the OECD-harmonized rate (ECON_UNIVERSE's default, LRHUTTTTCHM156S)
// for SECO's own registered-unemployment series (LMUNRLTTCHM647S) — that's
// the print FX desks actually watch for Switzerland ("Swiss Unemployment
// Rate" on any economic calendar is SECO's monthly figure, not the OECD one).
// Verified against a live FRED series page. Ceiling: Switzerland's employment
// survey (SAKE) and Wage Index are quarterly/annual at SOURCE — there is no
// monthly payrolls- or wage-equivalent to add regardless of which FRED
// series is used, and no confirmed headline wage series was found either
// (2026-08-08 search), so CHF stays unemployment-only, just the better
// series.
// NOTE units: this is a REGISTERED-UNEMPLOYMENT LEVEL (persons), not a %
// rate like every other currency's series — the scoring math doesn't care
// (unemploymentTrendScore works relative to a series' own history either
// way), but the UI needs UNEMPLOYMENT_UNIT_LABEL below to label it correctly
// rather than assume "%" like everywhere else.
LABOR_UNIVERSE.CHF = { unemployment: { series: 'LMUNRLTTCHM647S' } };

// NZD — quarterly across the board (unemployment, participation, wages),
// consistent with NZ's CPI/GDP data also being quarterly-only at the
// source. Unemployment series also CORRECTED here from the default
// ECON_UNIVERSE value — see econTrendEngine.js's own NZD comment for the
// full story (the nominally-monthly ID couldn't be confirmed to exist;
// this quarterly one was confirmed live and matches Stats NZ's own
// published figure for the same quarter).
LABOR_UNIVERSE.NZD.unemployment = { series: 'LRHUTTTTNZQ156S', quarterly: true };
LABOR_UNIVERSE.NZD.participation = { series: 'LRAC64TTNZQ156S', quarterly: true };
LABOR_UNIVERSE.NZD.wages = { series: 'LCEAMN01NZQ659S', isIndex: false, quarterly: true };

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
const zToScore = z => (z == null ? null : round2(clip(z / 2.5)));
// Raw OECD/FRED values (especially the non-US series) arrive with long
// floating-point tails (e.g. 61.882736451) — round to 2dp for anything
// surfaced as a headline "latest" reading; the z-score math above still
// runs on the raw, unrounded value.
const round2 = v => (v == null ? null : +v.toFixed(2));

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
// `opts.isIndex` (default true, matching USD's always-been-an-index-level
// series): when false, the raw obs ARE already a YoY% print (most non-USD
// series) and must NOT be re-derived, same trap js/cpiEngine.js's
// toYoySeries helper guards against. `opts.quarterly` shortens the z-score
// lookback for quarterly-cadence series (EUR/AUD/NZD's wage series).
export function wageScore(wageObsMap, opts = {}) {
  const { isIndex = true, quarterly = false } = opts;
  const raw = toSeries(wageObsMap);
  const series = isIndex ? yoyPct(raw) : raw.map(pt => ({ ...pt, yoy: pt.value }));
  const yoys = series.map(p => p.yoy);
  const z = latestZScore(yoys, quarterly ? 8 : 24);
  const latest = series.at(-1);
  return {
    latestYoyPct: round2(latest?.yoy),
    latestDate: latest?.date ?? null,
    z, score: zToScore(z),
  };
}

// Smoothed trailing-3-month average at every point (reduces one noisy print
// dominating), used by both trend scores below. Only meaningful for MONTHLY
// series — a quarterly print IS already the smoothed unit BLS/OECD-style
// monthly data needs 3 of to approximate, so quarterly callers skip this
// entirely (see the `quarterly` opt on both trend scores) rather than
// further averaging 3 quarters into a 9-month-lagged number.
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
// `opts.quarterly`: skip the monthly-only trailing3moAvg smoothing and use
// a shorter 8-point (~2yr) lookback instead of 24 (~6yr for quarterly data,
// diluting "recent" past a useful comparison base) — same treatment GDP's
// quarterly currencies get.
export function unemploymentTrendScore(unempObsMap, opts = {}) {
  const { quarterly = false } = opts;
  const series = toSeries(unempObsMap);
  const latest = series.at(-1);
  if (series.length < 8) return { latestLevel: round2(latest?.value), latestDate: latest?.date ?? null, z: null, score: null };
  const smoothed = quarterly ? series.map(p => p.value) : trailing3moAvg(series);
  const z = latestZScore(smoothed, quarterly ? 8 : 24);
  return { latestLevel: round2(latest?.value), latestDate: latest?.date ?? null, z, score: zToScore(z == null ? null : -z) };
}

// Participation trend: same "relative cycle high/low" framing — rising
// participation reads positive directly (no sign flip: more people working
// or looking for work IS the strong read). Same `opts.quarterly` treatment
// as unemploymentTrendScore above.
export function participationTrendScore(partObsMap, opts = {}) {
  const { quarterly = false } = opts;
  const series = toSeries(partObsMap);
  const latest = series.at(-1);
  if (series.length < 8) return { latestLevel: round2(latest?.value), latestDate: latest?.date ?? null, z: null, score: null };
  const smoothed = quarterly ? series.map(p => p.value) : trailing3moAvg(series);
  const z = latestZScore(smoothed, quarterly ? 8 : 24);
  return { latestLevel: round2(latest?.value), latestDate: latest?.date ?? null, z, score: zToScore(z) };
}

// Quits confidence: the JOLTS quits rate, same "relative cycle high/low"
// framing as participation. Workers quit voluntarily when they're confident
// of finding something else — a rising quits rate reads positive directly.
export function quitsScore(quitsObsMap) {
  const series = toSeries(quitsObsMap);
  const latest = series.at(-1);
  if (series.length < 8) return { latestRate: round2(latest?.value), latestDate: latest?.date ?? null, z: null, score: null };
  const z = latestZScore(trailing3moAvg(series));
  return { latestRate: round2(latest?.value), latestDate: latest?.date ?? null, z, score: zToScore(z) };
}

// Job openings: the JOLTS openings rate — labor DEMAND, same framing again.
// More open positions per 100 jobs reads positive directly (a tighter market).
export function jobOpeningsScore(openingsObsMap) {
  const series = toSeries(openingsObsMap);
  const latest = series.at(-1);
  if (series.length < 8) return { latestRate: round2(latest?.value), latestDate: latest?.date ?? null, z: null, score: null };
  const z = latestZScore(trailing3moAvg(series));
  return { latestRate: round2(latest?.value), latestDate: latest?.date ?? null, z, score: zToScore(z) };
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
  const score = round2(clip((diffusion - 50) / 50));
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
// participation?, quitsRate?, jobOpenings?, sectors?, payrollsInitialRelease? }
// each a raw FRED Map (or undefined if that factor isn't in LABOR_UNIVERSE for
// this currency). `universe` = LABOR_UNIVERSE[ccy] — carries the per-factor
// isIndex/quarterly metadata each score function needs. Strength composite
// averages the dimensions that read as "is the labor market tightening or
// loosening" (payrolls, unemployment, participation, breadth, quits
// confidence, job openings) — wages and revisionSurprise are reported
// alongside but deliberately excluded (see file header + revisionScore's
// own note).
export function laborMarketScore(data = {}, universe = {}) {
  const dims = {};
  if (data.payrolls) dims.payrollGrowth = payrollScore(data.payrolls);
  if (data.wages) dims.wageGrowth = wageScore(data.wages, universe.wages);
  if (data.unemployment) dims.unemploymentTrend = unemploymentTrendScore(data.unemployment, universe.unemployment);
  if (data.participation) dims.participationTrend = participationTrendScore(data.participation, universe.participation);
  if (data.quitsRate) dims.quitsConfidence = quitsScore(data.quitsRate);
  if (data.jobOpenings) dims.jobOpenings = jobOpeningsScore(data.jobOpenings);
  if (data.sectors) dims.breadth = breadthScore(data.sectors);
  if (data.payrolls && data.payrollsInitialRelease) dims.revisionSurprise = revisionScore(data.payrolls, data.payrollsInitialRelease);

  const strengthInputs = [dims.payrollGrowth?.score, dims.unemploymentTrend?.score, dims.participationTrend?.score, dims.breadth?.score, dims.quitsConfidence?.score, dims.jobOpenings?.score]
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
export async function fetchLaborData(ccy, fredKey, fromDate = '2000-01-01') {
  const cfg = LABOR_UNIVERSE[ccy];
  if (!cfg) throw new Error(`No labor-market series configured for ${ccy}`);
  const data = {}, availability = [];
  await Promise.all(Object.entries(cfg).map(async ([factor, meta]) => {
    try {
      const obs = await fetchFredObservations(meta.series, fromDate, fredKey);
      data[factor] = obs;
      availability.push({ factor, series: meta.series, n: obs.size });
    } catch (e) {
      availability.push({ factor, series: meta.series, n: 0, error: e.message });
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
