import assert from 'node:assert/strict';
import { prepare, chartHtml, fmtChg, CHART_COLOURS } from './drillChart.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };
const S = (key, unit, values, label = key) => ({ key, label, unit, values });
const ramp = (from, step, len = 21) => Array.from({ length: len }, (_, i) => from + i * step);

// ── change from the start, in the series' own unit ──────────────────────────
t('every line starts at zero, whatever the series was worth', () => {
  const p = prepare([S('us10y', 'bp', ramp(4, 0.01)), S('gold', 'pct', ramp(2000, 5))]);
  for (const s of p) assert.equal(s.chg[0], 0, `${s.key} must start at zero`);
});

t('bp series are scaled to basis points, pct series to percent', () => {
  const [bp] = prepare([S('us10y', 'bp', ramp(4, 0.01))]);      // +0.20 over 20 steps
  assert.equal(Math.round(bp.end), 20, 'a 0.20 move in a yield is 20bp');
  const [pc] = prepare([S('gold', 'pct', ramp(100, 0.5))]);    // 100 -> 110 over 20 steps
  assert.ok(Math.abs(pc.end - 10) < 1e-9, '100 -> 110 is +10%');
});

t('a window too short to be a twenty-session chart is refused', () => {
  // two points is a line segment, not a window. Drawing one would imply a shape the
  // data cannot support.
  assert.equal(prepare([S('gold', 'pct', [100, 110])]), null);
  assert.equal(prepare([S('gold', 'pct', [1, 2, 3, 4])]), null);
  assert.ok(prepare([S('gold', 'pct', [1, 2, 3, 4, 5])]), 'five is the floor');
});

// ── the honesty rules ───────────────────────────────────────────────────────
t('a window that starts on a hole is refused — there is no baseline', () => {
  assert.equal(prepare([S('x', 'bp', [null, 1, 2, 3, 4, 5, 6])]), null);
});

t('a mostly-empty window is refused rather than drawn from four points', () => {
  assert.equal(prepare([S('x', 'bp', [1, null, null, null, null, null, 2])]), null);
});

t('nulls BREAK the line instead of being bridged across', () => {
  const vals = ramp(4, 0.01); vals[10] = null;
  const html = chartHtml(prepare([S('us10y', 'bp', vals)]), { esc: String });
  const polys = (html.match(/<polyline/g) || []).length;
  assert.equal(polys, 2, 'a hole in the middle must produce two segments, not one line through it');
});

t('a gapless window is one unbroken line', () => {
  const html = chartHtml(prepare([S('us10y', 'bp', ramp(4, 0.01))]), { esc: String });
  assert.equal((html.match(/<polyline/g) || []).length, 1);
});

// ── shared vs mixed units: the claim the picture is allowed to make ─────────
t('series sharing a unit get a real shared axis and a zero line', () => {
  const html = chartHtml(prepare([S('us2y', 'bp', ramp(4, 0.01)), S('us30y', 'bp', ramp(4, 0.02))]), { esc: String });
  assert.match(html, /stroke-dasharray/, 'a zero line belongs on a shared axis');
  assert.match(html, /shared basis-point axis/);
  assert.match(html, /heights are directly comparable/);
});

t('mixed units are scaled separately and the caption says so', () => {
  const html = chartHtml(prepare([S('oil', 'pct', ramp(70, 0.5)), S('bei', 'bp', ramp(2, 0.01))]), { esc: String });
  assert.doesNotMatch(html, /stroke-dasharray/, 'no shared zero line when the axes are not shared');
  assert.match(html, /units differ/);
  assert.match(html, /not the heights against each other/);
});

// ── the drawing must stay inside its box ────────────────────────────────────
t('no point is drawn outside the viewBox', () => {
  const html = chartHtml(prepare([S('a', 'bp', ramp(4, 0.05)), S('b', 'bp', ramp(4, -0.05))]), { esc: String });
  const vb = html.match(/viewBox="0 0 (\d+) (\d+)"/);
  const [W, H] = [+vb[1], +vb[2]];
  for (const m of html.matchAll(/points="([^"]+)"/g))
    for (const pt of m[1].split(' ')) {
      const [x, y] = pt.split(',').map(Number);
      assert.ok(x >= 0 && x <= W, `x ${x} outside 0..${W}`);
      assert.ok(y >= 0 && y <= H, `y ${y} outside 0..${H}`);
    }
});

t('a flat series does not divide by zero', () => {
  const html = chartHtml(prepare([S('flat', 'bp', Array(21).fill(4))]), { esc: String });
  assert.ok(html.includes('<polyline'));
  assert.doesNotMatch(html, /NaN|Infinity/);
});

// ── the legend is the receipt ───────────────────────────────────────────────
t('the legend labels every line with its real change', () => {
  const html = chartHtml(prepare([S('us10y', 'bp', ramp(4, 0.01), 'US 10-year'), S('gold', 'pct', ramp(100, 0.5), 'Gold')]), { esc: String });
  assert.match(html, /US 10-year/);
  assert.match(html, /\+20bp/);
  assert.match(html, /Gold/);
  assert.match(html, /\+10\.0%/);
});

t('each line gets its own colour', () => {
  const html = chartHtml(prepare([S('a', 'bp', ramp(1, 0.01)), S('b', 'bp', ramp(2, 0.02)), S('c', 'bp', ramp(3, 0.03))]), { esc: String });
  for (const c of CHART_COLOURS.slice(0, 3)) assert.ok(html.includes(c), `${c} should appear`);
});

t('the class prefix is the caller\'s, so two pages keep separate stylesheets', () => {
  const p = prepare([S('a', 'bp', ramp(1, 0.01))]);
  assert.match(chartHtml(p, { cls: 'mr', esc: String }), /class="mr-chart"/);
  assert.match(chartHtml(p, { cls: 'dq', esc: String }), /class="dq-chart"/);
});

t('the escaper is the caller\'s and is actually used on labels', () => {
  const html = chartHtml(prepare([S('x', 'bp', ramp(1, 0.01), '<script>')]), { esc: s => String(s).replace(/</g, '&lt;') });
  assert.doesNotMatch(html, /<script>/, 'a label must not escape into the markup');
  assert.match(html, /&lt;script>/);
});

t('degenerate input returns nothing rather than a broken box', () => {
  assert.equal(chartHtml(null, {}), '');
  assert.equal(chartHtml([], {}), '');
  assert.equal(prepare([]), null);
  assert.equal(prepare(null), null);
  assert.equal(prepare([{ key: 'x' }]), null);
});

t('fmtChg rounds bp to whole numbers and percent to one place', () => {
  assert.equal(fmtChg(20.4, 'bp'), '+20bp');
  assert.equal(fmtChg(-3.6, 'bp'), '-4bp');
  assert.equal(fmtChg(1.234, 'pct'), '+1.2%');
  assert.equal(fmtChg(-0.05, 'pct'), '-0.1%');
});

console.log(`drillChart: ${n} groups, all passed`);
