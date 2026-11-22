import test from 'node:test';
import assert from 'node:assert/strict';
import { botOf, readProcs, summarise } from './processMemory.js';

const P = (pid, ppid, rssMB, cmd) => ({ pid, ppid, rssKB: rssMB * 1024, cmd });
// pid 10 = the node server (child of the start.sh shell 1), 20/21 = a supervisor and the gold bot under it, 30 = the level bot's python and 31 = a helper it started, 40 = a helper the server started
const procs = [P(1, 0, 3, 'bash start.sh'), P(10, 1, 4000, 'node server.js'), P(20, 1, 2, 'bash start.sh'), P(21, 20, 900, 'python Gold/main.py'), P(30, 1, 600, 'python bot/main.py'), P(31, 30, 150, 'python bot/helper.py --x'),
  P(40, 10, 300, 'python scripts/hmm_train.py --pair EURUSD'), P(50, 1, 1, 'sleep 30'), P(60, 1, 80, 'node PatternBot/pattern_live_bot.mjs')];

test('botOf matches each start.sh bot on its command line and nothing else', () => {
  assert.equal(botOf('python Gold/main.py'), 'botGold'); assert.equal(botOf('python bot/main.py'), 'botLevel'); assert.equal(botOf('node PatternBot/pattern_live_bot.mjs'), 'botPatternLive');
  assert.equal(botOf('bash AnalogML/motif_track_loop.sh'), 'botAnalogMotif'); assert.equal(botOf('python AnalogML/motif_nearing_watch.py'), 'botAnalogNearing');
  assert.equal(botOf('node server.js'), null); assert.equal(botOf('python mybot/main.py'), null);
});
test('summarise: bots own their children, the server and its helpers are separate rows, the rest is "system"; sorted by memory; each bot says how to turn it off', () => {
  const s = summarise(procs, { nodePid: 10 }), by = Object.fromEntries(s.rows.map(r => [r.id, r]));
  assert.equal(by.server.rssMB, 4000); assert.equal(by.botGold.rssMB, 900); assert.equal(by.botLevel.rssMB, 750); assert.equal(by.botLevel.processes, 2);
  assert.equal(by.botGold.turnOff, 'SVC_BOT_GOLD=0'); assert.ok(by.botGold.live && by.botGold.feeds.startsWith('LIVE'));
  assert.equal(by.botPatternLive.live, false);
  const child = s.rows.find(r => r.kind === 'server-child'); assert.equal(child.rssMB, 300); assert.match(child.label, /hmm_train/);
  assert.equal(by.system.rssMB, 6);                                                                       // the two shells and sleep
  assert.equal(s.containerMB, 4000 + 900 + 750 + 300 + 80 + 6);
  for (let i = 1; i < s.rows.length; i++) assert.ok(s.rows[i - 1].rssMB >= s.rows[i].rssMB);
});
test('readProcs parses /proc and returns null where there is none; kernel threads (no VmRSS) are skipped', () => {
  const files = { '/p/12/status': 'Name:\tnode\nPPid:\t1\nVmRSS:\t  2048 kB\n', '/p/12/cmdline': 'node\0server.js\0', '/p/13/status': 'Name:\tkthread\nPPid:\t2\n', '/p/13/cmdline': '' };
  const fsApi = { readdirSync: () => ['12', '13', 'self'], readFileSync: f => { if (!(f in files)) throw new Error('gone'); return files[f]; } };
  assert.deepEqual(readProcs('/p', fsApi), [{ pid: 12, ppid: 1, rssKB: 2048, cmd: 'node server.js' }]);
  assert.equal(readProcs('/nonexistent-dir-for-test'), null); assert.equal(summarise(null), null);
});

import { topMappings } from './processMemory.js';
test('topMappings groups /proc smaps by what each mapping is and sorts by resident size; null where there is no smaps', () => {
  const smaps = ['55d0-55d9 r-xp 00000000 08:01 123 /usr/bin/node', 'Size: 100 kB', 'Rss: 2048 kB', '7f00-7f40 rw-p 00000000 00:00 0', 'Size: 9999 kB', 'Rss: 4194304 kB',
    '7f50-7f60 rw-p 00000000 00:00 0 [heap]', 'Rss: 1024 kB', '7ff0-7ff1 rw-p 00000000 00:00 0 [stack:1234]', 'Rss: 512 kB', '7ff2-7ff3 rw-p 00000000 00:00 0 [stack:1235]', 'Rss: 256 kB'].join('\n');
  const top = topMappings(8, { readFileSync: () => smaps });
  assert.equal(top[0].name, 'anonymous rw-p'); assert.equal(top[0].rssMB, 4096);
  assert.equal(top.find(x => x.name === 'node').rssMB, 2); assert.equal(top.find(x => x.name === '[stack]').mappings, 2); assert.equal(top.find(x => x.name === '[stack]').rssMB, 1);
  assert.equal(topMappings(8, { readFileSync: () => { throw new Error('none'); } }), null);
});
