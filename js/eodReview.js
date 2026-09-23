/**
 * The paid end-of-day review: the prompt, and the snapshot it is built from.
 *
 * The free brief (js/endOfDayBrief.js) still renders every day and is unchanged by
 * this. It states the facts. This is the layer you press a button for when you want
 * the facts turned into something you can learn from — and it is worth paying for only
 * because the facts are already assembled: the model is handed a complete, numbered
 * account of the day and asked to explain and teach it, not to go and find it.
 *
 * WHAT THE PROMPT IS FOR, in the owner's words: "an end of day review of what happened
 * over the day, started at x moved to x, impact of that etc. What was right and wrong
 * about this morning's plan. And what we can learn going into tomorrow."
 *
 * THREE THINGS IT IS FORBIDDEN TO DO, and each has a reason on this desk:
 *
 *   1. Invent or round a number. Every figure it may use is in the snapshot. A review
 *      whose numbers drift from the page is worse than no review, because it reads as
 *      authoritative and cannot be checked.
 *   2. Forecast tomorrow's direction. The priced-in claim was tested here and came back
 *      null; surprise size validated for RANGE only; the page's own lean record is 19 of
 *      33. The forward section names what is scheduled and what is still standing.
 *   3. Assert WHY something moved as fact. Attribution on one session is a story. It may
 *      offer candidate explanations, clearly marked as candidates, with the test that
 *      would separate them — which is the part that actually teaches.
 *
 * Pure: no fetch, no DOM, no key. Tested in js/eodReview.test.mjs.
 */

const n = (v, dp = 2) => (v == null || !Number.isFinite(v)) ? null : +v.toFixed(dp);
const sign = (v, dp = 2) => v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(dp)}`;

/**
 * The compact snapshot the review is written from.
 *
 * Deliberately small. Thirty pairs of full detail would crowd out the part that matters
 * — the morning's commitments and what became of them — and cost more for a worse
 * answer. The spine is carried in full, the rest as counts and extremes.
 */
export function eodSnapshot({ eod = null, brief = null, morning = null, activity = {}, nowISO = new Date().toISOString() } = {}) {
  if (!eod?.ok) return null;
  const rows = eod.rows ?? [];
  const spineNames = new Set((brief?.named ?? []).map(x => x.name));

  const pair = r => ({
    name: r.name,
    open: r.open, now: r.now,
    move: `${sign(r.move, r.dp)} ${r.unit}`,
    movedPct: n(r.movedPct),
    expected: r.expected, realised: r.realised, usedPct: r.used,
    rangeFrom: r.rangeFrom,
    regime: r.regimeNow ?? null, volPctile: r.volPctNow ?? null,
    lean: r.lean, leanRight: r.leanRight,
    falsifier: r.wrongAt ? { price: r.wrongAt.level, side: r.wrongAt.side, traded: r.wrongAt.hit, certain: r.wrongAt.certain } : null,
    aim: r.aim ? { price: r.aim.level, side: r.aim.side, reached: r.aim.hit, certain: r.aim.certain } : null,
    verdict: r.verdict,
    activity: activity?.[r.name]?.ratio ?? null,
    o5: r.o5, o5c: r.o5c, o20: r.o20, o20c: r.o20c,
  });

  return {
    asOf: nowISO,
    morningAt: eod.morningAt ?? morning?.plan?.at ?? null,
    morning: {
      regime: morning?.brief?.regime ?? null,
      headline: morning?.brief?.headline ?? null,
      theme: morning?.brief?.theme ?? null,
      watch: Array.isArray(morning?.brief?.watch) ? morning.brief.watch.slice(0, 3) : [],
      chainHook: morning?.chainRead?.hook ?? null,
      chainStories: (morning?.chainRead?.stories ?? []).map(s => `${s.name} (${s.status})`),
      tradeOfTheDay: morning?.brief?.boardTrade ?? null,
    },
    // the markets that get described whatever the board did, in full
    spine: rows.filter(r => spineNames.has(r.name)).map(pair),
    // everything else as extremes and counts, so the prompt stays small
    biggestOverRange: rows.filter(r => r.used != null && !spineNames.has(r.name)).sort((a, b) => b.used - a.used).slice(0, 4).map(pair),
    quietest: rows.filter(r => r.used != null && !spineNames.has(r.name)).sort((a, b) => a.used - b.used).slice(0, 2).map(pair),
    committed: rows.filter(r => r.leanRight !== null && !spineNames.has(r.name)).slice(0, 8).map(pair),
    board: {
      scored: eod.range.n, medianUsedPct: eod.range.medianUsed,
      over: eod.range.over, aboutRight: eod.range.about, under: eod.range.under,
      measuredOpenToNow: eod.range.weak,
      leansRight: eod.leans.right, leansMade: eod.leans.n,
      falsifiersTraded: eod.commitments?.falsified ?? null, falsifiersSet: eod.commitments?.nFalsifiers ?? null,
      aimsReached: eod.commitments?.aimsPaid ?? null, aimsSet: eod.commitments?.nAims ?? null,
    },
    dollar: brief?.dollar ?? null,
    risk: brief?.risk ?? null,
    regimeTurns: brief?.regimeTurns ?? [],
    chain: eod.chain ? { broke: eod.chain.broke, healed: eod.chain.healed, stillBroken: eod.chain.stillBroken } : null,
    macroFreshness: brief?.freshness ?? null,
    printed: brief?.printedWords ?? null,
    tomorrow: brief?.tomorrow ?? null,
  };
}

const list = (arr, f) => (arr ?? []).map(f).join('\n') || '  none';

/** One pair, as a line the model can quote from without arithmetic. */
const pairLine = p => `  ${p.name}: opened ${p.open}, now ${p.now} (${p.move}${p.movedPct != null ? `, ${sign(p.movedPct)}%` : ''}).` +
  ` Expected range ${p.expected ?? '—'}, realised ${p.realised ?? '—'} = ${p.usedPct ?? '—'}% of forecast${p.rangeFrom === 'open-to-now' ? ' [open-to-now, understated]' : ''}.` +
  (p.regime ? ` Regime ${p.regime}.` : '') + (p.volPctile != null ? ` Vol ${p.volPctile}th pctile.` : '') +
  (p.activity != null ? ` Tick count ${p.activity}x its 20-session median.` : '') +
  (p.lean && p.lean !== 'flat' ? ` MORNING LEAN: ${p.lean} — ${p.leanRight ? 'right' : 'wrong'} by the close.` : ' No direction was called.') +
  (p.falsifier ? ` Falsifier ${p.falsifier.side} ${p.falsifier.price}: ${p.falsifier.traded ? 'TRADED' : 'never traded'}${p.falsifier.certain ? '' : ' (close only — no high/low to confirm)'}.` : '') +
  (p.aim ? ` Aim ${p.aim.side} ${p.aim.price}: ${p.aim.reached ? 'REACHED' : 'not reached'}${p.aim.certain ? '' : ' (close only)'}.` : '') +
  (p.verdict ? ` Verdict: ${p.verdict}.` : '');

/**
 * The prompt.
 *
 * `evidence` is this desk's tested-claims block — the same one the morning brief and the
 * chain read are given. It goes in so the review leans on what has actually been
 * measured here rather than on market folklore, and so it cannot assert something this
 * desk has already closed as null.
 */
export function buildEodReviewPrompt(s, evidence = '') {
  const m = s?.morning ?? {};
  const b = s?.board ?? {};
  return `You are a former macro trader writing the END-OF-DAY REVIEW for one reader who is learning to read markets. The session is over. This is a retrospective: what happened today, what it did to the board, what this page got right and wrong this morning, and what is worth carrying into tomorrow.

Everything below is measured. You have no other source. Do not add a number that is not here, and never restate one at a different value.

=== THIS MORNING, ON THE RECORD (captured ${s?.morningAt ?? 'unknown'}) ===
Regime called: ${m.regime ?? 'none'}
Headline: ${m.headline ?? 'none'}
The chain read opened: ${m.chainHook ?? 'none'}
Stories it named: ${(m.chainStories ?? []).join('; ') || 'none'}
Trade of the day: ${m.tradeOfTheDay ? `${m.tradeOfTheDay.direction} ${m.tradeOfTheDay.pair}` : 'none named'}
What it said to watch:
${list(m.watch, w => `  - ${w}`)}

=== THE DAY, MARKET BY MARKET (open -> now) ===
${list(s?.spine, pairLine)}

FURTHEST PAST THEIR OWN FORECAST RANGE
${list(s?.biggestOverRange, pairLine)}

QUIETEST AGAINST FORECAST
${list(s?.quietest, pairLine)}

OTHER INSTRUMENTS THE PAGE COMMITTED A DIRECTION ON
${list(s?.committed, pairLine)}

=== THE BOARD, SCORED ===
Median instrument used ${b.medianUsedPct ?? '—'}% of the range this page forecast for it: ${b.over} ran past it, ${b.aboutRight} landed about right, ${b.under} stayed inside, of ${b.scored} scored${b.measuredOpenToNow ? ` (${b.measuredOpenToNow} measured open-to-now, so understated)` : ''}.
Direction: ${b.leansMade ? `${b.leansRight} of ${b.leansMade} committed leans are the right way` : 'no direction was committed on any instrument'}.
Falsifiers: ${b.falsifiersSet ? `${b.falsifiersTraded} of ${b.falsifiersSet} named falsifier prices traded` : 'none were set'}.
Aims: ${b.aimsSet ? `${b.aimsReached} of ${b.aimsSet} aims were reached` : 'none were set'}.
The dollar: ${s?.dollar?.word ? `${s.dollar.word}, ${sign(s.dollar.pct)}% averaged across ${s.dollar.n} priced legs` : 'not readable'}.
Risk shape: ${s?.risk?.shape ?? 'not readable'}${s?.risk?.equity != null ? ` (indices ${sign(s.risk.equity)}%, havens ${sign(s.risk.haven)}% vs the dollar, gold ${sign(s.risk.gold)}%)` : ''}.
Regimes that turned today: ${(s?.regimeTurns ?? []).map(t => `${t.name} ${t.from}->${t.to}`).join(', ') || 'none'}.
Chain links: ${s?.chain ? `${s.chain.broke.length ? `broke — ${s.chain.broke.join(', ')}` : 'none broke'}; ${s.chain.healed.length ? `came back into line — ${s.chain.healed.join(', ')}` : 'none healed'}` : 'not compared'}.
What printed: ${s?.printed ?? 'nothing with a consensus to score against'}.
MACRO DATA FRESHNESS: ${s?.macroFreshness?.note ?? 'unknown'} — do NOT describe a rates, credit or volatility move as having happened today unless that line says the series are current.

=== INTO TOMORROW (scheduled only) ===
${s?.tomorrow?.day ? `${s.tomorrow.day.date}: ${s.tomorrow.day.n} high-impact releases — ${(s.tomorrow.day.events ?? []).slice(0, 6).map(e => `${e.ccy ?? ''} ${e.event} ${new Date(e.ms).toISOString().slice(11, 16)}`).join('; ')}` : 'nothing high-impact in the window the feed carries'}
Standing 5-session calls the page is still carrying: ${s?.tomorrow?.standing ? `${s.tomorrow.standing.up} up, ${s.tomorrow.standing.down} down, ${s.tomorrow.standing.none} no view` : 'unknown'}.

=== TESTED ON THIS DESK (pre-registered, paired-control tests on this desk's own data — lean on these BEFORE any market folklore) ===
${evidence || '  not supplied'}

=== END ===

HOW TO WRITE IT:
- This is a REVIEW, past tense, of a session that has finished. Not a preview, not a call.
- Walk the day: where each market opened, where it went, and what that did to the rest of the board. Second and third order. "Gold opened at X and finished at Y; against real yields doing nothing, that is the dollar leg, not the rates leg."
- BE HONEST ABOUT THE MORNING. Say plainly what the page got right, what it got wrong, and — separately — what was simply unknowable at 07:00. Those are three different things and a reader learns most from the third. If the range forecasts were badly wrong, say so in those words; range is the measurement this page is actually judged on.
- WHY IS A CANDIDATE, NEVER A FACT. On one session you cannot know why anything moved. Where you offer a reason, mark it as a candidate and give the test that would separate it from its rival next time: "either the dollar bid was the rate leg or it was month-end flow; the tell is whether the front end moved with it." That test is the most teachable thing you can write.
- Numbers inline and plain, exactly as given. Never round to a different value. Never invent one.
- Gloss every term in four words the first time ("breakevens — what inflation is priced at").
- Short sentences. Contractions fine. No filler, no hedging throat-clearing, no "as always".
- NOTHING ABOUT TOMORROW'S DIRECTION. Name what is scheduled, which markets it lands on, what is still standing, and what would change your reading. The priced-in claim tested null here and surprise size validated for RANGE only — say a release widens the range, never which way it goes.
- EVIDENCE FIRST. Where a TESTED ON THIS DESK line covers what you are writing, use it and say so in four words ("tested here: null"). Never assert something those lines mark null.
- No entries, stops, sizes, products or calls to action. Never name a central-bank official; use the role.
- If the day was quiet and the page was roughly right, say so and keep it short. A dull day honestly reported is worth more than a manufactured story.

Respond with a single valid JSON object, no markdown, no text outside it:
{"hook":"one sentence: the day in a line, specific and plain","story":"4-6 short paragraphs separated by blank lines, 200-320 words: the day as it unfolded, open to close, market by market, with the knock-on effects","plan":{"right":"1-3 sentences: what this page got right this morning, with the numbers","wrong":"1-3 sentences: what it got wrong, in plain words, worst thing first","unknowable":"1-2 sentences: what could not have been known at the open — the part that is not a mistake"},"lessons":[{"point":"one sentence a reader could repeat next week","why":"1-2 sentences: the mechanism, using today's numbers","howToSpot":"one sentence: what to put on a screen to see this happening again"}],"tomorrow":"2-3 sentences: what is scheduled, which markets it lands on, and what is still standing. NO direction.","terms":[{"term":"a term used above a beginner would stumble on","plain":"one sentence in plain words"}]}
Give 3-5 lessons and 5-10 terms.`;
}
