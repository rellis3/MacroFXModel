// cotState.js — where an instrument sits on the COT crowding map, and what the desk's research says about it.
//
// One brick, two consumers (today.html's per-pair drawer and the Atlas newsletter), so both say the same thing.
// The states and the wording come from the registered study `cot-crowding-programme`
// (forge/COT_CROWDING_PROGRAMME_PREREG.md; results analysis/output/cot-crowding-programme/RESULTS.md). Every line
// carries the ledger id it rests on, and none of them says buy or sell, because the study found crowding does not tell
// you which way price goes.
//
// SIGN CONVENTION — read this before touching a sign. /api/cot-extremes puts JPY, CAD and CHF in USD-PAIR terms
// (_worker.js processTFF: `inst.flip ? levS - levL : levL - levS`), so for those rows positive = long USDJPY / USDCAD /
// USDCHF = SHORT the yen, loonie or franc. Every other row is in its own futures terms (EUR, GBP, AUD, NZD, MXN = long
// the currency = long EURUSD etc.). So feed rows are already in the terms of the instrument this desk quotes
// (EURUSD, USDJPY, ...). Use `toCcyTerms` when you need "long the currency" (a currency card, a cross).
//
// Pure: no fetch, no DOM. Tested in js/cotState.test.mjs.

/** Feed rows that arrive in USD-pair terms (positive = long USD against the currency). */
export const FLIPPED = new Set(['JPY', 'CAD', 'CHF']);

/** A feed value in "long the currency" terms. Only JPY/CAD/CHF need the sign turned back. */
export function toCcyTerms(sym, x) {
  if (x == null || !Number.isFinite(+x)) return null;
  return FLIPPED.has(sym) ? -x : +x;
}

/** Percentile in "long the currency" terms (rank flips around 50). */
export function pctToCcyTerms(sym, pct) {
  if (pct == null || !Number.isFinite(+pct)) return null;
  return FLIPPED.has(sym) ? 100 - pct : +pct;
}

/**
 * A whole feed row in "long the currency" terms (a no-op except for JPY/CAD/CHF). Every directional field is negated
 * and every percentile flipped around 50, together; flipping some and not others is how this went wrong before.
 */
export function toCcyRow(row) {
  if (!row || !FLIPPED.has(row.sym)) return row;
  const neg = v => (v == null || !Number.isFinite(+v) ? v : -v), inv = v => (v == null || !Number.isFinite(+v) ? v : 100 - v);
  return { ...row, specNet: neg(row.specNet), specShare: neg(row.specShare), specZ: neg(row.specZ), specShareZ: neg(row.specShareZ),
    specPct: inv(row.specPct), specSharePct: inv(row.specSharePct), weeklyChg: neg(row.weeklyChg), specShareChg: neg(row.specShareChg),
    specShareChg4w: neg(row.specShareChg4w), commNet: neg(row.commNet), commShare: neg(row.commShare), commPct: inv(row.commPct),
    commSharePct: inv(row.commSharePct), amNet: neg(row.amNet), amShare: neg(row.amShare), amSharePct: inv(row.amSharePct),
    dlNet: neg(row.dlNet), dlShare: neg(row.dlShare), splitChg4w: neg(row.splitChg4w), ccyTerms: true };
}

/** Instrument the desk quotes -> its COT feed row. Rows are already in these instruments' terms. */
export const COT_ROW_FOR = {
  EURUSD: 'EUR', GBPUSD: 'GBP', AUDUSD: 'AUD', NZDUSD: 'NZD', USDJPY: 'JPY', USDCAD: 'CAD', USDCHF: 'CHF',
  GOLD: 'GOLD', NQ: 'NQ', SPX500: 'ES', US30: 'YM', US2000: 'RTY',
};

/** OANDA symbol for the price leg of each instrument (daily closes for the trend). */
export const OANDA_FOR = {
  EURUSD: 'EUR_USD', GBPUSD: 'GBP_USD', AUDUSD: 'AUD_USD', NZDUSD: 'NZD_USD', USDJPY: 'USD_JPY', USDCAD: 'USD_CAD',
  USDCHF: 'USD_CHF', GOLD: 'XAU_USD', NQ: 'NAS100_USD', SPX500: 'SPX500_USD', US30: 'US30_USD', US2000: 'US2000_USD',
};

// What each place on the map means, in the study's own terms. `ev` = the ledger entry the line rests on;
// `verdict` mirrors that entry, so a reader can tell a measured finding from an unsettled one.
export const STATE_TEXT = {
  A: { label: 'Crowded, trend still running',
       line: 'Speculators are crowded with the trend and still adding. Crowded trends like this have behaved like any other trend of the same strength: no extra continuation and no extra risk measured.',
       ev: 'cot-crowding-p6', verdict: 'null' },
  B: { label: 'Crowded, momentum fading as the crowd keeps adding',
       line: 'This is the "vulnerable" look. Tested for a higher chance of a sharp move against the trend: none found, though not settled.',
       ev: 'cot-crowding-p4', verdict: 'underpowered' },
  C: { label: 'Crowded, the crowd starting to leave while price still runs',
       line: 'No measured difference from an ordinary trend of the same strength.',
       ev: null, verdict: 'descriptive' },
  D: { label: 'Crowded, pulling back as the crowd leaves',
       line: 'Historically a reset rather than a reversal: after pullbacks like this the trend resumed more often, and big moves against it were rarer (about 22% vs 30% within four weeks) than in an ordinary pullback. Rare, and not yet confirmed going forward.',
       ev: 'cot-crowding-p5', verdict: 'validated' },
  against: { label: 'Crowded against the trend',
       line: 'Speculators are heavily positioned against the way price has been going. That has not been a reversal signal: big moves against the trend were no more common than with neutral positioning.',
       ev: 'cot-crowding-s0-adv', verdict: 'null' },
  trimmed: { label: 'Smallest position in years',
       line: 'Speculators have cut this position right back (an extreme percentile, but the net is on the other side). No measured effect.',
       ev: null, verdict: 'descriptive' },
  leaningWith: { label: 'Leaning with the trend', line: 'Positioned with the trend, short of crowded. No measured effect on direction.', ev: null, verdict: 'descriptive' },
  leaningAgainst: { label: 'Leaning against the trend', line: 'Positioned against the trend, short of crowded. No measured effect.', ev: null, verdict: 'descriptive' },
  neutral: { label: 'Neutral', line: 'Positioning is mid-range.', ev: null, verdict: 'descriptive' },
};

/** Added to every state where speculators sit with the trend (crowded or leaning): the one consistent shape. */
export const VOL_NOTE = 'When speculators lean with the trend, the next month has run slightly more volatile (about 4%), mostly when open interest is high. Small.';

/**
 * Classify one report. All inputs in the instrument's own terms (feed rows already are).
 *   pct      share-of-OI percentile against the prior up-to-155 reports (/api/cot-extremes `specSharePct`)
 *   share    net spec share of open interest now (sign is what matters)
 *   share4   the same 4 reports earlier
 *   move13   price move over the last 13 weeks (log or %, only the sign is used)
 *   move4    price move over the last 4 weeks
 */
export function classifyCot({ pct, share, share4, move13, move4 }) {
  if (pct == null || share == null || !Number.isFinite(+pct) || !Number.isFinite(+share)) return null;
  const crowdedLong = pct >= 90 && share > 0, crowdedShort = pct <= 10 && share < 0;
  const trimmed = (pct >= 90 && share <= 0) || (pct <= 10 && share >= 0);
  const trend = move13 == null || !Number.isFinite(+move13) || move13 === 0 ? 0 : Math.sign(move13);
  const crowd = crowdedLong ? 1 : crowdedShort ? -1 : 0;
  const out = { crowd, trend, trimmed, pct: +pct };
  if (trimmed) return { ...out, zone: 'trimmed', state: null };
  if (!trend) return { ...out, zone: crowd ? 'crowded (no clear trend)' : 'neutral', state: null };
  const posT = trend > 0 ? pct : 100 - pct;                 // 100 = maximally with the trend
  if (crowd && crowd === -trend) return { ...out, zone: 'against', state: null, posT };
  if (crowd && crowd === trend) {
    const m4 = move4 != null && Number.isFinite(+move4) && Math.sign(move4) === trend ? 1 : -1;
    const flow = share4 != null && Number.isFinite(+share4) && (share - share4) * crowd > 0 ? 1 : -1;
    const state = m4 === 1 ? (flow === 1 ? 'A' : 'C') : (flow === 1 ? 'B' : 'D');
    return { ...out, zone: 'with', state, posT, m4, flow };
  }
  return { ...out, zone: posT >= 70 ? 'leaningWith' : posT <= 30 ? 'leaningAgainst' : 'neutral', state: null, posT };
}

/** The reader-facing read for a classification: label, line, evidence id, verdict, and the vol note where it applies. */
export function describeCot(c) {
  if (!c) return null;
  const key = c.state ?? (c.zone === 'crowded (no clear trend)' ? 'neutral' : c.zone);
  const t = STATE_TEXT[key] ?? STATE_TEXT.neutral;
  const withTrend = c.zone === 'with' || c.zone === 'leaningWith';
  const side = c.crowd > 0 ? 'long' : c.crowd < 0 ? 'short' : null;
  return { key, label: t.label, line: t.line, ev: t.ev, verdict: t.verdict, vol: withTrend ? VOL_NOTE : null, side };
}

/** Daily bars [{date, close}] (any order) -> close on/after `iso` (the first bar at or after a date). */
function closeOnOrAfter(bars, iso) { for (const b of bars) if (b.date >= iso) return b.close; return null; }
function closeOnOrBefore(bars, iso) { let v = null; for (const b of bars) { if (b.date <= iso) v = b.close; else break; } return v; }
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/**
 * Full read for one instrument.
 *   row     the instrument's /api/cot-extremes row (specSharePct, specShare, reportDate)
 *   series  its weekly history (cot_series_v2: { dates, specShare } oldest first; specShare in % of OI)
 *   bars    daily bars [{date, close}] of the instrument
 * Price is measured from the close on/after the release Friday (report Tuesday + 3 days), as in the study.
 */
export function cotStateFor({ row, series, bars }) {
  if (!row) return null;
  const pct = row.specSharePct ?? null, share = row.specShare ?? null;
  let share4 = null;
  if (series?.dates?.length && series?.specShare?.length) {
    const i = series.dates.lastIndexOf(row.reportDate);
    const j = (i >= 0 ? i : series.dates.length - 1) - 4;
    share4 = j >= 0 ? series.specShare[j] : null;
  }
  let move13 = null, move4 = null;
  const sorted = (bars ?? []).filter(b => b && b.date && Number.isFinite(+b.close)).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  if (row.reportDate && sorted.length) {
    const rel = addDays(row.reportDate, 3);
    const p0 = closeOnOrAfter(sorted, rel) ?? sorted.at(-1).close;
    const p13 = closeOnOrBefore(sorted, addDays(rel, -91)), p4 = closeOnOrBefore(sorted, addDays(rel, -28));
    if (p0 && p13) move13 = Math.log(p0 / p13);
    if (p0 && p4) move4 = Math.log(p0 / p4);
  }
  const c = classifyCot({ pct, share, share4, move13, move4 });
  if (!c) return null;
  return { ...c, ...describeCot(c), reportDate: row.reportDate ?? null, share, share4,
           move13: move13 == null ? null : +move13.toFixed(4), move4: move4 == null ? null : +move4.toFixed(4) };
}
