// Layer 2 (event days) on the CFD QLIKE base: the layer never changes the base, is x1 on ordinary days, tags decision
// days from the bank calendars, and has a full multiplier set for every CFD on the base.   node js/ladderV2EventLayer.test.mjs
import { EVENT_LAYER, eventLayerTag, eventLayerLevels, eventLayerRows } from './ladderV2EventLayer.js';
import { qlikeInstruments, qlikeText } from './ladderV2Qlike.js';

let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };

for (const s of qlikeInstruments('cfd')) {
  const P = EVENT_LAYER.instruments[s];
  ok(P, `${s} has no layer-2 params`);
  if (!P) continue;
  for (const q of ['hl', 'oh', 'ol', 'cup', 'cdn']) for (const b of ['CB', 'FOMC']) for (const t of ['50', '75', '90']) {
    const m = P.lines[q]?.mult?.[b]?.[t];
    ok(Number.isFinite(m) && m > 0.4 && m < 3, `${s} ${q} ${b} p${t} mult ${m}`);
  }
}

const base = { hl_p50: 1, hl_p75: 1.4, hl_p90: 1.8, oh_p50: .5, oh_p75: .8, oh_p90: 1.1, ol_p50: .5, ol_p75: .8, ol_p90: 1.1,
  cup_p50: .3, cup_p75: .6, cup_p90: .9, cdn_p50: .3, cdn_p75: .6, cdn_p90: .9, arms: {}, sigmas: {} };
ok(eventLayerTag('EURUSD', '2026-11-24') === null, 'ordinary day must be x1 (no tag)');
ok(eventLayerRows('EURUSD', base, '2026-11-24').length === 0, 'ordinary day must add no rows');
ok(eventLayerTag('NQ', '2026-10-28')?.bucket === 'FOMC', 'NQ on FOMC 2026-10-28');
ok(eventLayerTag('EURUSD', '2026-10-29')?.bucket === 'CB', 'EURUSD on ECB 2026-10-29');
ok(eventLayerTag('NQ', '2026-10-29') === null, 'NQ does not hear the ECB');
ok(eventLayerTag('AUDCAD', '2026-10-28')?.label.includes('BoC'), 'AUDCAD BoC + FOMC day ranks CB');
const ev = eventLayerLevels('EURUSD', base, '2026-10-29');
const m = EVENT_LAYER.instruments.EURUSD.lines.hl.mult.CB['90'];
ok(Math.abs(ev.lines.hl.p90 - 1.8 * m) < 1e-12, 'layer = base x mult');
ok(base.hl_p90 === 1.8, 'base object untouched');
const plain = qlikeText({ EURUSD: base }, '2026-11-24', 'cfd');
ok(plain === qlikeText({ EURUSD: base }, '2026-11-24', 'cfd', { EURUSD: [] }), 'no extra rows -> identical export');
const withEv = qlikeText({ EURUSD: base }, '2026-10-29', 'cfd', { EURUSD: eventLayerRows('EURUSD', base, '2026-10-29') });
ok(withEv.includes('EV2 HL') && withEv.includes('ECB decision'), 'decision-day rows present');
const baseRows = t => t.split('\n').filter(r => /median/.test(r) && !r.startsWith('EV2'));
ok(JSON.stringify(baseRows(withEv)) === JSON.stringify(baseRows(qlikeText({ EURUSD: base }, '2026-10-29', 'cfd'))), 'base rows identical with the layer on');
console.log(bad ? `${bad} FAILED` : `layer 2 ok: ${Object.keys(EVENT_LAYER.instruments).length} CFDs, base untouched, x1 on ordinary days`);
process.exit(bad ? 1 : 0);
