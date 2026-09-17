/**
 * localM1Loader.js — load M1 bars straight from the local
 * `VolRangeForecaster/data/m1/*.parquet` cache, skipping `volBacktestM1Engine.
 * loadM1ForPair`'s R2-first priority entirely.
 *
 * Why this exists: the R2-hosted copy of these parquet files carries TWO
 * extra numeric columns before the datetime column (8 columns: open, high,
 * low, close, volume, ?, ?, datetime) instead of the local disk copy's 6
 * (open, high, low, close, volume, datetime) — `loadM1ForPair`'s `pack()`
 * hardcodes `r[5]` as the datetime column, which is only correct for the
 * 6-column (local) schema. Against the 8-column R2 payload it silently reads
 * a numeric filler column instead, producing an all-zero `times` array (a
 * `NaN` epoch coerced to 0 by the `Int32Array` write) and therefore an empty
 * walk with no error raised — a genuine, pre-existing schema mismatch
 * between the two data sources, not something introduced here. Confirmed by
 * directly comparing `fetchFromR2('eurusd')` (8 cols/row) against the local
 * `eurusd_m1.parquet` (6 cols/row) with the same underlying price history.
 * Local disk is unaffected and this repo already ships all 26 pairs there,
 * so this loader reads ONLY that path — same packed `{n, times, opens,
 * highs, lows, closes, volumes}` contract as `loadM1ForPair`, just without
 * ever touching the network.
 *
 * UPDATE 2026-09-17: the local cache is no longer uniformly 6-column. It is
 * MIXED — `usdjpy_m1.parquet` has 6 (open, high, low, close, volume, datetime)
 * while `eurusd`, `gbpusd`, `gold` and others have 8 (…, spread_open,
 * spread_close, datetime). So the `r[5]` assumption above was reading a spread
 * column as a timestamp on most pairs and producing exactly the all-zero
 * `times` array it was written to avoid — silently, because a NaN epoch
 * becomes 0 in an `Int32Array` and an empty walk raises nothing. The datetime
 * column is now LOCATED per file from its first row rather than assumed, and a
 * file whose timestamps do not resolve throws instead of returning zeros. The
 * packed contract is unchanged.
 */
import path from 'path';
import { existsSync } from 'fs';
import { BT_M1_DIR, readM1Parquet } from './volBacktestM1Engine.js';

const toEpoch = v => {
  if (v instanceof Date) return Math.floor(v.getTime() / 1000);
  if (typeof v === 'bigint') return Number(v > 1_000_000_000_000n ? v / 1000n : v);   // some writers emit epoch millis
  if (typeof v === 'number') return Math.floor(v > 1e12 ? v / 1000 : v);
  const s = String(v).substring(0, 19).replace(' ', 'T');
  const ms = Date.parse(s + 'Z');
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
};

/**
 * Which column holds the timestamp, from the last column backwards — the
 * datetime is the pandas index and is written last in every layout seen here,
 * and searching from the right stops a numeric price column from matching by
 * accident. Returns −1 if no column resolves to a plausible epoch.
 */
export function findTimeColumn(row) {
  if (!Array.isArray(row)) return -1;
  for (let i = row.length - 1; i >= 0; i--) {
    const t = toEpoch(row[i]);
    if (Number.isFinite(t) && t > 946_684_800 && t < 4_102_444_800) return i;   // 2000-01-01 … 2100-01-01
  }
  return -1;
}

export async function loadM1ForPairLocal(pairKey, m1Dir = BT_M1_DIR) {
  const m1File = path.join(m1Dir, `${pairKey}_m1.parquet`);
  if (!existsSync(m1File)) return null;
  const rows = await readM1Parquet(m1File);
  if (!rows?.length) return null;

  const tCol = findTimeColumn(rows[0]);
  if (tCol < 0) throw new Error(`${pairKey}_m1.parquet: no timestamp column in a ${rows[0]?.length}-column row — refusing to return an all-zero time axis`);

  const n = rows.length;
  const times = new Int32Array(n);
  const opens = new Float32Array(n);
  const highs = new Float32Array(n);
  const lows = new Float32Array(n);
  const closes = new Float32Array(n);
  const volumes = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    times[i] = toEpoch(r[tCol]);
    opens[i] = Number(r[0]); highs[i] = Number(r[1]); lows[i] = Number(r[2]); closes[i] = Number(r[3]);
    volumes[i] = Number(r[4]) || 0;
  }
  return { n, times, opens, highs, lows, closes, volumes };
}
