// Tests for js/rulesKeeper.js.   node js/rulesKeeper.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOT_BASIS, parseRegistry, bearing, assessBot, rulesReport } from './rulesKeeper.js';
import { DESK_EVIDENCE } from './deskEvidence.js';
import { parseRegister } from './theoryDesk.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const registry = parseRegistry(readFileSync(new URL('./botRegistry.js', import.meta.url), 'utf8'));

t('the registry parses: every bot with its key and paper flag', () => {
  assert.ok(registry.length >= 25); assert.ok(registry.some(r => r.key === 'oi_bot_status' && r.paper === true)); assert.ok(registry.some(r => r.key === 'bot_status' && r.paper === false));
});
t('every key in the map is a registry bot, every evidence id exists, every register id exists', () => {
  const ids = new Set(DESK_EVIDENCE.map(e => e.id)), rows = new Set(parseRegister(readFileSync(new URL('../plans/RESEARCH_REGISTER.md', import.meta.url), 'utf8')).map(r => r.id));
  for (const [k, b] of Object.entries(BOT_BASIS)) {
    assert.ok(registry.some(r => r.key === k), `${k} is not in botRegistry.js`);
    for (const e of b.evidence ?? []) assert.ok(ids.has(e), `${k}: no Evidence Book entry ${e}`);
    for (const r of b.register ?? []) assert.ok(rows.has(r), `${k}: no register row ${r}`);
  }
});
t('bearing: a null that says do not trade is against; validated supports', () => {
  assert.equal(bearing({ verdict: 'null', use: 'Do not trade a fade or a continuation at a Live Range line.' }), 'against');
  assert.equal(bearing({ verdict: 'validated', use: 'x' }), 'support');
  assert.equal(bearing({ verdict: 'underpowered', use: 'Do not trade' }), 'caution');
  assert.equal(bearing({ verdict: 'null', use: 'Treat QMR as an asymmetric-payoff day selector, not a direction forecast.' }), 'caution');
  assert.equal(bearing({ verdict: 'null', use: 'Meta-labelling closed for good on this book.' }), 'caution');
});
const evidence = [{ id: 'live-range-line-race', verdict: 'null', date: '2026-01-01', use: 'Do not trade a fade or a continuation at a Live Range line.' }, { id: 'conviction-vote', verdict: 'null', date: '2026-10-30', use: 'Do not scale size by a vote that has not been scored.' }, { id: 'iv-regime-fade-follow', verdict: 'null', date: '2026-01-01', use: 'Vote Atlas is dead regardless.' }];
const rows = [{ id: 'atlas-honest-gonogo', status: 'REGISTERED', next: 'needs bid/ask' }];
const now = Date.parse('2026-11-03T12:00:00Z');
t('a live Vote Atlas: tested-against and before-verdict are high; registry mismatch flagged; fresh verdict noted', () => {
  const b = assessBot({ key: 'volatility_bot_v2_status', label: 'Vote Atlas', paper: true }, { mode: 'live', running: true, generatedAt: '2026-11-03T11:58:00Z' }, { evidence, rows, now });
  const k = Object.fromEntries(b.flags.map(f => [f.kind, f.severity]));
  assert.equal(k['tested-against'], 'high'); assert.equal(k['before-verdict'], 'high'); assert.equal(k['mode-mismatch'], 'medium'); assert.equal(k['new-verdict'], 'low'); assert.ok(!k.silent);
});
t('on paper the same bot is medium/low; a silent bot and an unmapped live bot are flagged', () => {
  const p = assessBot({ key: 'volatility_bot_v2_status', label: 'Vote Atlas', paper: true }, { mode: 'paper', generatedAt: '2026-11-03T06:00:00Z' }, { evidence, rows, now });
  const k = Object.fromEntries(p.flags.map(f => [f.kind, f.severity]));
  assert.equal(k['tested-against'], 'medium'); assert.equal(k['before-verdict'], 'low'); assert.equal(k.silent, 'medium');
  const u = assessBot({ key: 'regime_bot_status', label: 'Regime V1', paper: false }, { pushed_at: now - 60_000 }, { evidence, rows, now });
  assert.deepEqual(u.flags.map(f => [f.kind, f.severity]), [['no-basis', 'medium']]); assert.match(u.flags[0].text, /no study on record.*It runs live/i);
  const x = assessBot({ key: 'unknown_status', label: 'X', paper: true }, { mode: 'paper', generatedAt: now }, { evidence, rows, now });
  assert.deepEqual(x.flags.map(f => [f.kind, f.severity]), [['no-basis', 'low']]);
  const m = assessBot({ key: 'signal_copier_status', label: 'Signal Copier', paper: true }, { mode: 'live', balance: 102088.28, account_login: 26365117, generatedAt: now }, { evidence, rows, now });
  assert.match(m.flags.find(f => f.kind === 'mode-mismatch').text, /balance 102,088, MT5 login 26365117.*demo account/);
  assert.equal(assessBot({ key: 'bot_status', label: 'MacroFX V1', paper: false }, null, { now }).flags.length, 0);
});
t('report sorts the worst first and counts', () => {
  const r = rulesReport([{ key: 'regime_bot_status', label: 'Regime V1', paper: false }, { key: 'volatility_bot_v2_status', label: 'Vote Atlas', paper: true }], { regime_bot_status: { pushed_at: now }, volatility_bot_v2_status: { mode: 'live', generatedAt: now } }, { evidence, rows, now });
  assert.equal(r.bots[0].label, 'Vote Atlas'); assert.equal(r.counts.high, 2); assert.equal(r.reporting, 2);
});
console.log(`rulesKeeper: ${n} tests passed`);
