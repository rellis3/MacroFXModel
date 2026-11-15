// node js/terminal/kchartCore.test.mjs: the Chart tab's pure half (bar mapping, the pinned library, indicators, level lines, theme styles).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { KLINE, periodFor, INDICATORS, toKline, precisionFor, newerThan, levelsFromDay, styleFor, TOKENS, cleanSymbol, NEAR, validateSettings, defaultSettings, describeSettings, loadSettings, saveSettings, settingsFor, SETTINGS_KEY } from './kchartCore.js';
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
ok(!('DRAWINGS' in await import('./kchartCore.js')), 'drawing tools are gone');

// indicator settings: ranges, validation, what the library gets, the legend, what this browser remembers
const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, m }; };
for (const i of INDICATORS) { const r = validateSettings(i.id, i.defaults); ok(r.ok && r.values.join() === i.defaults.join(), `${i.id}: the library's own defaults are valid settings`); ok(i.fields.length >= i.defaults.length, `${i.id}: a field per default number`); }
ok(validateSettings('EMA', { p1: '9', p2: '21', p3: '' }).values.join() === '9,21', 'a blank optional line is dropped');
ok(validateSettings('EMA', { p1: ' 9 ', p2: '21', p3: '50' }).values.join() === '9,21,50', 'up to three EMA lines, spaces trimmed');
ok(validateSettings('MA', { p1: '5', p2: '10', p3: '30', p4: '60' }).values.length === 4, 'MA takes up to four lines');
ok(!validateSettings('EMA', { p1: '', p2: '21' }).ok && /Line 1 is needed/.test(validateSettings('EMA', { p1: '' }).errors[0]), 'line 1 is always needed');
ok(/between 1 and 250/.test(validateSettings('MA', { p1: '0' }).errors[0]) && /between 1 and 250/.test(validateSettings('MA', { p1: '251' }).errors[0]), 'MA range 1 to 250 is enforced both ends');
ok(/whole number/.test(validateSettings('RSI', { p1: '14.5' }).errors[0]) && /must be a number/.test(validateSettings('RSI', { p1: 'abc' }).errors[0]) && /between 2 and 200/.test(validateSettings('RSI', { p1: '1' }).errors[0]), 'RSI: whole numbers, 2 to 200, words for the mistake');
ok(validateSettings('RSI', { p1: '14' }).values.join() === '14', 'RSI with one period');
ok(validateSettings('BOLL', { period: '20', width: '2.5' }).values.join() === '20,2.5' && !validateSettings('BOLL', { period: '20', width: '9' }).ok && !validateSettings('BOLL', { period: '1', width: '2' }).ok && !validateSettings('BOLL', { period: '20', width: '' }).ok, 'Bollinger: bars 2 to 200, width 0.5 to 5 with decimals, both needed');
ok(validateSettings('BOLL', { period: '20', width: '2.456' }).values[1] === 2.46, 'a long decimal is rounded to two places');
ok(validateSettings('MACD', { fast: '8', slow: '21', signal: '5' }).values.join() === '8,21,5' && /smaller than slow/.test(validateSettings('MACD', { fast: '26', slow: '12', signal: '9' }).errors[0]) && /smaller than slow/.test(validateSettings('MACD', { fast: '12', slow: '12', signal: '9' }).errors[0]), 'MACD: fast must be below slow');
ok(!validateSettings('MACD', { fast: '12', slow: '26' }).ok && !validateSettings('NOPE', {}).ok, 'a missing MACD signal and an unknown indicator are refused');
ok(validateSettings('EMA', [9, 21]).ok && !validateSettings('EMA', [9, 21, 50, 80]).ok && !validateSettings('BOLL', [20]).ok, 'the stored (array) form is checked the same way, and extra values are refused');
ok(describeSettings('EMA', [6, 12, 20]) === 'EMA 6 / 12 / 20' && describeSettings('BOLL', [20, 2]) === 'BOLL 20 bars, 2 std devs' && describeSettings('MACD', null) === 'MACD 12 / 26 / 9', 'the legend line, defaults when nothing is set');
ok(defaultSettings('MA').join() === '5,10,30,60' && defaultSettings('NOPE').length === 0, 'defaults');
{ // persistence
  const st = memStore();
  ok(Object.keys(loadSettings(st)).length === 0 && Object.keys(loadSettings(null)).length === 0, 'nothing stored: no settings');
  ok(saveSettings(st, { EMA: [9, 21], MA: [5, 10, 30, 60] }) === true, 'saved');
  const raw = JSON.parse(st.getItem(SETTINGS_KEY)); ok(raw.EMA.join() === '9,21' && !('MA' in raw), 'only what differs from the default is stored');
  const back = loadSettings(st); ok(back.EMA.join() === '9,21' && settingsFor(back, 'EMA').join() === '9,21' && settingsFor(back, 'RSI').join() === '6,12,24', 'read back; untouched indicators use the defaults');
  saveSettings(st, { EMA: [6, 12, 20] }); ok(st.getItem(SETTINGS_KEY) === null, 'resetting everything to default clears the key');
  st.setItem(SETTINGS_KEY, '{not json'); ok(Object.keys(loadSettings(st)).length === 0, 'a corrupt store is ignored');
  st.setItem(SETTINGS_KEY, JSON.stringify({ EMA: [0, 5], RSI: [14], MACD: [26, 12, 9], BOLL: 'x', ZZZ: [1] })); const l = loadSettings(st);
  ok(!('EMA' in l) && l.RSI.join() === '14' && !('MACD' in l) && !('BOLL' in l) && !('ZZZ' in l), 'invalid or unknown entries are dropped one by one, valid ones kept');
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  ok(Object.keys(loadSettings(bad)).length === 0 && saveSettings(bad, { EMA: [9] }) === false, 'a blocked store never throws');
}

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
