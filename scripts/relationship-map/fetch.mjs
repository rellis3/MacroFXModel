// relationship-map: fetch the daily closes not already cached (Yahoo chart API, keyless). Writes
// analysis/output/relationship-map/data/px_<NAME>.csv (date,close). Dates: UTC date of the bar stamp + 12h (Yahoo stamps futures bars at the
// evening session start, 18:00 ET the day before; +12h lands every bar on its trade date). Run once: node scripts/relationship-map/fetch.mjs
import fs from 'node:fs';
const OUT = 'analysis/output/relationship-map/data';
const T = { DXY: 'DX-Y.NYB', BRENT: 'BZ=F', COPPER: 'HG=F' };
for (const [name, tk] of Object.entries(T)) {
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tk)}?period1=1104537600&period2=1787443200&interval=1d`;
  const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (research script)' } });
  const j = await r.json(); const res = j?.chart?.result?.[0];
  if (!res) { console.error(name, r.status, JSON.stringify(j).slice(0, 200)); process.exit(1); }
  const ts = res.timestamp, c = res.indicators.quote[0].close;
  const rows = ts.map((t, i) => [new Date((t + 43200) * 1000).toISOString().slice(0, 10), c[i]]).filter(([, v]) => v != null && v > 0);
  fs.writeFileSync(`${OUT}/px_${name}.csv`, 'date,close\n' + rows.map(r => r.join(',')).join('\n') + '\n');
  console.log(name, rows.length, rows[0][0], rows.at(-1)[0]);
}
