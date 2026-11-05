// Tests for js/deskBookPine.js.   node js/deskBookPine.test.mjs
import assert from 'node:assert/strict';
import { pineForCard, pineForBook, csvForBook, CSV_COLUMNS, pineText, px, LABEL } from './deskBookPine.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const L = { open: 157.92, up: { p50: 158.25, p75: 158.55, p90: 158.9 }, down: { p50: 157.57, p75: 157.27, p90: 156.95 } };
const short = { rating: 'SHORT', conviction: 'high', size: 1.02, levels: L, why: 'BoJ "jawboning" risk;\nyields, falling', plan: { zone: 'Sell rallies into 158.27-158.55', invalidation: 'Close back above 158.45-158.92', timing: 'London' } };
const flat = { rating: 'FLAT', conviction: 'low', size: 0, levels: { open: 1.1, up: { p50: 1.104, p75: 1.107, p90: 1.11 }, down: { p50: 1.096, p75: 1.093, p90: 1.09 } }, why: 'nothing', plan: { zone: '1.0950-1.0970', invalidation: 'below 1.0900' } };
const date = '2026-11-05';

t('one card: the day clock in London time, every line at its price', () => {
  const s = pineForCard('USDJPY', short, { date, oandaSymbol: 'USD_JPY' });
  assert.match(s, /^\/\/@version=6/);
  assert.match(s, /timestamp\("Europe\/London", 2026, 11, 5, 8, 0\)/);
  assert.match(s, /timestamp\("Europe\/London", 2026, 11, 5, 21, 0\)/);
  assert.match(s, /OANDA:USDJPY/);
  for (const v of ['157.92', '158.25', '158.55', '158.9', '157.27', '156.95']) assert.ok(s.includes(`lvl(${v},`), v);
  assert.match(s, /lvl\(157\.57, cTg, line\.style_solid, 3, "first target \(down p50\)"\)/);   // the short's first target, heavier
  assert.match(s, /box\.new\(t8, 158\.55, t21, 158\.27, xloc = xloc\.bar_time/);                // the entry zone, 08:00-21:00
  assert.match(s, /lvl\(158\.45, cInv, line\.style_solid, 2, "invalid"\)/);                      // the invalidation, red
  assert.ok(s.includes(LABEL));
});

t('the why is escaped: no raw quotes or line breaks inside a Pine string', () => {
  const s = pineForCard('USDJPY', short, { date });
  const lab = s.split('\n').find(l => l.includes('label.new(t8'));
  assert.ok(lab.includes("BoJ 'jawboning' risk; yields, falling"));
  assert.equal(pineText('a"b\\c\nd'), "a'b/c d");
  assert.ok(pineText('x'.repeat(300)).length <= 140);
  assert.equal((lab.match(/"/g) ?? []).length % 2, 0);   // every string literal is closed
});

t('a FLAT card draws the lines only: no zone, no invalidation, no target', () => {
  const s = pineForCard('EURUSD', flat, { date });
  assert.ok(s.includes('lvl(1.104, cUp'));
  assert.ok(!s.includes('box.new'));
  assert.ok(!s.includes('"invalid"'));
  assert.ok(!s.includes('first target'));
});

t('the book script: auto-detects the chart, with a manual pick', () => {
  const s = pineForBook({ instruments: { USDJPY: short, EURUSD: flat, GOLD: { ...short, levels: { open: 4000, up: { p50: 4020 }, down: { p50: 3980 } }, plan: {} } } }, { date });
  assert.match(s, /input\.string\("auto", .*options = \["auto", "EURUSD", "GOLD", "USDJPY"\]\)/);
  assert.match(s, /tk == "XAUUSD"/);
  assert.match(s, /rt == "GC"/);
  assert.match(s, /if inst == "USDJPY"\n {8}lvl\(157\.92/);
  assert.equal((s.match(/box\.new/g) ?? []).length, 1);
  assert.ok(px(1e-7) === '0' && px(1.10000) === '1.1');
});

t('CSV: a header and one row per card, with the plan columns', () => {
  const csv = csvForBook({ instruments: { USDJPY: short, EURUSD: flat } }, { date }).trim().split('\n');
  assert.equal(csv.length, 3);
  assert.equal(csv[0], CSV_COLUMNS.join(','));
  const usd = csv.find(r => r.includes('USDJPY'));
  assert.equal(usd, '2026-11-05,USDJPY,SHORT,1.02,high,158.27,158.55,158.45,157.57,158.25,158.55,158.9,157.57,157.27,156.95,157.92,"BoJ ""jawboning"" risk; yields, falling"');
  const eur = csv.find(r => r.includes('EURUSD')).split(',');
  assert.equal(eur.length, CSV_COLUMNS.length);
  assert.equal(eur[5], ''); assert.equal(eur[7], '');   // FLAT: no zone, no invalidation
});
console.log(`deskBookPine: ${n} tests passed`);
