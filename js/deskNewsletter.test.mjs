import assert from 'node:assert/strict';
import { styleExamples, newsletterSections, renderDeskNewsletter } from './deskNewsletter.js';
import { validateNewsletterIssue, NL_LABELS } from './deskSchemas.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.log('FAIL', name); throw e; } };

const TEXT = `THE CHAIN · DAILY · 2026-11-02

QUIET DAY · MONDAY 2 NOVEMBER · MIXED REGIME
Cheaper money, but stocks and gold fall too

REGIME  Mixed regime
CHANGED 3 of 10 chain links broken
WATCH   ISM 15:00

CHANGED SINCE FRI
- Gold down 0.8%

US borrowing costs have dropped sharply, with ten-year yields down 26 basis points over 20 days. Normally that would lift gold and growth stocks, but both are down. Credit spreads widened 15 basis points.

NEXT RELEASES (UK time)
- 15:00 USD ISM (high)`;

t('style examples: the headline and the first prose paragraph of the latest dailies, never the weekly or the desk edition', () => {
  const ex = styleExamples([{ kind: 'desk', subject: 'x', text: TEXT, date: '2026-11-03' }, { kind: 'daily', subject: 'Cheaper money, but stocks and gold fall too', text: TEXT, date: '2026-11-02' }, { kind: 'weekly', subject: 'w', text: TEXT }]);
  assert.equal(ex.length, 1);
  assert.equal(ex[0].headline, 'Cheaper money, but stocks and gold fall too');
  assert.match(ex[0].opening, /^US borrowing costs have dropped sharply/);
  assert.deepEqual(styleExamples([{ kind: 'daily', subject: 's', text: 'SHORT' }]), []);
});

const issue = {
  subject: 'Dollar and yen bid as credit cracks, AUD the weak link',
  standfirst: 'Credit spreads widened 18bp in a day. The desk reads the tape as risk-off. The US midterms report at 15:16 UK time.',
  sections: [
    { title: 'The global backdrop', label: 'Model output', body: 'Risk-off, medium conviction.' },
    { title: 'The currencies', label: 'untested interpretation', body: 'USD and JPY lead; AUD trails.' },
    { title: 'What could break the day', label: 'Observed data', body: 'US midterms 15:16.' },
    { title: 'Bad label', label: 'Gut feel', body: 'x' },
  ],
  ideas: [{ instrument: 'AUD/JPY', view: 'strong short', size: 0.75, level: 'sell bounces to 103.40', invalidation: 'gate clears', why: 'weakest vs strongest' },
    { instrument: 'XYZ', view: 'LONG' }, { instrument: 'GOLD', view: 'maybe' }],
};

t('issue validation: labels normalised to the house set, unknown label -> Untested interpretation, bad ideas dropped', () => {
  const v = validateNewsletterIssue(issue);
  assert.ok(v.ok);
  assert.equal(v.value.sections[1].label, 'Untested interpretation');
  assert.equal(v.value.sections[3].label, 'Untested interpretation');
  assert.ok(v.value.sections.every(s => NL_LABELS.includes(s.label)));
  assert.deepEqual(v.value.ideas.map(i => [i.instrument, i.view]), [['AUDJPY', 'STRONG_SHORT']]);
  assert.ok(v.notes.some(x => /XYZ/.test(x)) && v.notes.some(x => /maybe/.test(x)));
});

t('issue validation: forecasting wording in the opening is flagged; too few sections fails', () => {
  const v = validateNewsletterIssue({ ...issue, standfirst: 'Gold will rally today.' });
  assert.ok(v.notes.includes('the opening uses forecasting wording'));
  assert.equal(validateNewsletterIssue({ subject: 's', standfirst: 'x', sections: [] }).ok, false);
});

t('render: masthead, desk-edition tag, headline, labels, ideas table, untested footer; HTML escaped; text version', () => {
  const v = validateNewsletterIssue(issue).value;
  v.subject = 'A <b>bold</b> headline';
  const { html, text } = renderDeskNewsletter(v, { date: '2026-11-03', runFinishedAt: '2026-11-03T07:06:57Z', packHealth: { ok: 79, total: 107 } });
  assert.match(html, /<b>The Chain<\/b><span>Desk edition · Tuesday, 3 November 2026/);
  assert.ok(html.includes('A &lt;b&gt;bold&lt;/b&gt; headline') && !html.includes('<b>bold</b>'));
  assert.ok(html.includes("The desk's ideas") && html.includes('AUDJPY') && html.includes('Strong short'));
  assert.ok(html.includes('79 of 107 feeds read') && html.includes('not scored until'));
  assert.ok(text.startsWith('A <b>bold</b> headline') && text.includes('[Model output]') && text.includes('AUDJPY: Strong short, size 0.75'));
});

t('writer input runs top-down and keeps only the non-flat cards, with sizes after the cap', () => {
  const run = { head: { book: { headline: 'h', global: { tone: 'risk_off' }, risks: [], gaps: [], exposure: { cap: 4 },
    instruments: { EURUSD: { rating: 'SHORT', size: 0.41, sizeBeforeCap: 0.85, why: 'w' }, USDCHF: { rating: 'FLAT', size: 0 } } } },
    debate: { global: { view: { tone: 'risk_off' } }, currency: { view: { ranking: ['USD'] } }, risk: { risk_neutral: { view: { headline: 'n', warnings: [] } } } }, analysts: {} };
  const s = newsletterSections(run, [{ headline: 'h', opening: 'o' }]);
  assert.deepEqual(s.map(x => x[0].split(':')[0]), ['The desk book', 'Global ruling', 'Currency ruling', 'The book', 'Net exposure by currency (after the cap)', 'Risk desk', 'Events and news analyst', 'Style examples']);
  assert.deepEqual(Object.keys(s[3][1]), ['EURUSD']);
  assert.equal(s[3][1].EURUSD.sizeBeforeCap, 0.85);
});

console.log(`deskNewsletter: ${n} tests passed`);
