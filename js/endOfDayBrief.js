/**
 * The end-of-day brief: the day narrated, against what the page said this morning.
 *
 * The companion to the morning brief, and deliberately NOT an AI call. Everything here
 * is a comparison between two records the page already holds — what it published this
 * morning and what the tape did since — and a comparison is arithmetic, not judgement.
 * An AI call would cost money to restate numbers that are already sitting in memory,
 * and it would be free to drift from them. The morning brief buys a trader's voice on
 * an open question; this buys nothing, so it is written from templates and runs every
 * day at no cost.
 *
 * THE ONE THING IT WILL NOT DO IS REPORT THE MACRO AS TODAY'S NEWS. The rates, credit
 * and volatility series come from FRED, which settles two to three sessions behind:
 * on the day this was built the "1-day" change on the 10-year was a move from three
 * sessions ago. A brief that printed those as the day's macro would be inventing an
 * afternoon that never happened. `macroFreshness` measures the lag and the brief states
 * it, then builds the day's read off the only thing that genuinely moved today — the
 * priced tape, thirty instruments from their session open to now.
 *
 * AND IT SAYS NOTHING ABOUT TOMORROW'S DIRECTION. This desk has tested that repeatedly:
 * the priced-in claim came back null, surprise size validated for RANGE only, and the
 * page's own lean record has never cleared a coin flip. So the forward section names
 * what is scheduled,
 * which tiles it transmits through, and which calls are still standing — never which
 * way anything goes. (The record is READ from the ledger at render time; a figure written
 * into this comment would go stale the same way the prose once did.)
 *
 * Pure: no fetch, no DOM. Tested in js/endOfDayBrief.test.mjs.
 */

const pct1 = v => (v > 0 ? '+' : '') + v.toFixed(1) + '%';
const pct2 = v => (v > 0 ? '+' : '') + v.toFixed(2) + '%';
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const fxPair = name => /^[A-Z]{6}$/.test(name) ? [name.slice(0, 3), name.slice(3)] : null;
/** 1st, 2nd, 3rd, 4th ... 11th-13th are the exceptions that catch a naive rule. */
const ord = n => {
  const v = Math.abs(Math.round(n)), t = v % 100;
  return `${n}${t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][v % 10] ?? 'th'}`;
};

/**
 * How stale the macro series are.
 *
 * `lastDate` is the newest print across the whole macro set. FRED settles behind the
 * tape, so on most days this is yesterday or the day before, and on a Monday it can be
 * Thursday. The brief needs the number to decide whether it is allowed to describe a
 * rates move as having happened "today" — usually it is not.
 */
/**
 * Trading sessions between two dates, which is NOT the number of calendar days.
 *
 * THE BUG THIS FIXES. The lag was measured in calendar days and reported as "sessions",
 * so every Monday the debrief opened by announcing that Friday's macro print was "3
 * sessions back". It is one. The data looked three times staler than it was, every week,
 * in the first sentence.
 *
 * Weekends only. A market holiday will still read one session high occasionally, which is
 * a far smaller error than counting Saturday and Sunday as trading days.
 */
export function sessionsBetween(fromISO, toISO) {
  const a = Date.parse(fromISO), b = Date.parse(toISO);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  let n = 0;
  for (let t = a + 864e5; t <= b; t += 864e5) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) n++;
  }
  return n;
}

export function macroFreshness(moved = [], nowMs = Date.now()) {
  const dates = (Array.isArray(moved) ? moved : []).map(r => r.lastDate).filter(Boolean).sort();
  if (!dates.length) return { lastDate: null, staleDays: null, staleSessions: null, sameDay: false, material: true, note: 'the macro series did not load, so nothing here describes rates or credit' };
  const lastDate = dates[dates.length - 1];
  const today = nowMs ? new Date(nowMs).toISOString().slice(0, 10) : lastDate;
  const staleDays = Math.round((Date.parse(today) - Date.parse(lastDate)) / 864e5);
  const staleSessions = sessionsBetween(lastDate, today);
  const sameDay = staleSessions <= 0;
  // Most of these series publish with a day's lag by design. One session back is the
  // normal state of the world and is not worth the first sentence of a debrief; two or
  // more means the read is genuinely describing a different week.
  const material = staleSessions >= 2;
  return {
    lastDate, staleDays, staleSessions, sameDay, material,
    note: sameDay
      ? 'the macro series are current to today'
      : `the macro series last printed on ${lastDate}, ${staleSessions} session${staleSessions === 1 ? '' : 's'} back — so nothing below claims a rates, credit or volatility move happened today`,
  };
}

/**
 * The dollar, from the day's own FX block rather than from a lagged index.
 *
 * DXY on this page is a FRED series and settles days late. The thirty priced pairs did
 * not: inverting every XXX/USD and taking every USD/XXX as it stands gives the dollar's
 * day directly, and `n` says how many legs it rests on so a two-pair reading is not
 * mistaken for a broad one.
 */
export function dollarRead(rows = []) {
  const legs = [];
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (r.ac !== 'fx' || r.movedPct == null) continue;
    const p = fxPair(r.name); if (!p) continue;
    if (p[1] === 'USD') legs.push(-r.movedPct);
    else if (p[0] === 'USD') legs.push(r.movedPct);
  }
  const pct = mean(legs);
  if (pct == null) return { pct: null, n: 0, word: null, dir: null };
  const a = Math.abs(pct);
  const dir = a < 0.1 ? 'flat' : pct > 0 ? 'stronger' : 'weaker';
  const word = a < 0.1 ? 'barely moved' : a < 0.35 ? `a shade ${dir}` : a < 0.8 ? `clearly ${dir}` : `sharply ${dir}`;
  return { pct: +pct.toFixed(2), n: legs.length, word, dir };
}

/**
 * Risk appetite, read as a SHAPE rather than as a score.
 *
 * Equities, the havens and gold are reported separately and the brief says whether they
 * line up, because the disagreement is the information. Equities lower with the yen bid
 * is a risk-off day; equities lower with the yen ALSO lower is a dollar day wearing a
 * risk-off costume, and collapsing the two into one "risk" number would hide exactly
 * that. No composite score, for the same reason the terminal has none: the weights
 * would be invented.
 */
export function riskRead(rows = []) {
  const by = name => (Array.isArray(rows) ? rows : []).find(r => r.name === name);
  const equity = mean((Array.isArray(rows) ? rows : []).filter(r => r.ac === 'index' && r.movedPct != null).map(r => r.movedPct));
  // a haven bid shows as the dollar LOSING to it, so the sign is inverted
  const havenLegs = [by('USDJPY'), by('USDCHF')].filter(r => r?.movedPct != null).map(r => -r.movedPct);
  const haven = mean(havenLegs);
  const gold = by('GOLD')?.movedPct ?? null;
  const eqDown = equity != null && equity < -0.1, eqUp = equity != null && equity > 0.1;
  const havBid = haven != null && haven > 0.1, havOff = haven != null && haven < -0.1;
  const shape = (eqDown && havBid) ? 'risk-off'
    : (eqUp && havOff) ? 'risk-on'
    : (eqDown && havOff) ? 'stocks lower with the havens also lower — a dollar day rather than a fear day'
    : (eqUp && havBid) ? 'stocks higher with the havens ALSO bid — the two are not agreeing, which usually means the equity move is about a handful of names'
    : 'no clear risk shape — the moves are too small to read one';
  return {
    equity: equity == null ? null : +equity.toFixed(2),
    haven: haven == null ? null : +haven.toFixed(2),
    gold, shape,
    agree: shape === 'risk-off' || shape === 'risk-on',
  };
}

/**
 * The instruments that did something the morning did not expect.
 *
 * Ranked by range USED, not by size of move: a 60-pip day is enormous for one pair and
 * a quiet afternoon for another, and the whole point of publishing an expected range is
 * to have a denominator. Returns the ones that ran past the forecast and the ones that
 * never got going, because a board full of 40% days is as much a finding as a wild one.
 */
export function standouts(rows = [], { limit = 4 } = {}) {
  const scored = (Array.isArray(rows) ? rows : []).filter(r => r.used != null);
  const over = scored.filter(r => r.used >= 140).sort((a, b) => b.used - a.used).slice(0, limit);
  const under = scored.filter(r => r.used <= 60).sort((a, b) => a.used - b.used).slice(0, limit);
  return { over, under };
}

/**
 * The trade of the day, scored.
 *
 * The morning brief names one pair and one direction. That is a closeable call — unlike
 * the prose around it — so it is the one part of the brief this can actually mark. One
 * day settles nothing, which the caller states; the point is that it is on the record.
 */
export function boardTradeVerdict(boardTrade, rows = []) {
  const pair = boardTrade?.pair, dir = String(boardTrade?.direction ?? '').toUpperCase();
  if (!pair || (dir !== 'LONG' && dir !== 'SHORT')) return null;
  const r = (Array.isArray(rows) ? rows : []).find(x => x.name === pair);
  if (!r || r.move == null) return null;
  const right = (r.move > 0) === (dir === 'LONG');
  return { pair, direction: dir, move: r.move, unit: r.unit, dp: r.dp, movedPct: r.movedPct, right, used: r.used };
}

/**
 * The forward section: what is scheduled, where it lands, what is still standing.
 *
 * Deliberately has no view. `standing` counts the 5-session outlooks the page is still
 * carrying, split by direction, so a reader can see the book it is running into
 * tomorrow — not a prediction, an inventory.
 */
export function tomorrow({ ahead = [], rows = [], nowMs = Date.now() } = {}) {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const next = (Array.isArray(ahead) ? ahead : []).filter(g => g.date > today);
  const standing = { up: 0, down: 0, none: 0 };
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const b = String(r.o5 ?? '').toUpperCase();
    if (b === 'BULLISH') standing.up++;
    else if (b === 'BEARISH') standing.down++;
    else standing.none++;
  }
  return {
    day: next[0] ?? null,
    laterDays: next.slice(1),
    nScheduled: next.reduce((a, g) => a + (g.n ?? 0), 0),
    standing,
  };
}

/**
 * The whole brief.
 *
 * `eod` is the result of endOfDay(); `morning` the day's snapshot row. Returns a
 * structure, never HTML — the renderer decides how it looks, and the wording lives here
 * where it can be tested.
 */
/**
 * A wide day, restated as the number of separate moves behind it.
 *
 * The board scores thirty correlated instruments against a forecast that is a MEDIAN --
 * so half of all days are SUPPOSED to exceed it, and one currency shock prints "the
 * forecast missed" on every pair carrying that leg. On 2026-10-01, 27 of 30 ran past
 * forecast and EUR was a leg in seven of the biggest; listed as 27 misses that reads as a
 * broken model, when the measured record over 298 pair-days is a median range used of
 * 100% with 49% above -- exactly where a median belongs.
 *
 * So this says it once, with the count that matters, and only when the day really is
 * carried by one leg. Silent otherwise, including on a broad day where everything moved
 * for its own reasons -- that one IS thirty separate overshoots and should read as such.
 */
export function concentrationLine(c) {
  if (!c || !c.concentrated || !c.largest || c.largest.n < 3) return '';
  const l = c.largest;
  return `Those ${c.over} are not ${c.over} separate misses: ${l.leg} is a leg in ${l.n} of them, and as independent moves the overshoot is closer to ${c.independent}. The forecast is the MEDIAN day, so half of all days are meant to clear it — measured across every day this page has stored, the median instrument uses 100% of its forecast and 49% run over. A day like this is the tail of that distribution, not a broken number.`;
}

/**
 * The leg tally restated as bets, because legs are not bets.
 *
 * Fourteen committed leans with six yen legs in them is not fourteen calls: one yen
 * rally settles six at once, and the leg tally then reports a single view as six
 * successes. The page has always grouped leans this way for TRADING ("one of each at
 * most"); this puts the same grouping in the score.
 *
 * Silent when the decomposition adds nothing -- if every leg is already its own view
 * there is no second number worth printing.
 */
export function viewLine(v) {
  if (!v || !v.views?.length || v.legs < 2) return '';
  if (v.views.length === v.legs) return '';   // already one bet per leg
  const big = v.largest;
  const concentrated = big && big.n >= 3
    ? ` The largest single view carried ${big.n} of them (${big.view}), so one move settled ${big.n === v.legs ? 'all' : big.n} at once.`
    : '';
  return `Counted as bets rather than legs, those ${v.legs} collapse into ${v.views.length} ${
    v.views.length === 1 ? 'view' : 'views'}${v.n ? `, of which ${v.right} of ${v.n} held` : ''}.${concentrated} `;
}

/**
 * The running direction record, from the ledger rather than from a number typed into a
 * string.
 *
 * THE BUG THIS REPLACES. This sentence read "the running record is 19 of 33" as literal
 * text -- no interpolation, never updated. By the time the owner asked about it the real
 * figure was 32 of 53, so a line whose entire job was honest self-scoring had been
 * quietly wrong for weeks. A stale self-score is worse than none, because it reads as
 * live.
 *
 * It now carries the INTERVAL and whether the record clears a coin flip, because 60% on
 * 53 calls sounds like an edge and its interval runs from 47% to 74% -- which is to say
 * it is not yet distinguishable from chance, and the sentence should say so.
 */
export function recordLine(rec) {
  if (!rec || !rec.n) return 'That is a tally, not a verdict, and the running record is not loaded here to put it against.';
  const pct = Math.round((rec.hitRate ?? rec.rate ?? 0) * 100);
  const lo = rec.hitRateLo ?? rec.lo, hi = rec.hitRateHi ?? rec.hi;
  const band = Number.isFinite(lo) && Number.isFinite(hi) ? ` (${pct}%, interval ${Math.round(lo * 100)}–${Math.round(hi * 100)}%)` : ` (${pct}%)`;
  const clears = rec.clearsCoinFlip === 'yes' || rec.clears === true;
  return `That is a tally, not a verdict — the running record is ${rec.hits} of ${rec.n}${band}, which ${
    clears ? 'does clear a coin flip, and one day neither makes nor breaks it'
           : 'does not clear a coin flip, and a single day cannot move it off one'}.`;
}

// ── The evening read, beyond the scorecard ──────────────────────────────────
// The morning brief reads the data as it stands and looks forward. The evening should
// read the same data and look BACK, and two things were missing from that: what the
// WEEK has been doing (the deltas were already in `moved` and only the freshness field
// was being spent), and where the crowd already sits.

/** Did today extend the week, or argue with it? */
export function weekFrame(moved = [], { minRows = 3 } = {}) {
  const rows = (Array.isArray(moved) ? moved : []).filter(r => r && r.deltas
    && Number.isFinite(r.deltas['1']) && Number.isFinite(r.deltas['5']));
  if (rows.length < minRows) return null;

  // A series is "with the week" when today's move shares the sign of the week's. Sign
  // only: magnitudes across rates, credit and FX are not commensurable and averaging
  // them would invent a number.
  let withWeek = 0, againstWeek = 0, quiet = 0;
  const notable = [];
  for (const r of rows) {
    const d1 = r.deltas['1'], d5 = r.deltas['5'];
    if (d1 === 0 || d5 === 0) { quiet++; continue; }
    const same = Math.sign(d1) === Math.sign(d5);
    if (same) withWeek++; else againstWeek++;
    // the ones where today is a real fraction of the whole week are the ones worth naming
    if (Math.abs(d5) > 0 && Math.abs(d1) / Math.abs(d5) >= 0.5) notable.push({ ...r, share: Math.abs(d1) / Math.abs(d5), same });
  }
  const n = withWeek + againstWeek;
  if (!n) return null;
  notable.sort((a, b) => b.share - a.share);
  const lean = withWeek / n;
  return {
    n, withWeek, againstWeek, quiet,
    shape: lean >= 0.7 ? 'extended' : lean <= 0.3 ? 'against' : 'mixed',
    notable: notable.slice(0, 3).map(r => ({ key: r.key, label: r.label, unit: r.unit, d1: r.deltas['1'], d5: r.deltas['5'], d20: r.deltas['20'] ?? null, same: r.same })),
  };
}

export function weekFrameLine(w) {
  if (!w) return null;
  const d = (v, u) => `${v >= 0 ? '+' : ''}${v}${u === 'bps' ? 'bp' : u === '%' ? '%' : ''}`;
  const head = w.shape === 'extended'
    ? `Today went with the week: ${w.withWeek} of ${w.n} tracked series moved the way they have been moving`
    : w.shape === 'against'
    ? `Today argued with the week: ${w.againstWeek} of ${w.n} tracked series moved against their own five-day direction`
    : `Today was split against the week — ${w.withWeek} of ${w.n} series extended it, ${w.againstWeek} went the other way`;
  const named = w.notable.length
    ? ' ' + w.notable.map(r => `${r.label} ${d(r.d1, r.unit)} today against ${d(r.d5, r.unit)} on the week`).join(', ') + '.'
    : '';
  const so = w.shape === 'extended'
    ? ' A move that continues its own week is the easier one to believe; it is also the one already partly priced.'
    : w.shape === 'against'
    ? ' A day that reverses its own week is either the start of something or noise, and one session cannot tell you which.'
    : '';
  return `${head}.${named}${so}`;
}

/**
 * Where the crowd sits, with what this desk has actually measured about it.
 *
 * `cot`: { EURUSD: { pct, ageDays }, ... } percentiles of speculative positioning.
 * `oi`:  [{ key, gex, callWall, putWall, dte }]
 */
export function positionRead(cot = null, oi = []) {
  const ends = cot ? Object.entries(cot)
    .filter(([, v]) => v && Number.isFinite(v.pct) && (v.pct >= 80 || v.pct <= 20))
    .sort((a, b) => Math.abs(b[1].pct - 50) - Math.abs(a[1].pct - 50))
    .slice(0, 4).map(([k, v]) => ({ pair: k, pct: v.pct, side: v.pct >= 80 ? 'long' : 'short', ageDays: v.ageDays ?? null })) : [];
  const gamma = (Array.isArray(oi) ? oi : []).filter(o => o && Number.isFinite(o.gex))
    .map(o => ({ key: o.key, sign: o.gex > 0 ? 'positive' : 'negative', dte: o.dte ?? null }));
  if (!ends.length && !gamma.length) return null;
  const age = cot ? Math.min(...Object.values(cot).map(v => v?.ageDays ?? 99)) : null;
  return { ends, gamma, ageDays: Number.isFinite(age) && age < 99 ? age : null };
}

export function positionLine(p) {
  if (!p) return null;
  const bits = [];
  if (p.ends.length) {
    bits.push(`Positioning is stretched in ${p.ends.map(e => `${e.pair} (${e.pct}th, crowded ${e.side})`).join(', ')}`
      + `${p.ageDays != null ? `, on a COT report ${p.ageDays} days old` : ''}. `
      + `A crowded book is FUEL and not a direction: it says which way a surprise would hurt more, never which way price goes next.`);
  } else if (p.ends.length === 0 && p.gamma.length === 0) {
    return null;
  } else {
    bits.push('Speculative positioning is mid-range across the board, so there is no crowded side to squeeze.');
  }
  if (p.gamma.length) {
    bits.push(`Dealer gamma is ${p.gamma.map(g => `${g.sign} in ${g.key}`).join(', ')} — positive dampens ranges, negative extends them. `
      + `That SIGN is the part this desk validated; the walls are not magnets (tested, and price rejects at one no more than at a neighbouring strike) and max pain is null.`);
  }
  return bits.join(' ');
}

export function endOfDayBrief({ morning = null, eod = null, moved = [], ahead = [], printed = null, watchFired = [], sessions = {}, activity = {}, leanRecord = null, cot = null, oi = [], nowMs = Date.now() } = {}) {
  if (!eod?.ok) return { ok: false, reason: eod?.reason ?? 'nothing to compare against yet' };
  const rows = eod.rows ?? [];
  const fresh = macroFreshness(moved, nowMs);
  const usd = dollarRead(rows);
  const risk = riskRead(rows);
  const out = standouts(rows);
  const bt = boardTradeVerdict(morning?.brief?.boardTrade, rows);
  const fwd = tomorrow({ ahead, rows, nowMs });
  const med = eod.range.medianUsed;
  const plan = morning?.plan?.pairs ?? {};
  const named = spineRead({ rows, sessions, activity, plan });
  const turns = regimeTurns(rows, plan);
  const prints = printedRead(printed);
  const week = weekFrame(moved);
  const posn = positionRead(cot, oi);

  // The headline leads with whatever was most out of the ordinary, because that is what
  // a reader wants first. Range beats direction: it is the measurement this desk has
  // actually validated, and the direction tally is a coin flip on a sample this size.
  const wide = med != null && med >= 130, quiet = med != null && med <= 70;
  // With no morning plan there is no forecast to beat, so the headline is the day itself
  // rather than a range verdict against nothing. Silence here was the old behaviour and
  // it removed the evening entirely on half the days.
  const headline = !eod.marked
    ? (usd.n && usd.word && usd.dir !== 'flat'
        ? `No call was made this morning, so this is the day as it happened — the dollar ${usd.word} across ${usd.n} legs${risk.equity != null ? `, equities ${pct2(risk.equity)}` : ''}.`
        : `No call was made this morning, so this is the day as it happened.`)
    : wide
    ? `A wider day than the page forecast — the median instrument used ${med}% of its expected range, and ${eod.range.over} of ${eod.range.n} ran clean past it${
        eod.range.concentration?.concentrated ? `, though ${eod.range.concentration.largest.leg} is a leg in ${eod.range.concentration.largest.n} of them` : ''}.`
    : quiet
    ? `A quiet day by the page's own numbers — the median instrument used only ${med}% of the range forecast for it.`
    : usd.n && usd.word && usd.dir !== 'flat'
    ? `An ordinary day for range, with the dollar ${usd.word} across ${usd.n} legs — the median instrument used ${med ?? '—'}% of its forecast.`
    : `An ordinary day on both counts — the median instrument used ${med ?? '—'}% of the range forecast for it, and nothing in the tape stood out.`;

  const paragraphs = [];
  // THE DAY LEADS. This paragraph used to open with the macro-staleness caveat, so every
  // debrief began by explaining what it could NOT tell you before saying anything about
  // the session that had just finished. The caveat is still here and still never dropped
  // -- it moved to the end of the sentence, and only speaks up when the lag is material.
  paragraphs.push(`The tape: ${
    usd.n ? `the dollar ${usd.word} at ${pct2(usd.pct)} averaged across ${usd.n} pairs` : 'the FX block did not price'}${
    risk.equity != null ? `, equities ${pct2(risk.equity)} on average` : ''}${
    risk.haven != null ? `, the yen and franc ${risk.haven > 0 ? 'bid' : 'offered'} at ${pct2(risk.haven)} against the dollar` : ''}${
    risk.gold != null ? `, gold ${pct2(risk.gold)}` : ''}. ${risk.shape.charAt(0).toUpperCase()}${risk.shape.slice(1)}.${
    fresh.material || fresh.lastDate == null ? ` Note that ${fresh.note}.` : ''}${
    // An instrument that could not be measured is named, not quietly absent. A board
    // that shrank is a fact about the day's data, and silence reads as "nothing to say".
    eod.unpriced?.length ? ` ${eod.unpriced.length === 1 ? `${eod.unpriced[0]} is` : `${eod.unpriced.join(', ')} are`} left out — no session open, so there is no honest window to measure ${eod.unpriced.length === 1 ? 'it' : 'them'} against today.` : ''}`);

  // The week, before anything is said about forecasts or calls. A day figure alone is a
  // fact; the same figure against its own week is a read, and that is the half an evening
  // note exists to add.
  { const l = weekFrameLine(week); if (l) paragraphs.push(l); }

  if (out.over.length) paragraphs.push(`The forecast was beaten hardest by ${
    out.over.map(r => `<b>${r.name}</b> at ${r.used}% (${(r.move > 0 ? '+' : '') + r.move.toFixed(r.dp)} ${r.unit} against ${r.expected} expected)`).join(', ')}. A range that far past its forecast is the page being wrong about SIZE, which is the one thing it measures well enough to be judged on. ${concentrationLine(eod.range.concentration)}`);
  if (out.under.length) paragraphs.push(`At the other end, ${
    out.under.map(r => `<b>${r.name}</b> used ${r.used}%`).join(', ')} — days that never got going. A stop sized off the forecast had far more room than it needed.`);

  if (eod.leans.n) paragraphs.push(`On direction the page committed on ${eod.leans.n} ${eod.leans.n === 1 ? 'instrument' : 'instruments'} and ${eod.leans.right} ${eod.leans.right === 1 ? 'is' : 'are'} the right way${
    eod.commitments.nFalsifiers ? `; ${eod.commitments.falsified} of ${eod.commitments.nFalsifiers} named falsifiers traded` : ''}. ${viewLine(eod.views)}${recordLine(leanRecord)}`);
  else if (!eod.marked) paragraphs.push(`${eod.notMarked.charAt(0).toUpperCase()}${eod.notMarked.slice(1)}. What follows is a read of the session, not a scorecard — the difference matters, because a day with no call cannot be evidence for or against the page.`);
  else paragraphs.push(`The page committed no direction on any instrument today. That is the absence of a call rather than a miss, and it is the honest outcome on a board where the read is mostly about size.`);

  // Regime is the page changing its mind about what KIND of market it is looking at,
  // which is the input to sizing — a bigger deal than any one price move, and silent on
  // days whose plan predates the field rather than claiming nothing changed.
  if (turns.length) paragraphs.push(`The regime turned under ${turns.length} ${turns.length === 1 ? 'instrument' : 'instruments'} today: ${
    turns.map(t => `<b>${t.name}</b> ${t.from} → ${t.to}`).join(', ')}. That is the page changing its mind about what kind of market it is looking at, which feeds position sizing before it feeds any view.`);

  if (prints) paragraphs.push(`What printed: ${prints}. The gap is in each release's own units and is not standardised, so a big-looking number on one series is not comparable with a small one on another — and this desk's tested position is that surprise size moves RANGE, not direction.`);

  if (bt) paragraphs.push(`The brief's one named trade was <b>${bt.direction} ${bt.pair}</b>, and it ${bt.right ? 'went the right way' : 'went the wrong way'} — ${(bt.move > 0 ? '+' : '') + bt.move.toFixed(bt.dp)} ${bt.unit}${bt.movedPct != null ? ` (${pct2(bt.movedPct)})` : ''}. One call on one day proves nothing; it is here because it is the only part of the morning brief that can be marked at all.`);

  // The cards mirror the morning brief's four, so the two read as a pair.
  const cards = [
    { k: 'the dollar', body: usd.n
      ? `${usd.word.charAt(0).toUpperCase()}${usd.word.slice(1)} at ${pct2(usd.pct)}, averaged across ${usd.n} priced legs rather than taken from the dollar index, which is a FRED series and settles days late.`
      : 'The FX block did not price today, so there is no dollar read.' },
    { k: 'risk mood', body: `${risk.shape.charAt(0).toUpperCase()}${risk.shape.slice(1)}.${
        risk.equity != null ? ` Indices ${pct2(risk.equity)} on average` : ''}${risk.haven != null ? `, havens ${pct2(risk.haven)} against the dollar` : ''}${risk.gold != null ? `, gold ${pct2(risk.gold)}` : ''}.${
        risk.agree ? ' The legs agree, which is what makes it readable.' : ' The legs disagree, so this is not a clean risk day.'}` },
    { k: 'expectation vs reality', body: `Median range used ${med ?? '—'}%: ${eod.range.over} over, ${eod.range.about} about right, ${eod.range.under} inside, of ${eod.range.n} scored.${
        eod.range.weak ? ` ${eod.range.weak} of those had no session high/low and are measured open-to-now, which understates them.` : ''} Direction ${eod.leans.n ? `${eod.leans.right} of ${eod.leans.n}` : 'not called'}.` },
    { k: 'what changed underneath', body: (eod.chain && (eod.chain.broke.length || eod.chain.healed.length))
        ? `${eod.chain.broke.length ? `${eod.chain.broke.length} chain link${eod.chain.broke.length === 1 ? '' : 's'} broke since this morning (${eod.chain.broke.join(', ')})` : ''}${eod.chain.broke.length && eod.chain.healed.length ? '; ' : ''}${eod.chain.healed.length ? `${eod.chain.healed.length} came back into line (${eod.chain.healed.join(', ')})` : ''}.${
            watchFired.length ? ` ${watchFired.length} desk-watch condition${watchFired.length === 1 ? '' : 's'} started today.` : ''} The chain runs on the same lagged macro series, so a break is a change in the PAGE's reading, not necessarily something that happened this afternoon.`
        : `No chain link changed state since this morning${watchFired.length ? `, though ${watchFired.length} desk-watch condition${watchFired.length === 1 ? '' : 's'} started today` : ''}. The chain runs on macro series that settle behind the tape, so on most days it cannot change intraday.` },
  ];

  // What the day LEAVES BEHIND. Positioning is the state the next session inherits,
  // which is why it belongs at the end of a look-back rather than the start.
  { const l = positionLine(posn); if (l) paragraphs.push(l); }

  return {
    ok: true, week, positioning: posn,
    at: new Date(nowMs).toISOString(),
    morningAt: morning?.brief?.generatedAt ?? eod.morningAt ?? null,
    regime: morning?.brief?.regime ?? null,
    morningHeadline: morning?.brief?.headline ?? null,
    morningWatch: Array.isArray(morning?.brief?.watch) ? morning.brief.watch : [],
    morningHook: morning?.chainRead?.hook ?? null,
    headline, paragraphs, cards,
    // the markets a macro reader carries a view on every day, described every day —
    // ranking by range-used alone produces a brief about whichever cross went wild
    named: named.spine, alsoMoved: named.extra, regimeTurns: turns, printedWords: prints,
    dollar: usd, risk, standouts: out, boardTrade: bt, freshness: fresh,
    printed: printed ?? null,
    tomorrow: fwd,
    caveat: 'Written from the numbers on the page, not from a model call — every figure here is a comparison between what this page published this morning and what the tape has done since. Nothing in it says which way anything goes tomorrow: this desk tested the priced-in claim and it came back null, and surprise size validated for range only.',
  };
}

/**
 * THE SPINE — the markets that get described whatever the board did.
 *
 * Ranking by range-used alone produces a brief about whichever cross happened to be
 * wild, and on a day the AUD block moved you would read four paragraphs about AUD/CAD
 * and nothing about gold, the Nasdaq or the yen. These are the markets a macro reader
 * carries a view on every day, so they are covered every day, and the standouts are
 * reported ALONGSIDE rather than instead.
 *
 * `role` is what the market IS — the reason it earns a permanent line rather than a
 * rank — and it is what turns a number into something a reader can learn from.
 */
export const SPINE = [
  { name: 'GOLD',   label: 'Gold',     role: 'four trades wearing one name — real yields, the dollar, central-bank reserves and fear. It is read by which of the four the rest of the board agrees with.' },
  { name: 'NQ',     label: 'the Nasdaq', role: 'long-duration equity: its earnings sit far out, so it discounts a real-yield move harder than anything else on the board.' },
  { name: 'SPX500', label: 'the S&P',  role: 'the broad benchmark. Against the Nasdaq it says whether a move is the whole market or the long-duration corner of it.' },
  { name: 'USDJPY', label: 'USD/JPY',  role: 'the haven pair and the carry trade’s home. It answers the rate gap, and it answers fear, and telling those apart is most of reading it.' },
  { name: 'EURUSD', label: 'EUR/USD',  role: 'the biggest pair — mostly the dollar, partly the Bund gap.' },
  { name: 'BTCUSD', label: 'Bitcoin',  role: 'high-beta risk most days; the anti-dollar trade on the days the story is about credibility. Which one it is today is readable from whether it moved with the Nasdaq or against the dollar.' },
];

/** Activity in words. The unit is a TICK COUNT, so the wording never says "traded". */
export function activityWord(ratio) {
  if (!Number.isFinite(ratio)) return null;
  return ratio >= 1.6 ? 'far busier than usual' : ratio >= 1.2 ? 'busier than usual'
    : ratio <= 0.5 ? 'far quieter than usual' : ratio <= 0.8 ? 'quieter than usual' : 'about as busy as usual';
}

/**
 * How directly a market got where it finished.
 *
 * `efficiency` is net move over path length: 1.0 would be a straight line. It needs no
 * baseline and no history, which is why it is worth saying — it separates a trend day
 * from a day that paid nothing while looking like it moved.
 *
 * THE BANDS ARE MEASURED, NOT GUESSED, AND THE FIRST VERSION WAS GUESSED. Set at
 * 0.6/0.35/0.2 on an assumption, "very winding" fired on 20 of 30 instruments and
 * "straight line" was unreachable — a label that fires on two thirds of the board
 * describes nothing. The observed cross-section is min 0.02, p25 0.09, median 0.16,
 * p75 0.23, max 0.51: intraday paths are inherently inefficient and never come close
 * to 1.0.
 *
 * These are the QUARTILES of that distribution, so each word fires on about a quarter
 * of the board. Re-derive them if the instrument set changes — the same rule the
 * board's own z-thresholds carry, and for the same reason. Measured on one session's
 * thirty instruments (2026-09-24); a longer sample would tighten them.
 */
export const PATH_BANDS = { direct: 0.23, usual: 0.16, winding: 0.09, measuredOn: '2026-09-24', n: 30 };
export function pathWord(eff) {
  if (!Number.isFinite(eff)) return null;
  return eff >= PATH_BANDS.direct ? 'direct for an intraday path'
    : eff >= PATH_BANDS.usual ? 'the usual back-and-forth'
    : eff >= PATH_BANDS.winding ? 'winding'
    : 'very winding';
}

/**
 * One market, described.
 *
 * Every clause is a measured number with its own caveat attached. It deliberately never
 * gives a reason for the move: attribution on a single session is a story, and this desk
 * has a whole book of nulls built from testing exactly those stories.
 */
export function describe(name, { row = null, session = null, activity = null, morning = null } = {}) {
  const spec = SPINE.find(s => s.name === name);
  if (!row) return null;
  const bits = [];
  const moveTxt = `${row.move > 0 ? 'up' : row.move < 0 ? 'down' : 'flat at'} ${Math.abs(row.move).toFixed(row.dp)} ${row.unit}${row.movedPct != null ? ` (${row.movedPct > 0 ? '+' : ''}${row.movedPct}%)` : ''}`;
  bits.push(`${moveTxt}`);
  if (row.used != null) bits.push(`${row.used}% of the range forecast for it`);

  const eff = session?.vol_state?.path_efficiency?.efficiency;
  const pw = pathWord(eff);
  if (pw) bits.push(`and it got there ${pw}`);

  const aw = activityWord(activity?.ratio);
  if (aw) bits.push(`on a tick count ${aw} (${activity.ratio}× its 20-session median — an activity proxy, not traded size)`);

  // The regime the page was working from this morning, and whether it held. Only sayable
  // once the morning plan started carrying it, so it degrades to silence rather than to
  // a guess on any day captured before that.
  const reg = [];
  if (morning?.regime && row.regimeNow && morning.regime !== row.regimeNow)
    reg.push(`The page called it ${morning.regime} this morning and now reads ${row.regimeNow} — the regime turned under the position.`);
  else if (morning?.regime && row.regimeNow)
    reg.push(`Still ${row.regimeNow}, the regime the page was working from at the open.`);

  const vol = (row.volPctNow != null)
    ? `Its own volatility sits at the ${ord(row.volPctNow)} percentile of its history${morning?.volPct != null && Math.abs(row.volPctNow - morning.volPct) >= 10 ? `, from the ${ord(morning.volPct)} this morning` : ''}.`
    : '';

  return {
    name, label: spec?.label ?? name, role: spec?.role ?? null,
    line: `${spec?.label ?? name} finished ${bits.join(', ')}.`,
    regime: reg[0] ?? null, vol: vol || null,
    used: row.used, movedPct: row.movedPct, ratio: activity?.ratio ?? null, efficiency: eff ?? null,
    // The same facts as `line`, kept apart so a renderer can lay them out as numbers
    // instead of a sentence. Eight markets each repeating "and it got there having
    // travelled several times the distance it ended up covering, on a tick count about
    // as busy as usual (an activity proxy, not traded size)" is the wall of text, and
    // the caveat belongs in one tooltip rather than eight paragraphs.
    move: row.move, unit: row.unit, dp: row.dp, moveUp: row.move > 0,
    pathWord: pw, activityWord: aw, volPct: row.volPctNow ?? null, regimeNow: row.regimeNow ?? null,
    regimeTurned: !!(morning?.regime && row.regimeNow && morning.regime !== row.regimeNow),
  };
}

/**
 * The spine, described, plus any standout that is not already on it.
 *
 * A market that ran 250% of its forecast earns a line even when it is a cross nobody
 * carries a view on — that is the day's actual news. It is appended rather than ranked
 * above the spine, so the brief always reads in the same order.
 */
export function spineRead({ rows = [], sessions = {}, activity = {}, plan = {} } = {}) {
  const byName = new Map((Array.isArray(rows) ? rows : []).map(r => [r.name, r]));
  const out = [];
  for (const s of SPINE) {
    const d = describe(s.name, { row: byName.get(s.name), session: sessions[s.name], activity: activity[s.name], morning: plan[s.name] });
    if (d) out.push(d);
  }
  const onSpine = new Set(SPINE.map(s => s.name));
  const extra = (Array.isArray(rows) ? rows : [])
    .filter(r => !onSpine.has(r.name) && r.used != null && r.used >= 160)
    .sort((a, b) => b.used - a.used).slice(0, 3)
    .map(r => describe(r.name, { row: r, session: sessions[r.name], activity: activity[r.name], morning: plan[r.name] }))
    .filter(Boolean);
  return { spine: out, extra };
}

/**
 * The regimes that turned today, across the whole board.
 *
 * A regime flip is the page changing its mind about what KIND of market it is looking
 * at, which matters more than a price move: it is the input to sizing. Reported as a
 * count with the names, and silent on any day whose plan predates the field.
 */
export function regimeTurns(rows = [], plan = {}) {
  const turned = [];
  for (const r of (Array.isArray(rows) ? rows : [])) {
    const was = plan?.[r.name]?.regime, now = r.regimeNow;
    if (was && now && was !== now) turned.push({ name: r.name, from: was, to: now });
  }
  return turned;
}

/** What printed today, in words, biggest gap to consensus first. */
export function printedRead(printed, { limit = 3 } = {}) {
  const rows = (printed?.rows ?? []).filter(r => r.surprise != null).slice(0, limit);
  if (!rows.length) return null;
  return rows.map(r => `${r.country} ${r.event} came in ${Math.abs(r.surprise)} ${r.surprise > 0 ? 'above' : 'below'} the ${r.raw?.consensus ?? r.consensus} expected`).join('; ');
}
