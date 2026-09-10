// Synthetic tests for js/dataAgeStamp.js. No network, no real clock.
//   node js/dataAgeStamp.test.mjs
import {
  newestObservation, cadenceOf, discontinuedIn, ageDaysOf, renderDataAgeStamp,
  perCurrencyAges, budgetFor,
} from './dataAgeStamp.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };
const NOW = Date.parse('2026-09-10T12:00:00Z');
const el = () => ({ innerHTML: '', title: '' });   // enough of a DOM node for this

console.log('[newestObservation — the DATA date, never the fetch time]');
{
  // THE BUG this whole module exists for: generatedAt is always today and is true
  // whether the series published this morning or stopped in 2021.
  const p = { generatedAt: '2026-09-10T14:40:00Z', byCcy: { JPY: { headline: { latestDate: '2021-06-01' } } } };
  ok('ignores generatedAt and finds the real observation', newestObservation(p) === '2021-06-01', newestObservation(p));
}
{
  ok('finds the newest across differently-shaped payloads',
     newestObservation({ byCcy: { A: { d: { latestDate: '2026-05-01' } }, B: { rows: [{ asOf: '2026-07-01' }] } } }) === '2026-07-01');
  ok('reads the date half of an ISO timestamp on a non-meta key',
     newestObservation({ observed: '2026-06-15T08:30:00Z' }) === '2026-06-15');
  ok('no dates at all -> null, not a guess', newestObservation({ score: 1 }) === null);
}

console.log('[cadence decides what "old" means]');
{
  const quarterly = { generatedAt: '2026-09-10T00:00:00Z', byCcy: { GBP: { cadence: 'quarterly', headline: { latestDate: '2026-04-01' } } } };
  const r = renderDataAgeStamp(el(), quarterly, { label: 'retail sales', now: NOW });
  // 162 days. Normal for quarterly; would be a full release behind if monthly.
  ok('a normal quarterly print is NOT flagged overdue', r.overdue === false, `${r.age}d`);
  const monthly = { generatedAt: '2026-09-10T00:00:00Z', byCcy: { GBP: { cadence: 'monthly', headline: { latestDate: '2026-04-01' } } } };
  ok('the SAME date on a monthly series IS overdue',
     renderDataAgeStamp(el(), monthly, { now: NOW }).overdue === true);
  ok('cadence is read from whichever currency declares one', cadenceOf(quarterly) === 'quarterly');
  ok('and falls back when no engine reports it', cadenceOf({ byCcy: { X: {} } }, 'monthly') === 'monthly');
  ok('quarterly gets a much longer budget than monthly',
     budgetFor('cpi', 'quarterly') > budgetFor('cpi', 'monthly'));
  // The budgets come from js/macroScorecardEngine.js, not from a second table here.
  // A standalone 80-day monthly budget flagged seven trade-balance currencies as
  // "behind" that the scorecard counts as healthy (it allows 150d there for OECD's
  // two-month lag). A page contradicting the composite it feeds is worse than either
  // being wrong alone, because the reader cannot tell which to believe.
  ok('the page uses the SCORECARD budget for a dimension, not its own',
     budgetFor('tradeBalance', null) === 150, String(budgetFor('tradeBalance', null)));
  ok('cadence still overrides the dimension entry, mirroring readDim',
     budgetFor('tradeBalance', 'quarterly') === 300, String(budgetFor('tradeBalance', 'quarterly')));
}

console.log('[the three states read differently, because they mean different things]');
{
  const fresh = { generatedAt: '2026-09-10T00:00:00Z', byCcy: { USD: { cadence: 'monthly', h: { latestDate: '2026-07-01' } } } };
  const e1 = el(); renderDataAgeStamp(e1, fresh, { dim: 'cpi', label: 'CPI', now: NOW });
  ok('current: leads with the data date', e1.innerHTML.includes('Data: 2026-07-01'));
  ok('current: no warning colour', !e1.innerHTML.includes('#e8963c'));
  ok('current: fetch time is demoted to a suffix', e1.innerHTML.includes('checked'));

  const late = { generatedAt: '2026-09-10T00:00:00Z', byCcy: { USD: { cadence: 'monthly', h: { latestDate: '2026-01-01' } } } };
  const e2 = el(); const r2 = renderDataAgeStamp(e2, late, { dim: 'cpi', label: 'CPI', now: NOW });
  ok('overdue: warns', e2.innerHTML.includes('⚠') && r2.overdue === true);
  ok('overdue: the tooltip says a release is probably missing', e2.title.includes('should have arrived'));

  const dead = { generatedAt: '2026-09-10T00:00:00Z', byCcy: {
    USD: { cadence: 'monthly', h: { latestDate: '2026-07-01' } },
    JPY: { discontinued: { since: '2021-06', was: 'CPALTT01JPM659N', reason: 'OECD MEI withdrawn' } } } };
  const e3 = el(); const r3 = renderDataAgeStamp(e3, dead, { dim: 'cpi', label: 'CPI', now: NOW });
  ok('discontinued: counted and shown', e3.innerHTML.includes('1 source discontinued'), e3.innerHTML);
  ok('discontinued: says "not late — gone", so nobody waits for it', e3.title.includes('not late'));
  ok('discontinued: names the currency and when it stopped', e3.title.includes('JPY') && e3.title.includes('2021-06'));
  ok('discontinued does NOT suppress a healthy data date', e3.innerHTML.includes('Data: 2026-07-01'));
  ok('discontinuedIn lists them structurally', discontinuedIn(dead)[0].ccy === 'JPY');
}
{
  // A payload with no observation date must say so rather than look clean. Silence
  // here would read as "fine", which is the failure mode being removed.
  const e4 = el();
  const r = renderDataAgeStamp(e4, { generatedAt: '2026-09-10T00:00:00Z', byCcy: {} }, { now: NOW });
  ok('no observation date -> says so loudly, does not look fine', e4.innerHTML.includes('no observation date'));
  ok('and reports null age rather than 0', r.age === null);
  ok('tooltip tells the reader to treat the numbers as unverified', e4.title.includes('unverified'));
}
{
  ok('ageDaysOf counts whole days', ageDaysOf('2026-09-01', NOW) === 9);
  ok('ageDaysOf(null) is null', ageDaysOf(null) === null);
  ok('a missing element is a no-op, not a crash', renderDataAgeStamp(null, {}) === null);
}

console.log('[the monthly threshold must not cry wolf through the normal cycle]');
{
  // A monthly observation is dated the 1st of month M and publishes ~mid-M+1, so it
  // is the newest print available until mid-M+2 -- by which point it is ~75 days old
  // and still perfectly correct. The obvious 62-day threshold would warn for the last
  // fortnight of EVERY month, and a warning that fires half the time is one nobody
  // reads. Read on 2026-09-10:
  const at = (d, cadence = 'monthly') => renderDataAgeStamp(el(),
    { generatedAt: '2026-09-10', byCcy: { X: { cadence, h: { latestDate: d } } } }, { dim: 'cpi', now: NOW });
  ok('last month\'s print (40d) is quiet', at('2026-08-01').overdue === false);
  ok('the month before (71d) is STILL quiet — this is the case 62 got wrong',
     at('2026-07-01').overdue === false, at('2026-07-01').age + 'd');
  // 'cpi' carries a 130-day budget in the scorecard table, so the warn point sits
  // further out than a bare monthly cadence would put it -- deliberately, since that
  // table is tuned to the real publication lags.
  ok('two cycles back is still inside the CPI budget', at('2026-06-01').overdue === false);
  ok('but four cycles back warns', at('2026-04-01').overdue === true);
  ok('and a long-dead monthly series certainly warns', at('2026-01-01').overdue === true);
  // The live USD CPI on the day this was written, which must not look broken.
  ok('the real USD CPI reading of the day reads as healthy', at('2026-07-01').overdue === false);
}

console.log('[one fresh currency must not hide the stale ones behind it]');
{
  // The headline reports the NEWEST observation in the payload. On a page where USD
  // published this morning and others stopped long ago, that headline is technically
  // true and practically a lie -- the same shape of error as a composite averaging a
  // dead print into a live score.
  const p = { generatedAt: '2026-09-10', byCcy: {
    USD: { cadence: 'monthly', h: { latestDate: '2026-08-01' } },   //  40d, fine
    GBP: { cadence: 'monthly', h: { latestDate: '2026-07-01' } },   //  71d, fine
    JPY: { cadence: 'monthly', h: { latestDate: '2025-11-01' } },   // 313d, behind
    CHF: { cadence: 'monthly', h: { latestDate: '2025-06-01' } },   // 466d, behind
  } };
  const e = el(); const r = renderDataAgeStamp(e, p, { dim: 'cpi', label: 'CPI', now: NOW });
  ok('headline still shows the newest date', e.innerHTML.includes('Data: 2026-08-01'));
  ok('headline alone would look completely healthy', r.overdue === false);
  ok('but the stamp says 2 are behind', e.innerHTML.includes('2 behind'), e.innerHTML);
  ok('and the tooltip names them with their dates',
     e.title.includes('JPY 2025-11-01') && e.title.includes('CHF 2025-06-01'));
  ok('the tooltip explains the headline can hide them', e.title.includes('can hide these'));
}
{
  const p = { generatedAt: '2026-09-10', byCcy: {
    USD: { cadence: 'monthly', h: { latestDate: '2026-08-01' } },
    JPY: { discontinued: { since: '2021-06', was: 'X' } },
  } };
  const e = el(); renderDataAgeStamp(e, p, { now: NOW });
  ok('a DISCONTINUED currency is not double-counted as merely behind',
     !e.innerHTML.includes('behind') && e.innerHTML.includes('discontinued'), e.innerHTML);
  ok('perCurrencyAges excludes discontinued rows', perCurrencyAges(p, NOW).every(x => x.ccy !== 'JPY'));
  ok('and sorts worst-first so the tooltip leads with the biggest problem',
     perCurrencyAges({ byCcy: { A: { h: { latestDate: '2026-08-01' } }, B: { h: { latestDate: '2025-01-01' } } } }, NOW)[0].ccy === 'B');
}
{
  // Quarterly laggards are judged on the quarterly budget, not the monthly one.
  const p = { generatedAt: '2026-09-10', byCcy: {
    USD: { cadence: 'quarterly', h: { latestDate: '2026-04-01' } },   // 162d, normal
    EUR: { cadence: 'quarterly', h: { latestDate: '2026-01-01' } },   // 252d, normal
  } };
  const e = el(); renderDataAgeStamp(e, p, { now: NOW });
  ok('normal quarterly currencies are not reported as behind', !e.innerHTML.includes('behind'), e.innerHTML);
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll dataAgeStamp tests passed.');
