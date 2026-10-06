// Daily Read — pure logic (no I/O). The live job is js/dailyReadRoutes.js; the page is daily-read.html.
//
// What it does each day:
//   1. SETUP (the evening before): for each instrument, compare what options price for tomorrow with the
//      σ the Vol Forecast lines were built from.  ratio = (IV ÷ √252) ÷ σ_daily.  Rich ratio → the lines
//      are likely too tight (continuation day); cheap → likely too wide (exhaustion day).
//   2. SCORE (after the day): where the realised range landed inside its own forecast ladder, which lines
//      were hit, and the running tally per tag — a live reliability check of the call.
//   3. LESSON: one concept, picked by what actually happened, with the day's own numbers in it.
//
// Evidence: analysis/exhaustion_residual/RESIDUAL_MECHANISM_CHECK.md (descriptive, not pre-registered).
// 6 FX majors + NAS100, 2020-09 → 2026-08: share of days whose range passed the p75 line (design 25%)
// by IV ÷ σ tercile, unseen 2023-26 half: cheap 13.0%, middle 22.3%, rich 34.8%.
// Tercile edges below were fitted on 2020-22 settlement IV vs a Yang-Zhang 10-day σ. Production σ differs
// by estimator for some pairs, gold has no settlement history (FX pooled edges), and NQ's live IV is VXN
// rather than NAS settlement IV, so those two are marked provisional. The running tally on the page is
// what confirms or corrects these edges live.

export const DAILY_READ_KV = 'daily_read_v1';

export const EDGES = {
  EURUSD: [0.959, 1.102], GBPUSD: [0.974, 1.093], AUDUSD: [0.967, 1.078], USDCAD: [0.951, 1.069],
  USDCHF: [0.980, 1.097], USDJPY: [1.044, 1.182],
  GOLD:   [0.975, 1.103, 'provisional: FX pooled edges, gold has no settlement IV history'],
  NQ:     [1.008, 1.340, 'provisional: fitted on NAS settlement IV, live IV is VXN'],
  SPX:    [1.008, 1.340, 'provisional: NQ edges borrowed, live IV is VIX'],
  DOW:    [1.008, 1.340, 'provisional: NQ edges borrowed, live IV is VXD'],
  US2000: [1.008, 1.340, 'provisional: NQ edges borrowed, live IV is RVX'],
};

// Research expectation for the p75 range line by tag (2023-26 unseen half), and the design rate.
export const EXPECT_P75 = { exhaust: 0.130, fair: 0.223, continue: 0.348, design: 0.25 };

export const TAGS = {
  continue: { label: 'CONTINUE', short: 'lines likely too tight',
    read: 'Options price more movement than the lines assume. Breaks of p50/p75 tend to run to the next line. Follow breaks early (the rich-vol rule); do not fade.' },
  fair:     { label: 'FAIR', short: 'lines about right',
    read: 'Options and the lines agree. A touch is close to a coin flip and the line spacing already prices it. No edge at a touch either way.' },
  exhaust:  { label: 'EXHAUST', short: 'lines likely too wide',
    read: 'Options price less movement than the lines assume. p75/p90 tend to act as caps: price stalls before them rather than reversing. Take profit at the line, do not chase breakouts.' },
};

const r = (x, d = 3) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

// IV (annualised %) ÷ √252 ÷ σ_daily (%). Uses the σ BEFORE the event multiplier, matching the research.
export function ivSigmaRatio(ivPct, sigmaDailyPct) {
  if (!(ivPct > 0) || !(sigmaDailyPct > 0)) return null;
  return ivPct / Math.sqrt(252) / sigmaDailyPct;
}

export function tagFor(sym, ratio) {
  const e = EDGES[sym];
  if (!e || ratio == null) return { tag: null, edges: e ? e.slice(0, 2) : null, provisional: e?.[2] ?? null };
  const tag = ratio < e[0] ? 'exhaust' : ratio >= e[1] ? 'continue' : 'fair';
  return { tag, edges: e.slice(0, 2), provisional: e[2] ?? null };
}

// One instrument's setup row. `fc` = vol_forecast instruments[sym]; `flag` = paper-record flag ({iv, rv, ratio, rich, ivSource}).
export function setupRow(sym, fc, flag) {
  const lf = fc?.ladder_flat ?? {};
  const sigma = fc?.ladder?.sigma_daily_pct ?? (fc?.vol_annual > 0 ? fc.vol_annual / Math.sqrt(252) : null);
  const iv = flag?.iv ?? null;
  const ratio = ivSigmaRatio(iv, sigma);
  const t = tagFor(sym, ratio);
  return {
    sym, iv: r(iv, 2), sigma: r(sigma, 4), ratio: r(ratio), ...t,
    ivrv: flag?.ratio ?? null, rich: flag?.rich ?? null, ivSource: flag?.ivSource ?? null,
    why: iv == null ? (flag?.why ?? 'no implied vol for this instrument') : null,
    event: fc?.ladder?.event_tag ?? null, eventMult: fc?.ladder?.event_mult ?? null,
    lines: { hl_p50: lf.hl_p50, hl_p75: lf.hl_p75, hl_p90: lf.hl_p90, oh_p50: lf.oh_p50, oh_p75: lf.oh_p75, oh_p90: lf.oh_p90,
             ol_p50: lf.ol_p50, ol_p75: lf.ol_p75, ol_p90: lf.ol_p90 },
    expectP75: t.tag ? EXPECT_P75[t.tag] : null,
  };
}

// Where a realised value sits on its ladder: 0 below p50, 1 p50–75, 2 p75–90, 3 beyond p90.
export function bandOf(v, p50, p75, p90) {
  if (![v, p50, p75, p90].every(Number.isFinite)) return null;
  return v < p50 ? 0 : v < p75 ? 1 : v < p90 ? 2 : 3;
}
export const BAND_LABEL = ['inside p50', 'p50–p75', 'p75–p90', 'beyond p90'];

// Score one finished day. `sess` = vol_session instruments[sym] (realised hl/oh/ol/oc in %), `setup` = that day's setup row
// (may be null when the page was not running yet — the row is still scored, just untagged).
export function scoreRow(sym, fc, sess, setup) {
  const lf = fc?.ladder_flat ?? {};
  if (!sess || sess.error || !Number.isFinite(sess.hl) || !(lf.hl_p50 > 0)) return null;
  const hit = {};
  for (const s of ['oh', 'ol']) for (const p of ['p50', 'p75', 'p90']) hit[`${s}_${p}`] = Number.isFinite(lf[`${s}_${p}`]) ? sess[s] >= lf[`${s}_${p}`] : null;
  return {
    sym, tag: setup?.tag ?? null, ratio: setup?.ratio ?? null, event: fc?.ladder?.event_tag ?? null,
    hl: sess.hl, oh: sess.oh, ol: sess.ol, oc: sess.oc,
    resid: r(sess.hl / lf.hl_p50),
    band: bandOf(sess.hl, lf.hl_p50, lf.hl_p75, lf.hl_p90),
    hit, complete: sess.complete ?? null,
  };
}

// A session audit is only usable if it was taken before that London date ended. Before 2026-10-06 (cf47b9a0) the
// audit could run after London midnight and record the NEXT session's first minutes (6 of 15 records, Sep-Oct 2026).
export function auditUsable(sessionDate, auditedAt) {
  if (!auditedAt) return true;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(auditedAt)) <= sessionDate;
}

// Running tally per tag across every scored day: how often the range passed p75 / p90 vs design and vs research.
export function tally(days) {
  const t = {};
  for (const [, d] of Object.entries(days ?? {})) for (const row of d.score?.rows ?? []) {
    const k = row.tag ?? 'untagged';
    const a = (t[k] ??= { n: 0, p75: 0, p90: 0, residSum: 0 });
    if (row.band == null) continue;
    a.n++; a.p75 += row.band >= 2; a.p90 += row.band >= 3; a.residSum += row.resid ?? 0;
  }
  for (const a of Object.values(t)) { a.p75Rate = a.n ? r(a.p75 / a.n) : null; a.p90Rate = a.n ? r(a.p90 / a.n) : null; a.resid = a.n ? r(a.residSum / a.n) : null; delete a.residSum; }
  return t;
}

// ── Lessons ─────────────────────────────────────────────────────────────────────────────────────────
// Each trigger looks at the day just scored (+ tomorrow's setup + the tally) and returns the numbers the lesson
// quotes, or null. The first trigger that fires (and was not used in the last 5 lessons) wins; otherwise the
// concept rotation fills in. Links point at theory-lab lessons where one exists.
const USD_BASE = new Set(['USDJPY', 'USDCAD', 'USDCHF']);
const USD_QUOTE = new Set(['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD']);
const pct = x => `${(x * 100).toFixed(0)}%`;

export const LESSONS = [
  { id: 'vrp', title: 'Options knew: the variance risk premium',
    link: 'theory-lab/lessons/institutional-breeden-litzenberger-variance-swaps.html',
    when: ({ rows }) => { const x = rows.find(w => w.tag === 'continue' && w.band >= 2); return x && { x }; },
    body: ({ x }) => `${x.sym} was tagged CONTINUE last night (IV ÷ σ ${x.ratio}) and its range ran ${x.resid}× the median line, landing ${BAND_LABEL[x.band]}. ` +
      `The lines are built from past prices only; options are priced from what traders fear next. When the two disagree, the forward-looking one is usually closer. ` +
      `But options still overprice movement on average (on rich days the range is about 0.82 of what options imply) — sellers are paid a premium for carrying the risk. ` +
      `That is why the edge is a directional break trade, not buying options.` },
  { id: 'stall', title: 'Exhaustion is a stall, not a reversal',
    link: 'theory-lab/lessons/extreme-value-theory-micro.html',
    when: ({ rows }) => { const x = rows.find(w => w.tag === 'exhaust' && (w.hit.oh_p75 || w.hit.ol_p75) && !(w.hit.oh_p90 || w.hit.ol_p90)); return x && { x }; },
    body: ({ x }) => `${x.sym} was tagged EXHAUST and touched a p75 line without reaching p90 (range ${x.resid}× the median). ` +
      `This is what an exhaustion day looks like: the range stops growing. Your research found reversal odds at the outer lines are flat at about 50/50 — ` +
      `at the late p90, 12% continue and 12% come back. So the trade an exhaustion day gives you is not a fade entry; it is taking profit at the line and not opening a breakout.` },
  { id: 'usd', title: 'One bet, many tickets: the dollar factor',
    when: ({ rows }) => {
      let up = [], dn = [];
      for (const w of rows) { const usdUp = USD_BASE.has(w.sym) ? w.hit.oh_p75 : USD_QUOTE.has(w.sym) ? w.hit.ol_p75 : null;
        const usdDn = USD_BASE.has(w.sym) ? w.hit.ol_p75 : USD_QUOTE.has(w.sym) ? w.hit.oh_p75 : null;
        if (usdUp) up.push(w.sym); if (usdDn) dn.push(w.sym); }
      const side = up.length >= 3 ? ['bought', up] : dn.length >= 3 ? ['sold', dn] : null; return side && { side: side[0], list: side[1] }; },
    body: ({ side, list }) => `The dollar was ${side} hard enough to push ${list.length} pairs through their p75 line on the same side: ${list.join(', ')}. ` +
      `Those are not ${list.length} independent breaks; they are one dollar move seen through ${list.length} windows. A rule that trades each pair separately is quietly taking ${list.length}× the dollar risk. ` +
      `Desks split each pair's move into a common USD factor plus a local part and size the factor once. Watch how often this happens on rich-IV days — it is where the break rule's hidden concentration lives.` },
  { id: 'event', title: 'Scheduled events and the event multiplier',
    when: ({ rows }) => { const x = rows.find(w => w.event && !/none|holiday/i.test(w.event) && w.band >= 2); return x && { x }; },
    body: ({ x }) => `${x.sym} had a scheduled event (${x.event}) and its range landed ${BAND_LABEL[x.band]} (${x.resid}× median). ` +
      `The forecast already widens σ on event days with a fitted multiplier, so the question is whether the multiplier is big enough. ` +
      `Andersen, Bollerslev, Diebold & Vega (2003) showed scheduled releases are the main source of intraday jumps. If event days keep landing beyond p75 on this page's tally, the multiplier is too small — that is hypothesis H3, testable in a day.` },
  { id: 'quiet', title: 'Why a forecast miss does not repeat',
    when: ({ rows }) => (rows.length >= 4 && rows.filter(w => w.band === 0).length / rows.length >= 0.6 ? { n: rows.filter(w => w.band === 0).length, of: rows.length } : null),
    body: ({ n, of }) => `${n} of ${of} instruments finished inside their median range line. Quiet days invite the thought "the lines are too wide now, tighten them". ` +
      `The research says do not: after a run of misses, the next day's error is not more of the same (after a month of too many breaches, the next day breached 19% vs 28%), because σ catches up by itself. ` +
      `What σ cannot see is the future — only forward-looking inputs (options, the calendar) predict tomorrow's miss.` },
  { id: 'coin', title: 'Why a touch is a coin flip (the reflection principle)',
    link: 'theory-lab/lessons/merton-jump-diffusion.html',
    when: ({ rows }) => { const x = rows.find(w => w.tag === 'fair' && (w.hit.oh_p50 || w.hit.ol_p50)); return x && { x }; },
    body: ({ x }) => `${x.sym} (tagged FAIR) touched a p50 line. For a random walk, once price touches a level, the chance it finishes beyond is exactly one half — whatever the level. ` +
      `That is the reflection principle, and it is why 30+ price features at the touch landed on fair odds: the spacing to the next line already prices what the price path knows. ` +
      `On a FAIR day there is nothing extra to know. The edge only exists on days when σ itself is wrong.` },
  { id: 'calib', title: 'Grading a forecast like a meteorologist',
    when: ({ tallyAll }) => { const n = Object.values(tallyAll).reduce((a, b) => a + b.n, 0); return n >= 20 ? { tallyAll, n } : null; },
    body: ({ tallyAll, n }) => `This page has now scored ${n} instrument-days. A good forecast is calibrated: a p75 line should be passed on 25% of days. ` +
      Object.entries(tallyAll).filter(([k]) => k !== 'untagged').map(([k, a]) => `${TAGS[k]?.label ?? k}: ${a.n} days, p75 passed ${pct(a.p75Rate ?? 0)} (research ${pct(EXPECT_P75[k] ?? 0)})`).join('; ') + '. ' +
      `Weather services grade forecasts this way with reliability diagrams and the CRPS score. If the live rates drift from the research rates, the tercile edges need refitting — that is the loop this page closes.` },
  { id: 'voltime', title: 'Volatility time, not clock time',
    when: () => ({}),
    body: () => `An hour at 03:00 London and an hour at 14:30 are not the same amount of market. The NY open and data releases carry several times the expected movement of the Asian lull. ` +
      `Measuring a day in "how much expected movement has passed" instead of minutes makes touches comparable across sessions, and sharpens "is the high already in" — the Brownian arcsine law says the day's extreme is most likely early or late, rarely in the middle of vol time.` },
  { id: 'gap', title: 'What the market knows that your model does not',
    when: () => ({}),
    body: () => `Every edge is an information gap. Your lines know past prices and the calendar. Options know what traders pay to protect against. ` +
      `The order book knows where stops sit (a first look at OANDA's retail book found nothing: stop-heavy lines did not continue more, 31% vs 33%, n = 943). ` +
      `Rates know about policy. The research question is never "what will price do at the line" — it is "which of these does my forecast not yet contain".` },
];

export function pickLesson({ rows, setup, tallyAll, recent = [] }) {
  const ctx = { rows: rows ?? [], setup: setup ?? [], tallyAll: tallyAll ?? {} };
  const fresh = LESSONS.filter(l => !recent.slice(0, 5).includes(l.id));
  for (const l of [...fresh, ...LESSONS]) {
    let args = null; try { args = l.when(ctx); } catch { args = null; }
    if (args) return { id: l.id, title: l.title, body: l.body(args), link: l.link ?? null };
  }
  return null;
}
