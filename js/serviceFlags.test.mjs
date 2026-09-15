// Unit test for js/serviceFlags.js — the background-job on/off registry.
//
// The property that matters most here is the FIRST one: deploying the registry
// must not switch anything off by itself. Everything else is precedence.
//
// Run: node js/serviceFlags.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SERVICES, envNameFor, resolveService, serviceEnabled, servicesSnapshot, getService } from './serviceFlags.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readRepo = f => readFileSync(path.join(__dirname, '..', f), 'utf8');

let pass = 0;
const t = (name, fn) => { fn(); console.log(`  ok  ${name}`); pass++; };

t('an empty env leaves every service in its documented default state', () => {
  for (const s of servicesSnapshot({})) {
    assert.equal(s.enabled, s.defaultOn, `${s.id} should default to ${s.defaultOn}`);
    assert.equal(s.decidedBy, 'default');
  }
});

t('every service currently defaults ON (no silent behaviour change on deploy)', () => {
  assert.ok(servicesSnapshot({}).every(s => s.enabled), 'a service defaults off — was that intended?');
});

t('ids are unique and env names are derived, not hand-written', () => {
  const ids = SERVICES.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate service id');
  for (const s of SERVICES) assert.equal(s.env, envNameFor(s.id));
  assert.equal(envNameFor('hmm5mV2'), 'SVC_HMM5M_V2');
  assert.equal(envNameFor('sessionResearchFull'), 'SVC_SESSION_RESEARCH_FULL');
});

t('every service carries the metadata the docs and /api/services print', () => {
  for (const s of SERVICES) {
    assert.ok(s.label && s.cadence && s.feeds, `${s.id} is missing label/cadence/feeds`);
    assert.ok(['high', 'med', 'low'].includes(s.cost), `${s.id} has an unknown cost tier`);
    assert.ok(['server', 'start.sh'].includes(s.where), `${s.id} has an unknown location`);
  }
});

t('per-service env wins, in both spellings', () => {
  for (const off of ['0', 'false', 'off', 'no', 'OFF']) {
    assert.equal(serviceEnabled('hmm5mV2', { SVC_HMM5M_V2: off }), false, `"${off}" should disable`);
  }
  for (const on of ['1', 'true', 'on', 'yes']) {
    assert.equal(serviceEnabled('hmm5mV2', { SVC_HMM5M_V2: on }), true, `"${on}" should enable`);
  }
});

t('an unparseable value is ignored rather than guessed at', () => {
  const r = resolveService('hmm5mV2', { SVC_HMM5M_V2: 'maybe' });
  assert.equal(r.enabled, true);
  assert.equal(r.source, 'default');
});

t('legacy opt-out vars still work, so nothing set in Railway today changes meaning', () => {
  assert.equal(serviceEnabled('volatilityV2Plan', { VOLATILITY_V2_PLAN_REFRESH: '0' }), false);
  assert.equal(serviceEnabled('fibAtlasPlan',     { FIB_ATLAS_PLAN_REFRESH: '0' }), false);
  assert.equal(serviceEnabled('coneForward',      { CONE_FWD_AUTO: '0' }), false);
  assert.equal(serviceEnabled('surpriseAlerts',   { SURPRISE_ALERT_AUTO: '0' }), false);
  assert.equal(serviceEnabled('mveLog',           { VM_LOG_ENABLED: '0' }), false);
  assert.equal(serviceEnabled('mveHeartbeat',     { VM_HEARTBEAT: '0' }), false);
});

t('the canonical var beats the legacy one when both are set', () => {
  const r = resolveService('fibAtlasPlan', { SVC_FIB_ATLAS_PLAN: '1', FIB_ATLAS_PLAN_REFRESH: '0' });
  assert.equal(r.enabled, true);
  assert.equal(r.source, 'SVC_FIB_ATLAS_PLAN');
});

t('SERVICES_OFF / SERVICES_ON take comma lists', () => {
  const env = { SERVICES_OFF: 'sessionResearchFull, nasdaqMacroLead ,cogShadow' };
  assert.equal(serviceEnabled('sessionResearchFull', env), false);
  assert.equal(serviceEnabled('nasdaqMacroLead', env), false);
  assert.equal(serviceEnabled('cogShadow', env), false);
  assert.equal(serviceEnabled('monitor', env), true, 'unlisted services are untouched');
});

t('a per-service var overrides SERVICES_OFF', () => {
  const env = { SERVICES_OFF: 'hmm5mV2', SVC_HMM5M_V2: '1' };
  assert.equal(serviceEnabled('hmm5mV2', env), true);
});

t('SERVICE_PROFILE=lean keeps the lean set and drops the rest', () => {
  const snap = servicesSnapshot({ SERVICE_PROFILE: 'lean' });
  const on  = snap.filter(s => s.enabled).map(s => s.id);
  const off = snap.filter(s => !s.enabled).map(s => s.id);
  for (const id of ['monitor', 'levels', 'hmm5m', 'eventGate', 'botRegimeV2', 'botLevel', 'botGold']) {
    assert.ok(on.includes(id), `lean must keep ${id} — it is live trading or the site's core`);
  }
  for (const id of ['sessionResearchFull', 'nasdaqMacroLead', 'cogShadow', 'hmm5mV2']) {
    assert.ok(off.includes(id), `lean should drop ${id}`);
  }
  assert.ok(on.length < snap.length, 'lean must actually turn something off');
});

t('lean is still overridable per service', () => {
  const env = { SERVICE_PROFILE: 'lean', SVC_SESSION_RESEARCH_LIVE: '1' };
  assert.equal(serviceEnabled('sessionResearchLive', env), true);
});

t('an unknown id is a loud error, not a silent "off"', () => {
  assert.throws(() => serviceEnabled('notAService'), /unknown service id/);
  assert.equal(getService('notAService'), null);
});

t('every start.sh bot in the registry is actually wired into start.sh', () => {
  // start.sh does not reimplement the flag logic — it asks this module by id
  // (`svc_on botGold`), so the id is what must appear there, not the env name.
  const sh = readRepo('start.sh');
  for (const s of SERVICES.filter(x => x.where === 'start.sh')) {
    assert.ok(sh.includes(`start_bot ${s.id} `), `${s.id}: start.sh has no "start_bot ${s.id}" line`);
  }
  const started = [...sh.matchAll(/^start_bot (\w+) /gm)].map(m => m[1]);
  for (const id of started) {
    assert.ok(SERVICES.some(s => s.id === id), `start.sh starts "${id}" but it is not in the registry — it would be unswitchable`);
  }
  assert.equal(started.length, SERVICES.filter(x => x.where === 'start.sh').length);
});

t('every server service is gated at a real call site in server.js', () => {
  const src = readRepo('server.js');
  for (const s of SERVICES.filter(x => x.where === 'server')) {
    assert.ok(src.includes(`'${s.id}'`), `${s.id}: nothing in server.js is gated on it — a flag that gates nothing is worse than no flag`);
  }
});

t('no bare setInterval is left in server.js outside the svcInterval helper', () => {
  const src = readRepo('server.js');
  const stray = src.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /(?<!svc)setInterval\(/.test(line) && !line.trim().startsWith('//') && !line.includes('svcRun(id, fn)'));
  // Two known exceptions stay bare, both inside already-gated code:
  //   _scheduleDailyUtc's re-arm, and the VFR nightly refresh (opt-IN via VFR_REFRESH_UTC).
  assert.ok(stray.length <= 2, `unexpected ungated setInterval(s): ${stray.map(([n]) => n).join(', ')}`);
});

console.log(`\n${pass} passed`);
