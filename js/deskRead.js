/**
 * The desk read — today, narrated, from numbers the page already computed.
 *
 * WHAT THIS IS FOR. Every panel on this page is true and none of them talks to the
 * others. A reader has to assemble "semis are up, nine sectors are down, the real
 * yield did the work, and the Nasdaq ignored it" into one thought themselves — and
 * that assembly IS the skill. A page that never demonstrates it never teaches it.
 *
 * WHY IT IS NOT AN AI CALL. Both reference designs put an "auto-generated market
 * story" here. That costs money on a schedule and, worse, a language model asked to
 * narrate will reach for a cause when the numbers do not supply one. Every sentence
 * below is a template with a computed number in it, and a sentence whose number is
 * missing does not appear. That makes it free, deterministic, testable, and unable
 * to invent a story — which is the whole point of this desk.
 *
 * THE REGISTER. Short sentences. The mechanism named, not implied. The thing that
 * did NOT happen given equal billing with the thing that did, because in practice
 * that is where the information is: a move every rate-sensitive asset obeyed except
 * one tells you far more than the move itself.
 *
 * WHAT IT WILL NEVER SAY. No direction, no target, no "expect". Every forward claim
 * this desk has tested has died except range, and the read carries range only where
 * a validated trigger is actually firing.
 *
 * Pure: no fetch, no DOM. Tested in js/deskRead.test.mjs.
 */

/** Jargon used in the read, defined in passing so vocabulary is taught not assumed. */
export const TERMS = {
  'real yield': 'The interest rate after expected inflation is taken out — the true cost of money, and what gold, the Nasdaq and anything long-dated actually answer to.',
  'breakevens': 'What the bond market expects inflation to average. A nominal yield is a real yield plus breakevens, so splitting them tells you what KIND of bond move you are looking at.',
  'equal-weight': 'An index where every company counts the same. Compared against the normal cap-weighted index it shows whether a rally is broad or being carried by its biggest members.',
  'the curve': 'The gap between short and long yields. Banks borrow short and lend long, so when it flattens their margin compresses — which is why Financials answer it.',
  'dispersion': 'How much more single-name options cost than index options. High means money has crowded into a few names while the index looks calm.',
  'the front end': 'Short-dated yields, mostly the 2-year. It is the market voting on what the central bank does next.',
  'long duration': 'Assets whose value sits far in the future, so a change in the discount rate moves them hardest. The Nasdaq is the equity version.',
  'carry': 'Being paid the difference between two interest rates for holding one currency against another. Narrow the gap and the trade pays less.',
  'the noise floor': 'How much a market moves on an ordinary day. Below it, a move is not evidence of anything.',
};

const pct = v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
const bp = v => `${v > 0 ? '+' : ''}${Math.round(v)}bp`;
const unit = r => !r ? '—' : r.kind === 'price' ? pct(r.change) : (r.kind === 'rate' || r.kind === 'gap') ? bp(r.change) : `${r.change > 0 ? '+' : ''}${r.change.toFixed(1)}`;

/**
 * Compose the read.
 *
 * Returns `{ paragraphs: [{ id, text }], terms: string[], empty: boolean }`. Each
 * builder returns a string or null; nulls drop out, so a quiet day produces a short
 * honest read rather than a padded one.
 */
export function deskRead({ state = null, sectors = [], board = [], links = [], findings = [], confirmations = null, book = null } = {}) {
  // Default parameters only fire for `undefined`, and a failed fetch passes `null` --
  // which is exactly how this crashed the first time it met a bad bundle.
  const B = Array.isArray(board) ? board : [];
  const S = Array.isArray(sectors) ? sectors : [];
  const F = Array.isArray(findings) ? findings : [];
  const by = k => B.find(b => b.key === k) ?? null;
  const sec = k => S.find(s => s.key === k) ?? null;
  const P = [];

  // 1. WHAT KIND OF MARKET. Leads with breadth, because "the index rose" and "five
  //    companies rose" look identical on a chart and are different markets.
  if (state && !state.quiet) {
    const b = state.breadth ?? {};
    const bits = [];
    if (b.leader && b.laggard) bits.push(`${b.leader.label} is ${pct(b.leader.change)} and ${b.laggard.label} ${pct(b.laggard.change)}`);
    if (b.sectorsUp != null) bits.push(`${b.sectorsUp} of ${b.sectorsTotal} sectors are rising`);
    if (b.concentration != null && b.concentration <= -1)
      bits.push(`and the average share is lagging the index by ${Math.abs(b.concentration).toFixed(1)} points`);
    else if (b.concentration != null && b.concentration >= 0.5)
      bits.push(`and the average share is BEATING the index by ${b.concentration.toFixed(1)} points, which is the broad version`);
    if (bits.length) P.push({ id: 'state', text: `${state.state}. ${bits.join(', ')}.` });
  }

  // 2. WHAT IS DRIVING IT. The real-versus-inflation split when the 10-year has moved,
  //    because it is the one reading that changes what everything downstream means.
  const t = by('tips'), be = by('bei'), n10 = by('us10y'), n2 = by('us2y');
  if (t && be && n10 && Math.abs(n10.change) >= 12) {
    const denom = Math.abs(t.change) + Math.abs(be.change);
    const share = denom > 0 ? Math.abs(t.change) / denom : 0.5;
    const real = share >= 0.65;
    P.push({ id: 'driver', text: real
      ? `The driver is rates, and it is a real one. The 10-year is ${bp(n10.change)} and ${Math.round(share * 100)}% of that is the real yield (${bp(t.change)}) with breakevens at ${bp(be.change)}. That makes it a growth and policy move rather than an inflation scare${n2 && Math.abs(n2.change) > Math.abs(n10.change) ? `, and the front end is doing more of the work than the long end (${bp(n2.change)} against ${bp(n10.change)})` : ''}.`
      : `The driver is rates, but it is an inflation move rather than a growth one. Of the 10-year's ${bp(n10.change)}, ${Math.round((1 - share) * 100)}% is breakevens (${bp(be.change)}) with the real yield only ${bp(t.change)}. That is a different trade: it hurts bonds without supporting the currency, and it is the configuration gold tends to like.` });
  }

  // 3. WHERE IT LANDED. Naming the sectors makes an abstract rates move into something
  //    that happened to a business, which is the step most macro writing skips.
  const rate = [sec('xlre'), sec('xlu'), sec('xlf')].filter(Boolean);
  if (rate.length >= 2 && t && Math.abs(t.change) >= 10) {
    const up = t.change > 0;
    const obeyed = rate.filter(s => up ? s.change < 0 : s.change > 0);
    if (obeyed.length >= 2) P.push({ id: 'landed', text:
      `It landed where it should have. ${obeyed.map(s => `${s.label} ${pct(s.change)}`).join(', ')} — the sectors that trade on the level of rates rather than on growth${sec('xlf') && obeyed.includes(sec('xlf')) && by('curve') && by('curve').change < 0 ? `. Financials have the curve against them too, ${bp(by('curve').change)} of flattening, and a bank's margin is the gap between what it borrows at and what it lends at` : ''}.` });
  }

  // 4. WHAT DISOBEYED. The most useful paragraph on the page: a mechanism that nearly
  //    everything followed, and the one thing that did not.
  if (confirmations && confirmations.total >= 3 && confirmations.met >= 1 && confirmations.met < confirmations.total) {
    const failed = confirmations.items.filter(i => !i.ok);
    const first = failed[0];
    if (first) P.push({ id: 'disobeyed', text:
      `The interesting part is what did NOT follow. ${confirmations.met} of ${confirmations.total} things this mechanism implies actually happened${failed.length === 1 ? '' : `, and ${failed.length} did not`}. The one to look at: ${first.label.replace(/ — .*/, '').replace(/^The /, 'the ')} — it came in at ${first.got}. When every connected market obeys except one, the exception is the story, not the rule.` });
  }

  // 5. POSITIONING, when the book is fresh and price has left it.
  if (book?.ok && !book.stale) {
    const out = book.rows.filter(r => r.inside === false);
    if (out.length >= 2) P.push({ id: 'book', text:
      `${out.length} markets have traded outside their options book — ${out.slice(0, 3).map(r => r.label).join(', ')}. The strikes carrying the open interest were written around a range that no longer contains the market, so that picture is history until the next capture.` });
  }

  // 6. WHAT TO WATCH. An instruction to look, never to trade.
  const watch = [];
  const vt = by('vixterm');
  if (vt?.last != null && vt.last < 0) watch.push('the VIX curve is inverted, which is this desk’s one validated range trigger — expect bigger days, not a direction');
  const dis = F.find(f => f.kind === 'dislocation');
  if (dis) watch.push(`${dis.title.replace(' have come apart', ' are further apart than usual')} — decide which of the two is the odd one out`);
  if (state?.alternatives?.length) watch.push(`this was close to "${state.alternatives[0].name}", so the label is not settled`);
  if (watch.length) P.push({ id: 'watch', text: `What to watch: ${watch.join('; ')}.` });

  // A quiet board gets a short honest read rather than a padded one.
  if (!P.length) P.push({ id: 'quiet', text:
    'Nothing on the board is doing anything unusual, and that is the correct read on most days. The base case is that no macro story is running. A quiet board is exactly when stories get invented, so the useful move is to note it and come back tomorrow.' });

  const text = P.map(p => p.text).join(' ');
  return {
    paragraphs: P,
    terms: Object.keys(TERMS).filter(k => text.toLowerCase().includes(k.toLowerCase())),
    empty: P.length === 1 && P[0].id === 'quiet',
  };
}
