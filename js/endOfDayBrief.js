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
 * page's own lean record is 19 of 33. So the forward section names what is scheduled,
 * which tiles it transmits through, and which calls are still standing — never which
 * way anything goes.
 *
 * Pure: no fetch, no DOM. Tested in js/endOfDayBrief.test.mjs.
 */

const pct1 = v => (v > 0 ? '+' : '') + v.toFixed(1) + '%';
const pct2 = v => (v > 0 ? '+' : '') + v.toFixed(2) + '%';
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const fxPair = name => /^[A-Z]{6}$/.test(name) ? [name.slice(0, 3), name.slice(3)] : null;

/**
 * How stale the macro series are.
 *
 * `lastDate` is the newest print across the whole macro set. FRED settles behind the
 * tape, so on most days this is yesterday or the day before, and on a Monday it can be
 * Thursday. The brief needs the number to decide whether it is allowed to describe a
 * rates move as having happened "today" — usually it is not.
 */
export function macroFreshness(moved = [], nowMs = Date.now()) {
  const dates = (Array.isArray(moved) ? moved : []).map(r => r.lastDate).filter(Boolean).sort();
  if (!dates.length) return { lastDate: null, staleDays: null, sameDay: false, note: 'the macro series did not load, so nothing here describes rates or credit' };
  const lastDate = dates[dates.length - 1];
  const staleDays = Math.round((Date.parse(nowMs ? new Date(nowMs).toISOString().slice(0, 10) : lastDate) - Date.parse(lastDate)) / 864e5);
  const sameDay = staleDays <= 0;
  return {
    lastDate, staleDays, sameDay,
    note: sameDay
      ? 'the macro series are current to today'
      : `the macro series last printed on ${lastDate}, ${staleDays} session${staleDays === 1 ? '' : 's'} back — so nothing below claims a rates, credit or volatility move happened today`,
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
export function endOfDayBrief({ morning = null, eod = null, moved = [], ahead = [], printed = null, watchFired = [], nowMs = Date.now() } = {}) {
  if (!eod?.ok) return { ok: false, reason: eod?.reason ?? 'nothing to compare against yet' };
  const rows = eod.rows ?? [];
  const fresh = macroFreshness(moved, nowMs);
  const usd = dollarRead(rows);
  const risk = riskRead(rows);
  const out = standouts(rows);
  const bt = boardTradeVerdict(morning?.brief?.boardTrade, rows);
  const fwd = tomorrow({ ahead, rows, nowMs });
  const med = eod.range.medianUsed;

  // The headline leads with whatever was most out of the ordinary, because that is what
  // a reader wants first. Range beats direction: it is the measurement this desk has
  // actually validated, and the direction tally is a coin flip on a sample this size.
  const wide = med != null && med >= 130, quiet = med != null && med <= 70;
  const headline = wide
    ? `A wider day than the page forecast — the median instrument used ${med}% of its expected range, and ${eod.range.over} of ${eod.range.n} ran clean past it.`
    : quiet
    ? `A quiet day by the page's own numbers — the median instrument used only ${med}% of the range forecast for it.`
    : usd.n && usd.word && usd.dir !== 'flat'
    ? `An ordinary day for range, with the dollar ${usd.word} across ${usd.n} legs — the median instrument used ${med ?? '—'}% of its forecast.`
    : `An ordinary day on both counts — the median instrument used ${med ?? '—'}% of the range forecast for it, and nothing in the tape stood out.`;

  const paragraphs = [];
  paragraphs.push(`${fresh.note.charAt(0).toUpperCase()}${fresh.note.slice(1)}. What did move is the tape: ${
    usd.n ? `the dollar ${usd.word} at ${pct2(usd.pct)} averaged across ${usd.n} pairs` : 'the FX block did not price'}${
    risk.equity != null ? `, equities ${pct2(risk.equity)} on average` : ''}${
    risk.haven != null ? `, the yen and franc ${risk.haven > 0 ? 'bid' : 'offered'} at ${pct2(risk.haven)} against the dollar` : ''}${
    risk.gold != null ? `, gold ${pct2(risk.gold)}` : ''}. ${risk.shape.charAt(0).toUpperCase()}${risk.shape.slice(1)}.`);

  if (out.over.length) paragraphs.push(`The forecast was beaten hardest by ${
    out.over.map(r => `<b>${r.name}</b> at ${r.used}% (${(r.move > 0 ? '+' : '') + r.move.toFixed(r.dp)} ${r.unit} against ${r.expected} expected)`).join(', ')}. A range that far past its forecast is the page being wrong about SIZE, which is the one thing it measures well enough to be judged on.`);
  if (out.under.length) paragraphs.push(`At the other end, ${
    out.under.map(r => `<b>${r.name}</b> used ${r.used}%`).join(', ')} — days that never got going. A stop sized off the forecast had far more room than it needed.`);

  if (eod.leans.n) paragraphs.push(`On direction the page committed on ${eod.leans.n} ${eod.leans.n === 1 ? 'instrument' : 'instruments'} and ${eod.leans.right} ${eod.leans.right === 1 ? 'is' : 'are'} the right way${
    eod.commitments.nFalsifiers ? `; ${eod.commitments.falsified} of ${eod.commitments.nFalsifiers} named falsifiers traded` : ''}. That is a tally, not a verdict — the running record is 19 of 33 and a single day cannot move it off a coin flip.`);
  else paragraphs.push(`The page committed no direction on any instrument today. That is the absence of a call rather than a miss, and it is the honest outcome on a board where the read is mostly about size.`);

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

  return {
    ok: true,
    at: new Date(nowMs).toISOString(),
    morningAt: morning?.brief?.generatedAt ?? eod.morningAt ?? null,
    regime: morning?.brief?.regime ?? null,
    morningHeadline: morning?.brief?.headline ?? null,
    morningWatch: Array.isArray(morning?.brief?.watch) ? morning.brief.watch : [],
    morningHook: morning?.chainRead?.hook ?? null,
    headline, paragraphs, cards,
    dollar: usd, risk, standouts: out, boardTrade: bt, freshness: fresh,
    printed: printed ?? null,
    tomorrow: fwd,
    caveat: 'Written from the numbers on the page, not from a model call — every figure here is a comparison between what this page published this morning and what the tape has done since. Nothing in it says which way anything goes tomorrow: this desk tested the priced-in claim and it came back null, and surprise size validated for range only.',
  };
}
