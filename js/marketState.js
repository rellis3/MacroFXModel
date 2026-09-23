/**
 * What kind of market is this, in one line, with the evidence shown.
 *
 * WHY THIS EXISTS. The scan could tell you that a link had come apart and that a
 * series was rare, and a reader still had to assemble "so what kind of day is it?"
 * themselves. That assembly is the skill, and a page that never demonstrates it
 * never teaches it. This module does the assembly out loud: it names a state, lists
 * what supports it, and — the part that matters — lists what CONTRADICTS it.
 *
 * THE RULES ARE VISIBLE ON PURPOSE. Every state is a small set of conditions over
 * measured quantities, written below in plain sight. Nothing here is fitted, scored
 * or weighted, because a weighted composite nobody calibrated is a number that feels
 * rigorous and is not. A state is a LABEL for a configuration, and the confidence is
 * simply how many of its conditions held against how many failed. If you disagree
 * with a label you can see exactly which condition produced it and argue with that.
 *
 * WHAT A STATE IS NOT. It is not a forecast, it is not a regime model, and there are
 * no transition probabilities — those would need a fitted model this desk does not
 * have. It describes today's configuration and stops.
 *
 * BREADTH, HONESTLY. No free feed carries real advance/decline or new highs/lows, so
 * nothing here quotes a "% advancing" figure. Breadth is computed from what can
 * actually be sourced: equal-weight against cap-weight (RSP/SPY), small against
 * large, how many of the eleven sectors are participating, and how far apart they
 * are. Those are checkable.
 *
 * Pure: no fetch, no DOM. Tested in js/marketState.test.mjs.
 */

/** The eleven S&P sectors, plus semis as the concentration bellwether. */
export const SECTORS = [
  { key: 'xlk',  label: 'Technology',    what: 'Long-duration growth. Answers real yields harder than anything else here.' },
  { key: 'xlc',  label: 'Communications', what: 'The other half of big tech — the megacap platforms sit here, not in Technology.' },
  { key: 'xly',  label: 'Discretionary', what: 'What people buy when they feel comfortable. The consumer’s vote.' },
  { key: 'xlf',  label: 'Financials',    what: 'Banks earn the spread between short and long rates, so this is where the yield curve lands.' },
  { key: 'xli',  label: 'Industrials',   what: 'Capital spending and freight — the real economy’s own cycle.' },
  { key: 'xle',  label: 'Energy',        what: 'Follows crude, and is the one sector that likes an inflation scare.' },
  { key: 'xlb',  label: 'Materials',     what: 'Miners and chemicals: global growth with a China leg, like copper.' },
  { key: 'xlv',  label: 'Health care',   what: 'Defensive with a policy risk of its own. Leads when growth is doubted.' },
  { key: 'xlp',  label: 'Staples',       what: 'Food and soap. People buy these in a recession, so leadership here is a defensive vote.' },
  { key: 'xlu',  label: 'Utilities',     what: 'A bond substitute that happens to be an equity — it trades on yields, not on growth.' },
  { key: 'xlre', label: 'Real estate',   what: 'The most rate-sensitive sector there is: borrowing cost IS the business model.' },
  { key: 'smh',  label: 'Semiconductors', what: 'Not a sector but the trade everything has crowded into. Watch it against the rest.' },
];

const WINDOW = 20, BACK = 6;
const at = (b, k, i) => b?.series?.[k]?.[i] ?? null;
/**
 * The last real print at or before `i`, walking back up to BACK sessions.
 *
 * The bundle's date spine is the UNION of every source's calendar, and those calendars
 * disagree: OANDA prints on US holidays, FRED does not, and the equity feed settles a
 * day behind the FX one. Read the final index directly and a sector silently returns
 * null on any day its own feed did not print — which is how the whole sector board came
 * back EMPTY the first time this ran against live data, on a spine whose last date was
 * an FX-only session.
 */
const lastAt = (b, k, i) => {
  for (let j = i; j >= 0 && j > i - BACK; j--) { const v = at(b, k, j); if (v != null) return { v, j }; }
  return null;
};
const chg = (b, k, i, w = WINDOW) => {
  const now = lastAt(b, k, i);
  if (!now) return null;
  const then = lastAt(b, k, now.j - w);
  return (!then || !(then.v > 0)) ? null : (now.v / then.v - 1) * 100;
};
const r1 = v => v == null ? null : +v.toFixed(1);
const r2 = v => v == null ? null : +v.toFixed(2);

/** Every sector's 20-session move, ranked. Leaders first. */
export function sectorBoard(bundle, i = (bundle?.dates?.length ?? 1) - 1) {
  return SECTORS
    .map(s => { const c = chg(bundle, s.key, i); return c == null ? null : { ...s, change: r2(c), last: lastAt(bundle, s.key, i)?.v ?? null }; })
    .filter(Boolean)
    .sort((a, b) => b.change - a.change);
}

/**
 * Breadth, from sources that exist.
 *
 * `concentration` is the one to read: equal-weight minus cap-weight over twenty
 * sessions. Negative means the cap-weighted index is being carried by its largest
 * members — the average share is doing worse than the index implies.
 */
export function breadth(bundle, i = (bundle?.dates?.length ?? 1) - 1) {
  const rsp = chg(bundle, 'rsp', i), spy = chg(bundle, 'spy', i);
  const secs = sectorBoard(bundle, i).filter(s => s.key !== 'smh');
  const up = secs.filter(s => s.change > 0).length;
  const spread = secs.length >= 3 ? Math.max(...secs.map(s => s.change)) - Math.min(...secs.map(s => s.change)) : null;
  return {
    concentration: (rsp != null && spy != null) ? r2(rsp - spy) : null,
    rsp: r2(rsp), spy: r2(spy),
    sectorsUp: secs.length ? up : null, sectorsTotal: secs.length || null,
    // how far apart the best and worst sector are: a wide spread with a flat index
    // is rotation, a narrow spread is the whole market moving as one thing
    spread: r1(spread),
    leader: secs[0] ?? null, laggard: secs.at(-1) ?? null,
  };
}

/**
 * The states, in priority order. The FIRST whose `when` holds is the label; the rest
 * still contribute their met/failed conditions as supporting or contradicting evidence.
 *
 * Each condition is `[description, test]`. The description is what appears on the page,
 * so it has to read as a sentence a person would say out loud.
 *
 * `require` is a gate the state must clear before it is eligible at all, and it exists
 * because of a real flaw caught in testing: every condition of "Broad risk appetite"
 * was the ABSENCE of something bad (fear not rising, credit not widening), so a
 * completely dead board scored three out of four and the page confidently announced a
 * healthy rally into a flat market. A state now has to have something actually happen.
 */
function conditions(ctx) {
  const { z, chgOf, br } = ctx;
  return {
    'Rates are driving': {
      require: () => Math.abs(z('us2y')) >= 1.5 || Math.abs(z('us10y')) >= 1.5 || Math.abs(z('curve')) >= 1.5,
      line: 'The bond market is setting the agenda and everything else is reacting to it.',
      teach: 'When the front end moves this much, nothing else on the board is the cause — it is downstream. Read rates first, then ask which of the things attached to them has answered and which has not.',
      cond: [
        ['the front end has made an unusual move', () => Math.abs(z('us2y')) >= 1.5],
        ['the 10-year has moved with it', () => Math.abs(z('us10y')) >= 1],
        ['the curve has reshaped', () => Math.abs(z('curve')) >= 1.5],
        ['rate-sensitive sectors are at an extreme of the sector board', () => {
          const r = br.leader?.key, l = br.laggard?.key;
          return ['xlu', 'xlre', 'xlf'].includes(r) || ['xlu', 'xlre', 'xlf'].includes(l);
        }],
      ],
    },
    'Narrow and concentrated': {
      require: () => br.concentration != null && br.concentration <= -1,
      line: 'The index is being carried by a few large names while the average share lags.',
      teach: 'An index level can rise while most of what is in it falls. That is why the equal-weight comparison exists — it is the difference between "the market went up" and "five companies went up".',
      cond: [
        ['the average share is lagging the index', () => br.concentration != null && br.concentration <= -1],
        ['semiconductors are leading', () => br.leader?.key === 'smh' || (ctx.smh != null && ctx.smh >= 5)],
        ['fewer than half the sectors are participating', () => br.sectorsUp != null && br.sectorsUp < br.sectorsTotal / 2],
        ['single-name volatility is priced well above the index’s', () => (ctx.dspxPct ?? 0) >= 0.8],
      ],
    },
    'Risk is being sold': {
      require: () => z('vix') >= 1.2 || z('hy') >= 1,
      line: 'Money is leaving risk across several markets at once, not just in equities.',
      teach: 'A genuine risk-off move shows up in more than one place: credit widens, the fear price rises, defensives lead. When only one of those is true, the move is usually about that one market.',
      cond: [
        ['the fear price has risen unusually', () => z('vix') >= 1.2],
        ['credit has widened with it', () => z('hy') >= 1],
        ['the broad index is lower', () => (chgOf('spx') ?? 0) < 0],
        ['defensive sectors are leading', () => ['xlp', 'xlu', 'xlv'].includes(br.leader?.key)],
      ],
    },
    'Broad risk appetite': {
      require: () => (chgOf('spx') ?? 0) >= 1.5 && br.sectorsUp != null && br.sectorsUp >= br.sectorsTotal * 0.7,
      line: 'Almost everything is being bought, and the participation is wide rather than narrow.',
      teach: 'The healthy version of a rally: the average share keeps up with the index. That is the single distinction that separates this state from the narrow one, and it is worth checking every time.',
      cond: [
        ['most sectors are participating', () => br.sectorsUp != null && br.sectorsUp >= br.sectorsTotal * 0.7],
        ['the average share is keeping up with the index', () => br.concentration != null && br.concentration >= -0.5],
        ['the fear price is not rising', () => z('vix') <= 0.5],
        ['credit is not widening', () => z('hy') <= 0.5],
      ],
    },
    'Rotation without direction': {
      require: () => br.spread != null && br.spread >= 8,
      line: 'Large moves underneath a market that has gone nowhere overall.',
      teach: 'The index is an average, and averages hide arguments. A wide gap between the best and worst sector with a flat index means money is moving between things rather than in or out.',
      cond: [
        ['the gap between best and worst sector is wide', () => br.spread != null && br.spread >= 8],
        ['the broad index has gone roughly nowhere', () => Math.abs(chgOf('spx') ?? 9) < 2],
        ['the fear price is not elevated', () => z('vix') <= 1],
      ],
    },
  };
}

/**
 * Name the market, and show the working.
 *
 * Returns `{ state, line, teach, evidence, against, confidence, alternatives }`.
 * `confidence` is met / (met + failed) for the chosen state only — a plain fraction,
 * not a model output, and it is labelled that way on the page.
 */
export function marketState(bundle, board = [], i = (bundle?.dates?.length ?? 1) - 1) {
  const byKey = Object.fromEntries(board.map(b => [b.key, b]));
  const z = k => byKey[k]?.z ?? 0;
  const chgOf = k => byKey[k]?.change ?? null;
  const br = breadth(bundle, i);
  const ctx = { z, chgOf, br, smh: chg(bundle, 'smh', i), dspxPct: byKey.dspx?.pct ?? null };
  const defs = conditions(ctx);

  const scored = Object.entries(defs).filter(([, d]) => {
    try { return d.require ? !!d.require() : true; } catch { return false; }
  }).map(([name, d]) => {
    const met = [], failed = [];
    for (const [desc, test] of d.cond) {
      let ok = false;
      try { ok = !!test(); } catch { ok = false; }         // a missing series fails the condition, never the page
      (ok ? met : failed).push(desc);
    }
    return { name, line: d.line, teach: d.teach, met, failed, score: met.length };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const top = scored[0];
  // Two of a state's conditions is the floor. Below that, saying "quiet" is the
  // honest answer and it is the correct answer on most days.
  if (!top || top.score < 2) {
    return { state: 'Nothing much is happening', quiet: true,
      line: 'No configuration on this page is clearly in place today.',
      teach: 'This is the right read most of the time, and saying it plainly matters: a quiet board is exactly when people invent stories. The base case is that nothing macro is going on.',
      evidence: [], against: scored[0]?.failed?.slice(0, 3) ?? [], confidence: null,
      breadth: br, alternatives: [] };
  }
  return {
    state: top.name, quiet: false, line: top.line, teach: top.teach,
    evidence: top.met, against: top.failed,
    confidence: { met: top.met.length, total: top.met.length + top.failed.length },
    breadth: br,
    // the runners-up, so the page can say what else it nearly called this
    alternatives: scored.slice(1).filter(s => s.score >= 2).map(s => ({ name: s.name, met: s.met.length, total: s.met.length + s.failed.length })),
  };
}

/**
 * Event → mechanism → who it touches → what to check next.
 *
 * Built from findings the scan already produced, so nothing here is a new claim.
 * `check` is the instruction: the next thing to go and look at, named specifically
 * enough to actually do.
 */
const IMPACT = {
  dislocation: { affects: 'Both legs, and anything that usually moves with them', check: 'Look at the two tiles side by side and decide which one is the odd one out — then check a third market that touches only that one.' },
  inverted:    { affects: 'Any reasoning that leans on this relationship', check: 'Stop using this link for now. Find which market has been driving BOTH legs over the last year.' },
  ratekind:    { affects: 'Gold, the Nasdaq, real estate, utilities — everything priced off the real rate', check: 'Check gold and the Nasdaq. If the move is real and they have not responded, that is the question worth the next ten minutes.' },
  extreme:     { affects: 'Whatever normally moves with it', check: 'Ask what should have followed and go and look at whether it did. A big move nothing followed is a different story from one that propagated.' },
  vixterm:     { affects: 'Anything with a stop close enough to be hit by a wider day', check: 'Widen the expected range before you size anything. This one is validated for range and says nothing about direction.' },
  creditstack: { affects: 'Banks, leveraged borrowers, and the cost of capital generally', check: 'Check Financials on the sector board. Credit stress that never reaches the lenders’ share prices is usually contained.' },
  broken:      { affects: 'The mechanism itself', check: 'Find the market that is an end of more than one break — that is usually the one being driven by something off this board.' },
  dispersion:  { affects: 'Index hedges, which cover the wrong risk in this state', check: 'Compare equal-weight against cap-weight on the breadth line. That is the same story measured a second way.' },
  crack:       { affects: 'Energy, the pump price, the next inflation print', check: 'Check breakevens and Energy. If neither moved, the crude move is being read as a supply story.' },
  'book-outside': { affects: 'Nothing mechanically — but it dates the options picture', check: 'Treat the strikes as history until the next capture. The contracts sit behind price now.' },
  'book-flow': { affects: 'How much conviction sits behind the recent move', check: 'Compare the direction of the last twenty sessions with whether open interest grew or shrank.' },
  'book-stale':{ affects: 'Every number on the options card', check: 'Check whether the capture machine ran. Until it does, do not read the walls as current.' },
  quiet:       { affects: 'Nothing', check: 'Nothing needs doing. Come back tomorrow — this is the base case, not a failure of the page.' },
};

/** One row per finding: what happened, why it matters, who it touches, what to check. */
export function impactRows(findings = []) {
  return findings.map(f => ({
    kind: f.kind, event: f.title,
    mechanism: String(f.means ?? '').split('. ')[0] + '.',     // the first sentence IS the mechanism
    affects: IMPACT[f.kind]?.affects ?? 'Markets connected to it',
    check: IMPACT[f.kind]?.check ?? 'Look for the market that should have responded and check whether it did.',
    key: f.key ?? null,
  }));
}
