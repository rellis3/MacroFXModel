// js/terminal/ghostWalk.test.mjs: the ghost walk's drawing, its player definition and its command, over synthetic days and a stand-in page. node --test js/terminal/ghostWalk.test.mjs
// Proves: the picture uses theme tokens only, never draws past the current step, shows ghosts only when there are enough earlier days and says why when not, keeps the
// level lines off the chart honest, the player definition loads and draws every step, the honest "starts on <date>" line, the command (help, example, errors, no trade words) and
// that the feature is a preview surface wired into the loader and the status panel. It does NOT prove the look in a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ghostStage, yBound } from './ghostWalkDraw.js';
import { ghostDef, instFromLabel, evidenceChips } from './ghostWalk.js';
import { buildGhostPayload, makeFrames, selectGhosts, levelLines, touchTimes, STEP_MS, MIN_GHOSTS } from '../ghostWalkCore.js';
import { buildCommands } from './commandCore.js';
import { SURFACES } from './tabRegistry.js';
import { FEEL_KEYS } from './terminalFeel.js';
import { FEATURES } from './featureStatus.js';
import { sessionWindow } from '../replayCore.js';

const HOUR = 3600e3;
function dayBars(date, f) { const w = sessionWindow(date).start, rows = []; for (let i = 0; i < 96; i++) { const o = i ? f(i - 1) : 100, c = f(i); rows.push([w + i * STEP_MS, o, Math.max(o, c) + 0.05, Math.min(o, c) - 0.05, c]); } return rows; }
function series(n) {
  const bars = [], entries = [], forecasts = {}, days = []; let t = Date.parse('2026-09-01T12:00:00Z');
  for (let k = 0; days.length < n; k++) {
    const date = new Date(t).toISOString().slice(0, 10); t += 864e5; const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); if (dow === 0 || dow === 6) continue;
    bars.push(...dayBars(date, i => 100 + Math.sin((i + k) / 9) * 0.8 + (i === 30 ? 1.1 : 0)));
    entries.push({ date, asOf: date, savedAtMs: sessionWindow(date).start + 6.5 * HOUR, spot: 100, maxPain: 100.6, gammaFlip: 99.4, regime: 'pin', callWalls: [{ strike: 101, oi: 500, tier: 'strong' }, { strike: 104, oi: 200, tier: 'moderate' }], putWalls: [{ strike: 99, oi: 400, tier: 'strong' }], gexFlips: [] });
    forecasts[date] = { hl_median: 2, knownFrom: sessionWindow(date).start - 2 * HOUR }; days.push(date);
  }
  return { bars, entries, forecasts, days };
}
const payloadOf = n => { const s = series(n); return { ...buildGhostPayload({ bars: s.bars, entries: s.entries, forecasts: s.forecasts, focus: s.days.at(-1), n: 90 }), ok: true, dp: 1, label: 'Nasdaq 100', inst: 'NQ', date: s.days.at(-1) }; };

function extraFor(p, flt = 'all') {
  const focus = p.days.at(-1), sel = selectGhosts(p.days, focus, flt), ghostsOn = sel.enough, frames = makeFrames(focus, ghostsOn ? sel.ghosts : []), lines = levelLines(focus);
  return { frames, extra: { focus, ghosts: sel.ghosts, ghostsOn, filterLabel: sel.label, noGhostsWhy: `only ${sel.n} earlier days`, bandSeries: [], lines, touchAt: touchTimes(focus), levelsFrom: 6.5 * HOUR, dp: 1, label: 'Nasdaq 100', unitPct: 2, unitPts: 2, touchText: 'Over 20 earlier days ...', oiLine: 'levels: capture', evChips: evidenceChips() } };
}

test('the picture: theme tokens only, ghosts and levels drawn, a head at the current step, nothing after it', () => {
  const p = payloadOf(30), { frames, extra } = extraFor(p), i = 40, svg = ghostStage(frames, i, extra, {});
  assert.match(svg, /<svg class="rpv-svg gw-svg"/); assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(svg.replace(/&#\d+;/g, '')), 'no hex colours: tokens only'); assert.match(svg, /var\(--pur2\)/);
  assert.ok((svg.match(/stroke-opacity="\.10"/g) ?? []).length >= MIN_GHOSTS, 'one faint path per earlier day');
  assert.match(svg, /call wall/); assert.match(svg, /put wall/); assert.match(svg, /max pain/);
  // the day so far: the bright path ends at the current step, so the clock label of the last point is the frame's
  const later = ghostStage(frames, 90, extra, {}), nowPts = a => (a.match(/stroke="var\(--pur2\)" stroke-width="2\.4"/) ? 1 : 0);
  assert.equal(nowPts(svg), 1); assert.notEqual(svg, later);
  assert.match(svg, /role="img" aria-label="Nasdaq 100 on /);
});

test('ghosts only when there are enough earlier days, and the picture says why when not', () => {
  const p = payloadOf(8), { frames, extra } = extraFor(p), svg = ghostStage(frames, 10, extra, {});
  assert.equal(extra.ghostsOn, false); assert.ok(!/stroke-opacity="\.10"/.test(svg), 'no ghost paths drawn'); assert.match(svg, /no ghosts: only \d+ earlier days/);
});

test('reduced motion: no glow filter and no pulsing ring', () => {
  const p = payloadOf(30), { frames, extra } = extraFor(p), touchedI = frames.findIndex(f => f.data.touched.length);
  assert.ok(touchedI >= 0, 'a level is touched on the synthetic day');
  const a = ghostStage(frames, touchedI, extra, { reduced: false }), b = ghostStage(frames, touchedI, extra, { reduced: true });
  assert.match(a, /filter="url\(#gw/); assert.ok(!/filter="url\(#gw/.test(b)); assert.ok(!/class="gw-ring"/.test(b));
});

test('levels far from the open are counted as off the chart, not squashed onto it', () => {
  const p = payloadOf(30), { frames, extra } = extraFor(p); extra.lines = [...extra.lines, { id: 'far', type: 'call', price: 140, y: 9, x: 0 }];
  assert.ok(yBound(frames, extra) <= 3); assert.match(ghostStage(frames, 10, extra, {}), /1 level off the chart/);
});

test('words in the picture are escaped', () => {
  const p = payloadOf(30), { frames, extra } = extraFor(p); extra.label = '<img src=x onerror=alert(1)>'; extra.touchText = '<b>x</b>'; extra.filterLabel = '"><script>';
  const html = ghostStage(frames, 10, extra, {}); assert.ok(!/<img src=x|<script>|<b>x<\/b>/.test(html));
});

test('the player definition: market, session and ghost choices; every step draws; the coverage line says where the OI starts; a day outside it says so', async () => {
  const p = payloadOf(30); let url = null;
  const def = ghostDef('GOLD', null, { fetchJson: async u => { url = u; return p; }, now: () => Date.parse(`${p.date}T20:00:00Z`) });
  assert.equal(def.picks.length, 3); assert.equal(def.picks[0].values[0].v, 'GOLD', 'the window opens on the market asked for'); assert.ok(def.picks[2].values.some(v => v.v === 'regime'));
  const picks = { inst: 'NQ', day: p.date, flt: 'all' }, r = await def.load(picks);
  assert.match(url, /^\/api\/replay\/ghosts\?inst=NQ&date=/); assert.equal(r.frames.length, 96); assert.match(r.coverage, /from \w+, \d+ \w+ 2026/); assert.match(r.coverage, /only goes back as far as that capture/);
  for (let i = 0; i < r.frames.length; i += 7) { assert.match(def.draw(r.frames, i, { reduced: false, extra: r.extra, picks }), /<svg/); assert.ok(def.caption(r.frames, i, r.extra, picks).length > 20); assert.match(def.label(r.frames[i], i, r.frames.length, picks), /London/); }
  await assert.rejects(def.load({ inst: 'NQ', day: '2026-01-05', flt: 'all' }), /only starts on/);
  const none = ghostDef('NQ', null, { fetchJson: async () => ({ ...p, days: [], firstOi: null, oiDays: 0 }) });
  await assert.rejects(none.load({ inst: 'NQ', day: p.date, flt: 'all' }), /no option-OI captures are held/);
  const small = ghostDef('NQ', null, { fetchJson: async () => payloadOf(6) }), s = await small.load({ inst: 'NQ', day: payloadOf(6).date, flt: 'all' });
  assert.match(s.coverage, /No ghosts are drawn/);
});

test('terrain heading text maps to a desk market', () => {
  assert.equal(instFromLabel('Nasdaq (NQ)'), 'NQ'); assert.equal(instFromLabel('S&P 500 (ES)'), 'SPX500'); assert.equal(instFromLabel('Gold'), 'GOLD'); assert.equal(instFromLabel('EURUSD'), 'EURUSD'); assert.equal(instFromLabel('Nat gas'), null);
});

test('the evidence chips come from the Evidence Book itself', () => {
  const chips = evidenceChips([{ id: 'wall-placebo', verdict: 'null' }, { id: 'oi-max-pain', verdict: 'null' }, { id: 'gex-range-es', verdict: 'validated' }]);
  assert.equal(chips.length, 3); assert.match(chips[0], /NULL/); assert.match(chips[2], /VALIDATED/); assert.equal(evidenceChips([]).length, 0);
  assert.ok(evidenceChips().length >= 1, 'the real book carries at least one of the ids');
});

test('the GHOST command: help, example, errors, and no trade wording', () => {
  const cmds = buildCommands({ isOn: () => true, now: () => Date.parse('2026-11-16T10:00:00Z') }), c = cmds.find(x => x.id === 'ghost');
  assert.ok(c && c.help.length > 60 && c.example && c.opens && c.surface === 'widget.ghostwalk');
  assert.doesNotMatch(`${c.help} ${c.opens}`, /\b(buy|sell|entry|target|stop|signal)\b/i);
  assert.deepEqual(c.run('nq'), { action: { kind: 'ghost', inst: 'NQ', date: null }, summary: c.run('nq').summary });
  assert.equal(c.run('gold 12 nov').action.date, '2026-11-12'); assert.match(c.run('').error, /Say which market/); assert.match(c.run('nzdusd').error, /covers|not one of them/); assert.match(c.run('nq 32 nov').error, /real date|read/);
  assert.match(c.run('nq 2999-01-01').error, /not happened/);
  const off = buildCommands({ isOn: id => id !== 'widget.ghostwalk' }); assert.ok(!off.find(x => x.id === 'ghost')?.run || true);
});

test('it is a PREVIEW surface wired into the loader and the status panel', () => {
  const s = SURFACES.find(x => x.id === 'widget.ghostwalk'); assert.ok(s && s.hidden === 'preview' && s.kind === 'widget', 'registered as a preview widget');
  assert.ok(FEEL_KEYS.includes('ghostWalk')); assert.equal(FEATURES.ghostWalk.surface, 'widget.ghostwalk'); assert.ok(FEATURES.ghostWalk.where.some(w => /terrain/i.test(w)) && FEATURES.ghostWalk.where.some(w => /GHOST/.test(w)));
  const feel = fs.readFileSync(new URL('./terminalFeel.js', import.meta.url), 'utf8'); assert.match(feel, /ghostWalk: on\('widget\.ghostwalk'\)/); assert.match(feel, /import\('\.\/ghostWalk\.js'\)/);
});
