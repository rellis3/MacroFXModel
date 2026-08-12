/**
 * Minimal FRED fetch brick — one place for a REST pull of a FRED daily series and
 * a date-aligned forward-fill onto a bar calendar. Used by the vol-forecast
 * scheduler to attach the HAR-IV (GVZ/EVZ/VXN…) implied-vol series to daily bars.
 *
 * NOTE: server.js has its own inline `fetchFredSeries` (older, with a 25s timeout
 * + '.'-filtering). This is the extractable shared version; converge server.js onto
 * it later. Kept tiny + dependency-free so any module can import it.
 */

// Fetch a FRED daily series → Map<'YYYY-MM-DD', number>. Throws on HTTP error;
// returns an empty Map if the response has no usable observations.
export async function fetchFredSeries(seriesId, fromDate, fredKey, { timeoutMs = 25_000 } = {}) {
  if (!fredKey) throw new Error('FRED key not set');
  const url = 'https://api.stlouisfed.org/fred/series/observations'
            + `?series_id=${encodeURIComponent(seriesId)}&api_key=${fredKey}&file_type=json`
            + `&observation_start=${fromDate}&sort_order=asc`;
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`FRED ${seriesId} HTTP ${r.status}`);
  const json = await r.json();
  const out = new Map();
  for (const obs of json.observations ?? []) {
    if (obs.value === '.' || obs.value == null) continue;   // FRED missing marker
    const v = parseFloat(obs.value);
    if (Number.isFinite(v)) out.set(obs.date, v);
  }
  return out;
}

// Forward-fill a sparse date→value Map onto an ordered list of dates: each date
// gets the last observation on-or-before it (NaN before the first obs). Both inputs
// must be ascending 'YYYY-MM-DD'. Returns an array aligned 1:1 to `dates`.
export function forwardFillToDates(dates, map) {
  const keys = [...map.keys()].sort();
  const out = new Array(dates.length).fill(NaN);
  let ptr = -1, last = NaN;
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    while (ptr + 1 < keys.length && keys[ptr + 1] <= d) { ptr++; last = map.get(keys[ptr]); }
    out[i] = last;
  }
  return out;
}
