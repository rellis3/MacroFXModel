/**
 * m1GapFill — bring a frozen R2 M1 series up to "now" at build time.
 *
 * The per-line book is learned from the R2 `_m1.parquet` snapshot, which is fixed
 * in time (nothing appends to it). So a book rebuilt today still ends whenever the
 * parquet was last uploaded. Rather than rewrite parquet (the stack only READS it,
 * via hyparquet), this brick fetches the GAP — the window from the parquet's last
 * bar to now — from OANDA M1 at rebuild time and merges it into the in-memory
 * `packed` series the analyser consumes. No persistence, no parquet writer.
 *
 * Pure + offline-testable: the network call is injected (`fetchCandles`), so the
 * gap maths / chunking / merge are unit-tested on synthetic data. The real OANDA
 * M1 fetcher lives at the edge (server.js / volBacktestEngine) and is passed in.
 *
 * `packed` shape (from loadM1ForPair): { n, times, opens, highs, lows, closes,
 * volumes? }. `times` are epoch SECONDS (the loader's Int32), epoch ms, or ISO —
 * normalised to seconds here.
 */

const MIN = 60;                    // seconds per M1 bar
const DEFAULT_MAX_BARS = 5000;     // OANDA candles cap per request
const DEFAULT_MAX_RETRIES = 3;     // per chunk, before giving up on it
const DEFAULT_RETRY_BASE_MS = 500; // doubles each attempt (500, 1000, 2000, ...)
// Sanity floor for a "last known bar" timestamp (2026-09-16 incident: a
// single corrupted/unparseable trailing timestamp silently became epoch 0
// when written into the Int32Array `times` column — see `pack()` in
// volBacktestM1Engine.js, `times[i] = toEpoch(r[5])`; assigning NaN to a
// typed array index silently coerces to 0, no error, no warning — and
// computeGap then read that as "last bar was 1970-01-01", triggering a
// ~7.9M-bar refetch of this pair's entire history and hammering OANDA hard
// enough to draw 504s on the next pair in the same run). Anything before
// this floor is treated as corrupted, not a real "we're missing decades"
// gap. 2015-01-01 comfortably predates every real M1 archive this project
// uses (per the owner: "we only care about ~10 years, 2016 onwards").
export const SANE_EPOCH_FLOOR = Math.floor(Date.UTC(2015, 0, 1) / 1000);

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Normalise one packed timestamp (sec | ms | ISO) to epoch SECONDS.
export function toEpochSec(t) {
  if (typeof t === 'number') return t < 1e12 ? Math.floor(t) : Math.floor(t / 1000);
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

// Epoch seconds of the last bar in a packed series, or null if empty.
// Scans backward past any trailing timestamp(s) below SANE_EPOCH_FLOOR
// (corrupted -- see that constant's own doc) instead of trusting index
// n-1 blindly, so one bad tail value can't make the whole series look
// decades older than it really is. Only the true END of the array is ever
// corrupted by the known failure mode (a bad LAST row) -- this deliberately
// does not scan the whole array (that's `loadM1ForPair`'s/the parquet
// read's job, not a gap-fill helper's), just refuses to trust a nonsense
// tail.
export function lastPackedEpoch(packed) {
  if (!packed || !packed.n) return null;
  for (let i = packed.n - 1; i >= 0 && i >= packed.n - 5; i--) {
    const t = toEpochSec(packed.times[i]);
    if (t != null && t >= SANE_EPOCH_FLOOR) return t;
  }
  return null; // last up to 5 bars are ALL corrupted/pre-floor -- don't guess, let the caller decide
}

// The gap window [fromSec, toSec] to fetch (next minute after the last bar → now),
// or null if there's no parquet to extend or it's already current within minGapSec.
// Relies entirely on `lastPackedEpoch` above to keep `last` (and therefore
// `fromSec`) at or after SANE_EPOCH_FLOOR — a genuinely ancient-only series
// (every scanned bar pre-2015) reads as "no valid last bar" and returns
// null here rather than a floored-but-still-wrong fetch window; a real
// series with just a corrupted tail gets its true recent `last` back, no
// flooring needed. No separate clamp here — one enforcement point, not two
// that could quietly drift apart.
export function computeGap(packed, nowSec, { minGapSec = 3600 } = {}) {
  const last = lastPackedEpoch(packed);
  if (last == null) return null;                 // no base series (or every scanned bar corrupted/pre-floor) — nothing to extend onto
  if (nowSec - last < minGapSec) return null;    // current enough; skip the fetch
  return { fromSec: last + MIN, toSec: nowSec };
}

// Split a [from,to] minute range into ≤maxBars-minute chunks for paginated fetch.
export function chunkMinuteRange(fromSec, toSec, maxBars = DEFAULT_MAX_BARS) {
  const out = [];
  if (toSec < fromSec) return out;
  const span = maxBars * MIN;
  for (let s = fromSec; s <= toSec; s += span) out.push({ fromSec: s, toSec: Math.min(s + span - MIN, toSec) });
  return out;
}

// Fetch the gap as M1 bars via the injected fetcher (paginated). Returns bars in
// ascending time: [{ time(sec), open, high, low, close, volume? }]. fetchCandles
// is `(oandaSym, fromSec, toSec) → Promise<bar[]>`.
//
// A chunk failure (network blip, rate limit — OANDA 504s were a recurring, real
// issue during this project's own backtest regeneration runs) is retried up to
// `maxRetries` times with exponential backoff BEFORE being given up on — most
// transient failures never even reach the "give up" path anymore. If a chunk
// still fails after every retry, it's no longer silently dropped: the returned
// array carries a non-enumerable-safe `.gaps` property (an array is still a
// normal array — `.length`, `.concat()`, iteration all behave exactly as
// before for every existing caller — this is purely additive) listing which
// windows never got real data, e.g. `[{fromSec, toSec, error}]`. A caller that
// doesn't check `.gaps` sees no behavior change at all; `gapFillPacked` below
// checks it and turns a silent hole into a loud, specific log line.
export async function fetchM1Gap(oandaSym, fromSec, toSec, fetchCandles,
  { maxBars = DEFAULT_MAX_BARS, onLog = () => {}, maxRetries = DEFAULT_MAX_RETRIES, retryBaseMs = DEFAULT_RETRY_BASE_MS } = {}) {
  const out = [];
  const gaps = [];
  for (const c of chunkMinuteRange(fromSec, toSec, maxBars)) {
    let got, lastErr = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try { got = await fetchCandles(oandaSym, c.fromSec, c.toSec); lastErr = null; break; }
      catch (e) {
        lastErr = e;
        if (attempt < maxRetries) {
          const delayMs = retryBaseMs * (2 ** attempt);
          onLog(`m1 gap chunk ${c.fromSec}-${c.toSec} retrying (attempt ${attempt + 2}/${maxRetries + 1}) after: ${e.message} — waiting ${delayMs}ms`);
          await _sleep(delayMs);
        }
      }
    }
    if (lastErr) {
      // Deliberately keeps the exact "m1 gap chunk ... failed:" wording every
      // existing caller's own failure-counting (e.g. asiaFibAtlasRoutes.js /
      // mondayFibAtlasRoutes.js's countGapFillFailures, which regex-matches
      // this literal text) already keys on — only fires once retries are
      // truly exhausted, so it still means the same thing it always did
      // ("this window never got real data"), just genuinely rarer now.
      onLog(`m1 gap chunk ${c.fromSec}-${c.toSec} failed: ${lastErr.message} (gave up after ${maxRetries + 1} attempts)`);
      gaps.push({ fromSec: c.fromSec, toSec: c.toSec, error: lastErr.message });
      continue;
    }
    for (const b of got || []) {
      const ts = toEpochSec(b.time);
      if (ts != null) out.push({ time: ts, open: +b.open, high: +b.high, low: +b.low, close: +b.close, volume: +(b.volume ?? 0) });
    }
  }
  out.sort((a, b) => a.time - b.time);
  out.gaps = gaps;
  return out;
}

// Merge new bars into a packed series. Only bars strictly AFTER the last existing
// bar are appended (dedup by minute), so re-running is idempotent. Returns a NEW
// packed (plain arrays; consumers index by position) — input is not mutated.
export function mergeBarsIntoPacked(packed, bars) {
  const base = packed && packed.n ? packed : { n: 0, times: [], opens: [], highs: [], lows: [], closes: [], volumes: [] };
  const last = lastPackedEpoch(base);
  const fresh = [];
  let prev = last;
  for (const b of (bars || [])) {
    const ts = toEpochSec(b.time);
    if (ts == null) continue;
    if (last != null && ts <= last) continue;     // already covered by the parquet
    if (prev != null && ts <= prev) continue;     // dedup within the new batch (ascending)
    fresh.push(b); prev = ts;
  }
  if (!fresh.length) return base;

  const n = base.n + fresh.length;
  const times = new Array(n), opens = new Array(n), highs = new Array(n), lows = new Array(n), closes = new Array(n), volumes = new Array(n);
  for (let i = 0; i < base.n; i++) {
    times[i] = base.times[i]; opens[i] = base.opens[i]; highs[i] = base.highs[i];
    lows[i] = base.lows[i]; closes[i] = base.closes[i]; volumes[i] = base.volumes ? base.volumes[i] : 0;
  }
  for (let j = 0; j < fresh.length; j++) {
    const i = base.n + j, b = fresh[j];
    times[i] = toEpochSec(b.time); opens[i] = +b.open; highs[i] = +b.high;
    lows[i] = +b.low; closes[i] = +b.close; volumes[i] = +(b.volume ?? 0);
  }
  return { n, times, opens, highs, lows, closes, volumes };
}

// Convenience: load gap + merge in one call. `packed` in, extended `packed` out.
// No-op (returns the input) when already current or when no base series exists.
//
// `merged.gapFillWarnings` (2026-09-12, purely additive — same shape as
// `fetchM1Gap`'s own `.gaps`) is attached whenever any chunk failed even after
// retries, so a caller that cares (runOne's nightly regeneration, in
// particular) can tell a top-up that's honestly incomplete apart from one
// that fully succeeded, instead of both looking identical. `onLog` also gets
// one unmissable summary line — the per-chunk failures above are already
// logged individually by fetchM1Gap, but those are easy to lose in a long
// build log; this one line says plainly whether THIS pair's top-up has a real
// hole in it.
export async function gapFillPacked(packed, oandaSym, fetchCandles, { nowSec, minGapSec = 3600, maxBars = DEFAULT_MAX_BARS, onLog = () => {}, maxRetries = DEFAULT_MAX_RETRIES, retryBaseMs = DEFAULT_RETRY_BASE_MS } = {}) {
  const gap = computeGap(packed, nowSec, { minGapSec });
  if (!gap) return packed;
  const bars = await fetchM1Gap(oandaSym, gap.fromSec, gap.toSec, fetchCandles, { maxBars, onLog, maxRetries, retryBaseMs });
  const merged = mergeBarsIntoPacked(packed, bars);
  onLog(`${oandaSym}: gap-filled ${merged.n - (packed?.n || 0)} M1 bars (${new Date(gap.fromSec * 1000).toISOString()} → now)`);
  if (bars.gaps?.length) {
    merged.gapFillWarnings = bars.gaps;
    const spanMins = bars.gaps.reduce((a, g) => a + (g.toSec - g.fromSec) / MIN, 0);
    onLog(`⚠ ${oandaSym}: gap-fill INCOMPLETE — ${bars.gaps.length} window(s) (~${Math.round(spanMins)} min total) never fetched after retries, real holes remain in this top-up`);
  }
  return merged;
}
