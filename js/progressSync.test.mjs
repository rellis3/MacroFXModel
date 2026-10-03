// Tests for Theory Lab progress sync: the server validator (js/progressSync.js) and the
// browser merge (theory-lab/assets/sync.js), plus parity between the two merges.
//   node js/progressSync.test.mjs
import { readFileSync } from 'fs';
import vm from 'vm';
import { validateSyncBody, normalizeSyncCode, newSyncCode, mergeSyncPayload, syncFingerprint, SYNC_ALPHABET, SYNC_CODE_LEN } from './progressSync.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

// Load the browser script in a bare sandbox (no document/localStorage → only the pure merge runs).
const sandbox = {};
vm.runInNewContext(readFileSync(new URL('../theory-lab/assets/sync.js', import.meta.url), 'utf8'), sandbox);
const merge = sandbox.TLSync && sandbox.TLSync.merge;
ok('sync.js exposes a pure TLSync.merge without a DOM', typeof merge === 'function');
const plain = v => JSON.parse(JSON.stringify(v));   // normalise objects across the vm realm

// ── codes ─────────────────────────────────────────────────────────────────────
ok('alphabet has 31 symbols, no look-alikes', SYNC_ALPHABET.length === 31 && !/[01ILO]/.test(SYNC_ALPHABET) && new Set(SYNC_ALPHABET).size === 31);
const codes = Array.from({ length: 2000 }, newSyncCode);
ok('new codes are 10 chars from the alphabet', codes.every(c => c.length === SYNC_CODE_LEN && [...c].every(ch => SYNC_ALPHABET.includes(ch))));
ok('2000 new codes are all distinct', new Set(codes).size === codes.length);
ok('normalize accepts dashes/spaces/lowercase', normalizeSyncCode(' abcde-fghjk ') === 'ABCDEFGHJK');
ok('normalize rejects look-alikes, wrong length, non-strings', [normalizeSyncCode('ABCDE-FGHJO'), normalizeSyncCode('ABCD'), normalizeSyncCode('ABCDEFGHJKM'), normalizeSyncCode(42), normalizeSyncCode('../../etc')].every(x => x === null));

// ── validator ─────────────────────────────────────────────────────────────────
const good = {
  progress: { 'kelly-criterion': { percent: 140, scrollPct: 3, activeSec: -5, firstVisit: 1.7e12, completedAt: 1.75e12, updatedAt: 1.76e12, extra: 'x' } },
  path: 'volatility',
  checks: { volatility: { 0: true, 1: false, 2: true } },
};
const v = validateSyncBody(good);
ok('a well-formed body validates', v.ok);
ok('percent clamped to 100, scrollPct to 1, activeSec to 0', v.value.progress['kelly-criterion'].percent === 100 && v.value.progress['kelly-criterion'].scrollPct === 1 && v.value.progress['kelly-criterion'].activeSec === 0);
ok('unknown fields inside a lesson record are dropped', !('extra' in v.value.progress['kelly-criterion']));
ok('only true ticks are kept', JSON.stringify(v.value.checks) === '{"volatility":{"0":true,"2":true}}');
ok('empty body is fine (all three optional)', validateSyncBody({}).ok && validateSyncBody({ progress: null, path: null, checks: null }).ok);
ok('implausible timestamps become null', validateSyncBody({ progress: { a: { firstVisit: 5, completedAt: Date.now() + 1e10 } } }).value.progress.a.firstVisit === null);
ok('NaN / string percent → 0 or parsed', validateSyncBody({ progress: { a: { percent: 'abc' }, b: { percent: '55' } } }).value.progress.a.percent === 0);
const bad = [
  ['non-object body', [1, 2]],
  ['null body', null],
  ['unknown top-level field', { progress: {}, email: 'a@b.c' }],
  ['progress is an array', { progress: [] }],
  ['bad slug', { progress: { '../x': { percent: 1 } } }],
  ['uppercase slug', { progress: { Kelly: { percent: 1 } } }],
  ['lesson record not an object', { progress: { a: 50 } }],
  ['path with spaces', { path: 'a b' }],
  ['path not a string', { path: 5 }],
  ['tick not boolean', { checks: { volatility: { 0: 'yes' } } }],
  ['bad step index', { checks: { volatility: { x: true } } }],
  ['step index too big', { checks: { volatility: { 99: true } } }],
  ['too many paths', { checks: Object.fromEntries(Array.from({ length: 21 }, (_, i) => ['p' + i, {}])) }],
  ['too many lessons', { progress: Object.fromEntries(Array.from({ length: 1001 }, (_, i) => ['l' + i, {}])) }],
  ['over 64KB', { progress: Object.fromEntries(Array.from({ length: 900 }, (_, i) => ['lesson-with-a-rather-long-slug-name-number-' + i, { percent: 50, firstVisit: 1.7e12 }])) }],
];
for (const [name, body] of bad) { const r = validateSyncBody(body); ok(`rejects ${name}`, !r.ok, r.ok ? '' : r.error); }

// ── merge ─────────────────────────────────────────────────────────────────────
const phone = {
  progress: {
    a: { percent: 40, scrollPct: 0.4, activeSec: 100, firstVisit: 1000e9, completedAt: null, updatedAt: 1700e9 },
    b: { percent: 100, scrollPct: 1, activeSec: 600, firstVisit: 1200e9, completedAt: 1300e9, updatedAt: 1300e9 },
  },
  path: null,
  checks: { macro: { 0: true } },
};
const laptop = {
  progress: {
    a: { percent: 90, scrollPct: 0.9, activeSec: 50, firstVisit: 1100e9, completedAt: null, updatedAt: 1600e9 },
    b: { percent: 100, scrollPct: 1, activeSec: 500, firstVisit: 1150e9, completedAt: 1400e9, updatedAt: 1500e9 },
    c: { percent: 10, scrollPct: 0.1, activeSec: 5, firstVisit: 1500e9, completedAt: null, updatedAt: 1500e9 },
  },
  path: 'macro',
  checks: { macro: { 1: true }, risk: { 0: true } },
};
const m = plain(merge(phone, laptop));
ok('per-lesson percent is the max of both', m.progress.a.percent === 90 && m.progress.c.percent === 10);
ok('activeSec / scrollPct are high-water marks', m.progress.a.activeSec === 100 && m.progress.a.scrollPct === 0.9);
ok('first completedAt is kept', m.progress.b.completedAt === 1300e9);
ok('earliest firstVisit, latest updatedAt', m.progress.b.firstVisit === 1150e9 && m.progress.a.updatedAt === 1700e9);
ok('remote path fills an empty local path', m.path === 'macro');
ok('local path wins when set', plain(merge({ path: 'risk' }, { path: 'macro' })).path === 'risk');
ok('checks are a union', JSON.stringify(m.checks) === JSON.stringify({ macro: { 0: true, 1: true }, risk: { 0: true } }));
ok('a completedAt is never cleared by a remote without one', plain(merge({ progress: { x: { percent: 100, completedAt: 5e12 } } }, { progress: { x: { percent: 30, completedAt: null } } })).progress.x.completedAt === 5e12);
ok('merge is symmetric in progress + checks', JSON.stringify(syncFingerprint(plain(merge(phone, laptop)).progress)) === JSON.stringify(syncFingerprint(plain(merge(laptop, phone)).progress)) && syncFingerprint(m.checks) === syncFingerprint(plain(merge(laptop, phone)).checks));
ok('merge is idempotent', syncFingerprint(plain(merge(m, m))) === syncFingerprint(m) && syncFingerprint(plain(merge(m, laptop))) === syncFingerprint(m));
ok('merge does not mutate its inputs', phone.path === null && !('c' in phone.progress) && !('1' in phone.checks.macro));
ok('merge tolerates junk', JSON.stringify(plain(merge(null, { progress: 5, checks: [] }))) === '{"progress":{},"path":null,"checks":{}}');
ok('browser merge == server merge (phone,laptop)', syncFingerprint(m) === syncFingerprint(mergeSyncPayload(phone, laptop)));
ok('browser merge == server merge (laptop,phone)', syncFingerprint(plain(merge(laptop, phone))) === syncFingerprint(mergeSyncPayload(laptop, phone)));
ok('merged result still validates', validateSyncBody(mergeSyncPayload(phone, laptop)).ok);
ok('fingerprint ignores key order', syncFingerprint({ a: 1, b: { y: 1, x: 2 } }) === syncFingerprint({ b: { x: 2, y: 1 }, a: 1 }));

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
