/**
 * Keyless FRED daily CSV (fredgraph.csv) for research scripts.
 *
 * FRED returns HTTP 503 to the default `node` user-agent (faults-log 2026-11-01), so every copy of
 * `fredCsv` in analysis/*.mjs that fetched without a header now fails or returns an error page that
 * parses to zero rows. This sends a named user-agent (same string as server.js _FRED_CSV_HEADERS)
 * and THROWS on a non-200 or an empty series instead of returning [] silently.
 */
const FRED_CSV_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; MacroFXModel/1.0; +fredgraph.csv)' };

export async function fredCsv(id, { timeoutMs = 60_000 } = {}) {
  const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}`,
    { headers: FRED_CSV_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`FRED ${id}: HTTP ${r.status}`);
  const rows = (await r.text()).trim().split('\n').slice(1)
    .map(l => { const [d, v] = l.split(','); return { date: d, value: parseFloat(v) }; })
    .filter(o => Number.isFinite(o.value));
  if (!rows.length) throw new Error(`FRED ${id}: empty series`);
  return rows;
}
