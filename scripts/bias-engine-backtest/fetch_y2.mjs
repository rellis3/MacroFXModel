// bias-engine-backtest: fetch each currency's daily 2y government yield history from the SAME official free sources the
// live engine reads (js/yield2y.js fetchYield2y), back to ~2009, for the point-in-time policy-path proxy.
// Read-only public endpoints; no key, no cost, no R2. Market yields are not revised, so the latest file is the
// point-in-time series (the engine only ever reads points dated before the issue date).
//   node scripts/bias-engine-backtest/fetch_y2.mjs [CCY ...]
import { fetchYield2y, YIELD2Y_CCYS } from '../../js/yield2y.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const out = 'analysis/output/bias-engine-backtest/inputs';
mkdirSync(out, { recursive: true });
const want = process.argv.includes('--extras') ? [] : (process.argv.slice(2).length ? process.argv.slice(2) : YIELD2Y_CCYS);
const req = createRequire(process.env.XLSX_FROM ?? import.meta.url);
for (const c of want) {
  try {
    const pts = await fetchYield2y(c, { days: 6400, loadXlsx: async () => req('xlsx') });
    writeFileSync(`${out}/y2_${c}.json`, JSON.stringify({ ccy: c, fetchedAt: new Date().toISOString(), points: pts }));
    console.log(c, pts.length, pts[0]?.date, pts.at(-1)?.date);
  } catch (e) { console.log(c, 'FAIL', e.message); }
}

// ── extras: the same published series, earlier history than the live fetcher's window reaches ─────────────────────
//   EUR: the live ECB YC request with a longer timeout (the 17-year file is 2.5 MB).
//   CHF: SNB rendoblid (the fitted 2y spot cube; the live engine moved to rendoeid after rendoblid stopped 2025-07-31),
//        then rendoeid after that. Both published monthly; the runner applies that publication lag.
//   AUD: RBA F2 historical workbook f02dhist.xls (2009-2013), the same FCMYGBAG2D series.
import { parseEcbCsv, parseRbaF2, parseSnbRendoeid } from '../../js/yield2y.js';
if (process.argv.includes('--extras')) {
  const get = async (u, ms = 300000) => { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (research script)' }, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r; };
  const save = (c, pts, note) => { writeFileSync(`${out}/y2_${c}.json`, JSON.stringify({ ccy: c, fetchedAt: new Date().toISOString(), note, points: pts })); console.log(c, pts.length, pts[0]?.date, pts.at(-1)?.date, note); };
  const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!only.length || only.includes('EUR')) try { save('EUR', parseEcbCsv(await (await get('https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y?format=csvdata&startPeriod=2009-05-01')).text()), 'ECB YC SR_2Y'); } catch (e) { console.log('EUR FAIL', e.message); }
  if (!only.length || only.includes('CHF')) try {
    const t = await (await get('https://data.snb.ch/api/cube/rendoblid/data/csv/en')).text();
    const old = [];
    for (const l of t.split(/\r?\n/)) { const c = l.split(';').map(s => s.replace(/"/g, '').trim()); if (c.length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(c[0]) && c[1] === '2J' && c[2] !== '' && Number.isFinite(+c[2])) old.push({ date: c[0], value: +c[2] }); }
    let neu = [];
    try { neu = parseSnbRendoeid(await (await get('https://data.snb.ch/api/cube/rendoeid/data/csv/en?fromDate=2025-06-01')).text()); } catch (e) { console.log('CHF rendoeid FAIL', e.message); }
    const last = old.at(-1)?.date ?? '';
    save('CHF', [...old.filter(p => p.date >= '2009-01-01'), ...neu.filter(p => p.date > last)], 'SNB rendoblid 2J to its end, then rendoeid interpolated 2y');
  } catch (e) { console.log('CHF FAIL', e.message); }
  try {
    const X = createRequire(process.env.XLSX_FROM ?? import.meta.url)('xlsx');
    const buf = Buffer.from(await (await get('https://www.rba.gov.au/statistics/tables/xls-hist/f02dhist.xls')).arrayBuffer());
    const wb = X.read(buf, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames.find(n => /data/i.test(n)) ?? wb.SheetNames[0]];
    const rows = X.utils.sheet_to_json(ws, { header: 1, raw: true });
    const si = rows.findIndex(r => /^(Series ID|Mnemonic)$/.test(String(r?.[0]).trim())), ix = rows[si].indexOf('FCMYGBAG2D');
    const hist = [];
    for (const r of rows.slice(si + 1)) { const d = r?.[0]; const v = +r?.[ix]; if (d instanceof Date && Number.isFinite(v) && r[ix] !== '' && r[ix] != null) hist.push({ date: new Date(d.getTime() + 12 * 3600e3).toISOString().slice(0, 10), value: v }); }
    const cur = JSON.parse((await import('node:fs')).readFileSync(`${out}/y2_AUD.json`, 'utf8')).points;
    const first = cur[0]?.date ?? '9999';
    save('AUD', [...hist.filter(p => p.date >= '2009-01-01' && p.date < first), ...cur], 'RBA f02dhist (to 2013) + live F2');
  } catch (e) { console.log('AUD hist FAIL', e.message); }
  process.exit(0);
}
