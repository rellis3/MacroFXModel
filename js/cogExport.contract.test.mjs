/**
 * Contract test for the COG export text — its Pine consumers, both of them.
 *
 * The export is a PUBLIC INTERFACE. Several TradingView indicators parse it, and
 * they do NOT parse it the same way:
 *
 *   cog_volatility_v3_sessions.pine  reads ROW TOKENS   — finds a row by "RANGE" /
 *       "MOVE" / "OPEN HIGH" / "OPEN LOW" / "DRIFT", then pulls numbers by position
 *       (`f_firstNumAfter(row, ": ")`, `f_lastNumBefore(row, "75th")`).
 *
 *   weekly_vol_overlay.pine          reads SECTION HEADERS — is5DayHdr is a row
 *       containing "5-DAY" and "WEEKLY", is20DayHdr one containing "20-DAY" and
 *       "MONTHLY", and its "Both" display mode overlays them, so it needs BOTH
 *       sections present in a single paste.
 *
 * That difference has already cost a live break: splitting the weekly export into
 * separate Weekly and Monthly buttons was safe for the token parser and left the
 * header parser with one section per paste, so "Both" could never populate. There
 * was a contract test at the time — it only covered the token parser.
 *
 * The builders live inside vol-forecast-v2.html in a plain <script>, not a module.
 * They cannot be imported: converting that tag to type="module" would scope every
 * top-level function and break the inline onclick handlers the page is built on. So
 * this test extracts the real source from the HTML and evaluates it. Fragile to
 * renames, which is the point — a rename should fail here rather than on a chart.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../vol-forecast-v2.html', import.meta.url), 'utf8');

// Pull a top-level `function name(...) { ... }` out of the page by brace matching.
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name}() not found in vol-forecast-v2.html — renamed?`);
  // Find the body brace, NOT a brace in the parameter list — `buildCogExportText(data,
  // { weekly = false } = {})` destructures, so the first `{` after the name belongs to
  // the params and matching from there closes the "body" far too early.
  // walk to the end of the (possibly nested) parameter list first
  let depth = 0, i = src.indexOf('(', start);
  for (; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) { i++; break; }
  }
  i = src.indexOf('{', i);
  depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

function buildersFromPage() {
  const cogC = HTML.match(/const COG_C = \{[\s\S]*?\};/);
  assert.ok(cogC, 'COG_C constant block not found');
  const prelude = `
    ${cogC[0]}
    const COG_SQRT252 = Math.sqrt(252);
    const _cogVol = (name, f) => f.vol_annual;      // stubbed: sigma source is tested elsewhere
    ${extractFn(HTML, '_cogBands')}
    ${extractFn(HTML, 'buildCogExportText')}
    return { buildCogExportText, _cogBands, COG_C };
  `;
  return Function(prelude)();
}

const { buildCogExportText } = buildersFromPage();
const DATA = { session_label: 'TEST SESSION', instruments: { GOLD: { vol_annual: 23.35 } } };

// ── the two parsers, ported faithfully from the Pine ─────────────────────────
const firstNumAfter = (s, k) => {
  const i = s.indexOf(k); if (i < 0) return null;
  const m = s.slice(i + k.length).replaceAll('%', ' ').match(/-?\d+\.?\d*/);
  return m ? +m[0] : null;
};
const lastNumBefore = (s, k) => {
  const i = s.indexOf(k); if (i < 0) return null;
  const m = [...s.slice(0, i).replaceAll('%', ' ').matchAll(/-?\d+\.?\d*/g)];
  return m.length ? +m[m.length - 1][0] : null;
};

test('daily export: every row the token parser looks for is present and parses', () => {
  const txt = buildCogExportText(DATA);
  for (const token of ['High to Low range', 'Open to Close move']) {
    const row = txt.split('\n').find(r => r.startsWith(token));
    assert.ok(row, `daily export lost the "${token}" row`);
    assert.ok(Number.isFinite(firstNumAfter(row, ': ')), `${token}: median does not parse`);
    assert.ok(Number.isFinite(lastNumBefore(row, '75th')), `${token}: 75th does not parse`);
  }
});

test('daily export: a 90th, where present, sits AFTER the 75th token', () => {
  // Appending it before "75th" would silently change what lastNumBefore returns —
  // the 75th line would quietly start drawing the 90th value.
  const txt = buildCogExportText(DATA);
  for (const row of txt.split('\n')) {
    if (!row.includes('90th')) continue;
    assert.ok(row.indexOf('90th') > row.indexOf('75th'),
      `90th must follow the 75th token: ${row}`);
    const p75 = lastNumBefore(row, '75th'), p90 = lastNumBefore(row, '90th');
    assert.ok(p90 > p75, `90th (${p90}) should exceed the 75th (${p75}) in: ${row}`);
  }
});

test('WEEKLY export carries BOTH sections in one paste', () => {
  // The break this file exists for. weekly_vol_overlay.pine's "Both" mode overlays
  // the two, so one section per export makes it unusable.
  const txt = buildCogExportText(DATA, { weekly: true });
  const up = txt.toUpperCase().split('\n');
  const has5 = up.some(r => r.includes('5-DAY') && r.includes('WEEKLY'));
  const has20 = up.some(r => r.includes('20-DAY') && r.includes('MONTHLY'));
  assert.ok(has5, 'no row matches is5DayHdr ("5-DAY" + "WEEKLY")');
  assert.ok(has20, 'no row matches is20DayHdr ("20-DAY" + "MONTHLY")');
});

test('weekly sections are ordered and each carries its own rows', () => {
  const rows = buildCogExportText(DATA, { weekly: true }).split('\n');
  const i5 = rows.findIndex(r => /5-Day/i.test(r));
  const i20 = rows.findIndex(r => /20-Day/i.test(r));
  assert.ok(i5 < i20, '5-Day section must precede 20-Day');
  for (const [from, to, label] of [[i5, i20, '5-Day'], [i20, rows.length, '20-Day']]) {
    const block = rows.slice(from + 1, to);
    assert.ok(block.some(r => r.startsWith('High to Low range')), `${label} block has no H-L row`);
    assert.ok(block.some(r => r.startsWith('Open to Close move')), `${label} block has no O-C row`);
  }
});

test('the 20-day band is wider than the 5-day one', () => {
  // sqrt-time scaling: sqrt(20)/sqrt(5) = 2. A regression that swapped the multipliers
  // would still parse perfectly and be wrong on the chart.
  const rows = buildCogExportText(DATA, { weekly: true }).split('\n');
  const i20 = rows.findIndex(r => /20-Day/i.test(r));
  const hl = rows.map((r, i) => [i, r]).filter(([, r]) => r.startsWith('High to Low range'));
  const w5 = firstNumAfter(hl.find(([i]) => i < i20)[1], ': ');
  const w20 = firstNumAfter(hl.find(([i]) => i > i20)[1], ': ');
  assert.ok(w20 > w5, `20-day (${w20}) must exceed 5-day (${w5})`);
  assert.ok(Math.abs(w20 / w5 - 2) < 0.01, `expected a 2x ratio, got ${(w20 / w5).toFixed(3)}`);
});

test('weekly rows stay in the format the header parser was built against', () => {
  // Deliberately NOT carrying the 90th: that parser has not been checked against it,
  // and this export is the one that already broke once.
  const rows = buildCogExportText(DATA, { weekly: true }).split('\n');
  for (const r of rows.filter(x => x.startsWith('High to Low range') || x.startsWith('Open to Close move'))) {
    assert.match(r, /^.{24}: \d+\.\d{2}% median · \d+\.\d{2}% 75th Percentile$/,
      `weekly row format drifted: ${JSON.stringify(r)}`);
  }
});

test('the export still names the instrument in a divider the parsers can find', () => {
  const txt = buildCogExportText(DATA, { weekly: true });
  assert.ok(txt.toUpperCase().includes('GOLD'), 'instrument name missing from the export');
  assert.match(txt, /^\*\*VOL & RANGE FORECAST — COG WEEKLY\*\*/, 'weekly title changed');
});
