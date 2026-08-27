/**
 * Calendar loader — the local economic-calendar CSV (`calendar_events.csv`,
 * repo root), SCHEDULE ONLY. Every event's date/time/currency/impact tier is
 * public information, known well in advance — genuinely different from
 * every other "forward-looking" caveat in this codebase (CVOL's settle is a
 * market READ of uncertain future vol, not a certainty). A trader in 2020
 * already knew the exact calendar date of the March 2021 FOMC meeting. So,
 * unlike price data, a calendar date that falls AFTER "now" is not
 * lookahead here — it's the same public knowledge a trader actually had.
 *
 * What IS lookahead, and this loader deliberately never parses at all: the
 * `actual`/`consensus`/`previous` outcome columns — an event's REALIZED
 * surprise isn't known until it releases. Only `datetime_raw` (UTC — verified
 * against known FOMC 2pm-ET announcement times: 19:00 in winter/EST,
 * 18:00 in summer/EDT, both consistent with UTC) and `ccy`/`impact` are
 * read; the outcome columns are structurally never touched.
 *
 * Pure I/O boundary, same discipline as cvolLoader.js: reads the local file,
 * caches once per process, callers own all causal-shift/currency-relevance
 * logic (asiaFibAtlasEngine.js does the filtering-by-instrument and the
 * nearest-event lookup, not this file).
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CALENDAR_PATH = path.join(__dirname, '..', 'calendar_events.csv');

let _cache = null;   // [{epoch, ccy}], 'Major'-impact only, sorted by epoch — parsed once per process

/**
 * `majorEventEpochs()` -> `[{epoch, ccy}]`, every 'Major'-impact scheduled
 * event, sorted ascending by epoch (UTC seconds). Empty array if the file is
 * missing — callers degrade gracefully (same contract as every other
 * optional context source: absent data means null features, never a thrown
 * error).
 *
 * Columns 1-5 (date,datetime_raw,country,ccy,impact) are always plain and
 * comma-free in this file — verified: the ONLY column that ever contains a
 * comma or a quote is column 6 (event name), which this loader never reads
 * at all, so a naive split is safe here (a general CSV parser would be
 * needed the moment a caller wants the event name too).
 */
export function majorEventEpochs() {
  if (_cache) return _cache;
  if (!existsSync(CALENDAR_PATH)) { _cache = []; return _cache; }
  const text = readFileSync(CALENDAR_PATH, 'latin1');   // file has non-UTF-8 bytes (verified)
  const lines = text.split('\n');
  const out = [];
  for (let i = 1; i < lines.length; i++) {   // skip header
    const line = lines[i];
    if (!line) continue;
    const c1 = line.indexOf(','); if (c1 < 0) continue;
    const c2 = line.indexOf(',', c1 + 1); if (c2 < 0) continue;
    const c3 = line.indexOf(',', c2 + 1); if (c3 < 0) continue;
    const c4 = line.indexOf(',', c3 + 1); if (c4 < 0) continue;
    const c5 = line.indexOf(',', c4 + 1); if (c5 < 0) continue;
    const datetimeRaw = line.slice(c1 + 1, c2);
    const ccy = line.slice(c3 + 1, c4);
    const impact = line.slice(c4 + 1, c5);
    if (impact !== 'Major') continue;
    const m = datetimeRaw.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (!m) continue;
    const epoch = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000;
    out.push({ epoch, ccy });
  }
  out.sort((a, b) => a.epoch - b.epoch);
  _cache = out;
  return _cache;
}
