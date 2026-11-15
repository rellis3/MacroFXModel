// js/terminal/commandCore.test.mjs: the command line's list and matcher. The GUARD: every command has help, an example that really resolves to it,
// and a "what it opens" note, and points at a registered surface; a new tab cannot ship without its words.
// node --test js/terminal/commandCore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCommands, search, plainAction, grouped, parseWhen, resolveInstrument, nameScore, UNIVERSE, NAME, TAB_WORD_IDS, ALL_INSTRUMENTS } from './commandCore.js';
import { SURFACES, surfaceById, visibleFor } from './tabRegistry.js';
import { ALL_BLOCKS } from './macroSubtabs.js';
import { THEMES } from './themes.js';
import { londonDate } from '../replayCore.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NOW = Date.parse('2026-11-15T12:00:00Z');   // a Sunday: 2026-11-15
const all = buildCommands({ now: () => NOW });
const top = (line, cmds = all) => search(cmds, line, { limit: 5 })[0];

test('GUARD: every command has help, an example, a "what it opens" note and a registered surface', () => {
  assert.ok(all.length > 100, `found ${all.length} commands`);
  for (const c of all) {
    assert.ok(typeof c.help === 'string' && c.help.length >= 12, `${c.id}: help must be a real sentence, not "${c.help}"`);
    assert.ok(typeof c.example === 'string' && c.example.length >= 1, `${c.id}: needs an example`);
    assert.ok(typeof c.opens === 'string' && c.opens.length >= 3, `${c.id}: needs an "opens" note`);
    assert.ok(typeof c.group === 'string' && c.group, `${c.id}: needs a group`);
    if (c.surface) assert.ok(surfaceById(c.surface), `${c.id} points at ${c.surface}, which is not in the surface registry`);
    for (const n of c.needs ?? []) assert.ok(surfaceById(n), `${c.id} needs ${n}, which is not in the surface registry`);
    assert.ok(c.action || c.run, `${c.id}: it must do something (an action or a run)`);
  }
});

test('GUARD: the example of every command resolves to that command (so the help never lies)', () => {
  for (const c of all) {
    const r = search(all, c.example, { limit: 3 });
    assert.ok(r.length, `${c.id}: typing its example "${c.example}" finds nothing`);
    assert.equal(r[0].cmd.id, c.id, `${c.id}: typing its example "${c.example}" finds ${r[0].cmd.id} first`);
    assert.ok(!r[0].error, `${c.id}: its example "${c.example}" gives an error: ${r[0].error}`);
    const a = r[0].action ?? plainAction(r[0].cmd)?.action;
    assert.ok(a?.kind, `${c.id}: its example does not resolve to an action`);
  }
});

test('GUARD: names are unique, every registered tab has words, every Macro board has a command', () => {
  const names = all.map(c => c.name); assert.equal(new Set(names).size, names.length, `duplicate command names: ${names.filter((n, i) => names.indexOf(n) !== i)}`);
  const ids = all.map(c => c.id); assert.equal(new Set(ids).size, ids.length);
  const tabs = SURFACES.filter(s => s.kind === 'tab').map(s => s.id.slice(4));
  for (const t of tabs) assert.ok(TAB_WORD_IDS.includes(t), `tab "${t}" has no entry in TAB_WORDS (js/terminal/commandCore.js): add its command name, aliases and one line of help`);
  for (const t of TAB_WORD_IDS) assert.ok(tabs.includes(t), `TAB_WORDS names "${t}", which is not a registered tab`);
  for (const b of ALL_BLOCKS) assert.ok(all.some(c => c.surface === b), `Macro board ${b} has no command`);
  // an alias must not shadow another command's name
  for (const c of all) for (const a of c.aliases) if (names.includes(a) && a !== c.name) assert.fail(`${c.id}: alias ${a} is also the name of another command`);
});

test('the market list matches the page (desk-terminal.html UNIVERSE and NAME)', () => {
  const html = fs.readFileSync(path.join(ROOT, 'desk-terminal.html'), 'utf8');
  const u = new Function(`return (${/const UNIVERSE = (\{[\s\S]*?\});/.exec(html)[1]});`)();
  const n = new Function(`return (${/const NAME = (\{[\s\S]*?\});/.exec(html)[1]});`)();
  assert.deepEqual(UNIVERSE, u, 'UNIVERSE in js/terminal/commandCore.js has drifted from desk-terminal.html');
  assert.deepEqual(NAME, n, 'NAME in js/terminal/commandCore.js has drifted from desk-terminal.html');
});

test('markets: key, EUR/USD, and plain words all resolve', () => {
  for (const [w, k] of [['eurusd', 'EURUSD'], ['EUR/USD', 'EURUSD'], ['gold', 'GOLD'], ['xau', 'GOLD'], ['nasdaq', 'NQ'], ['nq', 'NQ'], ['spx', 'SPX500'], ['dax', 'DE30'], ['btc', 'BTCUSD'], ['oil', 'WTI']]) assert.equal(resolveInstrument(w), k, w);
  assert.equal(resolveInstrument('nonsense'), null); assert.equal(resolveInstrument(''), null);
  assert.equal(plainAction(top('gold').cmd).action.inst, 'GOLD'); assert.equal(top('eur').cmd.name, 'EURUSD');
  assert.deepEqual(plainAction(top('nq').cmd).action, { kind: 'pair', inst: 'NQ' });
});

test('the owner\'s examples: FED, MACRO RATES, REPLAY NQ 12 NOV, CPI US', () => {
  assert.deepEqual(plainAction(top('fed').cmd).action, { kind: 'macro', block: 'panel.macro.fedyields' });
  assert.deepEqual(plainAction(top('macro rates').cmd).action, { kind: 'macro', sub: 'rates' });
  const r = top('replay nq 12 nov');
  assert.equal(r.action.kind, 'replay'); assert.equal(r.action.inst, 'NQ');
  assert.equal(londonDate(r.action.ts), '2026-11-12'); assert.match(r.summary, /2026-11-12 at 07:00 London/);
  const c = top('cpi us'); assert.deepEqual(c.action, { kind: 'macro', block: 'panel.macro.engines', ccy: 'USD' });
  assert.deepEqual(top('cpi uk').action.ccy, 'GBP'); assert.deepEqual(plainAction(top('cpi').cmd).action, { kind: 'macro', block: 'panel.macro.engines' });
});

test('REPLAY: dates and times said the way people say them; errors are in words', () => {
  const when = (...t) => parseWhen(t, NOW);
  assert.deepEqual(when('12', 'NOV'), { date: '2026-11-12', hh: null, mm: null });
  assert.deepEqual(when('NOVEMBER', '12', '2026'), { date: '2026-11-12', hh: null, mm: null });
  assert.deepEqual(when('12TH', 'NOV', '14:30'), { date: '2026-11-12', hh: 14, mm: 30 });
  assert.deepEqual(when('2026-11-12', '9:05'), { date: '2026-11-12', hh: 9, mm: 5 });
  assert.deepEqual(when('YESTERDAY'), { date: '2026-11-14', hh: null, mm: null });
  assert.deepEqual(when('14:30'), { date: '2026-11-15', hh: 14, mm: 30 });
  assert.equal(when('20', 'DEC').date, '2025-12-20', 'a day still ahead with no year means last year');
  assert.match(when('31', 'FEB').error, /not a real date/); assert.match(when('25:00').error, /not a time/);
  assert.match(when('1', 'XYZ').error, /Could not read/); assert.match(when('12').error, /day and a month/);
  assert.match(when('2026-12-25').error, /not happened yet/);
  assert.equal(parseWhen([], NOW), null);
  assert.match(top('replay xx').error, /not a market I know/);
  assert.match(top('replay gbpjpy').error, /Replay covers/);
  assert.equal(top('replay nq 14:30').action.ts, top('replay nq today 14:30').action.ts);
  assert.deepEqual(top('replay nq').action, { kind: 'replay', inst: 'NQ', ts: null });
  assert.deepEqual(plainAction(top('replay').cmd).action, { kind: 'tab', t: 'replay' });
});

test('THEME, TF, LINK, HELP', () => {
  for (const t of THEMES) assert.deepEqual(top(`theme ${t.id}`).action, { kind: 'theme', id: t.id });
  assert.deepEqual(top('theme amb').action, { kind: 'theme', id: 'amber' });
  assert.match(top('theme zzz').error, /No theme called/); assert.match(top('theme ').error ?? 'x', /./);
  assert.deepEqual(top('tf 15m').action, { kind: 'tf', tf: '15m' }); assert.match(top('tf 7m').error, /Candle sizes/);
  assert.deepEqual(top('link off').action, { kind: 'link', on: false }); assert.match(top('link maybe').error, /LINK ON or LINK OFF/);
  assert.deepEqual(plainAction(top('?').cmd).action, { kind: 'help' });
  assert.equal(plainAction(all.find(c => c.id === 'theme')), null, 'a command that needs an argument has no plain action');
});

test('ranking: exact beats prefix beats word-start beats contains; help text is a weak last resort; leading / is ignored', () => {
  assert.ok(nameScore('FED', 'FED') > nameScore('FED', 'FEDPATH') && nameScore('FED', 'FEDPATH') > nameScore('FED', 'MACRO FEDYIELDS'));
  assert.ok(nameScore('YIELDS', 'MACRO FEDYIELDS') >= 400 && nameScore('RATE', 'MACRO RATES') === 600);
  assert.equal(nameScore('ZZZ', 'FED'), 0); assert.equal(nameScore('', 'FED'), 0);
  assert.equal(top('/fed').cmd.name, 'FED'); assert.equal(top('  FED  ').cmd.name, 'FED');
  assert.equal(top('macro').cmd.name, 'MACRO', 'the tab beats its sections');
  assert.ok(top('spillover'), 'a word only in a board\'s description still finds it'); assert.equal(search(all, 'qqqqqq').length, 0); assert.deepEqual(search(all, ''), []);
  assert.ok(search(all, 'a', { limit: 4 }).length <= 4);
});

test('grouped() lists every command once, under its group', () => {
  const g = grouped(all); assert.equal(g.reduce((n, x) => n + x.items.length, 0), all.length);
  assert.equal(g[0].group, 'Go to a tab');
});

test('VIEWER: a command whose surface is switched off for the session is not offered', () => {
  const owner = buildCommands({ now: () => NOW });
  const viewer = buildCommands({ isOn: id => visibleFor('viewer', null).includes(id), now: () => NOW });
  assert.ok(owner.some(c => c.id === 'tab.read') && !viewer.some(c => c.id === 'tab.read'), 'the Trader\'s read command is owner-only');
  assert.ok(owner.some(c => c.id === 'tab.infomap') && !viewer.some(c => c.id === 'tab.infomap'), 'the Info map command is owner-only');
  assert.ok(!viewer.some(c => c.id === 'tf' || c.id === 'link'), 'TF and LINK need linked selection, a preview feature');
  assert.ok(viewer.some(c => c.id === 'tab.macro') && viewer.some(c => c.id === 'inst.EURUSD'));
  const noMacro = buildCommands({ isOn: id => id !== 'tab.macro', now: () => NOW });
  assert.ok(!noMacro.some(c => c.group === 'Macro boards' || c.group === 'Macro sections' || c.group === 'Releases'), 'Macro commands need the Macro tab');
  const withLink = buildCommands({ isOn: id => visibleFor('viewer', { 'widget.linked': true }).includes(id), now: () => NOW });
  assert.ok(withLink.some(c => c.id === 'tf') && withLink.some(c => c.id === 'link'));
  // nothing trade-like: no command opens a surface hidden for 'trade' or 'pnl' for a viewer
  for (const c of viewer) { const s = surfaceById(c.surface); assert.ok(!s || !['trade', 'pnl', 'cost'].includes(s.hidden), `${c.id} reaches a ${s?.hidden} surface for a viewer`); }
});

test('every instrument key is in the list once', () => { assert.equal(new Set(ALL_INSTRUMENTS).size, ALL_INSTRUMENTS.length); });
