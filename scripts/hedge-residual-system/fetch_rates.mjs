// hedge-residual-system: daily central-bank policy rates from the BIS (WS_CBPOL, keyless), for the carry cell.
// Prereg: forge/HEDGE_RESIDUAL_SYSTEM_PREREG.md.
//
// Usage: NODE_USE_ENV_PROXY=1 node scripts/hedge-residual-system/fetch_rates.mjs
// Writes data/hedge-residual-system/rates.json = { CCY: [[date, pct], ...] } plus sha256 in manifest_rates.json.
// Policy rates are announced, never revised; the study reads the value of calendar day D-1 for a decision at the
// 17:00 New York close of session D (prereg §3), so no announcement after the decision is used.
import fs from 'node:fs';
import crypto from 'node:crypto';

const AREAS = { USD: 'US', EUR: 'XM', GBP: 'GB', JPY: 'JP', AUD: 'AU', NZD: 'NZ', CAD: 'CA' };
const OUT = new URL('../../data/hedge-residual-system/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

const out = {}, man = {};
for (const [ccy, ref] of Object.entries(AREAS)) {
  const url = `https://stats.bis.org/api/v1/data/WS_CBPOL/D.${ref}/all?format=csv&startPeriod=2014-01-01&endPeriod=2026-08-21`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${ccy}: HTTP ${r.status}`);
  const txt = await r.text();
  const lines = txt.trim().split('\n');
  const head = lines[0].split(',');
  const iT = head.indexOf('TIME_PERIOD'), iV = head.indexOf('OBS_VALUE');
  const rows = [];
  for (const ln of lines.slice(1)) {
    // TITLE / COMPILATION fields may hold quoted commas: read the two columns from the right-hand end
    const cells = ln.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(c => c.replace(/,$/, ''));
    const t = cells[iT], v = Number(cells[iV]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(t) && Number.isFinite(v)) rows.push([t, v]);
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  out[ccy] = rows;
  man[ccy] = { url, rows: rows.length, first: rows[0]?.[0], last: rows.at(-1)?.[0], sha256: crypto.createHash('sha256').update(txt).digest('hex') };
  console.log(ccy, rows.length, rows[0], rows.at(-1));
}
// EUR: the BIS euro-area series is the main refinancing rate, which sat at 0 while overnight money traded near the
// deposit rate (-0.40 to -0.50) in 2016-22. The ECB deposit facility rate (FRED ECBDFR, daily, never revised) is the
// rate a euro position is financed near, so it replaces the BIS series for EUR (prereg §3).
{
  const url = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=ECBDFR&cosd=2014-01-01&coed=2026-08-21';
  const r = await fetch(url); if (!r.ok) throw new Error(`ECBDFR: HTTP ${r.status}`);
  const txt = await r.text();
  const rows = txt.trim().split('\n').slice(1).map(l => l.split(',')).filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Number(v)) && v !== '').map(([d, v]) => [d, Number(v)]);
  man.EUR_BIS = man.EUR; out.EUR_BIS = out.EUR;
  out.EUR = rows;
  man.EUR = { url, rows: rows.length, first: rows[0]?.[0], last: rows.at(-1)?.[0], sha256: crypto.createHash('sha256').update(txt).digest('hex') };
  console.log('EUR (ECBDFR)', rows.length, rows[0], rows.at(-1));
}
fs.writeFileSync(new URL('rates.json', OUT), JSON.stringify(out));
fs.writeFileSync(new URL('manifest_rates.json', OUT), JSON.stringify(man, null, 1));
