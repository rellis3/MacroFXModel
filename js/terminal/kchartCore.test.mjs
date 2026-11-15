// node js/terminal/kchartCore.test.mjs: the Chart tab's pure half (bar mapping, the pinned library, indicators, level lines, theme styles).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { KLINE, periodFor, INDICATORS, DRAWINGS, toKline, precisionFor, newerThan, levelsFromDay, styleFor, TOKENS, cleanSymbol, NEAR } from './kchartCore.js';
import { TF_KEYS } from '../deskBarsCore.js';
import { INSTRUMENTS } from '../replayCore.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// the pinned library: exact version, jsDelivr, an integrity hash, Apache-2.0
ok(/^\d+\.\d+\.\d+$/.test(KLINE.version) && KLINE.url.includes(`klinecharts@${KLINE.version}/`) && KLINE.url.startsWith('https://cdn.jsdelivr.net/npm/') && /^sha384-[A-Za-z0-9+/]{64}$/.test(KLINE.integrity) && KLINE.license === 'Apache-2.0', 'pinned: exact version on jsDelivr, a sha384 integrity hash, Apache-2.0');

// every timeframe pill has a period
for (const tf of TF_KEYS) ok(periodFor(tf).span > 0 && ['minute', 'hour'].includes(periodFor(tf).type), `${tf} has a library period`);
ok(periodFor('15m').type === 'minute' && periodFor('4h').type === 'hour' && periodFor('4h').span === 4 && periodFor('nope').type === 'hour', 'periods');

// bars
const bars = [{ time: 200, open: 2, high: 3, low: 1, close: 2.5 }, { time: 100, open: 1, high: 2, low: 0.5, close: 1.5 }, { time: 'x', open: 1, high: 1, low: 1, close: 1 }, { time: 300, open: 1, high: null, low: 1, close: 1 }, null, { time: 400, open: 1, high: 2, low: 1, close: 1.5, volume: 7 }];
const k = toKline(bars);
ok(k.length === 3 && k[0].timestamp === 100000 && k[1].timestamp === 200000 && k[2].volume === 7 && !('volume' in k[0]), 'bars: seconds to ms, sorted, bad rows dropped, volume only when present');
ok(toKline(null).length === 0 && toKline([]).length === 0, 'no bars is fine');
ok(newerThan(k, 200000).length === 2 && newerThan(k, null).length === 3 && newerThan(k, 999999).length === 0, 'a refresh re-sends the last held bar and everything after it');
ok(precisionFor('NQ', 27000) === INSTRUMENTS.NQ.dp && precisionFor('ZZZ', 1.12) === 5 && precisionFor('ZZZ', 150) === 3 && precisionFor('ZZZ', 4000) === 2 && precisionFor('ZZZ', null) === 2, 'price decimals');

// the toolbar's catalogue
ok(INDICATORS.map(i => i.id).join() === 'MA,EMA,BOLL,RSI,MACD' && INDICATORS.every(i => i.label && i.note), 'indicators asked for: MA, EMA, BOLL, RSI, MACD (no volume: the bars have none)');
ok(DRAWINGS.length >= 5 && DRAWINGS.every(d => d.id && d.label), 'drawing tools');

// levels from a Replay day payload
const HOUR = 3600e3, start = Date.parse('2026-11-16T00:00:00Z'), end = start + 24 * HOUR, now = start + 6 * HOUR;
const m1 = []; for (let i = 0; i < 360; i++) { const t = start + i * 60e3, p = 100 + Math.sin(i / 30) * 2; m1.push([t, p, p + 0.2, p - 0.2, p + 0.05]); }
const day = { ok: true, bars: m1, win: { date: '2026-11-16', start, end }, forecast: { hl_median: 1, hl_75: 1.5, knownFrom: start }, dawn: { tone: 'bullish', rating: 'medium', finishedMs: start + 7 * HOUR },
  oi: { entries: [{ savedAtMs: start - HOUR, spot: 100, callWalls: [{ strike: 101, oi: 50 }, { strike: 140, oi: 90 }], putWalls: [{ strike: 99, oi: 40 }], maxPain: 100.5 }] } };
const L = levelsFromDay(day, now);
ok(L.ok && L.price > 0, 'lines read');
ok(L.lines.some(l => l.id === 'open') && L.lines.some(l => l.id === 'sess:hi') && L.lines.some(l => l.id === 'sess:lo'), 'open and the session range so far');
ok(L.lines.filter(l => l.kind === 'oi').every(l => Math.abs(l.price / L.price - 1) <= NEAR), 'option walls only within 3% of price (the 140 wall is not drawn)');
ok(L.lines.some(l => l.kind === 'oi' && l.price === 101) && L.lines.some(l => l.kind === 'fc'), 'a near wall and the forecast lines are drawn');
ok(L.lines.filter(l => l.kind === 'fc').every(l => l.tone === 'gold') && L.lines.filter(l => l.kind === 'oi').every(l => l.tone === 'pur2') && L.lines.every(l => TOKENS.includes(l.tone)), 'colour says what a line is, from the token set');
ok(/Dawn read: bullish, medium, written 0\d:\d\d London/.test(L.dawn) && /not a tested signal/.test(L.dawn), 'the dawn read is a chip, worded as a description');
ok(!/buy|sell|will rise|will fall/i.test(JSON.stringify(L)), 'no direction or trade wording in the lines');
const early = levelsFromDay(day, start - HOUR);
ok(early.ok && !early.lines.some(l => l.kind === 'fc'), 'before the session open there is no forecast line (nothing known yet)');
ok(levelsFromDay({ ok: false }, now).ok === false && levelsFromDay(null, now).lines.length === 0 && levelsFromDay({ ok: true, bars: [], win: {} }, now).ok === false, 'no data: an honest empty answer');
ok(levelsFromDay({ ...day, dawn: null }, now).dawn === null, 'no dawn read, no chip');

// themes
const s = styleFor({ up: '#0a0', dn: '#a00', tx2: '#888', tx3: '#666', line: '#222', bg1: '#000', pur2: '#80f', gold: '#fa0' });
ok(s.candle.bar.upColor === '#0a0' && s.candle.bar.downColor === '#a00' && s.grid.horizontal.color === '#222' && s.indicator.lines[0].color === '#80f' && s.crosshair.vertical.text.backgroundColor === '#888', 'a token map becomes the library styles');
ok(styleFor({}).candle.bar.upColor === 'gray' && styleFor(null).xAxis.tickText.color === 'gray', 'missing tokens paint grey, never undefined');
const hex = JSON.stringify(styleFor({ up: 'rgb(1,2,3)' })); ok(hex.includes('rgb(1,2,3)'), 'any CSS colour string passes through');
ok(cleanSymbol('eur/usd', w => w === 'EURUSD') === 'EURUSD' && cleanSymbol('zzz', () => false) === null, 'symbols');

// the page and the registry: licence record is honest
const notice = fs.readFileSync(path.join(ROOT, 'js/terminal/kchartCore.js'), 'utf8');
ok(/Apache-2\.0/.test(notice) && /NOT used: its last release is 2023/.test(notice), 'the verification is recorded beside the code');
console.log(`kchartCore: ${n} checks OK`);
