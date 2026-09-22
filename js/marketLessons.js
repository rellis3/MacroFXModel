/**
 * Market lessons — the teaching layer.
 *
 * THE PROBLEM THIS SOLVES. A dashboard shows numbers. Numbers do not become
 * intuition on their own: you learn a market the way you learn a language, by
 * meeting the same structure again and again with someone naming it each time
 * until you stop needing them to. This file is that someone.
 *
 * HOW IT WORKS. Each lesson has a `when` that looks at TODAY'S REAL TAPE and
 * decides whether today is a good day to teach that idea. A lesson only fires
 * when the market is actually doing the thing. So the curriculum is written by
 * the market, not by a syllabus, and you meet ideas in the order they happen —
 * which is the order a trader on a desk learns them.
 *
 * EVERY LESSON HAS THE SAME FOUR PARTS, deliberately:
 *   seen      what is literally on the screen right now, with numbers
 *   means     the mechanism, in plain English, with the causal chain spelled out
 *   notMeans  the trap — what a beginner would wrongly conclude, and why
 *   words     how a trader would say it in one sentence, so the vocabulary sticks
 * plus `evidence`, naming the ledger entries that back (or kill) it.
 *
 * LEVELS. 1 = the idea itself. 2 = the nuance you need once the idea is
 * familiar. 3 = the exception, the case where the rule breaks and why. The
 * renderer tracks which lessons a reader has seen (in their browser) and
 * promotes to the next level of the SAME idea rather than repeating level 1 —
 * so the sixth time you see a broken dollar link you are taught something new
 * about it, not the same paragraph again.
 *
 * Pure: no fetch, no DOM, no clock beyond what the caller passes.
 * Tested in js/marketLessons.test.mjs.
 */

/** Helpers for the `when` predicates. All tolerate missing data by returning false. */
const linkOf = (ctx, id) => (ctx.links ?? []).find(l => l.id === id) ?? null;
const verdict = (ctx, id) => linkOf(ctx, id)?.verdict ?? null;
const broken = (ctx, ...ids) => ids.filter(id => verdict(ctx, id) === 'broken');
const holding = (ctx, ...ids) => ids.filter(id => verdict(ctx, id) === 'holding');
const nodeMove = (ctx, key) => { const l = (ctx.links ?? []).find(x => x.a?.key === key) ?? (ctx.links ?? []).find(x => x.b?.key === key); const e = l?.a?.key === key ? l.a : l?.b; return e ?? null; };
const moved = (ctx, key) => !!nodeMove(ctx, key)?.moved;
const dirOf = (ctx, key) => nodeMove(ctx, key)?.dir ?? null;
const textOf = (ctx, key) => nodeMove(ctx, key)?.text ?? '—';
const fired = (ctx, id) => (ctx.watch ?? []).some(t => t.firing && t.id === id);

/**
 * The lessons. Ordered roughly as a desk would meet them; `when` decides the
 * day, `level` decides the depth, `weight` breaks ties when several fire.
 */
export const LESSONS = [
  // ── the single most important idea on this desk ───────────────────────────
  {
    id: 'range-not-direction', level: 1, weight: 10, foundation: true, topic: 'what is knowable',
    title: 'The thing this desk knows, and the thing it does not',
    when: () => true,                                   // the floor: always available
    teach: (ctx) => ({
      seen: `${ctx.matrix?.validated ?? 0} relationships on this desk have survived a test, ${ctx.matrix?.nulls ?? 0} were tested and died, and ${ctx.matrix?.blank ?? 0} have never been asked.`,
      means: 'Look at what survived: almost all of it is about RANGE — how far a market travels — and almost none of it is about DIRECTION. That is not this desk being bad at forecasting. It is the actual shape of the problem. How much a market moves is driven by things that persist (volatility clusters, events are scheduled, fear is sticky). Which way it moves is competed away by everyone else trying to guess it.',
      notMeans: 'It does not mean direction is unknowable and you should give up. It means direction has to come from you — a view, a level, a reason — and the desk’s job is to tell you how much room the day has, what is scheduled, and where the lines are. Never expect the page to tell you which way.',
      words: '"I don’t have a directional view here, but the day has the range for it if I did."',
      evidence: ['yields-to-fx-direction', 'vix-inversion', 'surprise-size'],
    }),
  },
  // ── the chain ─────────────────────────────────────────────────────────────
  {
    id: 'broken-link', level: 1, weight: 90, topic: 'the chain',
    when: (ctx) => broken(ctx, ...(ctx.links ?? []).map(l => l.id)).length > 0,
    title: 'A broken link is where the story is',
    teach: (ctx) => {
      const b = (ctx.links ?? []).filter(l => l.verdict === 'broken');
      const one = b[0];
      return {
        seen: `${b.length} textbook link${b.length > 1 ? 's are' : ' is'} broken today. The clearest: ${one.textbook.toLowerCase()} — but ${one.a.label} ${one.a.text} and ${one.b.label} ${one.b.text}, the wrong way round.`,
        means: 'A textbook link is a claim about WHY two markets move together. When both ends move but the wrong way round, the usual driver is not what is moving the second one — something else is. That is genuinely informative: it tells you the market has a different story today than the one in the book, and it tells you which story to go looking for.',
        notMeans: 'It does not mean the link will "resolve" — that one side will give way and snap back into line. This desk tested exactly that (S5): when a link breaks, there is no tendency for either leg to be the one that corrects. A broken link explains today. It does not predict tomorrow.',
        words: `"${one.a.label} is doing its thing but ${one.b.label} isn’t following — so this isn’t a ${one.a.label.toLowerCase()} story today."`,
        evidence: ['broken-link-resolution'],
      };
    },
  },
  {
    id: 'broken-link', level: 2, weight: 90, topic: 'the chain',
    when: (ctx) => (ctx.links ?? []).filter(l => l.verdict === 'broken').length >= 2,
    title: 'Two broken links at once: look for the common end',
    teach: (ctx) => {
      const b = (ctx.links ?? []).filter(l => l.verdict === 'broken');
      const ends = {}; for (const l of b) { ends[l.a.key] = (ends[l.a.key] ?? 0) + 1; ends[l.b.key] = (ends[l.b.key] ?? 0) + 1; }
      const common = Object.entries(ends).sort((x, y) => y[1] - x[1])[0];
      const label = b.find(l => l.a.key === common[0])?.a.label ?? b.find(l => l.b.key === common[0])?.b.label ?? common[0];
      return {
        seen: `${b.length} links broken, and ${label} is an end of ${common[1]} of them: ${b.map(l => l.short).join(', ')}.`,
        means: `When several links break and they share an end, that shared market is usually the one behaving unusually — not the several on the other side. ${label} is either being driven by something not on this board, or it has stopped responding to its usual driver. Both are worth knowing before you trade anything attached to it.`,
        notMeans: 'It does not mean that market is "wrong" or due to catch up. Markets are not obliged to obey a chain drawn on a dashboard; the chain is a description of the usual case, and the unusual case is a real state, not an error to be corrected.',
        words: `"Everything that touches ${label} is misbehaving — that’s the tell, not the individual links."`,
        evidence: ['broken-link-resolution'],
      };
    },
  },
  {
    id: 'quiet-chain', level: 1, weight: 40, topic: 'the chain',
    when: (ctx) => { const L = ctx.links ?? []; return L.length > 0 && L.filter(l => l.verdict === 'quiet').length / L.length > 0.7; },
    title: 'A quiet board is information, not an absence of it',
    teach: (ctx) => {
      const L = ctx.links ?? []; const q = L.filter(l => l.verdict === 'quiet').length;
      return {
        seen: `${q} of ${L.length} links are quiet — at least one end has not moved past its noise floor over twenty days.`,
        means: 'Every node has a floor below which a move is noise: 2bp on a breakeven is not a move, 0.3% on the dollar is not a move. When most of the board is inside its floors, nothing macro is happening at the twenty-day scale. That is the correct read on most days, and it is why chasing a macro story on a quiet board leads you to invent one.',
        notMeans: 'It does not mean nothing is moving intraday or that the day will be small. Twenty-day quiet and a wide session are perfectly compatible — the session’s range comes from the event calendar and volatility clustering, not from the macro chain.',
        words: '"There’s no macro story today — it’s a levels-and-flows day."',
        evidence: [],
      };
    },
  },
  // ── the split that beginners miss ─────────────────────────────────────────
  {
    id: 'real-vs-nominal', level: 1, weight: 80, topic: 'rates',
    when: (ctx) => moved(ctx, 'us10y'),
    title: 'A yield move is two moves, and only one of them matters for gold',
    teach: (ctx) => ({
      seen: `The 10-year is ${textOf(ctx, 'us10y')} over twenty days. Of that, the real yield is ${textOf(ctx, 'real')} and inflation pricing is ${textOf(ctx, 'bei')}.`,
      means: 'A nominal yield is the real yield plus what the bond market expects inflation to be. Those two legs mean opposite things. A rise that is all REAL yield is money genuinely getting more expensive: it discounts future earnings harder, it raises the bar for holding an asset that pays nothing, and it usually supports the currency. A rise that is all INFLATION pricing is the opposite — the bond market saying money will be worth less, which is gold’s friend, not its enemy.',
      notMeans: 'It does not mean "yields up, gold down". That shortcut is wrong about half the time, and the half it is wrong about is exactly when the move came from inflation pricing. Always ask which leg moved before you use a yield move for anything.',
      words: '"The ten-year is up but it’s all breakevens — that’s not a tightening, that’s an inflation scare."',
      evidence: ['which-gold', 'oil-to-breakevens'],
    }),
  },
  {
    id: 'real-vs-nominal', level: 2, weight: 80, topic: 'rates',
    when: (ctx) => moved(ctx, 'us2y') && moved(ctx, 'us30y'),
    title: 'Which end of the curve moved tells you who the market is arguing with',
    teach: (ctx) => ({
      seen: `The 2-year is ${textOf(ctx, 'us2y')} and the 30-year is ${textOf(ctx, 'us30y')}.`,
      means: 'The front end is a vote on the central bank: what the market thinks policy will be over the next year or two. The long end is a vote on inflation over decades and on the government’s borrowing — it barely cares what the Fed does next meeting. So a front-end-led move is the market re-pricing policy, and a long-end-led move is the market re-pricing credibility or supply. They call for completely different trades and completely different worries.',
      notMeans: 'It does not mean the curve "predicts a recession" because it inverted. That shape has preceded recessions by a year or more, which is far outside anything this desk trades, and it says nothing about the next week.',
      words: '"Front end is doing the work — this is a Fed story, not a fiscal one."',
      evidence: ['front-end-shock'],
    }),
  },
  // ── the four golds ────────────────────────────────────────────────────────
  {
    id: 'which-gold', level: 1, weight: 70, topic: 'gold',
    when: (ctx) => moved(ctx, 'gold'),
    title: 'There is no such thing as "gold" — there are four of them',
    teach: (ctx) => ({
      seen: `Gold is ${textOf(ctx, 'gold')} over twenty days. Real yields ${textOf(ctx, 'real')}, the dollar ${textOf(ctx, 'dxy')}.`,
      means: 'Gold answers to one driver at a time, and which one it is changes the whole trade. RATES gold moves on real yields (an asset that pays nothing competes with one that does). DOLLAR gold is a currency trade — gold and the dollar as mirror images. RESERVE gold is central banks buying, and it ignores both. FEAR gold is the famous one. The way to tell which is trading is to look at whether the two chain links are holding.',
      notMeans: 'It does not mean fear buys gold. This desk tested 58 VIX spikes: no bid on average at five sessions, and a month later gold had LAGGED its ordinary drift. Fear gold is the one everybody buys and the one that has not paid.',
      words: '"This is dollar gold, not rates gold — I’m really trading the dollar here."',
      evidence: ['which-gold', 'fear-gold'],
    }),
  },
  {
    id: 'which-gold', level: 3, weight: 70, topic: 'gold',
    when: (ctx) => broken(ctx, 'real-gold').length > 0 && broken(ctx, 'dxy-gold').length > 0 && dirOf(ctx, 'gold') === 'up',
    title: 'Gold rising against both drivers: the residual everyone argues about',
    teach: (ctx) => ({
      seen: `Gold is ${textOf(ctx, 'gold')} while real yields are ${textOf(ctx, 'real')} and the dollar ${textOf(ctx, 'dxy')} — both textbook links broken, both the wrong way.`,
      means: 'When gold rises against both of its usual headwinds, the buying is coming from somebody who does not care about either: a buyer whose cost of capital is not the real yield and whose home currency is not the dollar. That is the central-bank case, and 2025 was the clearest example on record — gold rose 55% in a year when neither link explained it for 96% of the time.',
      notMeans: 'It does not mean you can confirm it. There is no free, timely central-bank purchase feed — the World Gold Council’s is behind a login and the IMF’s is quarterly and late. So "reserve gold" is a residual: the name for what is left when the two things you CAN measure have been ruled out. Treat a residual as a question, not an answer.',
      words: '"Neither link explains it, so somebody price-insensitive is buying."',
      evidence: ['which-gold'],
    }),
  },
  // ── events ────────────────────────────────────────────────────────────────
  {
    id: 'event-size', level: 1, weight: 85, topic: 'events',
    when: (ctx) => (ctx.events ?? []).length > 0,
    title: 'A release has a size, and the size is the only tested part',
    teach: (ctx) => {
      const e = ctx.events[0];
      return {
        seen: `Next up: ${e.country ?? ''} ${e.event}${e.inHours != null ? `, in ${e.inHours < 1 ? Math.round(e.inHours * 60) + ' minutes' : Math.round(e.inHours) + ' hours'}` : ''}${e.spike ? ` — the book says it moves this pair ${e.spike}× an ordinary half-hour` : ''}.`,
        means: 'Every recurring release has a characteristic SIZE: how far the market travels in the thirty minutes after it, measured against an ordinary half-hour at the same clock time. That is stable enough to plan around — it tells you how wide to expect the reaction, whether your stop is inside the noise, and whether to be flat.',
        notMeans: 'It does not tell you which way. This desk has scored direction after prints by family and it is a coin flip; it also tested whether a "priced-in" decision moves less (it does not) and whether a big surprise means a bigger follow-through (it does not). Size, never side.',
        words: '"Jobs is a three-times-normal half-hour for Aussie — I’ll be flat into it or sized for it."',
        evidence: ['event-impact-map', 'surprise-size', 'priced-in-direction'],
      };
    },
  },
  {
    id: 'event-size', level: 2, weight: 85, topic: 'events',
    when: (ctx) => (ctx.events ?? []).some(e => /cpi|inflation/i.test(e.event ?? '')),
    title: 'CPI is the one that widens the day AFTER',
    teach: (ctx) => ({
      seen: `An inflation print is on the calendar: ${(ctx.events.find(e => /cpi|inflation/i.test(e.event ?? '')) ?? {}).event}.`,
      means: 'When this desk cut release effects by family, most of them widened the session they landed in. CPI did not — its effect showed up the NEXT session (EUR/USD +0.16 ATR, USD/CAD +0.14). The likely reason is that an inflation print does not move markets directly; it moves the expected path of policy, and that gets repriced across the following day as strategists and models update.',
      notMeans: 'It does not mean the CPI session itself is quiet — it means the extra width is not reliably there on the day. Do not size the release session up for CPI the way you would for a rate decision.',
      words: '"CPI’s effect is tomorrow, not today."',
      evidence: ['surprise-size'],
    }),
  },
  // ── volatility and range ──────────────────────────────────────────────────
  {
    id: 'vol-clusters', level: 1, weight: 75, topic: 'volatility',
    when: (ctx) => fired(ctx, 'vix-inversion') || (ctx.vix != null && ctx.vix3m != null && ctx.vix > ctx.vix3m),
    title: 'Fear priced nearer than later: the cleanest range signal here',
    teach: (ctx) => ({
      seen: `VIX ${ctx.vix ?? '?'} is above the three-month ${ctx.vix3m ?? '?'} — the term structure is inverted.`,
      means: 'Normally insurance costs more the further out you buy it, because more can go wrong in three months than in one. When the near month costs MORE, the market is paying up for protection right now — it is braced for something imminent. This desk measured what follows: the next five sessions run +0.76 ATR wider on the S&P, +0.82 on the Nasdaq, +0.44 on USD/JPY, +0.43 on gold, against matched controls, on 86 episodes.',
      notMeans: 'It does not say which way, and it does not last: the median inversion is one session. It is a sizing fact — widen your stops, expect to be wrong about how far things go — not an entry.',
      words: '"Term structure’s inverted, so I’m sizing for a wider week."',
      evidence: ['vix-inversion'],
    }),
  },
  {
    id: 'asia-tells-you', level: 2, weight: 72, topic: 'the session',
    when: (ctx) => ctx.asiaBand === 'wide' || ctx.asiaBand === 'narrow',
    title: 'Overnight tells you how much of the day is left',
    teach: (ctx) => ({
      seen: `Asia came in ${ctx.asiaBand}${ctx.asiaAtr != null ? ` (${ctx.asiaAtr} ATR)` : ''}.`,
      means: 'A day has a budget. If the overnight session has already spent a large part of it, the odds of London and New York extending to the usual daily bands fall sharply — on gold, from 51% to 21% for the upper median. This desk measured it across 2,500 sessions per instrument and it is one of the largest day-to-day conditioners on the board.',
      notMeans: 'It says nothing about direction. The up-minus-down gap barely moves between a wide and a narrow Asia — never more than nine points anywhere. Overnight range tells you how much, never which way.',
      words: '"Asia already had the range — I’m not expecting London to extend."',
      evidence: ['asia-range-london'],
    }),
  },
  // ── positioning ───────────────────────────────────────────────────────────
  {
    id: 'crowding', level: 1, weight: 60, topic: 'positioning',
    when: (ctx) => !!ctx.cotExtreme,
    title: 'Crowded is a state, not a signal',
    teach: (ctx) => ({
      seen: `${ctx.cotExtreme.inst}: large speculators are at an extreme ${ctx.cotExtreme.dir}${ctx.cotExtreme.pctile != null ? `, ${ctx.cotExtreme.pctile}th percentile of their history` : ''}.`,
      means: 'A one-sided book is fuel: if price goes the other way, the people who are wrong have to buy back, and that adds to the move. That is a real mechanism and it is why a crowded position raises the tail — the day it goes wrong, it goes wrong faster.',
      notMeans: 'It does not mark a turn, and it is not a reason to fade. This desk pre-registered and tested the crowded-and-underwater setup: null on four instruments over nine years. Retail is roughly 60% long every major every day, so "crowded" is nearly a constant — a thing that is always true cannot tell you when.',
      words: '"The book’s one-sided, so I’ll respect the tail — but that’s not an entry."',
      evidence: ['squeeze-fuel', 'crowded-bond-short-fomc'],
    }),
  },
  // ── cost, the thing that kills most edges ─────────────────────────────────
  {
    id: 'cost-gate', level: 1, weight: 65, topic: 'execution',
    when: (ctx) => ctx.costRatio != null,
    title: 'Cost is not a detail — it is the gate everything has to pass',
    teach: (ctx) => ({
      seen: `Spread is ${(ctx.costRatio * 100).toFixed(1)}% of today’s expected range${ctx.costInst ? ` on ${ctx.costInst}` : ''}.`,
      means: 'Every edge is measured before costs and spent after them. This desk ran thirty strategy cells across timeframes: not one survived when the spread was more than about 15% of the instrument’s ATR. The faster the timeframe, the more true it gets — the edge shrinks quicker than the cost does.',
      notMeans: 'It does not mean cheap spreads make a strategy good. It means an expensive one makes a good strategy worthless, so cost is the FIRST filter, not the last check.',
      words: '"At that spread there’s nothing short-horizon worth doing here."',
      evidence: ['execution-gate'],
    }),
  },
  // ── the plumbing ──────────────────────────────────────────────────────────
  {
    id: 'plumbing', level: 2, weight: 55, topic: 'plumbing',
    when: (ctx) => moved(ctx, 'funding'),
    title: 'Repo: the boring number that is never boring twice',
    teach: (ctx) => ({
      seen: `Overnight repo against the Fed’s floor is ${textOf(ctx, 'funding')} over twenty days.`,
      means: 'Banks and dealers borrow overnight against Treasuries. When cash is plentiful that rate sits under the rate the Fed pays on reserves; when it rises through the floor, someone is paying up for overnight money. That is the machinery under every other market — if funding seizes, positions get closed regardless of what anyone thinks about the Fed.',
      notMeans: 'It does not mean stress every time it ticks up. This desk tested the 10bp mark: since 2024 it fires on a quarter of all sessions, it is month-end routine with the reverse-repo buffer drained, and it has not preceded a wider week. The number to watch is the emergency facility actually being used on an ordinary day.',
      words: '"Repo’s firm but that’s month-end — the backstop is still unused."',
      evidence: ['repo-stress-range'],
    }),
  },
  // ── the non-US legs ───────────────────────────────────────────────────────
  {
    id: 'foreign-legs', level: 2, weight: 58, topic: 'rates',
    when: (ctx) => ['giltgap', 'bundgap', 'jgbgap'].some(k => moved(ctx, k)),
    title: 'A currency pair is two bond markets arguing',
    teach: (ctx) => {
      const k = ['giltgap', 'bundgap', 'jgbgap'].find(x => moved(ctx, x));
      const NAMES = { giltgap: ['the gilt gap', 'GBP/USD'], bundgap: ['the Bund gap', 'EUR/USD'], jgbgap: ['the JGB gap', 'USD/JPY'] };
      return {
        seen: `${NAMES[k][0]} is ${textOf(ctx, k)} over twenty days — ${k === 'jgbgap' ? 'Japanese' : k === 'giltgap' ? 'UK' : 'German'} yields against Treasuries.`,
        means: 'Every pair is two economies with two central banks. The gap between their bond yields is the cleanest single summary of who is repricing faster, and in the same window it moves with the pair: Bunds and EUR/USD agree in 74% of twenty-day windows, JGBs and USD/JPY in 70%.',
        notMeans: 'It does not predict. After a foreign-led yield move, the next session is a coin flip (50%, 55%, 50%), and the gilt version is barely better than chance even in the same window (57%). The famous exceptions — the September 2022 mini-budget — are twelve days in sixteen years, and they are remembered precisely because they are rare.',
        words: '"Bunds are repricing faster than Treasuries — that’s the euro’s bid, in this window at least."',
        evidence: ['nonus-yield-gap-label', 'nonus-yield-gap-direction'],
      };
    },
  },
  // ── oil and the crack ─────────────────────────────────────────────────────
  {
    id: 'crack', level: 2, weight: 56, topic: 'commodities',
    when: (ctx) => ctx.crackPercentile != null && (ctx.crackPercentile >= 0.75 || ctx.crackPercentile <= 0.1),
    title: 'Crude and fuel are two markets, and the gap is the honest one',
    teach: (ctx) => ({
      seen: `The 3-2-1 crack spread is ${ctx.crackLevel != null ? '$' + Number(ctx.crackLevel).toFixed(0) : '?'} a barrel — ${ctx.crackPercentile >= 0.9 ? 'the top tenth' : ctx.crackPercentile >= 0.75 ? 'the top quarter' : 'the bottom tenth'} of its history since 2010.`,
      means: 'A refinery buys crude and sells petrol and diesel; the crack is its margin per barrel. Crude and fuel have different buyers and different constraints, so they can move apart — refineries offline, exports cut, inventories drawn. When the crack widens, the pump price stays up even as crude falls, and this desk measured that the bond market’s inflation pricing does not take the relief either.',
      notMeans: 'It does not widen the next month’s range (tested, null) and it is not a direction call on crude (62% on 45 cases, interval through the coin). It changes what you EXPECT from an inflation print, not what you trade.',
      words: '"Crude’s off but the crack is blowing out — don’t read that as inflation relief."',
      evidence: ['crack-inflation-channel', 'crack-blowout-range'],
    }),
  },
  // ── the regime ────────────────────────────────────────────────────────────
  {
    id: 'regime', level: 1, weight: 50, topic: 'macro',
    when: (ctx) => !!ctx.regime,
    title: 'The backdrop: two questions, four answers',
    teach: (ctx) => ({
      seen: `The backdrop is ${ctx.regime.label ?? ctx.regime.regime}, month ${ctx.regime.months ?? '?'} — ${ctx.regime.what ?? ''}.`,
      means: 'Nearly all macro reduces to two questions: is growth speeding up or slowing, and is inflation rising or falling. Four combinations, four names. Goldilocks (growth up, inflation down) is kind to equities. Stagflation (growth down, inflation up) is the one where everything’s range widens and nothing is comfortable. Knowing which one you are in tells you what NORMAL looks like this quarter.',
      notMeans: 'It does not tell you what happens next week, and it does not tilt FX. This desk tested every regime cell against forward returns: equities carry a tilt in goldilocks and reflation, gold in deflation, every market’s range is widest in stagflation — and all four FX cells are flat. Regime is a backdrop, not a trade.',
      words: '"We’re in goldilocks, so a quiet grind is the base case and a vol spike is the surprise."',
      evidence: ['regime-divergence-fx'],
    }),
  },
  // ── the discipline itself ─────────────────────────────────────────────────
  {
    id: 'why-tested', level: 3, weight: 30, topic: 'what is knowable',
    when: (ctx) => (ctx.matrix?.nulls ?? 0) >= 5,
    title: 'Why a null is worth more than a story',
    teach: (ctx) => ({
      seen: `${ctx.matrix.nulls} relationships on this page were tested and found to be nothing.`,
      means: 'Every one of those was believed by somebody, usually by a lot of people, and several were believed here before being tested. A null does two things a story cannot: it stops you paying for the same idea again, and it narrows where the real edge can be hiding. The nulls are why the handful of validated facts are worth trusting — they were not cherry-picked from a list of hopes, they are what was left.',
      notMeans: 'It does not mean those relationships are fake in the world — most of them are real as DESCRIPTION. It means they do not FORECAST, which is a different and much harder thing. Keep using them to explain; stop using them to predict.',
      words: '"That one’s been tested here — it explains, it doesn’t predict."',
      evidence: [],
    }),
  },
];

/** The trader's vocabulary, defined against the live number where there is one. */
export const GLOSSARY = [
  { term: 'Basis point (bp)', say: 'bip', def: 'One hundredth of a percent. Rates move in bips; "the ten-year is up seven" means 0.07%.' },
  { term: 'Real yield', def: 'The yield after expected inflation is taken out — the true cost of money. The 10-year TIPS is the market’s version.', live: c => c.series?.tips },
  { term: 'Breakevens', def: 'Nominal yield minus the real yield: what the bond market expects inflation to average. Called breakevens because that is the rate at which the two bonds pay the same.', live: c => c.series?.bei },
  { term: 'Term premium', def: 'The extra yield the long end pays over the average expected policy rate — compensation for holding duration through uncertainty, supply and deficits.' },
  { term: 'The curve', def: '2s10s is the ten-year minus the two-year. Steepening = the long end rising faster (growth or supply). Flattening = the front end rising faster (the Fed).' },
  { term: 'ATR', say: 'A-T-R', def: 'Average True Range: how far this market travels in a typical day. The unit this desk measures range effects in, because it is comparable across instruments.' },
  { term: 'Carry', def: 'What you are paid (or charged) simply for holding a position overnight — the interest rate difference between the two currencies.' },
  { term: 'Carry unwind', def: 'When positions funded in a low-rate currency get closed at once, buying that currency back hard. The classic yen event.' },
  { term: 'The crack spread', def: 'A refiner’s margin: the fuel it sells minus the crude it buys, per barrel. 3-2-1 = three barrels of crude in, two of petrol and one of diesel out.', live: c => c.crackLevel != null ? `$${Number(c.crackLevel).toFixed(0)}/bbl` : null },
  { term: 'Gamma', def: 'How fast an option hedger’s required hedge changes as price moves. Dealers long gamma buy dips and sell rips (pinning); short gamma, they chase (accelerating).' },
  { term: 'Repo', def: 'Overnight borrowing against Treasuries — the plumbing under everything. SOFR is its rate.' },
  { term: 'OAS', say: 'O-A-S', def: 'Option-adjusted spread: the extra yield a risky bond pays over Treasuries. High-yield OAS is the market’s read on corporate stress.', live: c => c.series?.hy },
  { term: 'Contango / backwardation', def: 'In volatility: contango is the normal shape, insurance costing more the further out you buy it. Backwardation (inversion) means the near term costs more — the market is braced now.' },
  { term: 'The book', def: 'On this desk: the Event Response Book, the measured SIZE of each release on each instrument, as a multiple of an ordinary half-hour.' },
  { term: 'Base rate', def: 'How often something happens unconditionally. The number any claim has to beat before it means anything.' },
  { term: 'Null', def: 'Tested, and nothing there. The most valuable result on this desk, because it stops you paying for the idea twice.' },
];

/**
 * Pick today's lesson. `seen` is the reader's history: { [id]: highestLevelSeen }.
 * Returns { lesson, body, why } or null.
 *
 * The rule: among lessons whose `when` fires today, prefer one the reader has
 * not seen at all; failing that, the next LEVEL UP of an idea they already know;
 * failing that, the highest-weighted. That is how a lesson deepens instead of
 * repeating, and why the same market shape teaches you something new in month
 * three that it could not have taught you in week one.
 */
export function pickLesson(ctx = {}, seen = {}, { exclude = [] } = {}) {
  const live = LESSONS.filter(l => { try { return l.when(ctx); } catch { return false; } })
    .filter(l => !exclude.includes(`${l.id}:${l.level}`));
  if (!live.length) return null;
  // A reader who has seen nothing gets the orientation lesson first -- what this
  // desk can and cannot know is the frame everything else hangs on. After that it
  // drops to the back: the day's own tape is the better teacher.
  const fresh = Object.keys(seen ?? {}).length === 0;
  const score = l => {
    const at = seen[l.id] ?? 0;
    if (l.foundation) return fresh ? 9000 : 50;
    if (at === 0) return 3000 + l.weight;                 // never met this idea
    if (l.level === at + 1) return 2000 + l.weight;       // the next step up
    if (l.level > at) return 1000 + l.weight;             // deeper, with a gap
    return l.weight - 100 * (at - l.level + 1);           // already known; last resort
  };
  const best = live.slice().sort((a, b) => score(b) - score(a))[0];
  let body = null;
  try { body = best.teach(ctx); } catch { return null; }
  const at = seen[best.id] ?? 0;
  return { lesson: best, body,
    why: at === 0 ? 'new to you' : best.level > at ? `level ${best.level} — you have seen the idea, here is what is underneath it` : 'worth meeting again' };
}

/** Every lesson that fires today, in teaching order — for a "more" list. */
export function lessonsToday(ctx = {}) {
  return LESSONS.filter(l => { try { return l.when(ctx); } catch { return false; } })
    .sort((a, b) => b.weight - a.weight || a.level - b.level);
}
