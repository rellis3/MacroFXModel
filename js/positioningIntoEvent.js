/**
 * Who is holding what, and which number is about to test them.
 *
 * WHAT THIS IS FOR. Two feeds on this desk have never been joined. The COT report says
 * who is positioned which way and how far that sits from their own history. The calendar
 * says which release is next and what the market expects it to print. Separately each is
 * a table you glance at; together they answer a question neither can: when this number
 * lands, WHO is holding the position that has to move?
 *
 * WHAT THIS IS NOT. It is not a direction signal, and the restraint is not modesty -- it
 * is the result. `cot-positioning-factor` pre-registered exactly that question, two-sided
 * so neither theory could claim the answer in advance, and it FAILED: pooled OOS rank-IC
 * -0.0317 at p=0.094 over 3,576 rows, and the AUD leg specifically was +0.004, which is
 * nothing. Its companion `crowded-bond-short-fomc` went further and found crowded shorts
 * into a scheduled event got PAID rather than squeezed, over 84 meetings. So a module
 * that turned this into "crowded long, therefore bearish" would be contradicting the only
 * two registered tests this desk has on the subject.
 *
 * What survives both results is MECHANICAL and does not need a test to be true: if the
 * fast money is crowded long and the number disappoints, the fast money is the side
 * holding what would have to be sold. That is a statement about who must act. Whether
 * they do, and what price does about it, is the part that came back null -- and every row
 * this module emits carries that verdict with it rather than leaving the reader to supply
 * an optimism the evidence does not.
 *
 * THE PARTICIPANT SPLIT IS THE POINT. A single "speculators" number cannot answer the
 * question at all. On 2026-10-06 the AUD book had leveraged funds net LONG at the 84th
 * percentile of three years while asset managers were net SHORT near a twenty-year
 * extreme, the two sides having pulled 27.6pp apart in a month. Collapsed into one
 * column, that reads "the market is net short"; split, it is a crowded long by the fast
 * money against a record real-money short, and those imply opposite things about who is
 * exposed to the Australian jobs print the following morning.
 *
 * Pure: no fetch, no DOM. Tested in js/positioningIntoEvent.test.mjs.
 */
import { HEADLINE_INSTRUMENT } from './newsOutcome.js';
import { toCcyRow } from './cotState.js';

/** Currency -> the country code the calendar files its releases under. */
export const CCY_COUNTRY = {
  USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP', AUD: 'AU',
  NZD: 'NZ', CAD: 'CA', CHF: 'CH', MXN: 'MX',
};
/** The euro's releases arrive under several national codes. */
const COUNTRY_CCY = {
  US: 'USD', EU: 'EUR', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR',
  GB: 'GBP', UK: 'GBP', JP: 'JPY', AU: 'AUD', NZ: 'NZD', CA: 'CAD', CH: 'CHF', MX: 'MXN',
};

/**
 * Classify a release by name.
 *
 * today.html carries its own copy of this at the top of the news playbook. The two must
 * agree or one panel will call a release inflation and the other a survey on the same
 * morning; js/positioningIntoEvent.test.mjs pins the table that guards it. The copy was
 * not merged because today.html takes additive changes only.
 */
export function newsKind(name) {
  const n = (name || '').toLowerCase();
  if (/rate decision|interest rate|policy rate|bank rate|rate statement|cash rate|refi rate|deposit rate/.test(n)) return 'rate';
  if (/\bcpi\b|\bppi\b|\bpce\b|inflation|price index|consumer prices|producer prices/.test(n)) return 'inflation';
  if (/unemployment rate|jobless rate/.test(n)) return 'unemp';
  if (/jobless claims|initial claims|continuing claims|unemployment claims/.test(n)) return 'claims';
  if (/nonfarm|non-farm|payroll|employment change|employment report|\bjobs\b/.test(n)) return 'jobs';
  if (/\bgdp\b|growth rate/.test(n)) return 'growth';
  if (/\bpmi\b|\bism\b|business climate|manufacturing|services|sentiment|confidence|zew|ifo|tankan/.test(n)) return 'survey';
  if (/retail sales|consumer spending/.test(n)) return 'spending';
  if (/trade balance|current account/.test(n)) return 'trade';
  if (/durable goods|factory orders|industrial production/.test(n)) return 'output';
  return 'generic';
}

/**
 * Kinds where a HIGHER number is WEAKER for the currency.
 *
 * Unemployment and jobless claims both read backwards. Getting this wrong would invert
 * the tilt on every labour release, which is worse than omitting it, so it is a table and
 * not a rule -- the same decision newsOutcome.js made for its instrument polarity.
 */
export const INVERTED_KINDS = new Set(['unemp', 'claims']);

/** "19.6K" -> 19600, "4.6%" -> 4.6, "790B" -> 7.9e11, "3.80|1.6" -> null (two numbers). */
export function parseFigure(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s.includes('|')) return null;
  const m = s.replace(/,/g, '').match(/^(-?\d+(?:\.\d+)?)\s*([KMBT])?/i);
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(m[2] ?? '').toUpperCase()] ?? 1;
  return parseFloat(m[1]) * mult;
}

/**
 * What the CONSENSUS is looking for, relative to last time, expressed for the currency.
 *
 * Not what will happen -- what the room has already agreed to expect, which is the thing
 * a surprise is measured against. Inverted kinds are flipped here so "stronger" always
 * means stronger for the currency and a reader never has to remember that a rising
 * unemployment rate is bad news.
 */
export function consensusTilt(ev = {}) {
  // Named estNum/prevNum, NOT est/prev: bookFor spreads this result over the calendar
  // row, and fields called `estimate`/`prev`/`est` would overwrite the display strings
  // the calendar publishes. That turned "19.6K vs 39.5K" into "19.6K vs 39500" on screen.
  const estNum = parseFigure(ev.estimate), prevNum = parseFigure(ev.prev);
  if (estNum == null || prevNum == null) return { tilt: null, word: 'no consensus published', estNum, prevNum };
  const inverted = INVERTED_KINDS.has(ev.kind ?? newsKind(ev.event));
  const band = Math.max(Math.abs(prevNum) * 0.02, 1e-9);
  const raw = Math.abs(estNum - prevNum) <= band ? 'hold' : estNum > prevNum ? 'up' : 'dn';
  const tilt = raw === 'hold' ? 'hold' : inverted ? (raw === 'up' ? 'dn' : 'up') : raw;
  return {
    tilt, estNum, prevNum, inverted,
    word: tilt === 'hold' ? 'consensus looks for no change'
        : tilt === 'up' ? 'consensus looks for a stronger print than last time'
        : 'consensus looks for a softer print than last time',
  };
}

const CROWD_HI = 80, CROWD_LO = 20;      // percentile of net share of open interest
const STRETCH_HI = 85, STRETCH_LO = 15;  // the real-money leg, on its own history
const SPLIT_PP = 10;                     // four-week divergence worth naming, in points

/** 1st, 2nd, 3rd, 61st, 83rd -- not "61th". */
export const ordinal = n => {
  if (n == null || !Number.isFinite(n)) return null;
  const v = Math.round(n), t = v % 100;
  return `${v}${t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][v % 10] ?? 'th'}`;
};

const sideOf = share => (share == null ? null : share > 0 ? 'long' : share < 0 ? 'short' : 'flat');

/**
 * Is this leg crowded, trimmed, or neither?
 *
 * A percentile on its own cannot tell the difference. Net LONG at the 10th percentile and
 * net SHORT at the 10th percentile are both "low", and they mean opposite things: the
 * first is the smallest long in three years, the second is a crowded short. The sign says
 * which side the position is on; the percentile says how far that is from normal; only
 * together do they say whether there is anything to unwind.
 */
export function extremeOf(leg = {}, hi = 80, lo = 20) {
  const { share, pct } = leg;
  if (share == null || pct == null) return { crowded: null, trimmed: null };
  if (share > 0 && pct >= hi) return { crowded: 'long', trimmed: null };
  if (share < 0 && pct <= lo) return { crowded: 'short', trimmed: null };
  if (share > 0 && pct <= lo) return { crowded: null, trimmed: 'long' };
  if (share < 0 && pct >= hi) return { crowded: null, trimmed: 'short' };
  return { crowded: null, trimmed: null };
}

/**
 * One currency's book: who holds what, how far from normal, and what is scheduled.
 *
 * `cot` is one row of /api/cot-extremes (it needs the participant split -- amShare and
 * friends); `events` are the calendar rows already filtered to this currency.
 */
export function bookFor(cot0, events = [], { nowMs = Date.now(), horizonH = 96 } = {}) {
  if (!cot0) return null;
  // This card speaks for the CURRENCY ("JPY: fast money crowded long"), so the row is read in "long the currency"
  // terms. The feed delivers JPY/CAD/CHF in USD-pair terms (js/cotState.js); before 2026-10-24 those three were
  // described on the wrong side.
  const cot = toCcyRow(cot0);
  const ccy = cot.sym;
  const fast = { net: cot.specNet ?? null, share: cot.specShare ?? null, pct: cot.specSharePct ?? null, side: sideOf(cot.specShare) };
  const real = { net: cot.amNet ?? null, share: cot.amShare ?? null, pct: cot.amSharePct ?? null, side: sideOf(cot.amShare) };
  const dealer = { net: cot.dlNet ?? null, share: cot.dlShare ?? null };

  // CROWDED is about the fast money, because they are the ones who unwind in a hurry.
  // Ranked on share of open interest, not raw contracts: 50,000 net long means different
  // things in a big book and a small one, and open interest itself moves a lot.
  //
  // THE SIGN AND THE PERCENTILE MUST AGREE. Reading the percentile alone called GBP a
  // "crowded short" on 2026-10-14 while leveraged funds were net LONG +12,432 — long, but
  // the least long in three years. That is not a crowded short and not a crowded long: it
  // is a position that has been TRIMMED, and it means the opposite thing. There is very
  // little left to unwind, where a crowded book has a great deal. Both readings are kept,
  // and they are never conflated.
  const fastX = extremeOf(fast, CROWD_HI, CROWD_LO);
  const realX = extremeOf(real, STRETCH_HI, STRETCH_LO);
  const crowded = fastX.crowded, trimmed = fastX.trimmed;
  const stretched = realX.crowded, realTrimmed = realX.trimmed;
  const split = cot.splitChg4w ?? null;
  const diverging = split != null && Math.abs(split) >= SPLIT_PP;

  const cutoff = nowMs + horizonH * 3600_000;
  const due = (events ?? [])
    .filter(e => e && e.ms != null && e.ms >= nowMs - 3600_000 && e.ms <= cutoff)
    .map(e => { const kind = newsKind(e.event); return { ...e, kind, ...consensusTilt({ ...e, kind }) }; })
    .sort((a, b) => a.ms - b.ms);

  return {
    ccy, country: CCY_COUNTRY[ccy] ?? null,
    // null for USD on purpose: a US release is not one pair's event, it lands on all of
    // them, and naming EURUSD here would quietly suggest otherwise.
    instrument: ccy === 'USD' ? null : HEADLINE_INSTRUMENT[CCY_COUNTRY[ccy]] ?? null,
    fast, real, dealer, split, diverging, crowded, stretched, trimmed, realTrimmed,
    events: due,
    exposure: exposureLine({ ccy, fast, real, crowded, trimmed, stretched, realTrimmed, split, diverging, next: due[0] ?? null }),
  };
}

/**
 * The one sentence worth reading, and the hardest one to keep honest.
 *
 * Everything here is mechanical: a crowded long is a position someone has to sell if they
 * change their mind, and that is true whether or not it predicts anything. The moment it
 * starts saying which way price goes it is contradicting `cot-positioning-factor`, so it
 * never does, and `verdictLine()` below ships alongside it to say so out loud.
 */
export function exposureLine({ ccy, fast, real, crowded, trimmed, stretched, realTrimmed, split, diverging, next } = {}) {
  if (!crowded && !trimmed && !stretched && !realTrimmed && !diverging) return null;
  const bits = [];
  if (trimmed) {
    // The opposite of crowded, and worth saying out loud: the position has already been
    // cut, so there is little left to be forced out of.
    bits.push(`Leveraged funds hold their smallest ${trimmed.toUpperCase()} in three years`
      + (fast && fast.pct != null ? ` (${ordinal(fast.pct)} percentile)` : '')
      + ` — the crowd has already left this one, so there is little left to unwind`);
  }
  if (crowded) {
    const pct = fast && fast.pct != null ? ` (${ordinal(fast.pct)} percentile of their own three years)` : '';
    const what = crowded === 'long'
      ? `a disappointing ${ccy} number leaves them holding the position that has to be sold`
      : `a strong ${ccy} number leaves them holding the position that has to be bought back`;
    bits.push(`Leveraged funds are crowded ${crowded.toUpperCase()}${pct} — ${what}`);
  }
  if (realTrimmed && real && real.pct != null) {
    bits.push(`asset managers hold their smallest ${realTrimmed.toUpperCase()} in three years (${ordinal(real.pct)} percentile)`);
  }
  if (stretched && real && real.side) {
    // "sits LONG at the bottom of its own range" is true (long, but less long than usual)
    // and reads as a contradiction. State the side and the rank separately, and only call
    // it the opposite side when it actually is one.
    const opposed = crowded && real.side !== crowded;
    bits.push(`asset managers — real money, mostly hedging — are net ${real.side.toUpperCase()}`
      + ` at the ${ordinal(real.pct)} percentile of their own three years`
      + (opposed ? `, the opposite side of the fast money` : ''));
  }
  if (diverging) {
    bits.push(`the two sides have pulled ${Math.abs(split).toFixed(1)}pp ${split > 0 ? 'further apart' : 'back together'} in four weeks`);
  }
  if (next) bits.push(`next test: ${next.event}, ${next.word}`);
  return bits.join('. ') + '.';
}

/** Said on every row, because the row is the kind of thing that invites the wrong read. */
export function verdictLine() {
  return 'Positioning does not say which way this goes. The one registered test of that '
       + 'failed (rank-IC -0.03, p=0.09, 3,576 rows; the AUD leg was +0.004), and crowded '
       + 'shorts into a scheduled event were PAID, not squeezed, over 84 meetings. Read '
       + 'this as who has to act if they are wrong, never as a lean.';
}
export const EVIDENCE_IDS = ['cot-positioning-factor', 'crowded-bond-short-fomc', 'squeeze-fuel'];

/**
 * The whole board: every currency with a book, most exposed first.
 *
 * USD is pulled out separately rather than ranked, because a US release is not one
 * currency's event -- it lands on every pair at once, and burying it in a sorted list
 * would hide that.
 */
export function positioningBoard(instruments = [], events = [], { nowMs = Date.now(), horizonH = 96 } = {}) {
  const fx = (instruments ?? []).filter(i => i && i.group === 'fx' && CCY_COUNTRY[i.sym]);
  const evFor = ccy => (events ?? []).filter(e =>
    e && String(e.impact ?? '').toLowerCase() === 'high' && COUNTRY_CCY[e.country] === ccy);

  const rows = fx.map(i => bookFor(i, evFor(i.sym), { nowMs, horizonH })).filter(Boolean);
  const usd = rows.find(r => r.ccy === 'USD') ?? null;
  const rest = rows.filter(r => r.ccy !== 'USD');

  // Most exposed first: a crowded book with a release due outranks a crowded book with
  // nothing scheduled, which outranks a quiet one. Ties break on how stretched.
  const score = r => (r.crowded ? 2 : 0) + (r.events.length ? 2 : 0) + (r.stretched ? 1 : 0)
    + (r.diverging ? 1 : 0) + (r.fast.pct == null ? 0 : Math.abs(r.fast.pct - 50) / 100);
  rest.sort((a, b) => score(b) - score(a));
  return { usd, rows: rest, verdict: verdictLine(), evidence: EVIDENCE_IDS };
}
