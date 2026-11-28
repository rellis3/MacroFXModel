import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTarget, parseHelixArgs, parseHelixHash, helixHash, voiceNav, STYLE_GROUPS, groupOf, collapseStyles, nextStyle, mergeInbox, sinceSummary, agoText, todayLines, frameBudget, KEYS, sectionForKey, allItems } from './helixNav.js';
import { wakeParse, navWords } from './jarvisCore.js';
import { SECTIONS, sectionOf } from './jarvisNav.js';

test('resolveTarget: ids, labels, aliases, prefixes; nonsense is null', () => {
  assert.deepEqual(resolveTarget('yields'), { kind: 'view', id: 'yields' });
  assert.deepEqual(resolveTarget('Yield Curve'), { kind: 'view', id: 'yields' });
  assert.deepEqual(resolveTarget('the board'), { kind: 'view', id: 'candles' });
  assert.deepEqual(resolveTarget('gamma pillar'), { kind: 'view', id: 'gpillar' });
  assert.deepEqual(resolveTarget('alerts'), { kind: 'tool', id: 'alerts' });
  assert.deepEqual(resolveTarget('today'), { kind: 'tool', id: 'today' });
  assert.deepEqual(resolveTarget('flip map'), { kind: 'view', id: 'flipmap' });
  assert.deepEqual(resolveTarget('unusual moves'), { kind: 'tool', id: 'radar' });
  assert.deepEqual(resolveTarget('vol surf'), { kind: 'view', id: 'ivsurf' });
  assert.equal(resolveTarget('what is oil doing today and why'), null);
  assert.equal(resolveTarget(''), null); assert.equal(resolveTarget('zz'), null);
});
test('every alias points at an item that exists in a section', () => {
  const items = allItems();
  for (const w of ['board', 'map', 'curve', 'chain', 'gamma', 'flip', 'range', 'day', 'inbox', 'today'] ) { const t = resolveTarget(w); assert.ok(t && items.some(i => i.kind === t.kind && i.id === t.id), w); }
});
test('parseHelixArgs: target, window, region, popout; unknown words are reported', () => {
  assert.deepEqual(parseHelixArgs('board 1d'), { target: { kind: 'view', id: 'candles' }, win: 1, region: null, popout: false, unknown: null });
  const g = parseHelixArgs('map europe'); assert.deepEqual(g.target, { kind: 'view', id: 'globe' }); assert.equal(g.region, 'europe');
  assert.equal(parseHelixArgs('yields 20D').win, 20); assert.equal(parseHelixArgs('alerts popout').popout, true);
  assert.deepEqual(parseHelixArgs(''), { target: null, win: null, region: null, popout: false, unknown: null });
  assert.equal(parseHelixArgs('flibbertigibbet').unknown, 'flibbertigibbet');
});
test('parseHelixHash and helixHash round-trip; other hashes are not ours', () => {
  assert.equal(parseHelixHash('#replay/NQ'), null); assert.equal(parseHelixHash(''), null);
  assert.deepEqual(parseHelixHash('#helix').target, null);
  assert.deepEqual(parseHelixHash('#helix/yields/5d').target, { kind: 'view', id: 'yields' });
  for (const s of [{ kind: 'view', id: 'yields', win: 1 }, { kind: 'tool', id: 'alerts', win: 5 }, { kind: 'view', id: 'globe', win: 20, region: 'asia' }]) {
    const h = helixHash(s), p = parseHelixHash(h); assert.deepEqual(p.target, { kind: s.kind, id: s.id }, h); assert.equal(p.win ?? 5, s.win, h); if (s.region) assert.equal(p.region, s.region);
  }
  assert.equal(helixHash({ id: 'candles' }), '#helix/candles'); assert.equal(helixHash({}), '#helix');
  assert.equal(parseHelixHash('#helix/gamma%20pillar').target.id, 'gpillar');
});
test('voice navigation: "show X" goes to X, a question goes to ASK; wakeParse carries nav only when there is one', () => {
  assert.equal(voiceNav('show yields'), 'yields'); assert.equal(voiceNav('go to the board please'), 'the board'); assert.equal(voiceNav('take me to the gamma pillar.'), 'the gamma pillar');
  assert.equal(voiceNav('home'), 'today'); assert.equal(voiceNav('what is oil doing'), null); assert.equal(navWords('why is the dollar up'), null);
  assert.deepEqual(wakeParse('Helix, show yields'), { woke: true, query: 'show yields', nav: 'yields' });
  assert.deepEqual(wakeParse('Helix what is oil doing'), { woke: true, query: 'what is oil doing' });
  assert.deepEqual(resolveTarget(wakeParse('hey helix open alerts').nav), { kind: 'tool', id: 'alerts' });
});
test('STYLE groups: every member is a real nav view; collapse keeps one item per group and nothing is lost', () => {
  for (const [g, x] of Object.entries(STYLE_GROUPS)) for (const m of x.members) { assert.ok(sectionOf('view', m), `${g}:${m}`); assert.equal(groupOf(m), g); }
  const mac = SECTIONS.find(s => s.id === 'macro').items.map(([kind, id, label]) => ({ kind, id, label }));
  const c = collapseStyles(mac, {}, 'yields');
  assert.equal(c.filter(i => i.group === 'chain').length, 1); assert.equal(c.find(i => i.group === 'chain').id, 'reactor');
  assert.equal(collapseStyles(mac, { chain: 'orbit' }, 'yields').find(i => i.group === 'chain').id, 'orbit');
  assert.equal(collapseStyles(mac, { chain: 'orbit' }, 'skyline').find(i => i.group === 'chain').id, 'skyline', 'the picture on screen wins');
  assert.ok(c.some(i => i.id === 'yields') && c.length < mac.length);
  assert.equal(nextStyle('reactor'), 'chainfly'); assert.equal(nextStyle('bubbles'), 'reactor'); assert.equal(nextStyle('gamma', () => true, 1), 'gpillar');
  assert.equal(nextStyle('yields'), null); assert.equal(nextStyle('vol', id => id !== 'ivsurf'), null, 'a style that is not loaded is skipped');
  // every grouped view stays reachable: by STYLE from its lead, and directly by id
  for (const x of Object.values(STYLE_GROUPS)) { let v = x.members[0]; const seen = new Set([v]); for (let i = 0; i < 10; i++) { v = nextStyle(v); seen.add(v); } assert.equal(seen.size, x.members.length); }
});
test('mergeInbox: QLIKE level alerts join the inbox, held ones say so', () => {
  const rows = mergeInbox({ qlike: [{ at: '2026-11-30T09:01:00Z', text: 'EURUSD reached its upper QLIKE level (1.09120)', send: true }, { at: '2026-11-30T06:00:00Z', text: 'GOLD reached its lower QLIKE level (3601.3)', send: false }, { at: 'bad', text: 'x' }],
    desk: [{ name: 'r', firedAt: '2026-11-30T08:00:00Z' }] });
  assert.deepEqual(rows.map(r => r.src), ['qlike', 'desk', 'qlike']);
  assert.match(rows[2].text, /logged, not sent/); assert.doesNotMatch(rows[0].text, /not sent/);
});

test('mergeInbox: tab, phone and desk in one list, newest first; the same sentence twice is one row', () => {
  const t0 = Date.parse('2026-11-27T09:00:00Z');
  const rows = mergeInbox({
    tab: [{ at: t0 + 60_000, level: 'warn', text: 'The link a just broke.' }, { at: t0 + 120_000, text: 'Gold is up 1%, 2.1 times its normal noise.' }],
    server: [{ at: new Date(t0).toISOString(), level: 'warn', text: 'Helix: The link a just broke. (description, not a trade)', sent: true }],
    desk: [{ name: 'NQ near call wall', firedAt: new Date(t0 + 30_000).toISOString() }, { name: 'never', firedAt: null }],
  });
  assert.equal(rows.length, 3); assert.deepEqual(rows.map(r => r.src), ['tab', 'desk', 'phone']);
  assert.equal(rows[2].text, 'The link a just broke.');
  assert.equal(mergeInbox({ tab: Array.from({ length: 90 }, (_, i) => ({ at: t0 + i, text: `x${i}` })) }).length, 60);
  assert.deepEqual(mergeInbox(), []);
});
test('sinceSummary: broke/healed/big since the last look plus the alert count; nothing seen -> empty', () => {
  const prev = { links: { a: { verdict: 'holding', short: 'A' }, b: { verdict: 'broken', short: 'B' } }, nodes: { g: { label: 'Gold', text: 'up 1%', ratio: 1, moved: true } } };
  const now = { links: { a: { verdict: 'broken', short: 'A' }, b: { verdict: 'holding', short: 'B' } }, nodes: { g: { label: 'Gold', text: 'up 3%', ratio: 2.5, moved: true } } };
  const s = sinceSummary({ at: 1000, snap: prev }, now, [{ at: 500 }, { at: 1500 }, { at: 2500 }], 3000);
  assert.equal(s.empty, false); assert.equal(s.lines.length, 4); assert.match(s.lines[0].text, /A just broke/); assert.match(s.lines[3].text, /2 alerts since then/);
  assert.deepEqual(s.lines[2].go, { kind: 'tool', id: 'radar' });
  assert.equal(sinceSummary(null, now).empty, true);
  assert.equal(agoText(0, 30 * 60_000), '30 min ago'); assert.equal(agoText(0, 200 * 60_000), '3 h 20 min ago'); assert.equal(agoText(0, 49 * 3600_000), '2 days ago');
});
test('todayLines: one line per section, every line opens a real place; missing inputs say so; the amplified wording stays', () => {
  const empty = todayLines({});
  assert.equal(empty.length, 7); for (const l of empty) { assert.ok(l.go.id && l.text); }
  for (const s of SECTIONS.filter(x => x.id !== 'ask')) assert.ok(empty.some(l => l.sec === s.id), s.id);
  for (const l of empty) assert.ok(allItems().some(i => i.kind === l.go.kind && i.id === l.go.id), l.label);
  const full = todayLines({ lead: 'Dollar firm.', chain: { holding: 9, broken: 2, brokenShort: ['oil→CAD', 'gold→real yield'] }, unusual: [{ label: 'Gold', text: 'up 2%' }], board: { n: 30, up: 12, dn: 10, quiet: 8 }, next: { time: '13:30', ccy: 'USD', event: 'CPI' }, walls: { label: 'NQ', call: '21,000', put: '20,000', flip: '20,500', long: false }, alerts: { n: 2, last: 'x' } });
  assert.match(full[1].text, /2 textbook links broken: oil→CAD/); assert.match(full[5].text, /short gamma, moves amplified/); assert.equal(full[1].tone, 'warn');
  for (const l of full) assert.doesNotMatch(l.text, /\b(buy|sell|long the|short the|will rise|will fall)\b/i);
});
test('frameBudget: slow frames drop the DPR to 1, fast ones bring it back; idle or reduced motion caps at 30 fps', () => {
  const b = frameBudget({ maxDpr: 2 });
  let r; for (let i = 0; i < 200; i++) r = b.tick(40); assert.equal(r.dpr, 1);
  for (let i = 0; i < 400; i++) r = b.tick(8); assert.equal(r.dpr, 2);
  assert.equal(b.tick(16, { idle: true }).minGap, 33); assert.equal(b.tick(16, { calm: true }).minGap, 33); assert.equal(b.tick(16).minGap, 0);
  const one = frameBudget({ maxDpr: 1 }); for (let i = 0; i < 400; i++) r = one.tick(40); assert.equal(r.dpr, 1);
});
test('keys: 1-6 map to the six sections in order; the help lists every key', () => {
  assert.equal(sectionForKey('1'), 'watch'); assert.equal(sectionForKey('6'), 'sys'); assert.equal(sectionForKey('7'), null); assert.equal(sectionForKey('a'), null);
  const all = KEYS.map(k => k[0]).join(' '); for (const k of ['1 – 6', '/', '?', 'Esc', 'S', 'O', 'P', 'Tab']) assert.ok(all.includes(k), k);
});

test('colour tokens: under every theme calls (up) and long gamma (--cy) are clearly different colours; down stays apart from both', async () => {
  const { THEMES } = await import('./themes.js'); const { cyTokenFor, colourGap } = await import('./helixNav.js');
  for (const t of THEMES) {
    const tok = t.id === 'daylight' ? THEMES.find(x => x.id === 'default').tokens : t.tokens;     // Helix forces the dark set under daylight
    const cy = tok[cyTokenFor(t.id)], up = tok.up, dn = tok.dn;
    assert.ok(cy && up && dn, t.id);
    assert.ok(colourGap(cy, up) > 60, `${t.id}: calls ${up} vs long gamma ${cy} too close (${colourGap(cy, up)?.toFixed(0)})`);
    assert.ok(colourGap(cy, dn) > 60, `${t.id}: long gamma vs down`);
  }
  assert.equal(cyTokenFor('colourblind'), 'pur2'); assert.equal(cyTokenFor('default'), 'teal'); assert.equal(colourGap('#000000', 'nope'), null);
});
test('canvas font: ui-monospace is never first (Chrome on Windows lacks it); the font floor still applies', async () => {
  const { monoFont, mapFont } = await import('./helixNav.js');
  assert.equal(monoFont('ui-monospace, Menlo, monospace'), 'Menlo, monospace'); assert.match(monoFont(''), /^Consolas/); assert.match(monoFont('var(--x)'), /^Consolas/);
  assert.equal(mapFont('11px ui-monospace,monospace', 'Consolas,monospace'), '11px Consolas,monospace');
  assert.equal(mapFont('600 11px ui-monospace,monospace', 'X', 15), '600 15px X'); assert.equal(mapFont('20px ui-monospace,monospace', 'X', 15), '20px X'); assert.equal(mapFont('12px serif', 'X'), '12px serif');
});
test('open in terminal: chain keys and market keys map to desk instruments; prefixed hit keys do not', async () => {
  const { instFor } = await import('./helixNav.js');
  assert.equal(instFor('gold'), 'GOLD'); assert.equal(instFor('spx'), 'SPX500'); assert.equal(instFor('EURUSD'), 'EURUSD'); assert.equal(instFor('eur/usd'), 'EURUSD');
  assert.equal(instFor('us10y'), null); assert.equal(instFor('gm:prev'), null); assert.equal(instFor(null), null);
});
test('the hologram keeps the last two pipelines alive', async () => {
  const { keepPipelines, glBudget } = await import('./jarvisGL.js');
  assert.deepEqual([...keepPipelines('a', 'b')], ['a', 'b']); assert.deepEqual([...keepPipelines('a', null)], ['a']); assert.equal(glBudget.dpr, 2);
});
test('the HELIX command takes a picture and a window; nonsense is an error, not a guess', async () => {
  const { buildCommands, search, plainAction } = await import('./commandCore.js');
  const cmds = buildCommands({ isOn: () => true }), h = cmds.find(c => c.id === 'jarvis');
  assert.deepEqual(plainAction(h).action, { kind: 'jarvis' });
  const r = search(cmds, 'helix board 1d')[0]; assert.equal(r.cmd.id, 'jarvis'); assert.deepEqual(r.action, { kind: 'jarvis', args: 'board 1d' }); assert.match(r.summary, /MARKET BOARD \(1D\)/);
  assert.ok(search(cmds, 'helix flibbertigibbet')[0].error); assert.equal(search(cmds, 'jarvis yields')[0].action.args, 'yields');
});
