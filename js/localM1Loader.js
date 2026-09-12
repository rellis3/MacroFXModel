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
 */
import path from 'path';
import { existsSync } from 'fs';
import { BT_M1_DIR, readM1Parquet } from './volBacktestM1Engine.js';

export async function loadM1ForPairLocal(pairKey, m1Dir = BT_M1_DIR) {
  const m1File = path.join(m1Dir, `${pairKey}_m1.parquet`);
  if (!existsSync(m1File)) return null;
  const rows = await readM1Parquet(m1File);

  const toEpoch = v => {
    if (v instanceof Date) return Math.floor(v.getTime() / 1000);
    const s = String(v).substring(0, 19).replace(' ', 'T');
    return Math.floor(new Date(s + 'Z').getTime() / 1000);
  };

  const n = rows.length;
  const times = new Int32Array(n);
  const opens = new Float32Array(n);
  const highs = new Float32Array(n);
  const lows = new Float32Array(n);
  const closes = new Float32Array(n);
  const volumes = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    times[i] = toEpoch(r[5]);
    opens[i] = Number(r[0]); highs[i] = Number(r[1]); lows[i] = Number(r[2]); closes[i] = Number(r[3]);
    volumes[i] = Number(r[4]) || 0;
  }
  return { n, times, opens, highs, lows, closes, volumes };
}
