// node js/terminal/alertsView.test.mjs: the alerts form offers only choices the rules accept (the panel's DOM glue is not covered: see the report).
import assert from 'node:assert/strict';
import { fieldHtml } from './alertsView.js';
import { KINDS, KIND_IDS, FEEDS, LIVE_INDICES, makeRule } from '../deskAlertRulesCore.js';
import { INSTRUMENTS } from '../replayCore.js';
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

for (const k of KIND_IDS) for (const f of KINDS[k].fields) ok(fieldHtml(k, f).includes(`data-f="${f[0]}"`), `${k}.${f[0]} has a control`);
const opts = h => [...h.matchAll(/<option value="([^"]*)"/g)].map(m => m[1]);
ok(opts(fieldHtml('level_touch', ['market', 'text', 'NQ'])).join() === Object.keys(INSTRUMENTS).join(), 'level alerts offer exactly the Replay markets');
ok(opts(fieldHtml('gap_closed', ['market', 'text', 'NQ'])).includes('NQ') && opts(fieldHtml('gap_closed', ['market', 'text', 'NQ'])).every(v => LIVE_INDICES.includes(v) || /^USD/.test(v)), 'gap alerts offer the live index and EM markets');
ok(opts(fieldHtml('data_stale', ['feed', 'feed', 'fed-zq'])).join() === Object.keys(FEEDS).join(), 'stale alerts offer the known feeds');
ok(/<input[^>]*type="text"[^>]*maxlength="12"/.test(fieldHtml('range_used', ['market', 'text', 'EURUSD'])) && /type="number"/.test(fieldHtml('range_used', ['pct', 'number', 80])), 'free text and numbers where they are free');
// every default the form starts with makes a valid rule
for (const k of KIND_IDS) { const params = Object.fromEntries(KINDS[k].fields.map(([name, , def]) => [name, def])); ok(makeRule({ kind: k, params }).ok, `the form's defaults for ${k} make a valid alert`); }
ok(!fieldHtml('range_used', ['market', 'text', '"><script>']).includes('<script>'), 'a default value is escaped');
// the command line's ALERT <...> goes through win.deskAlerts.add: it must refuse a desk login before it posts anything (the server refuses too: deskAlertRules.test.mjs)
import fs from 'node:fs';
const src = fs.readFileSync(new URL('./alertsView.js', import.meta.url), 'utf8');
ok(/add: async b => \{ if \(!canEdit\(\)\)/.test(src), 'deskAlerts.add checks canEdit() first');
console.log(`alertsView: ${n} checks OK`);
