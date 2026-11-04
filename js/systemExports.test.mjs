// Tests for js/systemExports.js.   node js/systemExports.test.mjs
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normaliseTrades, toolkitCsv, terminalCsv, parseTerminalCsv, tearsheet, systemFiles, london, TERMINAL_HEADER } from './systemExports.js';
import { writeSystemOutputs } from '../scripts/systems/writeSystemOutputs.mjs';
let n = 0; const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const FIX = new URL('../tests/fixtures/system_exports/', import.meta.url), fx = f => readFileSync(new URL(f, FIX), 'utf8');
const { trades } = normaliseTrades(JSON.parse(fx('trades.json')).trades);

await t('the CSVs match the fixtures (the Python writer is checked against the same files)', () => {
  for (const k of ['pct', 'r', 'cash']) assert.equal(toolkitCsv(trades, k), fx(`toolkit_${k}.csv`), k);
  assert.equal(terminalCsv(trades), fx('data_terminal.csv'));
  assert.equal(fx('data_terminal.csv').split('\n')[0], TERMINAL_HEADER.join(','));
  assert.equal(fx('toolkit_pct.csv').split('\n')[0], 'Date,Return %,MAE %');
});
await t('London time across BST, and the terminal CSV round-trips', () => {
  assert.deepEqual(london(Date.parse('2025-07-01T07:00:00Z')), ['2025-07-01', '08:00']);
  assert.deepEqual(london(Date.parse('2025-01-02T13:00:00Z')), ['2025-01-02', '13:00']);
  const back = parseTerminalCsv(fx('data_terminal.csv'));
  assert.equal(back.trades.length, 3); assert.equal(back.trades[1].exitMs, trades[1].exitMs); assert.equal(back.trades[1].R, -1); assert.equal(back.trades[1].notes, 'stop, then "gap"');
  assert.equal(terminalCsv(back.trades).split('\n').slice(1, 3).join('\n').replace(/entry[^\n]*/, ''), fx('data_terminal.csv').split('\n').slice(1, 3).join('\n').replace(/entry[^\n]*/, ''));
  assert.match(parseTerminalCsv('a,b\n1,2').errors[0], /not a Data Terminal CSV/);
});
await t('normalise: returnPct-only trades, bad rows reported', () => {
  const r = normaliseTrades([{ instrument: 'NQ', side: 'sell', exitMs: 1, returnPct: -0.5, riskPct: 0.5 }, { instrument: 'X', exitMs: 2, R: 1 }]);
  assert.equal(r.trades[0].R, -1); assert.equal(r.trades[0].direction, 'Short'); assert.equal(r.errors.length, 1);
});
await t('tearsheet: the standard battery plus breakdowns', () => {
  const many = [];
  for (let i = 0; i < 200; i++) many.push({ instrument: i % 2 ? 'EURUSD' : 'GOLD', direction: i % 3 ? 'Long' : 'Short', exitMs: Date.parse('2024-01-02T12:00:00Z') + i * 864e5 * 2, R: i % 3 === 0 ? -1 : 1.2, maeR: -0.5 });
  const ts = tearsheet(normaliseTrades(many).trades, { costR: 0.05 });
  assert.ok(ts.ok); for (const k of ['winRate', 'expectancy', 'profitFactor', 'sharpe', 'sortino', 'calmar', 'maxDD', 'bootstrap', 'montecarlo']) assert.ok(k in ts.perTrade, k);
  for (const k of ['sharpe', 'cagr', 'maxDD']) assert.ok(k in ts.portfolio, k);
  assert.deepEqual(Object.keys(ts.byYear), ['2024', '2025']); assert.equal(Object.keys(ts.byInstrument).length, 2); assert.ok(ts.rMultiples.monteCarlo.ok); assert.ok(ts.costs.ok);
  assert.equal(tearsheet([]).ok, false);
});
await t('the writer puts every standard file in the system folder', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sys-')), r = await writeSystemOutputs('fixture-sys', JSON.parse(fx('trades.json')).trades, { model: 'Test' }, { dir });
  assert.deepEqual(readdirSync(dir).sort(), ['data_terminal.csv', 'tearsheet.json', 'toolkit_cash.csv', 'toolkit_pct.csv', 'toolkit_r.csv', 'trades.json']);
  assert.equal(r.trades, 3); assert.equal(readFileSync(path.join(dir, 'toolkit_r.csv'), 'utf8'), fx('toolkit_r.csv'));
  await assert.rejects(writeSystemOutputs('Bad Id', [], {}, { dir }));
  assert.ok(Object.keys(systemFiles('x', trades)).includes('data_terminal.csv'));
});
console.log(`systemExports: ${n} tests passed`);
