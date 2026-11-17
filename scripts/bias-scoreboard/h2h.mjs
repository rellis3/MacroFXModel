// Desk Bias Process head to head (plans/DESK_BIAS_PROCESS_SPEC.md; forge/BIAS_SCOREBOARD_PREREG.md amendment A4).
// Logic in js/deskBiasH2H.js (pure, tested). Reads stored records only; nothing is re-issued.
//
//   node scripts/bias-scoreboard/h2h.mjs --api <server base url> [--write]
//        reads /api/desk-bias-process?dump=1 and /api/direction-ledger?sameday=1&dump=1; bars from OANDA M5 bid/ask/mid
//        (OANDA_KEY, OANDA_ENV=practice|live), so every fill pays its own minute's spread
//   node scripts/bias-scoreboard/h2h.mjs --dir <folder> [--write]
//        <folder>/process/desk_bias_process_<D>.json, <folder>/sameday/<D>_<source>.json, <folder>/bars/<MARKET>.json
//        (bars: [{ t (open ms), o, h, l, c, sp? }], 5-minute)
// --write puts H2H.md and h2h.json in analysis/output/bias-scoreboard/h2h/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { headToHead, processCalls, ledgerCalls, H2H_VERSION } from '../../js/deskBiasH2H.js';
import { DESK_NAME } from '../../js/biasForecasters.js';
import { OANDA } from '../../js/deskBiasProcess.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const baselines = JSON.parse(fs.readFileSync(path.join(here, '../../js/biasScoreboardBaselines.json'), 'utf8'));
const M5 = 5 * 60_000;

/** OANDA M5 candles with mid OHLC and the bar's closing spread (ask.c - bid.c), [fromMs, toMs). */
export async function oandaBars(instrument, fromMs, toMs, { key = process.env.OANDA_KEY, env = process.env.OANDA_ENV || 'live' } = {}) {
  const base = env === 'practice' ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com', out = [];
  for (let from = fromMs; from < toMs;) {
    const u = `${base}/v3/instruments/${instrument}/candles?granularity=M5&price=MBA&from=${new Date(from).toISOString()}&count=5000`;
    const r = await fetch(u, { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error(`OANDA ${instrument} ${r.status}`);
    const cs = ((await r.json()).candles ?? []).filter(c => c.complete && c.mid);
    if (!cs.length) break;
    for (const c of cs) { const t = Date.parse(c.time); if (t >= toMs) break; out.push({ t, o: +c.mid.o, h: +c.mid.h, l: +c.mid.l, c: +c.mid.c, sp: c.ask && c.bid ? +c.ask.c - +c.bid.c : null }); }
    const last = Date.parse(cs.at(-1).time) + M5;
    if (last <= from) break;
    from = last;
  }
  return out;
}

export function markdown(H) {
  const f = (x, k = 3) => (x == null || !Number.isFinite(x) ? '—' : (+x).toFixed(k));
  const ci = c => (c ? `[${f(c[0])}, ${f(c[1])}]` : '—');
  const L = [`# Desk Bias Process head to head (${H.version})`, '', `${H.days} days (${H.first} → ${H.last}); shared market-days ${H.sharedMarketDays} on ${H.sharedDays} days. ${H.note}`, '',
    '## Shared market-days (every competitor has a record)', '',
    '| competitor | records | speaking | neutral share | hit d21 | B0 | excess [95%] | hit n07 | trades | mean R net [95%] | total R net | win |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  const row = (c, b) => `| ${c} | ${b.records} | ${b.speaking} | ${f(b.neutralShare)} | ${f(b.hits.d21.hit)} | ${f(b.hits.d21.b0)} | ${f(b.hits.d21.excess)} ${ci(b.hits.d21.excessCi)} | ${f(b.hits.n07.hit)} | ${b.R.trades} | ${f(b.R.meanRnet)} ${ci(b.R.meanRnetCi)} | ${f(b.R.totalRnet, 2)} | ${f(b.R.win)} |`;
  for (const r of H.table) L.push(row(r.competitor, r.shared));
  L.push('', '## All of each competitor\'s own rows', '', L[6], L[7]);
  for (const r of H.table) L.push(row(r.competitor, r.all));
  L.push('', '## Calibration: d21 hit rate by conviction (all rows)', '');
  for (const r of H.table) L.push(`- ${r.competitor}: ${Object.entries(r.all.calibration).map(([k, v]) => `${k}: ${f(v.hit)} (n ${v.n})`).join('; ') || '—'}`);
  const o = H.override;
  L.push('', '## process-ai override record', '', `${o.n} override(s): the AI was better on ${o.aiBetter}, the system on ${o.systemBetter}; mean (AI − system) signed d21 move ${f(o.meanDiffSigma)} σ ${ci(o.diffCi)}.`);
  return L.join('\n') + '\n';
}

function readJsonDir(dir, re) { return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => re.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) : []; }

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  let proc = [], ledger = [], bars = {};
  if (arg('--dir')) {
    const d = arg('--dir');
    proc = readJsonDir(path.join(d, 'process'), /^desk_bias_process_\d{4}-\d{2}-\d{2}\.json$/);
    ledger = readJsonDir(path.join(d, 'sameday'), /^\d{4}-\d{2}-\d{2}_[a-z]+\.json$/);
    for (const f of fs.existsSync(path.join(d, 'bars')) ? fs.readdirSync(path.join(d, 'bars')) : []) if (f.endsWith('.json')) bars[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(d, 'bars', f), 'utf8'));
  } else if (arg('--api')) {
    const base = arg('--api').replace(/\/$/, '');
    proc = (await (await fetch(`${base}/api/desk-bias-process?dump=1`)).json()).records ?? [];
    ledger = (await (await fetch(`${base}/api/direction-ledger?sameday=1&dump=1`)).json()).records ?? [];
  } else { console.error('need --dir or --api'); process.exit(2); }
  const nameOf = DESK_NAME;
  const calls = [...processCalls(proc), ...ledgerCalls(ledger, nameOf)];
  // only the days the process has issued: the head to head starts with it (forward only)
  const first = proc.map(r => r.date).sort()[0];
  const kept = first ? calls.filter(c => c.date >= first) : [];
  if (!kept.length) { console.log('no Desk Bias Process issue stored yet: nothing to compare'); process.exit(0); }
  if (arg('--api')) {
    if (!process.env.OANDA_KEY) { console.error('OANDA_KEY is needed for the bars (or use --dir with bars/)'); process.exit(2); }
    const from = Date.parse(`${first}T00:00:00Z`) - 864e5, to = Math.min(Date.now(), Date.parse(`${kept.map(c => c.date).sort().at(-1)}T00:00:00Z`) + 4 * 864e5);
    for (const m of [...new Set(kept.map(c => c.market))]) if (OANDA[m]) bars[m] = await oandaBars(OANDA[m], from, to);
  }
  const b0 = Object.fromEntries(Object.entries(nameOf).map(([inst, m]) => [m, { d21: baselines.instruments?.[inst]?.d21?.p0 ?? 0.5, n07: baselines.instruments?.[inst]?.n07?.p0 ?? 0.5 }]));
  const H = { ...headToHead({ calls: kept, bars, b0, barMs: M5 }), version: H2H_VERSION, baselines: baselines.version };
  if (process.argv.includes('--write')) {
    const od = path.resolve(here, '../../analysis/output/bias-scoreboard/h2h');
    fs.mkdirSync(od, { recursive: true });
    fs.writeFileSync(path.join(od, 'h2h.json'), JSON.stringify(H, null, 1));
    fs.writeFileSync(path.join(od, 'H2H.md'), markdown(H));
    console.log('wrote', od);
  } else process.stdout.write(markdown(H));
}
