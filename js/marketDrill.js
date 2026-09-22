/**
 * The drill — learning to read a macro tape by committing before you see.
 *
 * WHY THIS EXISTS. Explanation attached to live data (js/marketLessons.js) is
 * necessary but weak on its own: reading a good explanation feels like learning
 * and very little survives the week. Two things fix that, and this file is both:
 *
 *   COMMIT FIRST. You answer before the reveal. Guessing and being corrected
 *     beats reading the right answer, by a wide margin and in every study of it.
 *   VOLUME. A wide-Asia day or a broken dollar link arrives when the market
 *     feels like it. Six years of history gives you fifty reps in an evening.
 *
 * THE ONE RULE. **Never drill something that is a coin flip.** Asking "which way
 * did it close?" would train you to see signal in noise, which is the exact
 * disease this desk exists to avoid. Every question here has a real answer that
 * follows from the numbers on the card: which link broke, which leg of a yield
 * move did it, which gold was trading, what the bond market concluded about an
 * oil move, whether credit confirmed an equity wobble, which regime you were in.
 * Structure and mechanism, never direction.
 *
 * THE DATA. A bundle of daily series ({ dates: [...], series: { key: [...] } },
 * nulls where a series did not print). Every question is rebuilt from the same
 * numbers the live page uses, so what you learn here transfers exactly.
 *
 * Pure: no fetch, no DOM, no clock. Deterministic given a seed, so a question
 * can be linked to, replayed and argued with. Tested in js/marketDrill.test.mjs.
 */

/** Deterministic PRNG so a seed always rebuilds the same question. */
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const WINDOW = 20;                                  // the chain's own window, so this transfers
const at = (b, key, i) => b?.series?.[key]?.[i] ?? null;
/** Change over the window ending at index i: bp for rates, % for prices. */
function delta(b, key, i, kind) {
  const now = at(b, key, i), then = at(b, key, i - WINDOW);
  if (now == null || then == null) return null;
  return kind === 'bp' ? (now - then) * 100 : (then !== 0 ? (now / then - 1) * 100 : null);
}
const fmt = (v, kind, dp = 1) => v == null ? '—' : `${v > 0 ? '+' : ''}${kind === 'bp' ? Math.round(v) : v.toFixed(dp)}${kind === 'bp' ? 'bp' : '%'}`;
const shuffle = (arr, rand) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/**
 * Each generator gets (bundle, i, rand) for a candidate day and returns a
 * question or null when that day cannot teach its idea. `topic` groups them so
 * the page can report where a reader is weak.
 */
export const GENERATORS = [
  {
    id: 'yield-split', topic: 'rates',
    make(b, i, rand) {
      const d10 = delta(b, 'us10y', i, 'bp'), dR = delta(b, 'tips', i, 'bp'), dB = delta(b, 'bei', i, 'bp');
      if (d10 == null || dR == null || dB == null) return null;
      if (Math.abs(d10) < 15) return null;                                  // needs a real move to be a question
      const realShare = Math.abs(dR) / (Math.abs(dR) + Math.abs(dB) || 1);
      if (realShare > 0.4 && realShare < 0.6) return null;                  // genuinely split: no clean answer
      const answer = realShare >= 0.6 ? 'real' : 'inflation';
      return {
        stem: `The US 10-year moved ${fmt(d10, 'bp')} over twenty sessions.`,
        ask: 'Was that mostly the REAL yield, or mostly INFLATION pricing?',
        options: [
          { key: 'real', label: 'Mostly the real yield — money genuinely getting dearer' },
          { key: 'inflation', label: 'Mostly inflation pricing — breakevens moving' },
        ],
        answer,
        reveal: `Real yield ${fmt(dR, 'bp')}, breakevens ${fmt(dB, 'bp')}.`,
        why: answer === 'real'
          ? 'The move was the real yield, so this is a genuine tightening of financial conditions: it discounts future earnings harder, raises the bar for holding an asset that pays nothing, and usually supports the currency. Gold’s headwind.'
          : 'The move was inflation pricing, not the real yield. Money did not get more expensive — the bond market simply expects it to be worth less. That is gold’s FRIEND, and it is why "yields up, gold down" is wrong about half the time.',
        principle: 'A nominal yield is the real yield plus expected inflation. Always ask which leg moved before you use a yield move for anything.',
        evidence: ['which-gold'],
      };
    },
  },
  {
    id: 'curve-led', topic: 'rates',
    make(b, i) {
      const d2 = delta(b, 'us2y', i, 'bp'), d30 = delta(b, 'us30y', i, 'bp');
      if (d2 == null || d30 == null) return null;
      if (Math.abs(d2) < 12 && Math.abs(d30) < 12) return null;
      if (Math.abs(Math.abs(d2) - Math.abs(d30)) < 8) return null;          // too close to call
      const answer = Math.abs(d2) > Math.abs(d30) ? 'front' : 'long';
      return {
        stem: `Over twenty sessions the 2-year moved ${fmt(d2, 'bp')} and the 30-year ${fmt(d30, 'bp')}.`,
        ask: 'Who is the market arguing with here?',
        options: [
          { key: 'front', label: 'The central bank — a policy repricing' },
          { key: 'long', label: 'Inflation credibility and government supply — a fiscal repricing' },
        ],
        answer,
        reveal: `The ${answer === 'front' ? 'front end' : 'long end'} led by ${Math.abs(Math.abs(d2) - Math.abs(d30)).toFixed(0)}bp.`,
        why: answer === 'front'
          ? 'The front end is a vote on what policy does over the next year or two. When it leads, the market is re-pricing the central bank — a meeting, a speech, a jobs number.'
          : 'The long end barely cares what happens at the next meeting. When it leads, the argument is about inflation over decades, or about how much the government needs to borrow. Different story, different trades, different worry.',
        principle: 'Front end = the Fed. Long end = credibility and supply. Which end led tells you which conversation the market is having.',
        evidence: ['front-end-shock'],
      };
    },
  },
  {
    id: 'oil-breakevens', topic: 'inflation',
    make(b, i) {
      const dOil = delta(b, 'oil', i, 'pct'), dB = delta(b, 'bei', i, 'bp');
      if (dOil == null || dB == null) return null;
      if (Math.abs(dOil) < 8) return null;
      const followed = Math.sign(dOil) === Math.sign(dB) && Math.abs(dB) >= 5;
      return {
        stem: `Crude moved ${fmt(dOil, 'pct')} over twenty sessions.`,
        ask: 'What did the bond market’s inflation pricing do about it?',
        options: [
          { key: 'followed', label: 'Followed it — breakevens moved the same way' },
          { key: 'ignored', label: 'Ignored it — breakevens barely moved' },
        ],
        answer: followed ? 'followed' : 'ignored',
        reveal: `Breakevens ${fmt(dB, 'bp')}.`,
        why: followed
          ? 'Energy fed through: the bond market took this oil move as a real change in the inflation outlook, and the first domino in the chain did its job.'
          : 'The bond market declined to take it. That is a verdict, not a delay — this desk tested it directly: only 43% of ±10% oil moves get 5bp of breakeven within twenty sessions, and the cross-correlation is highest at lag ZERO. If breakevens did not move with oil, do not write "not yet".',
        principle: 'Oil reaches inflation pricing in the same window or not at all. A quiet breakeven next to a big oil move is the bond market disagreeing, not lagging.',
        evidence: ['oil-to-breakevens'],
      };
    },
  },
  {
    id: 'which-gold', topic: 'gold',
    make(b, i) {
      const dG = delta(b, 'gold', i, 'pct'), dR = delta(b, 'tips', i, 'bp'), dD = delta(b, 'dxy', i, 'pct');
      if (dG == null || dR == null || dD == null) return null;
      if (Math.abs(dG) < 2) return null;
      const ratesOk = Math.abs(dR) >= 8 && Math.sign(dR) !== Math.sign(dG);
      const dollarOk = Math.abs(dD) >= 0.5 && Math.sign(dD) !== Math.sign(dG);
      const answer = ratesOk ? 'rates' : dollarOk ? 'dollar' : 'neither';
      return {
        stem: `Gold moved ${fmt(dG, 'pct')} over twenty sessions. Real yields ${fmt(dR, 'bp')}, the broad dollar ${fmt(dD, 'pct')}.`,
        ask: 'Which gold was trading?',
        options: [
          { key: 'rates', label: 'Rates gold — the real-yield trade' },
          { key: 'dollar', label: 'Dollar gold — really a currency trade' },
          { key: 'neither', label: 'Neither — gold moved against or without both' },
        ],
        answer,
        reveal: answer === 'rates' ? 'The real-yield link explains it.' : answer === 'dollar' ? 'The dollar link explains it; the real-yield one does not.' : 'Neither link explains it — the residual case.',
        why: answer === 'neither'
          ? 'When neither driver explains gold, the buying is coming from somebody who cares about neither — the central-bank case. It is a residual, which means a question rather than an answer: there is no free, timely feed to confirm it. This is also the most common state, roughly 45% of history.'
          : answer === 'rates'
            ? 'Gold pays nothing, so it competes with an asset that does. When the real yield moves and gold moves the other way, that is the opportunity-cost trade and nothing else needs explaining.'
            : 'Gold and the dollar as mirror images is not really a gold trade at all — it is a currency trade wearing gold’s clothes. Know which one you are in before you size it.',
        principle: 'There is no such thing as "gold". Four drivers, one at a time, and the way to tell is to check both links before you write the story.',
        evidence: ['which-gold', 'fear-gold'],
      };
    },
  },
  {
    id: 'credit-confirms', topic: 'risk',
    make(b, i) {
      const dV = delta(b, 'vix', i, 'pct'), dH = delta(b, 'hy', i, 'bp');
      if (dV == null || dH == null) return null;
      if (dV < 15) return null;                                             // only ask when fear actually rose
      const confirmed = dH >= 15;
      return {
        stem: `Equity fear rose hard over twenty sessions: the VIX ${fmt(dV, 'pct')}.`,
        ask: 'Did the credit market agree?',
        options: [
          { key: 'yes', label: 'Yes — high-yield spreads widened with it' },
          { key: 'no', label: 'No — credit barely moved' },
        ],
        answer: confirmed ? 'yes' : 'no',
        reveal: `High-yield spreads ${fmt(dH, 'bp')}.`,
        why: confirmed
          ? 'Both markets repriced risk together. Credit is where lenders vote, and lenders moving with equity holders is what a genuine risk-off looks like — it is much harder to dismiss as positioning or an options event.'
          : 'Equity fear rose and lenders did not blink. That pattern usually means the equity move is about equity — positioning, an options expiry, a crowded trade unwinding — rather than about the economy. Credit is the slower, meaner judge.',
        principle: 'Ask whether credit confirms an equity scare. Fear without credit is usually a positioning story; fear with credit is an economic one.',
        evidence: ['vix-inversion'],
      };
    },
  },
  {
    id: 'dollar-link', topic: 'the chain',
    make(b, i, rand) {
      const dD = delta(b, 'dxy', i, 'pct');
      if (dD == null || Math.abs(dD) < 0.5) return null;
      const legs = [
        { key: 'gold', label: 'Gold', d: delta(b, 'gold', i, 'pct'), floor: 2, sign: -1 },
        { key: 'audusd', label: 'AUD/USD', d: delta(b, 'audusd', i, 'pct'), floor: 1, sign: -1 },
        { key: 'usdjpy', label: 'USD/JPY', d: delta(b, 'usdjpy', i, 'pct'), floor: 1, sign: +1 },
      ].filter(l => l.d != null && Math.abs(l.d) >= l.floor);
      if (legs.length < 2) return null;
      const bad = legs.filter(l => Math.sign(l.d) !== Math.sign(dD) * l.sign);
      if (bad.length !== 1) return null;                                    // exactly one broken = one clean answer
      return {
        stem: `The broad dollar moved ${fmt(dD, 'pct')} over twenty sessions. ${legs.map(l => `${l.label} ${fmt(l.d, 'pct')}`).join(', ')}.`,
        ask: 'Which of these stopped following the dollar?',
        options: shuffle(legs.map(l => ({ key: l.key, label: l.label })), rand),
        answer: bad[0].key,
        reveal: `${bad[0].label} went the wrong way for a ${dD > 0 ? 'stronger' : 'weaker'} dollar.`,
        why: `Every one of these is half a dollar trade, so when the dollar moves they should all respond. ${bad[0].label} did not, which means something else was driving it — and that is the thing worth going to look for. A broken link is where the story is. What it is NOT is a prediction: this desk tested whether a broken link resolves one way, and there is no tendency for either leg to be the one that corrects.`,
        principle: 'When one leg of a driver stops responding, the driver is not the story for that leg. Go and find what is.',
        evidence: ['broken-link-resolution'],
      };
    },
  },
  {
    id: 'regime-quad', topic: 'macro',
    make(b, i) {
      // growth proxy: copper vs gold over a quarter. inflation proxy: breakevens.
      const dCu = delta(b, 'copper', i, 'pct'), dG = delta(b, 'gold', i, 'pct'), dB = delta(b, 'bei', i, 'bp');
      if (dCu == null || dG == null || dB == null) return null;
      const growth = dCu - dG;                                              // the classic copper/gold growth read
      if (Math.abs(growth) < 4 || Math.abs(dB) < 5) return null;
      const g = growth > 0 ? 'up' : 'down', inf = dB > 0 ? 'up' : 'down';
      const answer = g === 'up' && inf === 'down' ? 'goldilocks' : g === 'up' ? 'reflation' : inf === 'up' ? 'stagflation' : 'deflation';
      return {
        stem: `Copper ${fmt(dCu, 'pct')} against gold ${fmt(dG, 'pct')} — the growth read — with breakevens ${fmt(dB, 'bp')}.`,
        ask: 'Which quadrant is that?',
        options: [
          { key: 'goldilocks', label: 'Goldilocks — growth up, inflation down' },
          { key: 'reflation', label: 'Reflation — growth up, inflation up' },
          { key: 'stagflation', label: 'Stagflation — growth down, inflation up' },
          { key: 'deflation', label: 'Deflation / risk-off — growth down, inflation down' },
        ],
        answer,
        reveal: `Growth ${g}, inflation ${inf}.`,
        why: `Nearly all macro reduces to those two questions, and the answer sets what NORMAL looks like this quarter. ${answer === 'stagflation' ? 'Stagflation is the one where every market’s range widens and nothing is comfortable.' : answer === 'goldilocks' ? 'Goldilocks is kind to equities — a quiet grind is the base case and a vol spike is the surprise.' : answer === 'reflation' ? 'Reflation carries equities too, with the inflation hedge working alongside.' : 'Deflation is the quadrant gold has historically carried, and risk assets have not.'} What it does NOT do is tilt FX: all four currency cells tested flat here.`,
        principle: 'Growth and inflation, each up or down. Four boxes. It is a backdrop, not a trade.',
        evidence: ['regime-divergence-fx'],
      };
    },
  },
];

/**
 * Build one question from the bundle. `seed` makes it reproducible; `topics`
 * narrows it; `exclude` avoids repeating a generator back to back.
 * Returns null only if the bundle cannot support any question at all.
 */
export function buildQuestion(bundle, { seed = 1, topics = null, exclude = [] } = {}) {
  const dates = bundle?.dates ?? [];
  if (dates.length < WINDOW + 30) return null;
  const rand = rng(seed);
  const pool = GENERATORS.filter(g => (!topics || topics.includes(g.topic)) && !exclude.includes(g.id));
  const gens = pool.length ? pool : GENERATORS;
  // try random days until one of them can teach something; bounded so this
  // always terminates on a thin bundle
  for (let tries = 0; tries < 240; tries++) {
    const i = WINDOW + 5 + Math.floor(rand() * (dates.length - WINDOW - 6));
    const g = gens[Math.floor(rand() * gens.length)];
    let q = null;
    try { q = g.make(bundle, i, rand); } catch { q = null; }
    if (!q) continue;
    const opts = q.options.length === 2 ? q.options : shuffle(q.options, rand);
    return { id: `${g.id}@${dates[i]}`, gen: g.id, topic: g.topic, date: dates[i], seed, ...q, options: opts };
  }
  return null;
}

/** Was the reader right, and what does the score look like now? */
export function score(history = []) {
  const done = history.filter(h => h.chosen != null);
  const byTopic = {};
  for (const h of done) { const t = (byTopic[h.topic] ??= { n: 0, right: 0 }); t.n++; if (h.chosen === h.answer) t.right++; }
  const right = done.filter(h => h.chosen === h.answer).length;
  let streak = 0; for (let i = done.length - 1; i >= 0; i--) { if (done[i].chosen === done[i].answer) streak++; else break; }
  const weakest = Object.entries(byTopic).filter(([, v]) => v.n >= 3).sort((a, b) => (a[1].right / a[1].n) - (b[1].right / b[1].n))[0] ?? null;
  return { n: done.length, right, pct: done.length ? right / done.length : null, streak,
           byTopic, weakest: weakest ? { topic: weakest[0], ...weakest[1] } : null };
}
