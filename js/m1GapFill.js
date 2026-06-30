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

// Normalise one packed timestamp (sec | ms | ISO) to epoch SECONDS.
export function toEpochSec(t) {
  if (typeof t === 'number') return t < 1e12 ? Math.floor(t) : Math.floor(t / 1000);
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

// Epoch seconds of the last bar in a packed series, or null if empty.
export function lastPackedEpoch(packed) {
  if (!packed || !packed.n) return null;
  return toEpochSec(packed.times[packed.n - 1]);
}

// The gap window [fromSec, toSec] to fetch (next minute after the last bar → now),
// or null if there's no parquet to extend or it's already current within minGapSec.
export function computeGap(packed, nowSec, { minGapSec = 3600 } = {}) {
  const last = lastPackedEpoch(packed);
  if (last == null) return null;                 // no base series — nothing to extend onto
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
// is `(oandaSym, fromSec, toSec) → Promise<bar[]>`; chunk failures are logged and
// skipped (a partial top-up still beats a frozen series).
export async function fetchM1Gap(oandaSym, fromSec, toSec, fetchCandles, { maxBars = DEFAULT_MAX_BARS, onLog = () => {} } = {}) {
  const out = [];
  for (const c of chunkMinuteRange(fromSec, toSec, maxBars)) {
    let got;
    try { got = await fetchCandles(oandaSym, c.fromSec, c.toSec); }
    catch (e) { onLog(`m1 gap chunk ${c.fromSec}-${c.toSec} failed: ${e.message}`); continue; }
    for (const b of got || []) {
      const ts = toEpochSec(b.time);
      if (ts != null) out.push({ time: ts, open: +b.open, high: +b.high, low: +b.low, close: +b.close, volume: +(b.volume ?? 0) });
    }
  }
  out.sort((a, b) => a.time - b.time);
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
export async function gapFillPacked(packed, oandaSym, fetchCandles, { nowSec, minGapSec = 3600, maxBars = DEFAULT_MAX_BARS, onLog = () => {} } = {}) {
  const gap = computeGap(packed, nowSec, { minGapSec });
  if (!gap) return packed;
  const bars = await fetchM1Gap(oandaSym, gap.fromSec, gap.toSec, fetchCandles, { maxBars, onLog });
  const merged = mergeBarsIntoPacked(packed, bars);
  onLog(`${oandaSym}: gap-filled ${merged.n - (packed?.n || 0)} M1 bars (${new Date(gap.fromSec * 1000).toISOString()} → now)`);
  return merged;
}
