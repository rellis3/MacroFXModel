/**
 * Book intelligence (Desk Terminal, Overview, under the book headline): a compact strip and three or four sentences
 * written by template from numbers the run already has. No model call, no new score, no forecast:
 *   global call          run.head.book.global (the Head's adoption of the Global Manager's ruling);
 *   net concentration    js/deskExposure.js netExposure on the book after the cap (= run.head.book.exposure.after);
 *   effective bets       /api/desk-risk (js/deskRisk.js bookRisk) on today's book; the bullet names the concentration group
 *                        (js/terminal/bookView.js) with the fewest independent bets per card;
 *   largest scenario     the worst book total over /api/scenarios (js/scenarioEngine.js), via scenarioMatrix;
 *   against the view     js/terminal/bookView.js viewCheck: FX cards whose direction is the opposite of what their two
 *                        currencies' biases imply ("x of y cards agree with their currency bias").
 * Pure. Tested in js/terminal/bookView.test.mjs.
 */
import { exposureRows, concentration, flagText, viewCheck, viewTally, liveCards, EQUITY } from './bookView.js';
import { worstRow } from './scenarioMap.js';
import { groupOf } from '../deskPack.js';

const n2 = v => (Number.isFinite(v) ? (Math.round(v * 100) / 100).toString() : '–');
const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + n2(Math.abs(v));
const toneTxt = t => String(t ?? '').replace(/_/g, '-') || 'no ruling';
// the desk login reads a net position as a lean (bullish / bearish), never as a position (long / short)
const sideTxt = (net, k) => { const w = globalThis.deskIsViewer?.() ? (net > 0 ? 'bullish' : 'bearish') : (net > 0 ? 'long' : 'short'); return k === EQUITY ? `${w} equities` : `${w} ${k}`; };
const list = xs => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/**
 * ctx: { run, risk (the /api/desk-risk body, optional), matrix (scenarioMatrix, optional) }.
 * Returns { tiles: [{ k, v, s, tone }], bullets: [string], facts } (facts: the numbers, for tests).
 */
export function bookIntel({ run, risk = null, matrix = null }) {
  const book = run?.head?.book ?? {}, cards = book.instruments ?? {}, ccyView = run?.debate?.currency?.view?.currencies ?? book.currencies ?? {};
  const live = liveCards(cards), fx = live.filter(([n]) => /^fx_/.test(groupOf(n) ?? '')).length;
  const tone = book.global?.tone ?? run?.debate?.global?.view?.tone ?? null, conv = run?.debate?.global?.view?.conviction ?? null;
  const rows = exposureRows(cards).filter(r => r.key !== EQUITY), top = rows[0] ?? null, cap = book.exposure?.cap ?? null;
  const flags = concentration(cards, risk?.ok ? risk : null);
  // the bullet names the tightest group: the fewest independent bets per card (the largest by units when no correlations)
  const flag = flags.filter(f => f.bets).sort((a, b) => a.bets.bets / a.bets.of - b.bets.bets / b.bets.of || b.units - a.units)[0] ?? flags[0] ?? null;
  const tally = viewTally(viewCheck(cards, ccyView));
  const worst = worstRow(matrix);
  const worstCards = worst ? Object.entries(worst.cells).filter(([, v]) => Number.isFinite(v) && v < 0).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([n]) => n) : [];
  const eb = risk?.ok ? { bets: risk.effectiveBets, of: risk.cards, days: risk.days } : null;
  const cut = top ? (book.exposure?.cuts ?? []).find(c => c.ccy === top.key) : null;

  const tiles = [
    { k: 'Global call', v: toneTxt(tone), s: conv ? `${conv} conviction · the Head's ruling` : "the Head's ruling", tone: /off/i.test(tone ?? '') ? 'dn' : /on/i.test(tone ?? '') ? 'up' : '' },
    { k: 'Largest net currency', v: top ? `${sideTxt(top.net, top.key)} ${n2(Math.abs(top.net))}` : '–', s: top ? `${top.cards.length} cards · units as the cap counts them${cap ? ` · cap ±${cap}` : ''}` : 'no FX exposure', tone: '' },
    { k: 'Effective bets', v: eb ? `${n2(eb.bets)} of ${eb.of}` : '–', s: eb ? `independent bets · ${eb.days} sessions' correlations` : (risk?.error ?? risk?.reason ?? 'risk read not loaded'), tone: '' },
    { k: 'Largest scenario loss', v: worst ? `${sgn(worst.total)} card-σ` : '–', s: worst ? `${worst.label}${worst.totalPct != null ? ` · ${sgn(worst.totalPct)}% of gross` : ''}` : matrix ? 'no listed scenario loses' : 'scenarios not loaded', tone: worst ? 'dn' : '' },
    { k: 'Against currency view', v: tally.judged ? `${tally.against.length} of ${tally.judged}` : '–', s: tally.judged ? `FX cards · ${tally.agree} agree with their currencies' biases` : 'no FX card with a ruling on its legs', tone: tally.against.length ? 'gold' : '' },
  ];

  const bullets = [];
  if (top) bullets.push(`The largest net currency position is ${sideTxt(top.net, top.key)}, ${n2(Math.abs(top.net))} units across ${top.cards.length} card${top.cards.length === 1 ? '' : 's'}${cap != null && Math.abs(top.net) >= cap - 1e-9 ? `, at the ±${cap} cap` : ''}${cut ? ` (the cap cut it from ${sgn(cut.net)})` : ''}.`);
  if (flag) bullets.push(`${flag.bets ? 'Tightest cluster' : 'Concentration'}: ${flagText(flag, { days: risk?.days ?? null })}`);
  if (worst) bullets.push(`The largest loss in the scenario set is "${worst.label}": ${sgn(worst.total)} card-σ${worst.totalPct != null ? ` (${sgn(worst.totalPct)}% of gross)` : ''}${worstCards.length ? `, most from ${list(worstCards)}` : ''}. Today's sensitivities, not a forecast.`);
  if (tally.judged) bullets.push(`${tally.agree} of ${tally.judged} FX cards agree with their currencies' biases${tally.against.length ? `; against the currency view: ${list(tally.against.slice(0, 5))}${tally.against.length > 5 ? ` and ${tally.against.length - 5} more` : ''}` : ''}.`);
  if (bullets.length < 3) bullets.unshift(`The global ruling is ${toneTxt(tone)}${conv ? ` at ${conv} conviction` : ''}; the book holds ${live.length} live card${live.length === 1 ? '' : 's'}, ${fx} of them FX.`);
  return { tiles, bullets: bullets.slice(0, 4), facts: { tone, top, flag, worst, tally, eb, live: live.length } };
}
