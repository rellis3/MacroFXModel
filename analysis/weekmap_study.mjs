#!/usr/bin/env node
/**
 * W1 -- do the analogue weeks carry information? Design frozen in
 * MD files/WEEK_MAP.md. Also writes the current week map for inspection.
 *   node analysis/weekmap_study.mjs      (OANDA_KEY; FRED_KEY for the OAS series)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PANEL, placeboTest } from '../js/weekMap.js';
import { buildWeekMap } from '../js/weekMapBuild.js';
import { fetchD1 } from '../js/volBacktestEngine.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'output', 'weekmap_test.json');
async function fredCsv(id) { const t = await (await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`)).text(); return t.trim().split('\n').slice(1).map(l => { const [d, v] = l.split(','); return { date: d, value: parseFloat(v) }; }).filter(o => Number.isFinite(o.value)); }
async function fredApi(id) { const k = process.env.FRED_KEY; if (!k) return fredCsv(id); const j = await (await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${k}&file_type=json&observation_start=1990-01-01`)).json(); return (j.observations ?? []).map(o => ({ date: o.date, value: parseFloat(o.value) })).filter(o => Number.isFinite(o.value)); }
const raw = {};
for (const p of PANEL) {
  try {
    if (p.fred) raw[p.id] = p.keyed ? await fredApi(p.fred) : await fredCsv(p.fred);
    else if (p.nyfed === 'sofr99') { const j = await (await fetch(`https://markets.newyorkfed.org/api/rates/secured/sofr/search.json?startDate=2018-04-01&endDate=${new Date().toISOString().slice(0, 10)}`)).json(); raw[p.id] = (j.refRates ?? []).map(r => ({ date: r.effectiveDate, value: +r.percentPercentile99 })).filter(o => Number.isFinite(o.value)).sort((a, b) => a.date < b.date ? -1 : 1); }
    else if (p.oanda) raw[p.id] = (await fetchD1(p.oanda, 5000)).map(b => ({ date: b.date, value: b.close }));
    if (raw[p.id]) console.log(`  ${p.id.padEnd(9)} ${raw[p.id][0]?.date} → ${raw[p.id].at(-1)?.date} (${raw[p.id].length})`);
  } catch (e) { console.log(`  ${p.id} failed: ${e.message}`); }
}
const wm = buildWeekMap(raw);
console.log(`\nweek map as of ${wm.asOf}: ${wm.weeks} weeks; state series ${wm.stateIds.length}: ${wm.stateIds.join(', ')}`);
for (const [id, s] of Object.entries(wm.series)) if (!s.hidden) console.log(`  ${s.label.padEnd(16)} ${s.latest.change != null ? (s.latest.change >= 0 ? '+' : '') + s.latest.change.toFixed(s.kind === 'pct' ? 2 : 1) : '?'} ${s.kind === 'bp' ? 'bp' : s.kind === 'pct' ? '%' : s.kind === 'bn' ? '$bn' : 'pt'}  z ${s.latest.z != null ? (s.latest.z >= 0 ? '+' : '') + s.latest.z.toFixed(2) : '?'} ${s.latest.word}  (${s.years}y)`);
console.log('\nanalogues:', wm.analogues.map(a => `${a.week} (d ${a.distance})`).join(', '));
for (const [tg, o] of Object.entries(wm.outcomes)) console.log(`  ${tg}:`, Object.entries(o).map(([h, r]) => `${h}w median ${r.median} (uncond ${r.unconditional?.median}, p10 ${r.unconditional?.p10}, p90 ${r.unconditional?.p90})`).join(' | '));
// W1
const { states, series } = wm._internal;
const targets = Object.fromEntries(['spx', 'eurusd', 'gold'].filter(t => series[t]).map(t => [t, { vals: series[t].values, kind: series[t].kind }]));
console.log('\nW1 placebo test (walk-forward, 400 weeks, h=13, k=10, 200 placebo draws)…');
const w1 = placeboTest(states, targets, { weeks: 400, h: 13, k: 10, crowd: 8, reps: 200 });
for (const [t, r] of Object.entries(w1)) console.log(`  ${t.padEnd(7)} n=${r.n}  analogue hit ${r.hitRate}  unconditional ${r.unconditional}  placebo p05/p50/p95 ${r.placebo?.p05}/${r.placebo?.p50}/${r.placebo?.p95}  |err| analogue ${r.medErrAnalogue} vs uncond ${r.medErrUnconditional}  → ${r.verdict}`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), spec: 'MD files/WEEK_MAP.md#W1', asOf: wm.asOf, weeks: wm.weeks, stateIds: wm.stateIds, w1, analoguesNow: wm.analogues, outcomesNow: wm.outcomes }, null, 1));
console.log('written', OUT);
