// fiscal-event-reaction step 3: OANDA mid M1 for each event window and its 8 control days (prereg §3).
// Read-only OANDA candles; cache data/fiscal_history/prices/<instrument>/<YYYY-MM-DD>_<HHMM>_<tz>.json.
//   OANDA_KEY=... [OANDA_ENV=practice] node scripts/fiscal-event-reaction/fetch_prices.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UK_EVENTS, zonedMs } from './events.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'data', 'fiscal_history');
const BASE = process.env.OANDA_ENV === 'live' ? 'https://api-fxtrade.oanda.com' : 'https://api-fxpractice.oanda.com';
const KEY = process.env.OANDA_KEY;


export const INSTRUMENTS = { GB: ['UK10YB_GBP', 'GBP_USD', 'UK100_GBP'], US: ['USB10Y_USD', 'USB02Y_USD', 'USB30Y_USD'] };
export const N_CONTROLS = 8;

export function usEvents() {
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
  return Object.values(manifest.us).filter(m => m.status === 'ok').map(m => ({
    id: m.id, country: 'US', date: m.date, clock: '08:30', tz: 'America/New_York', windowMin: 90,
    t0: zonedMs(m.date, '08:30', 'America/New_York'), href: m.href, year: m.year, q: m.q,
  })).sort((a, b) => a.date.localeCompare(b.date));
}

const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/** The 8 preceding same-weekday dates that are not themselves events. */
export function controlDates(ev, eventDates) {
  const out = [];
  for (let w = 1; out.length < N_CONTROLS && w <= 20; w++) {
    const d = addDays(ev.date, -7 * w);
    if (!eventDates.has(d)) out.push(d);
  }
  return out;
}

export function cachePath(ins, date, clock, tz) {
  return path.join(DIR, 'prices', ins, `${date}_${clock.replace(':', '')}_${tz.split('/')[1]}.json`);
}

async function fetchWindow(ins, date, clock, tz, windowMin) {
  const f = cachePath(ins, date, clock, tz);
  if (fs.existsSync(f)) return 'cached';
  const t0 = zonedMs(date, clock, tz);
  const from = new Date(t0 - 15 * 60e3).toISOString(), to = new Date(t0 + (windowMin + 5) * 60e3).toISOString();
  const url = `${BASE}/v3/instruments/${ins}/candles?price=M&granularity=M1&from=${from}&to=${to}`;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + KEY } });
    if (r.status === 429) { await new Promise(s => setTimeout(s, 2000 * (i + 1))); continue; }
    if (!r.ok) return 'http ' + r.status;
    const j = await r.json();
    const bars = (j.candles ?? []).filter(c => c.complete !== false).map(c => [Date.parse(c.time), +c.mid.o, +c.mid.h, +c.mid.l, +c.mid.c]);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(bars));
    return bars.length;
  }
  return 'rate limited';
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (!KEY) throw new Error('OANDA_KEY not set');
  const events = [...UK_EVENTS, ...usEvents()];
  const eventDates = { GB: new Set(UK_EVENTS.map(e => e.date)), US: new Set(usEvents().map(e => e.date)) };
  const jobs = [];
  for (const ev of events) {
    const dates = [ev.date, ...controlDates(ev, eventDates[ev.country])];
    for (const ins of INSTRUMENTS[ev.country]) for (const d of dates) jobs.push([ins, d, ev.clock, ev.tz, ev.windowMin]);
  }
  console.log(`${events.length} events, ${jobs.length} windows`);
  let done = 0, fails = 0;
  const POOL = 6;
  await Promise.all(Array.from({ length: POOL }, async () => {
    while (jobs.length) {
      const j = jobs.shift();
      const r = await fetchWindow(...j);
      if (typeof r === 'string' && r !== 'cached') { fails++; console.log('  fail', j.slice(0, 3).join(' '), r); }
      if (++done % 300 === 0) console.log(`  ${done} done, ${fails} failed`);
    }
  }));
  console.log(`done: ${done}, failed ${fails}`);
}
