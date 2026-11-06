/**
 * What the Evidence Book (js/deskEvidence.js) says next to each view of the Correlations & hedges tab.
 *
 * Every chip is the entry's own verdict, quoted through citable(), so an entry the code audit left unverified says
 * so. Where nothing in the book tests the thing on screen, the chip says UNTESTED. The Book hedge (the top row held
 * against the book's biggest net currency exposure) is tested by hedge-finder-book (2026-11-06): the daily 5% tail
 * fell (hedge-finder-book-es, VALIDATED), drawdowns and Sharpe were not shown (hedge-finder-book, UNDERPOWERED). The
 * per-market finder (hedging one instrument) is still untested.
 */
import { DESK_EVIDENCE, citable } from '../deskEvidence.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// view -> [entry id, why it sits here]; `untested` lines are claims the tab touches that nothing in the book tests
export const VIEW_EVIDENCE = {
  matrix: {
    ids: [['rule-a-portfolio-budget', 'Correlated legs (>= 0.30) behave as one bet: sizing by cluster beat 1R per trade, but within noise.'],
      ['stock-bond-flip', 'How long a sign flip in a 20-day correlation has lasted; nothing about what follows.']],
  },
  rolling: {
    ids: [['stock-bond-flip', 'Episodes of a flipped 20-day correlation: median 5 sessions. Description, not a forecast.'],
      ['cross-iv', 'A trailing leg correlation is a working INPUT to the cross range lines; it is not a trading signal.']],
  },
  factors: {
    ids: [['spread-sleeve-factor-audit', 'The shared USD / risk factors behind the USD pairs, from a book audit since deflated.'],
      ['fx-factor-book-v2', 'A correlation-factor overlay on trend: no large improvement, realistic ones untestable here.'],
      ['fx-dollar-funding-exposure-hit', 'Which currencies get hit in risk-off weeks: the dollar-funding ranking tested null.']],
  },
  hedges: {
    untested: ['Per-market hedges: no entry tests that hedging one market with these rows cuts its losses out of sample. Past co-movement only.'],
    ids: [['rule-a-portfolio-budget', 'A tested use of correlation for risk: cluster budgets, underpowered. The Book hedge card carries its own test (hedge-finder-book).']],
  },
  bookHedge: {
    ids: [['hedge-finder-book-es', 'Daily 5% tail -9.2% [-11.4, -7.0] on a 26-year proxy book; nothing for USD or JPY exposures; the currency\'s own USD pair cut 16.6%.'],
      ['hedge-finder-book', 'Drawdowns and Sharpe not shown: max drawdown +0.5% [-18, +32], Sharpe -0.06 [-0.14, +0.03] after spreads.']],
  },
  signals: {
    untested: ['The hedge-signal generator (correlation z-score divergences): no banked verdict. Its backtest page is not a pre-registered test.'],
    ids: [['ou-bands-fx-crosses', 'Mean-reversion bands on correlated crosses: too few trades to test.']],
  },
  regimes: {
    ids: [['stock-bond-flip', 'Regime-dependent correlation as a base rate only.']],
  },
};

const CLS = { validated: 'up', null: 'dn', underpowered: 'gold', context: '' };
const WORD = { validated: 'VALIDATED', null: 'TESTED: NULL', underpowered: 'UNDERPOWERED', context: 'BASE RATE' };

/** One chip for an entry id: the verdict word (plus "unconfirmed" when the code audit did not clear it), the claim
 *  and the citable tag in the tooltip. '' for an unknown id. */
export function chipFor(id, why = '', list = DESK_EVIDENCE) {
  const e = list.find(x => x.id === id); if (!e) return '';
  const c = citable(e), unconf = c.audit && c.audit.status !== 'stands' ? ' · unconfirmed' : '';
  const title = `${e.id} (${e.date}): ${e.claim}. ${why ? why + ' ' : ''}${c.tag}. USE: ${e.use ?? ''}`;
  return `<span class="chip ${CLS[e.verdict] ?? ''} ct-ev" title="${esc(title)}" data-ev="${esc(e.id)}">${esc(WORD[e.verdict] ?? String(e.verdict).toUpperCase())}${esc(unconf)} · ${esc(e.id)}</span>`;
}
export const untestedChip = line => `<span class="chip ct-ev" title="${esc(line)}">UNTESTED</span>`;

/** The chip row for a view: untested lines first, then each entry's verdict. */
export function chipsFor(view, list = DESK_EVIDENCE) {
  const v = VIEW_EVIDENCE[view]; if (!v) return '';
  const parts = [...(v.untested ?? []).map(untestedChip), ...(v.ids ?? []).map(([id, why]) => chipFor(id, why, list))].filter(Boolean);
  return parts.length ? `<div class="ct-evrow"><span class="lbl">Evidence Book</span>${parts.join('')}</div>` : '';
}
