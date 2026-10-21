/**
 * PAIR WHY — the "why" row on a Pairs card, written to teach.
 *
 * The card already shows WHAT: the range used, the lean, the clock. This says WHY the market is doing
 * what it is, one point at a time, each with a plain-words line on what it means, so a reader learns
 * the mechanism and not just the label. Built only from things the page already measures:
 *
 *   flow       which currencies the market is buying and selling today (measured cross-sectional move)
 *   range      how much of the expected day has been travelled, and what that does and does not imply
 *   macro      the macro-scorecard gap between the two currencies, worded as a thin read when it is one
 *   chain      the textbook links this instrument sits on, holding or broken, with the measured ends
 *   calendar   the next scheduled release, and that it moves the SIZE of the range, not its direction
 *
 * Every point is tagged by where it comes from (measured / calendar) so a number is never confused with
 * a story. Nothing here forecasts: direction claims on this desk have tested null almost every time, and
 * the footer says so. Pure: no DOM, no fetch.
 */

const MIN_FACTORS = 3;   // same floor as js/countryCard.js — fewer scored factors is a thin read

const sgn = v => (v >= 0 ? '+' : '') + v.toFixed(2);
const pct = v => `${Math.round(v * 100)}%`;

/** Which chain nodes an instrument sits on, by the names the page uses. */
export const NODE_FOR = {
  NAS100: 'nq', NQ: 'nq', SPX500: 'spx', SPX: 'spx', XAUUSD: 'gold', GOLD: 'gold',
  AUDUSD: 'audusd', USDCAD: 'usdcad', USDJPY: 'usdjpy', GBPUSD: 'gbpusd', EURUSD: 'eurusd',
  USOIL: 'oil', WTI: 'oil', BTCUSD: 'btc',
};

function flowPoint(ccys, csr) {
  if (!ccys || !csr?.length) return null;
  const [base, quote] = ccys;
  const by = Object.fromEntries(csr.map(x => [x.ccy, x.score]));
  if (by[base] == null || by[quote] == null) return null;
  const ranked = [...csr].sort((a, b) => b.score - a.score);
  const top = ranked[0], bot = ranked[ranked.length - 1];
  const bs = by[base], qs = by[quote];
  const isExtreme = c => c === top.ccy || c === bot.ccy;
  let body;
  if (isExtreme(base) && isExtreme(quote)) {
    body = `${top.ccy} is the most-bought currency today (${sgn(top.score)}) and ${bot.ccy} the most-sold (${sgn(bot.score)}), and this pair is exactly those two, so it sits at the widest gap on the board. `
      + `A pair moves for one of two reasons: one currency is being bought or sold everywhere, or something specific to these two. Here both currencies are pulling the same way.`;
  } else if (isExtreme(base) || isExtreme(quote)) {
    const c = isExtreme(base) ? base : quote, v = by[c];
    body = `${c} is ${c === top.ccy ? 'the most-bought' : 'the most-sold'} currency on the board today (${sgn(v)}), so a good part of this pair's move is a ${c} story rather than a story about the pair. `
      + `You would see the same push in every other pair that contains ${c}. That is the quickest way to tell a single-currency move from a pair-specific one: look across the other pairs.`;
  } else {
    body = `Neither currency is at an extreme today (${base} ${sgn(bs)}, ${quote} ${sgn(qs)}), so the board is not pushing this pair hard from either side. Moves here are more likely to be specific to these two economies than a broad buying or selling of one currency.`;
  }
  return { kind: 'measured', key: 'flow', title: 'Which currencies are being bought and sold', body, figure: `${base} ${sgn(bs)} · ${quote} ${sgn(qs)}` };
}

function rangePoint(used, hlMed) {
  if (used == null || !Number.isFinite(used)) return null;
  const u = pct(used);
  const how = used < 0.5 ? 'less than half of a typical day\'s movement is done, so there is room to run if something gives it a reason'
    : used < 0.9 ? 'most of a typical day\'s movement is done'
    : used < 1.25 ? 'about a full typical day has been travelled'
    : 'well past a typical day, which is unusual and tends to mean something is driving it';
  return {
    kind: 'measured', key: 'range', title: 'How much of the day is done',
    body: `Price has covered ${u} of today's expected range, the median high-to-low for this market on a day like this: ${how}. `
      + `The forecast is calibrated: across years the median day uses about 100% of it, so this is a fair ruler. It tells you how stretched the day is, not which way it goes next.`,
    figure: `${u} of the expected range${hlMed ? '' : ''}`,
  };
}

function macroPoint(ccys, composites) {
  if (!ccys || !composites) return null;
  const [base, quote] = ccys, b = composites[base], q = composites[quote];
  if (!b || !q || b.composite == null || q.composite == null) return null;
  const thin = [b, q].some(x => x.factorsScored != null && x.factorsScored < MIN_FACTORS);
  const lean = b.composite - q.composite > 0 ? base : quote, other = lean === base ? quote : base;
  const cover = thin
    ? ` Only ${Math.min(b.factorsScored ?? 0, q.factorsScored ?? 0)} of 6 macro factors have fresh data for at least one of these two, so this is mostly a rates read, not a full macro picture.`
    : '';
  return {
    kind: 'measured', key: 'macro', title: 'What the macro scorecard says about the two economies',
    body: `Scored on rates, inflation, growth, jobs, spending and trade, ${base} reads ${sgn(b.composite)} and ${quote} ${sgn(q.composite)}, so the textbook leans ${lean} over ${other}.${cover} `
      + `Read it as the reason one currency should be preferred if the market is pricing these things, not as a prediction: macro as a trading signal has been tested here five times and came back null.`,
    figure: `${base} ${sgn(b.composite)} · ${quote} ${sgn(q.composite)}${thin ? ' · thin' : ''}`,
    thin,
  };
}

function chainPoints(links, node) {
  if (!node || !links?.length) return [];
  const mine = links.filter(l => (l.a?.key === node || l.b?.key === node) && l.verdict !== 'unmeasured');
  const order = { broken: 0, holding: 1, quiet: 2 };
  mine.sort((x, y) => (order[x.verdict] ?? 3) - (order[y.verdict] ?? 3));
  return mine.slice(0, 2).map(l => {
    const ends = `${l.a.label} ${l.a.text} → ${l.b.label} ${l.b.text}`;
    if (l.verdict === 'broken') {
      return { kind: 'measured', key: `chain-${l.id}`, title: `A link in the chain is broken: ${l.short ?? l.id}`, figure: ends,
        body: `The textbook says: ${l.textbook?.toLowerCase?.() ?? ''}. Both ends moved, but the wrong way round (${ends}). ${l.read ?? ''} A broken link is information: the market is pricing something other than the usual mechanism, and working out what is the useful part.` };
    }
    if (l.verdict === 'holding') {
      return { kind: 'measured', key: `chain-${l.id}`, title: `A link in the chain is holding: ${l.short ?? l.id}`, figure: ends,
        body: `The textbook says: ${l.textbook?.toLowerCase?.() ?? ''}, and that is what happened (${ends}). When a link holds, the usual mechanism is doing the pricing, so the cause you would reach for first is probably the right one.` };
    }
    return { kind: 'measured', key: `chain-${l.id}`, title: `A link is quiet: ${l.short ?? l.id}`, figure: ends,
      body: `At least one end of this link has not moved past its noise floor (${ends}). Quiet means "not judged today", not a weak yes: there is nothing to explain here.` };
  });
}

function calendarPoint(ev, now = Date.now()) {
  if (!ev || ev.ms == null) return null;
  const hrs = (ev.ms - now) / 3.6e6;
  if (hrs > 24) return null;
  const when = hrs <= 0 ? 'has just printed' : hrs < 1 ? `lands in ${Math.max(1, Math.round(hrs * 60))} minutes` : `lands in about ${Math.round(hrs)} hours`;
  return {
    kind: 'calendar', key: 'calendar', title: 'What is scheduled', figure: `${ev.event}${ev.time ? ' · ' + ev.time : ''}`,
    body: `${ev.event} ${when}${ev.impact ? ` (${String(ev.impact).toLowerCase()} impact)` : ''}. Scheduled releases are known in advance, so they are the one kind of cause you can prepare for. `
      + `What this desk has measured is that releases like this widen the range around them; it has not found that the direction of the surprise is predictable. Expect a bigger move, not a known one.`,
  };
}

/**
 * input = { name, ccys:[base,quote]|null, csr:[{ccy,score}], composites:{ccy:{composite,factorsScored,factorsTotal}},
 *           links:[chain links], used, hlMed, event, now }
 * → { lead, points:[{kind,key,title,figure,body,thin?}], foot }
 */
export function buildPairWhy(input) {
  const { name, ccys = null, csr = [], composites = null, links = [], used = null, hlMed = null, event = null, now = Date.now() } = input ?? {};
  if (!name) throw new Error('pairWhy: name is required');
  const node = NODE_FOR[String(name).toUpperCase().replace(/[^A-Z0-9]/g, '')] ?? null;
  const pts = [];
  const f = flowPoint(ccys, csr); if (f) pts.push(f);
  pts.push(...chainPoints(links, node));
  const m = macroPoint(ccys, composites); if (m) pts.push(m);
  const r = rangePoint(used, hlMed); if (r) pts.push(r);
  const c = calendarPoint(event, now); if (c) pts.push(c);

  // The lead: the one or two points a reader should walk away with, in a sentence.
  const first = pts.find(p => p.key === 'flow') ?? pts.find(p => p.key.startsWith('chain-')) ?? pts[0];
  const bits = [];
  if (first) bits.push(first.key === 'flow' ? first.figure.replace(' · ', ' and ') + ' on the flow' : first.title.toLowerCase());
  if (used != null) bits.push(`${pct(used)} of the expected range used`);
  if (c) bits.push(`next: ${c.figure}`);
  const lead = bits.length ? bits.join(' · ') : 'No measured driver stands out for this instrument today.';

  return {
    lead, points: pts,
    foot: 'Why the market is doing this, in the textbook\'s words, from numbers this page measures. It explains; it does not forecast. Direction claims have tested null here almost every time, which is why every point is about size, cause or mechanism.',
  };
}
