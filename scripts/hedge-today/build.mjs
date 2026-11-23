#!/usr/bin/env node
// hedge-today: build the session panel from local M1 (read-only, no R2). Prereg: forge/HEDGE_TODAY_PREREG.md §3.1, §3.4.
//   node scripts/hedge-today/build.mjs [m1Dir]
// Output: analysis/output/hedge-today/panel.json
//   { keys, sessions: [London date], px: {KEY: [[P8..P17] per session, null = missing]}, daily: {dates, close: {KEY: [...]}}, event: {CCY: [0/1 per session]} }
import fs from 'node:fs';
import path from 'node:path';
import { loadM1ForPairLocal } from '../../js/localM1Loader.js';
import { nyCloseDailyBars } from '../../js/voteAtlasV4Lines.js';

const M1_DIR = process.argv[2] || path.resolve(process.cwd(), 'VolRangeForecaster/data/m1');
const START = '2016-01-04', END = '2026-07-02';
const KEYS = ['gold', 'nq', 'us30', 'us2000', 'de30', 'eurusd', 'gbpusd', 'usdjpy', 'usdchf', 'audusd', 'usdcad', 'nzdusd'];
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const OUT = new URL('../../analysis/output/hedge-today/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

// Europe/London offset without Intl per bar: BST from the last Sunday of March 01:00 UTC to the last Sunday of October 01:00 UTC.
const lastSun = (y, m) => { const d = new Date(Date.UTC(y, m + 1, 0)); return Date.UTC(y, m, d.getUTCDate() - d.getUTCDay(), 1) / 1000; };
const bst = {}; const bstOf = y => (bst[y] ??= [lastSun(y, 2), lastSun(y, 9)]);
export const londonOffsetSec = t => { const y = new Date(t * 1000).getUTCFullYear(), [a, b] = bstOf(y); return t >= a && t < b ? 3600 : 0; };

// the London weekday sessions in range
const sessions = []; for (let t = Date.parse(START + 'T12:00:00Z'); t <= Date.parse(END + 'T12:00:00Z'); t += 864e5) { const d = new Date(t); if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) sessions.push(d.toISOString().slice(0, 10)); }
const sIdx = new Map(sessions.map((d, i) => [d, i]));

const px = {}, dailyBy = {};
for (const k of KEYS) {
  const p = await loadM1ForPairLocal(k, M1_DIR);
  if (!p?.n) throw new Error(`no M1 for ${k}`);
  const grid = sessions.map(() => new Array(HOURS.length).fill(null));
  let hits = 0;
  for (let i = 0; i < p.n; i++) {
    const t = p.times[i], tl = t + londonOffsetSec(t), day = new Date(tl * 1000).toISOString().slice(0, 10);
    const si = sIdx.get(day); if (si == null) continue;
    const m = Math.floor((tl % 86400) / 60);   // London minute of day of the bar's open
    for (let j = 0; j < HOURS.length; j++) { const b = HOURS[j] * 60; if (m >= b - 5 && m < b) { grid[si][j] = p.closes[i]; hits++; } }
  }
  px[k] = grid;
  const days = nyCloseDailyBars(p).filter(b => b.n >= 60 && Number.isFinite(b.close) && b.close > 0 && b.key <= END)
    .filter(b => { const w = new Date(b.key + 'T12:00:00Z').getUTCDay(); return w >= 1 && w <= 5; });
  dailyBy[k] = new Map(days.map(b => [b.key, b.close]));
  const full = grid.filter(r => r[0] != null && r[9] != null).length;
  console.log(k, 'M1', p.n, 'sessions with P8 & P17', full, 'of', sessions.length, 'daily', days.length, days[0]?.key, '->', days.at(-1)?.key);
}
// daily: inner join (as hedge-method-comparison), from 2015 so the first session has its 250-day history
let ddates = [...dailyBy[KEYS[0]].keys()].filter(d => d >= '2015-01-01' && KEYS.every(k => dailyBy[k].has(d))).sort();
const dclose = {}; for (const k of KEYS) dclose[k] = ddates.map(d => dailyBy[k].get(d));

// calendar: Major releases inside 08:00-17:00 London, per currency per session (schedule only; values never read)
function parseCsvLine(s) { const o = []; let cur = '', q = false; for (let i = 0; i < s.length; i++) { const c = s[i]; if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ',') { o.push(cur); cur = ''; } else cur += c; } o.push(cur); return o; }
const raw = fs.readFileSync('calendar_events.csv', 'latin1').split(/\r?\n/); const head = parseCsvLine(raw[0]);
const iDt = head.indexOf('datetime_raw'), iC = head.indexOf('ccy'), iI = head.indexOf('impact');
const seen = new Set(), event = {}; let nMajor = 0;
for (const line of raw.slice(1)) {
  if (!line || seen.has(line)) continue; seen.add(line);
  const r = parseCsvLine(line); if (r[iI] !== 'Major' || !/\d{2}:\d{2}/.test(r[iDt] ?? '')) continue;
  const t = Date.parse(r[iDt].replace(' ', 'T') + 'Z') / 1000; if (!Number.isFinite(t)) continue;
  const tl = t + londonOffsetSec(t), day = new Date(tl * 1000).toISOString().slice(0, 10), si = sIdx.get(day); if (si == null) continue;
  const h = (tl % 86400) / 3600; if (h < 8 || h >= 17) continue;
  (event[r[iC]] ??= new Array(sessions.length).fill(0))[si] = 1; nMajor++;
}
console.log('Major in-session releases (deduped)', nMajor, Object.fromEntries(Object.entries(event).map(([c, a]) => [c, a.reduce((x, y) => x + y, 0)])));
fs.writeFileSync(new URL('panel.json', OUT), JSON.stringify({ keys: KEYS, hours: HOURS, sessions, px, daily: { dates: ddates, close: dclose }, event, m1Dir: M1_DIR, builtAt: new Date().toISOString() }));
console.log('sessions', sessions.length, sessions[0], '->', sessions.at(-1), '; daily common dates', ddates.length, ddates[0], '->', ddates.at(-1));
process.exit(0);
