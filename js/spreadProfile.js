// Spread profile — measured spread per pair per UTC hour, accumulated for weeks.
//
// pylego/motif_policy.py's RETAIL_SPREAD_PIPS is a table of ESTIMATES, and the
// touch-motif strategy's fixed 20-pip stop makes every pip of spread 5% of a
// trade's risk -- the spread half of best-config (max 2.0p) decides which
// pairs trade at all. Measured 2026-09-17 20:00 UTC the table was ~2x light
// on the crosses (GBPJPY 4.1 live vs 1.6 in the table), but that's a thin
// hour and the strategy enters 07-16 UTC. Nobody can set that threshold
// honestly without a per-pair, per-hour picture -- and no spread history
// existed anywhere in this repo. This is that history.
//
// Storage is a running (sum, n, max, sumsq) per pair per hour -- a few KB
// however long it runs -- in KV `spread_profile_v1`, loaded at boot, flushed
// after every sample that changed it (one small write per sample tick).
// Spread is kept in PIPS as the server computes them (PIP_SIZE / JPY 0.01 /
// else 0.0001) AND raw price units, so a different pip convention (gold) can
// be re-derived later without resampling.

export const KV_KEY = 'spread_profile_v1';
export const ENTRY_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16];   // where the backtest's entries cluster (UTC)

// The tracker's 26-pair universe in OANDA form, plus gold.
export const MOTIF_UNIVERSE = [
  'AUD_CAD', 'AUD_CHF', 'AUD_JPY', 'AUD_NZD', 'AUD_USD', 'CAD_JPY', 'CHF_JPY',
  'EUR_AUD', 'EUR_CAD', 'EUR_CHF', 'EUR_GBP', 'EUR_JPY', 'EUR_NZD', 'EUR_USD',
  'GBP_AUD', 'GBP_CAD', 'GBP_CHF', 'GBP_JPY', 'GBP_NZD', 'GBP_USD', 'XAU_USD',
  'NZD_JPY', 'NZD_USD', 'USD_CAD', 'USD_CHF', 'USD_JPY',
];

let _profile = { since: null, samples: 0, pairs: {} };   // pairs[sym][hour] = { sum, n, max, sumsq, rawSum }
let _kv = null;
let _dirty = false;

export async function spreadProfileInit(kvApi) {
  _kv = kvApi;
  try {
    const raw = await _kv.get(KV_KEY);
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (saved && typeof saved === 'object' && saved.pairs) _profile = saved;
  } catch (e) { console.warn('[spread-profile] load failed, starting fresh:', e.message); }
  if (!_profile.since) _profile.since = new Date().toISOString();
}

// One tick: `pairs` is _fetchSpreads' output ({ SYM: { spreadPips, spread, tradeable } }).
export function spreadProfileSample(pairs, when = new Date()) {
  const h = String(when.getUTCHours()).padStart(2, '0');
  let took = 0;
  for (const [sym, q] of Object.entries(pairs || {})) {
    if (!MOTIF_UNIVERSE.includes(sym)) continue;
    if (q.tradeable === false || !Number.isFinite(q.spreadPips)) continue;   // a halted quote is not a payable cost
    const bySym = (_profile.pairs[sym] ||= {});
    const cell = (bySym[h] ||= { sum: 0, n: 0, max: 0, sumsq: 0, rawSum: 0 });
    cell.sum += q.spreadPips; cell.n += 1; cell.sumsq += q.spreadPips * q.spreadPips;
    cell.max = Math.max(cell.max, q.spreadPips);
    cell.rawSum += q.spread ?? 0;
    took++;
  }
  if (took) { _profile.samples += 1; _profile.lastAt = when.toISOString(); _dirty = true; }
  return took;
}

export async function spreadProfileFlush() {
  if (!_dirty || !_kv) return false;
  _dirty = false;
  try { await _kv.put(KV_KEY, JSON.stringify(_profile)); return true; }
  catch (e) { _dirty = true; console.warn('[spread-profile] flush failed:', e.message); return false; }
}

// Report: per pair, mean/max by hour, the entry-hours mean (07-16 UTC), the
// all-hours mean, and -- when a reference table is passed -- the ratio to it.
export function spreadProfileReport(reference = null) {
  const out = { since: _profile.since, lastAt: _profile.lastAt ?? null, samples: _profile.samples,
                entryHours: ENTRY_HOURS, pairs: {} };
  for (const sym of MOTIF_UNIVERSE) {
    const bySym = _profile.pairs[sym] || {};
    const byHour = {};
    let eSum = 0, eN = 0, aSum = 0, aN = 0, eMax = 0;
    for (const [h, c] of Object.entries(bySym)) {
      if (!c.n) continue;
      const mean = c.sum / c.n;
      const sd = Math.sqrt(Math.max(0, c.sumsq / c.n - mean * mean));
      byHour[h] = { mean: +mean.toFixed(2), sd: +sd.toFixed(2), max: +c.max.toFixed(2), n: c.n };
      aSum += c.sum; aN += c.n;
      if (ENTRY_HOURS.includes(Number(h))) { eSum += c.sum; eN += c.n; eMax = Math.max(eMax, c.max); }
    }
    const key = sym.replace('_', '').toLowerCase().replace('xauusd', 'gold');
    const row = {
      pair: key,
      entryHoursMean: eN ? +(eSum / eN).toFixed(2) : null,
      entryHoursMax: eN ? +eMax.toFixed(2) : null,
      allHoursMean: aN ? +(aSum / aN).toFixed(2) : null,
      samples: aN,
      byHour,
    };
    if (reference && reference[key] != null) {
      row.table = reference[key];
      row.ratioToTable = row.entryHoursMean != null ? +(row.entryHoursMean / reference[key]).toFixed(2) : null;
    }
    out.pairs[sym] = row;
  }
  return out;
}
