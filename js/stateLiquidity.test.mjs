// node --test js/stateLiquidity.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summariseLiquidity, netLiquidityWeekly, weeklyStats, toWeekly, asOf } from './stateLiquidity.js';

const weds = n => { const out = []; let d = Date.UTC(2024, 0, 3); for (let i = 0; i < n; i++, d += 7 * 864e5) out.push(new Date(d).toISOString().slice(0, 10)); return out; };
const W = weds(120);
const raw = {
  WALCL: W.map((date, i) => ({ date, value: 7_000_000 - i * 5_000 })),        // $M, QT
  WTREGEN: W.map(date => ({ date, value: 800_000 })),                          // $M
  RRPONTSYD: W.map((date, i) => ({ date, value: Math.max(0, 500 - i * 5) })),  // $B
  WRESBAL: W.map(date => ({ date, value: 3_200_000 })),
  SWPT: W.map(date => ({ date, value: 100 })),
  TOTBKCR: W.map((date, i) => ({ date, value: 17_000 + i * 10 })),
};

test('net liquidity uses FRED units: WALCL $M − TGA $M − RRP $B → $bn', () => {
  const w = netLiquidityWeekly({ walcl: raw.WALCL, tga: raw.WTREGEN, rrp: raw.RRPONTSYD });
  assert.equal(w.length, 120);
  assert.equal(w[0].value, 7000 - 800 - 500);
  assert.equal(w[119].value, (7_000_000 - 119 * 5000) / 1000 - 800 - 0);
});

test('a TGA print older than 10 days drops the week instead of carrying a stale value', () => {
  const w = netLiquidityWeekly({ walcl: raw.WALCL, tga: raw.WTREGEN.slice(0, 10), rrp: raw.RRPONTSYD });
  assert.equal(w.length, 11);   // weeks 0-9, plus week 10 (7 days after the last TGA)
});

test('weekly stats: 4/13/52-week changes and all-history percentile', () => {
  const st = weeklyStats(raw.WALCL, 1 / 1000);
  assert.equal(st.chg4w, -20); assert.equal(st.chg13w, -65); assert.equal(st.chg52w, -260);
  assert.equal(st.pctAll, 0);
  assert.equal(st.since, '2024-01-03');
});

test('daily series are taken weekly (last print of the week to Wednesday)', () => {
  const daily = []; for (let i = 0; i < 21; i++) daily.push({ date: new Date(Date.UTC(2026, 9, 1) + i * 864e5).toISOString().slice(0, 10), value: i });
  const wk = toWeekly(daily);
  assert.ok(wk.length >= 3 && wk.length <= 4);
  assert.equal(wk.at(-1).value, 20);
  assert.equal(asOf(daily, '2026-10-05').value, 4);
});

test('the layer: rows, impulse, today estimate from DTS, evidence statuses, no unit warnings', () => {
  const tgaDaily = new Map([['2026-10-29', 850], ['2026-10-30', 870]]);
  const L = summariseLiquidity({ raw, tgaDaily });
  assert.deepEqual(L.warnings, []);
  assert.equal(L.net.impulse, 'flat');            // 13w: −65 (WALCL) + 0 (RRP floored at 0) → −65
  assert.equal(L.net.today.tga, 870);
  assert.equal(L.net.today.tgaAsOf, '2026-10-30');
  assert.ok(['net', 'walcl', 'tga', 'tgaDaily', 'rrp', 'reserves', 'swaps', 'bankCredit'].every(id => L.rows.some(r => r.id === id)));
  assert.ok(L.rows.find(r => r.id === 'bankCredit').yoyPct > 0);
  assert.equal(L.evidence.find(e => e.id === 'net-liquidity-tailwind-spx').status, 'stands');
  assert.equal(L.evidence.find(e => e.id === 'net-liquidity-tailwind-spx').banked, 'underpowered');
});

test('nothing loaded → no rows, no net, no invented numbers', () => {
  const L = summariseLiquidity({});
  assert.equal(L.rows.length, 0); assert.equal(L.net, null);
});

test('TGA in $ billions by mistake is flagged', () => {
  const L = summariseLiquidity({ raw: { ...raw, WTREGEN: W.map(date => ({ date, value: 800 })) } });
  assert.ok(L.warnings.some(w => /WTREGEN/.test(w)));
});

test('BIS global dollar credit comes through from the server store, with each series labelled by its feed', () => {
  const bis = { latest: '2026-Q2', line: 'Bank credit 2026-Q2: …', source: 'BIS LBS', headline: { usdStockBn: 14000, usdG: 4.2, regime: 'expanding', nbfiG: 6, caymanUsdG: 3, yenOffshoreG: -1 }, usdHistory: [{ period: '2026-Q1', g: 3.9 }, { period: '2026-Q2', g: 4.2 }] };
  const L = summariseLiquidity({ raw, bis, via: { WALCL: 'FRED API' } });
  assert.equal(L.global.usdG, 4.2);
  assert.equal(L.global.usdHistory.length, 2);
  assert.equal(L.rows.find(r => r.id === 'walcl').via, 'FRED API');
  assert.equal(summariseLiquidity({ raw }).global, null);
});

import { summarisePlumbing } from './stateLiquidity.js';
test('plumbing: $ levels scaled to $bn, rates changed in bp, CP − fed funds spread', () => {
  const d = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * 864e5).toISOString().slice(0, 10));
  const P = summarisePlumbing({
    WMTSECL1: d.map((date, i) => ({ date, value: 2_600_000 - i * 100 })),      // $M
    DCPF3M: d.map((date, i) => ({ date, value: 4.0 + i * 0.001 })), EFFR: d.map(date => ({ date, value: 3.88 })),
    NFCI: d.map((date, i) => ({ date, value: -0.5 + i * 0.0001 })),
  });
  const c = P.rows.find(r => r.id === 'WMTSECL1');
  assert.ok(c.last > 2500 && c.last < 2600 && c.unit === '$bn');
  assert.equal(P.rows.find(r => r.id === 'DCPF3M').chgUnit, 'bp');
  assert.ok(P.cpSpread.last > 40 && P.cpSpread.unit === 'bp');
  assert.equal(P.rows.find(r => r.id === 'NFCI').chgUnit, 'pts');
  assert.equal(summarisePlumbing({}).rows.length, 0);
});
