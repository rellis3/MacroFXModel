// node js/terminal/scorecardView.test.mjs: the auditable macro scorecard, the factor bar, and the per-currency macro strip.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rowStates, factorState, dimWhy, coverageChip, stackHtml, scorecardHtml, FACTOR_KEYS, sourceEnded, liveCpiNote } from './scorecardView.js';
import { ribbonSvg, rowParts, stripHtml, miniHtml } from './ccyMacroStrip.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const f = (label, score, dims, of) => ({ label, score, dims, excludedStale: [], coverage: dims.length / of, of });
// CAD as served on 2026-11-15: inflation and demand have no usable series (4 of 6)
const CAD = { ccy: 'CAD', composite: 0.42, factorsScored: 4, factorsTotal: 6, stale: [],
  factors: { rates: f('Rates & policy', 0.13, ['rateDiff', 'yieldCurve'], 3), inflation: f('Inflation', null, [], 2), growth: f('Growth', 0.71, ['gdp', 'ism'], 2), labour: f('Labour market', 0.15, ['laborMarket'], 1), demand: f('Domestic demand', null, [], 2), external: f('External balance', 0.7, ['tradeBalance'], 1) } };
const USD = { ccy: 'USD', composite: 0.3, factorsScored: 6, factorsTotal: 6, stale: [],
  factors: { rates: f('Rates & policy', 0.22, ['rateDiff', 'realYield', 'yieldCurve'], 3), inflation: f('Inflation', 0.79, ['cpi', 'ppi'], 2), growth: f('Growth', -0.2, ['gdp', 'ism'], 2), labour: f('Labour market', 0.1, ['laborMarket'], 1), demand: f('Domestic demand', 0.4, ['retailSales', 'consumerConfidence'], 2), external: f('External balance', 0.5, ['tradeBalance'], 1) } };
const SC = { ranked: [CAD, USD], discontinued: { cpi: { CAD: { since: '2025-03', reason: 'OECD MEI mirror discontinued; Eurostat is Europe-only' } } } };

t('a currency on 4 of 6 factors names the two that are missing, and why each dimension is out', () => {
  const r = rowStates(CAD, SC);
  assert.equal(r.scored, 4); assert.deepEqual(r.missingFactors, ['Inflation', 'Domestic demand']);
  assert.match(dimWhy(CAD, 'cpi', SC), /CPI: series ended 2025-03 \(OECD MEI mirror discontinued/);
  assert.match(dimWhy(CAD, 'retailSales', SC), /retail sales: no series for CAD/);
  assert.match(dimWhy({ ...CAD, stale: [{ dim: 'gdp', asOf: '2026-04-01', ageDays: 228 }] }, 'gdp', SC), /228 days old, past its limit/);
});
t('the shares of the composite add up to the composite (it is the mean of the scored factors)', () => {
  for (const row of [CAD, USD]) { const r = rowStates(row, SC); const sum = r.states.reduce((a, x) => a + (x.share ?? 0), 0); assert.ok(Math.abs(sum - Math.round(sum * 100) / 100) < 1 && Math.abs(sum - row.composite) < 0.02, `${row.ccy} ${sum}`); }
});
t('a partial factor (rates on 2 of 3 series) is flagged partial with the missing series named', () => {
  const s = factorState(CAD, 'rates', SC); assert.ok(s.partial); assert.deepEqual(s.missing.map(m => m.dim), ['realYield']);
});
t('coverage chip: plain at 6, amber at 4-5, red below 4, always in words', () => {
  assert.ok(!/gold|dn/.test(coverageChip(6)) && /6 of 6/.test(coverageChip(6)));
  assert.ok(/gold/.test(coverageChip(4)) && /partial/.test(coverageChip(4)));
  assert.ok(/chip dn/.test(coverageChip(3)) && /thin/.test(coverageChip(3)));
});
t('the Macro-tab table shows missing cells hatched and labelled, the coverage chip, and says how many currencies are short', () => {
  const h = scorecardHtml(SC, { flag: { CAD: 'C' } });
  assert.equal((h.match(/msc-missing/g) ?? []).length, 2 + 0 + 0);                       // CAD's inflation and demand
  assert.ok(/4 of 6 · partial/.test(h) && /6 of 6/.test(h) && /1 of 2 currencies are scored on fewer than six factors/.test(h) && /never counted as zero/.test(h));
  assert.ok(/series ended 2025-03/.test(h));                                              // the reason is on the cell's hover text
  assert.ok(/All eight currencies have all six factors/.test(scorecardHtml({ ranked: [USD] })));
  assert.equal(scorecardHtml({ ranked: [] }), '');
});
t('the factor bar: positives right, negatives left, missing factors listed with their reasons, a note that it describes', () => {
  const h = stackHtml(USD, SC);
  assert.ok(/msc-half l/.test(h) && /msc-half r/.test(h) && /What the composite is made of/.test(h) && /it describes, it does not predict/.test(h));
  const c = stackHtml(CAD, SC); assert.ok(/msc-pill miss/.test(c) && /Left out: .*Inflation: CPI: series ended 2025-03/.test(c));
  assert.ok(/role="img"/.test(c) && /aria-label="CAD composite \+0\.42 from 4 of 6 factors"/.test(c));
  assert.ok(/msc-track mini/.test(stackHtml(CAD, SC, { compact: true })) && !/msc-pills/.test(stackHtml(CAD, SC, { compact: true })));
});
t('an inflation factor whose source ended says so, with the latest live CPI print beside it (not in the score)', () => {
  const board = { cells: { CAD: { cpi: { status: 'surprise', event: 'CPI m/m', unit: 'm/m', actual: '0.2%', ms: Date.parse('2026-11-16T13:30:00Z'), ageDays: 11, cadence: 'monthly' } } } };
  assert.ok(sourceEnded(CAD, factorState(CAD, 'inflation', SC), SC), 'CPI discontinued and no PPI series outside the US: the source ended');
  assert.ok(!sourceEnded(CAD, factorState(CAD, 'demand', SC), SC), 'demand is merely missing');
  assert.equal(liveCpiNote('CAD', board), 'latest CPI m/m 0.2% (16 Nov)');
  assert.equal(liveCpiNote('CAD', { cells: { CAD: { cpi: { ...board.cells.CAD.cpi, ageDays: 600 } } } }), '', 'a print whose feed stopped is not offered as the latest');
  const h = scorecardHtml(SC, { board });
  assert.ok(/source ended/.test(h) && /latest CPI m\/m 0\.2% \(16 Nov\)/.test(h) && /missing/.test(h));
});
t('the six factor keys are the engine\'s', () => assert.deepEqual(FACTOR_KEYS, ['rates', 'inflation', 'growth', 'labour', 'demand', 'external']));

// ── the per-currency strip ──
const cell = (o = {}) => ({ family: 'labour', status: 'surprise', event: 'Unemployment Rate', cadence: 'monthly', ms: Date.parse('2026-11-07T13:30:00Z'), ageDays: 8, stale: false, actual: '4.3%', estimate: '4.2%', prev: '4.2%', z: -0.8, strength: -1, basis: 'consensus',
  history: [3.9, 4.0, 4.1, 4.1, 4.2, 4.3].map((v, i) => ({ ms: 1e12 + i * 2.6e9, v })), next: { ms: Date.parse('2026-12-05T13:30:00Z'), event: 'Unemployment Rate' }, ...o });
const BOARD = { cells: { CAD: { labour: cell(), cpi: { family: 'cpi', status: 'none', engine: { score: null, discontinued: { since: '2025-03', reason: 'x' } } }, gdp: { family: 'gdp', status: 'engine', engine: { score: 0.49, asOf: '2026-04-01' } },
  ppi: cell({ family: 'ppi', event: 'PPI m/m', strength: 1, actual: '0.4%', estimate: '0.2%', z: 1.2, history: [] }), pmi: { family: 'pmi', status: 'none' }, retail: { family: 'retail', status: 'none' }, trade: { family: 'trade', status: 'none' }, confidence: { family: 'confidence', status: 'none' } } } };

t('row parts: a weaker print says Weaker in words with the arrow and the basis; a stronger one says Stronger; engine-only and no-feed rows say so', () => {
  const FAM = k => ({ key: k });
  const w = rowParts('CAD', FAM('labour'), BOARD.cells.CAD.labour);
  assert.equal(w.dirWord, 'Weaker'); assert.equal(w.arrow, '▼'); assert.equal(w.dirCls, 'dn'); assert.equal(w.basis, 'vs expected'); assert.match(w.sub, /expected 4\.2% · prior 4\.2%/); assert.ok(w.ribbon.includes('cms-ribbon'));
  assert.equal(rowParts('CAD', FAM('ppi'), BOARD.cells.CAD.ppi).dirWord, 'Stronger');
  const e = rowParts('CAD', FAM('gdp'), BOARD.cells.CAD.gdp); assert.equal(e.dirWord, 'Above its norm'); assert.equal(e.dirCls, 'up'); assert.match(e.print, /engine \+0\.49/);
  assert.match(rowParts('CAD', FAM('cpi'), BOARD.cells.CAD.cpi).sub, /series ended 2025-03/);
  assert.match(rowParts('CAD', FAM('pmi'), BOARD.cells.CAD.pmi).sub, /no feed/);
  assert.equal(rowParts('CAD', FAM('labour'), cell({ basis: 'prior', strength: 0, estimate: null })).dirWord, 'In line');
});
t('ribbon needs two points; it draws an area, a glowing line, an end dot and a label that says what it is', () => {
  assert.equal(ribbonSvg([{ v: 1 }]), ''); assert.equal(ribbonSvg([]), ''); assert.equal(ribbonSvg(undefined), '');
  const s = ribbonSvg(BOARD.cells.CAD.labour.history); assert.ok(/class="area"/.test(s) && /class="line"/.test(s) && /class="dot"/.test(s) && /last 6 prints, 3\.9 to 4\.3/.test(s));
});
t('the modal section: eight rows, clickable where there is something to read, the factor bar under it, no colour literals, no trade words', () => {
  const h = stripHtml('CAD', BOARD, SC);
  assert.ok(/data-surface="panel\.ccy\.macrostrip"/.test(h) && /Macro picture/.test(h) && (h.match(/class="cms-row"/g) ?? []).length === 8);
  assert.ok((h.match(/ttMacroOpen\('CAD','/g) ?? []).length >= 3 && /tabindex="0" role="button"/.test(h));
  assert.ok(/What the composite is made of/.test(h) && /not a forecast for the currency/.test(h));
  assert.ok(!/#[0-9a-fA-F]{3,6}\b|rgb\(/.test(h.replace(/&#39;/g, '')), 'no hard-coded colour');
  assert.ok(!/\b(buy|sell|long|short|entry|stop|target)\b/i.test(h.replace(/<[^>]+>/g, ' ')), 'no trade wording');
  assert.equal(stripHtml('XXX', BOARD, SC), '');
  assert.ok(/not loaded yet/.test(stripHtml('CAD', null, SC)));
});
t('the card line: the compact bar with "n of 6", for a currency the scorecard has; nothing otherwise', () => {
  assert.ok(/4 of 6/.test(miniHtml('CAD', SC)) && /msc-track mini/.test(miniHtml('CAD', SC))); assert.equal(miniHtml('XXX', SC), '');
});
t('desk-terminal.html uses them: the scorecard board, the modal strip and the card line (guard)', () => {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'desk-terminal.html'), 'utf8');
  assert.ok(html.includes('ccyMacro?.scorecardHtml(') && html.includes('ccyMacro?.stripHtml(') && html.includes('ccyMacro?.miniHtml(') && html.includes('macro-strip.css') && html.includes('ccyMacroStrip.js'));
});
console.log(`\n${n} passed`);
