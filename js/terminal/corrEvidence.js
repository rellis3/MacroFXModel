/**
 * What the Evidence Book (js/deskEvidence.js) says next to each view of the Correlations & hedges tab.
 *
 * Every chip is the entry's own verdict, quoted through citable(), so an entry the code audit left unverified says
 * so. Where nothing in the book tests the thing on screen, the chip says UNTESTED: in particular no entry tests that
 * the ranked hedges below cut a book's losses, so they are never shown as working.
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
    untested: ['Ranked hedges: no entry tests that holding these cuts a book\'s losses out of sample. Past co-movement only.'],
    ids: [['rule-a-portfolio-budget', 'The one tested use of correlation for risk: cluster budgets, underpowered.']],
  },
  // `signals` (the hedge-signal generator's card) was removed on 2026-11-06 with the signals themselves: retired, untested.
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
