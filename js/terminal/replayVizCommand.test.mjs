// js/terminal/replayVizCommand.test.mjs: PLAY <visual> and REPLAY <visual> on the command line, the gating by the preview switch, and the help text.
// node --test js/terminal/replayVizCommand.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommands, search } from './commandCore.js';
import { VISUALS } from '../replayVizCore.js';

test('PLAY has help, an example and an opens note, and runs each visual by its words', () => {
  const cmds = buildCommands({ isOn: () => true }), c = cmds.find(x => x.id === 'replay.viz');
  assert.ok(c, 'the command is offered when the surface is on'); assert.ok(c.help.length > 40); assert.match(c.example, /^play /); assert.ok(c.opens.length > 10);
  for (const v of VISUALS) for (const w of [v.id, ...v.words]) {
    const r = search(cmds, `play ${w}`)[0]; assert.equal(r.cmd.id, 'replay.viz', w); assert.deepEqual(r.action, { kind: 'replay-viz', id: v.id }, w);
    assert.doesNotMatch(r.summary, /will |forecast|buy|sell/i);
  }
  const bad = search(cmds, 'play zzz')[0]; assert.match(bad.error, /not a visual I can replay yet/); assert.match(search(cmds, 'play')[0]?.cmd.name ?? 'PLAY', /PLAY/);
});

test('REPLAY CURVE reaches the same action; REPLAY NQ still opens the Replay tab', () => {
  const cmds = buildCommands({ isOn: () => true });
  const r = search(cmds, 'replay curve').find(x => x.cmd.id === 'tab.replay'); assert.deepEqual(r.action, { kind: 'replay-viz', id: 'curve' });
  const n = search(cmds, 'replay nq').find(x => x.cmd.id === 'tab.replay'); assert.equal(n.action.kind, 'replay');
});

test('with the preview switch off a desk login is not offered the command and REPLAY CURVE is not a visual', () => {
  const cmds = buildCommands({ isOn: id => id !== 'widget.replayviz' });
  assert.equal(cmds.find(x => x.id === 'replay.viz'), undefined);
  const r = search(cmds, 'replay curve').find(x => x.cmd.id === 'tab.replay'); assert.ok(r.error, 'treated as an unknown market, as before');
});
