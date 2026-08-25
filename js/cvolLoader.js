/**
 * CVOL loader — CME's EOD implied-volatility index (`cme_cvol_eod_available_history.parquet`,
 * repo root), the market's OWN forward-looking read: implied vol level, skew
 * (options-market directional lean), and convexity (tail pricing). Everything
 * else the Level Atlas measures is REALIZED — this is the one genuinely
 * different, forward-priced signal available with matching depth (EURUSD:
 * 2016-01-04 → present, day-for-day with the M1 history).
 *
 * Products in the file: AUDUSD, EURUSD, GBPUSD, USDCAD, USDCHF, USDJPY, XAUUSD.
 *
 * Pure I/O boundary: reads the local parquet with `hyparquet` (already a repo
 * dependency — same library `volBacktestM1Engine.js` uses for M1), returns a
 * plain `Map(dateStr → record)`. All causal-shift logic (using YESTERDAY's
 * settle for a touch today) lives in the CALLER (`levelAtlasEngine.js`), not
 * here — this loader just parses the file honestly.
 */
import { parquetRead, parquetMetadataAsync } from 'hyparquet';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CVOL_PATH = path.join(__dirname, '..', 'cme_cvol_eod_available_history.parquet');

let _cache = null;   // Map(product → Map(dateStr → record)), parsed once per process

async function loadAll() {
  if (_cache) return _cache;
  if (!existsSync(CVOL_PATH)) { _cache = new Map(); return _cache; }
  const buf = readFileSync(CVOL_PATH);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const meta = await parquetMetadataAsync(ab);
  const cols = meta.schema.map(s => s.name).slice(1);   // drop the root schema node
  const rows = [];
  await parquetRead({ file: ab, onComplete: d => rows.push(...d) });

  const byProduct = new Map();
  for (const r of rows) {
    const rec = Object.fromEntries(cols.map((c, i) => [c, r[i]]));
    const product = String(rec.product);
    const dateStr = new Date(rec.timestamp).toISOString().slice(0, 10);
    const m = byProduct.get(product) ?? new Map();
    m.set(dateStr, {
      cvol: rec.cvol, dnvar: rec.dnvar, upvar: rec.upvar,
      skew: rec.skew, skewRatio: rec.skew_ratio, atm: rec.atm, convexity: rec.convexity,
    });
    byProduct.set(product, m);
  }
  _cache = byProduct;
  return _cache;
}

/**
 * `cvolSeries('EURUSD')` → `Map(dateStr → { cvol, dnvar, upvar, skew, skewRatio, atm, convexity })`.
 * Empty map if the file is missing or the product isn't covered — callers
 * degrade gracefully (same contract as every other optional context source
 * in this engine: absent data means null features, never a thrown error).
 */
export async function cvolSeries(product = 'EURUSD') {
  const all = await loadAll();
  return all.get(String(product).toUpperCase()) ?? new Map();
}

export const CVOL_PRODUCTS = ['AUDUSD', 'EURUSD', 'GBPUSD', 'USDCAD', 'USDCHF', 'USDJPY', 'XAUUSD'];
