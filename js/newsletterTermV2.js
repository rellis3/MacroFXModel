/**
 * js/newsletterTermV2.js: "The Chain // Terminal", version 2 (owner, 2026-11-16). A real written newsletter for the Desk Terminal's look: it explains what
 * happened yesterday, where things stand today, and what history says could happen, with the terminal's own charts sitting beside the paragraph each
 * one illustrates. It is the same kind of newsletter as the daily and the brief, modernised: the desk writer's issue, the currency debate (reasons a
 * currency could be firm, reasons it could be weak), the analysts' tailwinds and headwinds for each market, the desk ruling, the calendar with what
 * each release did before, the regime, the curve, the Fed, vol, unusual-now, and the level-reach range model.
 *
 * No model is called here. The writing is the desk run's and the terminal's rule-built sentences, taken as they are stored (js/newsletterTermV2Prose.js
 * removes any sentence that carries entry, target, stop, size or zone wording, strips internal tags and never prints one sentence twice).
 * Output is always a PDF: A4 portrait, print CSS, one self-contained HTML page (inline SVG, no scripts, no fetched fonts), poster = the first page.
 *
 * EVIDENCE: range, timing and size are described; direction is never presented as a signal. The analysts' arguments carry "explains their thinking,
 * it is not a tested signal", and a chart that touches direction carries the Evidence Book's own verdict word (evidenceChip looks it up).
 * The classic terminal edition (js/newsletterTerminal.js) is untouched and stays behind a "classic" button for a few weeks.
 */
import * as G from './newsletterTermV2Svg.js';
import * as P from './newsletterTermV2Prose.js';
import { rankBundle, expectedByChance } from './terminal/unusualCore.js';
import { ladderRows } from './terminal/reachCore.js';
import { similarReleases } from './terminal/calendarDrillsCore.js';
import { DESK_EVIDENCE } from './deskEvidence.js';
import { renderPosterV2 } from './newsletterTermV2Poster.js';
import { wrapLines } from './newsletterTermV2Wrap.js';

const { esc, fmt, CSS_PAL, HEX_PAL, LIGHT_PAL, MONO, SANS } = G;
const { clean, fit, safeProse, sentencesUpTo, Dedupe } = P;
const fin = v => typeof v === 'number' && Number.isFinite(v);
const ukDate = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const longDate = ms => new Date(ms).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
const hhmm = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false });
export { clean, fit };
export const LEVEL_WORD = { ok: 'OK', watch: 'WATCH', stress: 'STRESS' };
export const THINKING = 'This explains the analysts\' thinking; it is not a tested signal.';
export const DISCLAIMER_V2 = 'Not financial advice. Educational macro analysis for a small private group. Figures are drawn from the desk terminal at the time shown; the written analysis is the desk run\'s, kept as it was written, and nothing here is a trade instruction. Range, timing and size are described; direction is not forecast.';
export const wordCount = s => (String(s ?? '').replace(/<[^>]*>/g, ' ').match(/[A-Za-z0-9%][A-Za-z0-9%'’.\-+−/]*/g) ?? []).length;

/** The Evidence Book's verdict word for an id, or null when the id is unknown (a test fails if any id used here goes missing). */
export function evidenceChip(id, label) { const e = DESK_EVIDENCE.find(x => x.id === id); return e ? { id, label, verdict: String(e.verdict).toUpperCase() } : null; }
export const EVIDENCE_IDS = ['band-reach-from-here', 'gex-range', 'surprise-size', 'calendar-range-profile', 'cb-tone-direction'];
const ev = (...a) => evidenceChip(...a);

const scoreMap = (S, w) => (S?.horizons?.[w]?.available ? Object.fromEntries(S.horizons[w].scores.map(x => [x.ccy, x.score])) : null);
function sessionPaths(bars, fcMedianPct, nowMs, maxDays = 10) {
  if (!bars?.length || !(fcMedianPct > 0)) return { past: [], today: null };
  const byDay = new Map();
  for (const b of bars) { const d = ukDate(b.time * 1000); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(b); }
  const todayKey = ukDate(nowMs), days = [...byDay.keys()].sort(), mk = list => { const o = list[0].open, unit = o * fcMedianPct / 100, t0 = list[0].time; return { label: ukDate(list[0].time * 1000), pts: list.map(b => [(b.time - t0) / 60, (b.close - o) / unit]) }; };
  return { past: days.filter(d => d < todayKey && byDay.get(d).length >= 20).slice(-maxDays).map(d => mk(byDay.get(d))), today: byDay.has(todayKey) && byDay.get(todayKey).length >= 2 ? mk(byDay.get(todayKey)) : null };
}
/** A short plain phrase: the first clause of a reason, never cut mid-word (for the poster). */
export function shortReason(t, max = 96) {
  const s = P.clean(t); if (!s) return '';
  const first = P.sentences(s)[0] ?? s;
  return P.fit(first, max).replace(/\.$/, '');
}
/**
 * data: { S, CV, VC, FED, WS, REG, CAL, BUNDLE, SCORE, RUN, FC, OI, BARS5, BARS15, RR } as the terminal's routes return them (any may be null).
 * Returns { date, asOf, headline, standfirst, stories: [...], takeaways: [...], poster: {...}, words }. A story with `na` is a "not available" note, never blank.
 */
export function buildModel(data, nowMs = Date.now()) {
  const d = data ?? {}, S = d.S, run = d.RUN?.ok ? d.RUN : null, asOfMs = Date.parse(S?.horizons?.['1H']?.to ?? '') || nowMs, asOf = `${hhmm(asOfMs)} UTC`;
  const stories = [], dd = new Dedupe(), add = s => { stories.push(s); return s; }, na = (id, beat, title, why) => add({ id, beat, title, na: why });
  const para = t => { const x = dd.take(t); return x || ''; };
  const standDone = (() => { const di0 = P.deskIssue(run); return di0?.standfirst ? para(di0.standfirst) : ''; })();
  const sc1w = scoreMap(S, '1W'), sc4h = scoreMap(S, '4H'), order = sc1w ? Object.keys(sc1w).sort((a, b) => sc1w[b] - sc1w[a]) : [];
  const tiles = (d.VC?.tiles ?? []).filter(t => t?.clock && fin(t.clock.used)), busy = tiles.length ? tiles.reduce((a, b) => (b.clock.used > a.clock.used ? b : a)) : null;
  const frames = d.CV?.frames ?? [], cur = frames.at(-1), at = i => frames[Math.max(0, frames.length - 1 - i)];
  const ghosts = frames.length > 5 ? [{ frame: at(5), label: '1w' }, { frame: at(21), label: '1m' }, { frame: at(60), label: '3m' }].filter(g => g.frame && g.frame !== cur) : [];
  const q = d.REG?.quadrant, di = P.deskIssue(run), cc = run ? P.currencyCases(run) : null, rul = run ? P.ruling(run) : null;
  const bundle = d.BUNDLE?.series ? d.BUNDLE : null, rank = bundle ? rankBundle(bundle) : null, ws = d.WS?.tiles ?? [];

  // ───────────────────────────── YESTERDAY ─────────────────────────────
  const sc = d.SCORE?.ok ? d.SCORE.score : null, rv = d.SCORE?.ok ? P.reviewProse(d.SCORE.reflection) : null;
  if (sc && fin(sc.S) && sc.placebo && fin(sc.placebo.mean)) {
    const pl = sc.placebo, where = sc.S > pl.p95 ? 'above' : 'inside', ps = [];
    ps.push(`The desk's morning read of ${sc.date} was scored against what prices actually did. It came out at ${fmt(sc.S, 2)} across ${sc.scored} markets. A random coin, run through the same scoring, averages ${fmt(pl.mean, 2)} and goes past ${fmt(pl.p95, 2)} one day in twenty, so the day finished ${where} the range a coin produces. One day is a small sample: over ${d.SCORE ? 'the days scored so far' : 'the record'} the question is whether this repeats, and it has not been tested long enough to say.`);
    if (rv?.headline) ps.push(rv.headline);
    if (rv?.worked?.length) ps.push(`What worked: ${rv.worked.join(' ')}`);
    if (rv?.failed?.length) ps.push(`What did not: ${rv.failed.join(' ')}`);
    if (rv?.lessons?.length) ps.push(`The desk's own lessons for today: ${rv.lessons.join(' ')}`);
    add({ id: 'yesterday-score', beat: 'Yesterday', title: 'How the morning read did against the day', paras: ps.map(para).filter(Boolean), svg: G.scoreBand(CSS_PAL, { S: sc.S, mean: pl.mean, sd: pl.sd, p95: pl.p95 }), how: 'The bar is what a random coin scores; the dot is the desk.', chips: [{ label: 'Desk direction reads', verdict: 'CONTEXT, NOT A SIGNAL' }], asOf: `scored for ${sc.date}` });
  } else na('yesterday-score', 'Yesterday', 'How the morning read did against the day', 'the desk score was not available');
  if (rank?.rows?.length) {
    const rows = rank.rows.filter(r => !r.stale && r.moves?.[1]).sort((a, b) => b.moves[1].pct - a.moves[1].pct).slice(0, 8), top = rows[0];
    const bigN = rank.rows.filter(r => !r.stale && r.moves?.[1]?.pct >= 0.95).length;
    add({ id: 'yesterday-moves', beat: 'Yesterday', title: 'The moves that stood out', paras: [para(`${top.label} had the rarest one-day move in the daily market bundle: ${top.moves[1].text}, bigger than ${Math.round(top.moves[1].pct * 100)}% of its own one-day moves since ${top.from}. ${bigN} of ${rank.rows.length} series moved more than 19 days in 20 would; the rest of the list shows the other biggest moves. A rare move says the day was unusual for that market, not which way the next one will go.`)].filter(Boolean),
      svg: G.rankedBars(CSS_PAL, rows.map(r => ({ label: r.label, value: r.moves[1].pct, text: r.moves[1].text, hot: r.moves[1].pct >= 0.95 })), { ariaLabel: 'Yesterday\'s biggest one-day moves, ranked by how rare they were' }), how: 'A full bar is a move bigger than every other day in that series\' own record.', asOf: `closes to ${rank.refDate}` });
  } else na('yesterday-moves', 'Yesterday', 'The moves that stood out', 'the daily market bundle was not available');
  const past = (d.RR?.live ?? []).filter(r => r?.ms && r.ms <= nowMs && r.ms > nowMs - 30 * 3600e3 && r.surprise?.ok).slice(0, 6);
  if (past.length) add({ id: 'yesterday-events', beat: 'Yesterday', title: 'Releases that came out', paras: [para('These are the releases of the last day with their surprise against the estimate. The size of a surprise is measured against that release\'s own past surprises; the market reaction to each is on the Release Reaction page.')].filter(Boolean), rows: past.map(r => ({ time: hhmm(r.ms), ccy: r.ccy ?? r.country, name: clean(r.event), text: `${r.surprise.actual} against ${r.surprise.estimate} expected, ${r.surprise.size}` })), chips: [ev('surprise-size', 'Surprise size')].filter(Boolean), asOf: 'last 30 hours' });

  // ───────────────────────────── TODAY ─────────────────────────────
  const backdrop = di?.byTitle('backdrop');
  if (di && backdrop) {
    const ps = [backdrop?.body].map(para).filter(Boolean);
    add({ id: 'backdrop', beat: 'Today', title: di.subject || 'The backdrop', paras: ps, lights: ws.length ? ws.map(t => ({ label: t.label, level: t.level, detail: clean(t.detail) })) : null, regime: q ? { name: String(q.name ?? '').toUpperCase(), growth: q.growth, inflation: q.inflation, met: d.REG.overall?.met, of: d.REG.overall?.of } : null,
      how: `The seven lights are the stress gauges at ${asOf}: OK, WATCH or STRESS, each with its own number. The regime is the growth and inflation quadrant the lenses agree on.`, label: backdrop?.label ?? 'Model output', chips: [{ label: 'Desk ruling', verdict: 'CONTEXT, NOT A SIGNAL' }], asOf: `desk run ${run?.date ?? ''}` });
  } else {
    const ps = [q ? para(`The regime reads ${String(q.name).toUpperCase()}: growth ${q.growth}, inflation ${q.inflation}. ${clean(q.why ?? '')}`) : ''].filter(Boolean);
    if (ps.length || ws.length) add({ id: 'backdrop', beat: 'Today', title: 'The backdrop', paras: ps, lights: ws.length ? ws.map(t => ({ label: t.label, level: t.level, detail: clean(t.detail) })) : null, how: 'The lights are OK, WATCH or STRESS for each gauge, with its own number.', asOf });
    else na('backdrop', 'Today', 'The backdrop', 'the desk run and the stress board were not available');
  }
  if (rul?.headline) add({ id: 'ruling', beat: 'Today', title: 'The desk ruling', paras: [para(rul.headline), rul.drivers.length ? para(`What carries it: ${rul.drivers.join(' ')}`) : ''].filter(Boolean), how: THINKING, chips: [{ label: 'Desk direction', verdict: 'CONTEXT, NOT A SIGNAL' }], asOf: `run ${run?.date ?? ''}` });

  // currencies: the strength strip, the desk's reading, who is strong and who is weak and why, two or three head-to-heads
  const heat = G.heatStrip(CSS_PAL, S);
  if (heat) {
    const lead = order[0], lag = order.at(-1), h4 = S.horizons['4H'], cur2 = di?.byTitle('currenc');
    const ps = [para(`Over a week ${lead} is the strongest currency (${fmt(sc1w[lead])}σ) and ${lag} the weakest (${fmt(sc1w[lag])}σ). ${h4?.available ? `Over the last four hours ${h4.leader} leads and ${h4.laggard} trails. ` : ''}Strength is each currency's move against the other seven, in units of a normal move for that window, so a reading near +3σ is rare and one near zero is ordinary.${Object.values(S.horizons).some(h => h.sinceClose) ? ' A window marked "since close" starts at the Friday close because the market was shut at its start.' : ''}`), cur2 ? para(cur2.body) : ''].filter(Boolean);
    add({ id: 'strength', beat: 'Today', title: 'Which currencies are firm, and why', paras: ps, svg: heat, how: 'Brighter is further from normal. Green is firm, red is weak; each column is one window.', label: cur2?.label ?? null, asOf });
    // head-to-heads: strongest vs weakest over a week, 4H leader vs laggard, and the desk's top vs bottom ranking, each pair once
    const pairs = [[lead, lag]]; if (h4?.available && h4.leader && h4.laggard) pairs.push([h4.leader, h4.laggard]); if (cc?.ranking?.length > 1) pairs.push([cc.ranking[0], cc.ranking.at(-1)]);
    const seen = new Set(), h2h = pairs.filter(([x, y]) => x && y && x !== y && !seen.has(`${x}${y}`) && seen.add(`${x}${y}`)).slice(0, 3).map(([x, y]) => P.headToHead(x, y, { sc1w, sc4h, cases: cc?.cases })).map(h => ({ ...h, forX: para(h.forX), againstY: para(h.againstY) }));
    add({ id: 'h2h', beat: 'Today', title: 'Head to head: the firmest against the weakest', paras: [para('Each pairing shows the two currencies side by side: their strength in σ, then the case the desk\'s analysts made for the first one holding up and the case they made for the second one struggling.')].filter(Boolean), h2h, how: THINKING, chips: [{ label: 'Currency direction', verdict: 'CONTEXT, NOT A SIGNAL' }], asOf: `run ${run?.date ?? ''}` });
    if (cc) add({ id: 'ccys', beat: 'Today', title: 'Each currency: reasons it could be firm, reasons it could be weak', paras: [para(cc.headlineUp), para(cc.headlineDn)].filter(Boolean), ccys: order.map(c => ({ ccy: c, w1: sc1w[c], h4: sc4h?.[c], up: para(sentencesUpTo(cc.cases[c].up || cc.cases[c].why, 420)), dn: para(sentencesUpTo(cc.cases[c].dn, 420)) })), how: THINKING, chips: [{ label: 'Currency direction', verdict: 'CONTEXT, NOT A SIGNAL' }], asOf: `run ${run?.date ?? ''}` });
  } else na('strength', 'Today', 'Which currencies are firm, and why', 'the strength route was not available');

  // rates
  const rcb = P.analystHeadlines(run, ['rates_cb', 'yields_curve']).map(x => para(x.text)).filter(Boolean), cv = cur ? G.curveChart(CSS_PAL, cur, ghosts) : '', winds = (d.FED?.windows ?? []).slice(0, 4), fedSvg = G.fedBars(CSS_PAL, winds);
  if (cv) add({ id: 'curve', beat: 'Today', title: 'The US curve against its own past shape', paras: [para(`The curve at the last close is the gold line. Its 2s10s slope is ${cur.data.s2s10 ?? 'n/a'}bp${ghosts[1]?.frame?.data?.s2s10 != null ? `, against ${ghosts[1].frame.data.s2s10}bp a month ago` : ''}. The violet ghosts are the same curve one week, one month and three months earlier, so the shape change is visible at a glance. These are official prints, last close ${cur.t}.`), ...rcb.slice(0, 1)].filter(Boolean), svg: cv, how: 'Gold is now; violet ghosts are the earlier curves. A steeper line is a wider gap between long and short yields.', asOf: `last close ${cur.t}` });
  else na('curve', 'Today', 'The US curve against its own past shape', 'the curve history was not available');
  if (fedSvg) add({ id: 'fed', beat: 'Today', title: 'What the Fed futures price', paras: [para(`The futures market prices a ${Math.round(winds[0].hike)}% chance of a rate rise by ${new Date(`${winds[0].ref}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}${winds[1] ? ` and ${Math.round(winds[1].hike)}% by ${new Date(`${winds[1].ref}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''}. That is what is priced, not what will happen: the violet ticks show where the same odds stood a day, a week and a month ago, so you can see whether the market is leaning further or backing off.`), ...rcb.slice(1, 2)].filter(Boolean), svg: fedSvg, how: 'The bar is today\'s odds; the ticks are the same odds 1 day, 1 week and 1 month ago.', chips: [{ label: 'Rate path', verdict: 'PRICED, NOT FORECAST' }], asOf });
  else na('fed', 'Today', 'What the Fed futures price', 'the Fed path was not available');

  // markets: the analysts' tailwinds and headwinds
  const mk = run ? P.marketBlocks(run, { limit: 10 }) : [];
  if (mk.length) add({ id: 'markets', beat: 'Today', title: 'The markets: reasons it could rise, reasons it could fall', paras: [para('For each market the desk\'s analysts made their case. Tailwinds are the points that push the market up, headwinds the points that push it down; each point comes from one analyst and is shown as they wrote it. A market with strong points on both sides is a contested one.')].filter(Boolean), markets: mk.map(m => ({ ...m, rise: m.rise.map(x => ({ ...x, text: para(x.text) })).filter(x => x.text), fall: m.fall.map(x => ({ ...x, text: para(x.text) })).filter(x => x.text), note: para(m.note) })), how: THINKING, chips: [{ label: 'Market direction', verdict: 'CONTEXT, NOT A SIGNAL' }], asOf: `run ${run?.date ?? ''}` });
  else na('markets', 'Today', 'The markets: reasons it could rise, reasons it could fall', 'the desk run was not available');
  const dl = G.dialsGrid(CSS_PAL, tiles), vh = P.analystHeadlines(run, ['vol_iv']).map(x => para(x.text)).filter(Boolean);
  if (dl) add({ id: 'vol', beat: 'Today', title: 'How much of the day\'s range is already used', paras: [para(`${busy.sym} has used ${Math.round(busy.clock.used * 100)}% of its median forecast range after ${busy.clock.hours} hours of the London day. A dial at 100% has covered the median day; the ticks mark the 75th and 90th percentile days, so a dial past the second tick is a day bigger than nine in ten. Under each name is the Daily Read's word (fair, continue or exhaust) and implied vol over the forecast.`), ...vh.slice(0, 1)].filter(Boolean), svg: dl, how: '100% is the median day; ticks are the median, 75th and 90th percentile days.', chips: [ev('calendar-range-profile', 'Range timing')].filter(Boolean), asOf });
  else na('vol', 'Today', 'How much of the day\'s range is already used', 'the vol clock was not available');
  if (rank?.rows?.length) {
    const top = rank.rows.slice(0, 8), ex = expectedByChance(rank.rows);
    add({ id: 'unusual', beat: 'Today', title: 'What is unusual right now', paras: [para(`Every series the terminal holds was ranked by how extreme it is against its own history, not by how big its move is. ${ex.hits} of ${ex.measures} readings sit at or beyond the 95th percentile, against about ${Math.round(ex.expected)} that chance alone would give, so ${ex.hits > ex.expected * 1.3 ? 'more is unusual than a normal day would show' : 'this is an ordinary day for the whole set'}. The most extreme is ${top[0].label}: it ${clean(top[0].driver?.text ?? '')}.`)].filter(Boolean),
      svg: G.rankedBars(CSS_PAL, top.map(r => ({ label: r.label, value: r.score, text: `${Math.round(r.score * 100)}th`, hot: r.score >= 0.95 })), { ariaLabel: 'The most unusual series, ranked by percentile' }), how: 'Each bar is the series\' percentile against its own history, so 98th means more extreme than 98% of its past.', asOf: `closes to ${rank.refDate}` });
  }
  const calRows = [], seen = new Set();
  for (const r of (d.CAL?.rows ?? [])) {
    if (r.impact !== 'High' || !(r.ms >= nowMs - 3600e3) || r.ms > nowMs + 36 * 3600e3) continue;
    const kk = `${r.time}|${r.event}|${r.country}`; if (seen.has(kk)) continue; seen.add(kk);
    const sim = (() => { try { return similarReleases({ country: r.country, event: r.event }); } catch { return null; } })();
    calRows.push({ ms: r.ms, time: hhmm(r.ms), hours: (r.ms - nowMs) / 3600e3, ccy: r.country, name: clean(r.event), text: `estimate ${r.estimate ?? 'n/a'}, previous ${r.prev ?? 'n/a'}`, drill: sim ? `In past prints the 30-minute move has typically been ${sim.medSpike} times an ordinary half-hour (${sim.events} prints); next-day direction was close to a coin flip.` : '' });
    if (calRows.length >= 6) break;
  }
  if (calRows.length) add({ id: 'calendar', beat: 'Today', title: 'Coming up, and what each release did before', paras: [para(`These are the high-impact releases in the next day and a half. Under each is what that release has done to markets in the past, as a multiple of an ordinary half-hour and not as a direction, which has not been predictable from the release alone.${calRows.some(r => !r.drill) ? " A release with no line under it has rarely moved markets more than an ordinary half-hour." : ''}`)].filter(Boolean), rows: calRows, svg: G.eventStrip(CSS_PAL, uniqEvents(calRows)), how: 'Times are UTC; the dots show how far away each release is.', chips: [ev('surprise-size', 'Surprise size')].filter(Boolean), asOf });
  else na('calendar', 'Today', 'Coming up, and what each release did before', 'no high-impact release in the next 36 hours, or the calendar was not available');
  const brk = di?.byTitle('break'), unseen = di?.byTitle('could not see');
  if (brk) add({ id: 'break', beat: 'Today', title: 'What could break the day', paras: [para(brk.body), rul?.flips?.length ? para(`What would flip the desk's ruling: ${rul.flips.join(' ')}`) : ''].filter(Boolean), how: THINKING, label: brk.label, asOf: `run ${run?.date ?? ''}` });
  if (unseen) add({ id: 'unseen', beat: 'Today', title: 'What the desk could not see', paras: [para(unseen.body)].filter(Boolean), how: 'Feeds that were stale or missing this morning, so the analysis above rests on less than usual in those places.', label: unseen.label, asOf: `run ${run?.date ?? ''}` });

  // ───────────────────────────── WHAT COULD HAPPEN ─────────────────────────────
  const sym = 'NQ', fc = d.FC?.instruments?.[sym], bars5 = d.BARS5?.bars, price = bars5?.at(-1)?.close ?? null, lad = fc?.ladder;
  if (fc && lad?.oh && lad?.ol && fin(price)) {
    const today5 = (bars5 ?? []).filter(b => ukDate(b.time * 1000) === ukDate(nowMs)), open = today5.length ? today5[0].open : price, hi = today5.length ? Math.max(...today5.map(b => b.high)) : null, lo = today5.length ? Math.min(...today5.map(b => b.low)) : null;
    let rows = []; try { rows = ladderRows({ sym, fc, bars: bars5, nowMs }, [0.5, 1, 1.5, 2]); } catch { rows = []; }
    const one = rows.find(r => r.k === 1), shown = rows.filter(r => fin(r.up.p) || fin(r.down.p));
    add({ id: 'range', beat: 'What could happen', title: 'Nasdaq: the range a day like this usually covers', paras: [para(`From the open, the median Nasdaq session reaches ${lad.oh.p50}% up and ${lad.ol.p50}% down; one session in four reaches ${lad.oh.p75}% up or ${lad.ol.p75}% down, and one in ten reaches ${lad.oh.p90}% up or ${lad.ol.p90}% down. Today the price is ${price.toLocaleString('en-GB', { maximumFractionDigits: 1 })} against an open of ${open.toLocaleString('en-GB', { maximumFractionDigits: 1 })}. These are the calibrated range ladders the desk forecast uses, drawn from the vol forecast for ${d.FC.session_date}.`), one && fin(one.up.p) ? para(`Measured in the day's own σ, a move to ${Math.round(one.up.level).toLocaleString('en-GB')} (one σ up) has about a ${Math.round(one.up.p * 100)}% chance of being touched before the day ends, and a move to ${Math.round(one.down.level).toLocaleString('en-GB')} (one σ down) about ${Math.round((one.down.p ?? 0) * 100)}%. This is a model of how far prices travel, not a view on which way they go.`) : ''].filter(Boolean),
      svg: G.rangeBand(CSS_PAL, { price, open, up: lad.oh, down: lad.ol, high: hi, low: lo }), reach: shown.length ? shown.map(r => ({ k: r.k, upLevel: r.up.level, upP: r.up.p, downLevel: r.down.level, downP: r.down.p })) : null, how: 'Dashed lines are the 75th and 90th percentile reach; the solid line the median; gold is the price now. The table is the chance of touching each level.', chips: [ev('calendar-range-profile', 'Range'), ev('band-reach-from-here', 'Level reach')].filter(Boolean), asOf: `price ${asOf}` });
  } else na('range', 'What could happen', 'Nasdaq: the range a day like this usually covers', 'the forecast or the price bars were not available');
  const paths = sessionPaths(d.BARS15?.bars, fc?.hl_median, nowMs);
  if (paths.past.length >= 3) add({ id: 'ghosts', beat: 'What could happen', title: 'Nasdaq: how the last sessions unfolded', paras: [para(`Each faint line is one of the last ${paths.past.length} London days, from its open, in units of today's forecast median range, so they can be laid on top of each other. ${paths.today ? `Today so far is ${fmt(paths.today.pts.at(-1)[1], 2)} of a median range from the open.` : 'Today has not started yet.'} The spread of the ghosts is the honest picture of how different days can be from the same starting point; they show how big days have been, not which way the next one goes.`)].filter(Boolean), svg: G.ghostPaths(CSS_PAL, paths.past, paths.today), how: 'Faint violet lines are past sessions; gold is today. The vertical scale is multiples of the median range.', asOf: `${paths.past[0].label} to ${paths.past.at(-1).label}` });
  const oiE = d.OI?.data?.NAS100_USD ?? d.OI?.NAS100_USD;
  if (oiE && fin(price)) {
    const unit = oiE.refMove?.move ?? null, lv = [['call wall', oiE.callWall], ['gamma flip', oiE.gexFlip], ['max pain', oiE.maxPain], ['put wall', oiE.putWall], ['snapshot spot', oiE.spot]].filter(x => fin(x[1])).map(([label, p]) => ({ label, price: p }));
    add({ id: 'levels', beat: 'What could happen', title: 'Nasdaq: the option levels and where price sits against them', paras: [para(`The stored open-interest capture puts the call wall at ${Math.round(oiE.callWall).toLocaleString('en-GB')}, the put wall at ${Math.round(oiE.putWall).toLocaleString('en-GB')} and the gamma flip at ${Math.round(oiE.gexFlip).toLocaleString('en-GB')}. Price is ${fmt((oiE.callWall - price) / (unit || 1), 1)}σ below the call wall and ${fmt((price - oiE.putWall) / (unit || 1), 1)}σ above the put wall, where σ is the capture's own expected move. Tests on this desk found these levels describe where price is, not where it will go, and the nearest ones are often just neighbours of price.`)].filter(Boolean), svg: G.levelLadder(CSS_PAL, lv, price, unit), how: 'Dashed lines are option levels from the capture; gold is the price now; the note is the distance in σ.', chips: [ev('gex-range', 'Option levels')].filter(Boolean), asOf: `capture ${oiE.savedAt ?? 'saved'}` });
  }
  if (rul?.gaps?.length) add({ id: 'gaps', beat: 'What could happen', title: 'What would change the picture', paras: [para(rul.gaps.join(' '))].filter(Boolean), how: 'Each of these is a gap or a flip condition the desk named; when one changes, the reading above is worth revisiting.', asOf: `run ${run?.date ?? ''}` });

  // ───────────────────────────── assemble ─────────────────────────────
  const lead = order[0], lag = order.at(-1), headline = di?.subject || (lead ? `${lead} leads the week, ${lag} trails` : 'The terminal today');
  const stand2 = standDone || stories.find(s => s.id === 'strength')?.paras?.[0] || '';
  const push = run && lead ? { [lead]: P.ccyPhrase(run, lead, 'firm'), [lag]: P.ccyPhrase(run, lag, 'weak') } : {}, takeaways = buildTakeaways({ push, sc, rank, q, ws, lead, lag, sc1w, cc, cur, ghosts, winds, lad, price, one: null, calRows, tiles, busy, fc, bars5, nowMs, asOf });
  const model = { date: longDate(asOfMs), asOf, asOfMs, headline, standfirst: stand2, stories, takeaways, stress: d.WS?.overall ?? null, regime: q ? String(q.name).toUpperCase() : null,
    poster: { S, sc1w, sc4h, order, cur, ghosts, winds, tiles, lights: ws, q, asOf, date: longDate(asOfMs), takeaways, ...posterFacts({ d, run, rul, sc, rank, order, sc1w, sc4h, calRows, winds, ws, headline, nowMs }) } };
  model.words = proseWords(model);
  return model;
}

/** A short, clean clause of a longer sentence for the poster: brackets and "e.g." removed, cut at a clause or a word, never ending on a dangling word. */
export function shortClause(t, max = 66) {
  let x = P.clean(t).replace(/\([^)]*\)?/g, '').replace(/\be\.g\.?,?/gi, '').replace(/\s{2,}/g, ' ').trim();
  x = (P.sentences(x)[0] ?? x).split(/\s[\u2014\u2013-]\s/)[0].replace(/[.;:,]$/, '');
  if (x.length <= max) return x;
  const cut = x.slice(0, max), c = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf(' and '), cut.lastIndexOf(' or '));
  const y = c > max * 0.55 ? cut.slice(0, c) : cut.replace(/\s+\S*$/, '');
  return y.replace(/[,;:\s]+$/, '').replace(/\b(a|an|the|of|to|in|on|at|by|with|and|or|into|against|than)$/i, '').trim();
}
const GATE_NAME = { NAS100_USD: 'Nasdaq', SPX500_USD: 'S&P 500', US30_USD: 'Dow', US2000_USD: 'Russell 2000', DE30_USD: 'DAX', UK100_GBP: 'FTSE 100', JP225_USD: 'Nikkei' };
const RISK_LABEL = { USD: 'Dollar', RISK: 'Risk-on', CARRY: 'Carry', COMMOD: 'Commodities', RATES: 'Rates' };
const lonHm = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London', hour12: false });
/** The facts the poster draws, from the same routes and the same desk run as the written issue (nothing invented; a missing source leaves its field null). */
function posterFacts({ d, run, rul, sc, rank, order, sc1w, sc4h, calRows, winds, ws, headline, nowMs }) {
  const tone = rul?.tone || null, verdict = evidenceChip('credit-leads-equities', 'x')?.verdict ?? null;
  const rf = ws.find(t => /risk flags/i.test(t.label)), cr = d.CRED?.rows ?? [], ccc = cr.find(r => r.id === 'BAMLH0A3HYC'), ig = cr.find(r => r.id === 'BAMLC0A0CM');
  const lvl = (x, hi, mid) => (x >= hi ? 'stress' : x >= mid ? 'watch' : 'ok');
  const foundation = ccc ? { level: lvl(ccc.pctile5y, 95, 80), word: ccc.pctile5y >= 95 ? 'Credit stress' : ccc.pctile5y >= 80 ? 'Credit strained' : 'Credit sound' } : null;
  const surface = rf ? { level: rf.level, word: rf.level === 'ok' ? 'Calm' : rf.level === 'watch' ? 'Edgy' : 'Stressed' } : null;
  const gi = d.GATE?.instruments ? Object.entries(d.GATE.instruments) : [], blocked = gi.filter(([, v]) => v.composite === 'BLOCKED'), g0 = blocked[0]?.[1] ?? gi[0]?.[1];
  const gate = gi.length ? { level: blocked.length >= 3 ? 'stress' : blocked.length ? 'watch' : 'ok', word: blocked.length === gi.length ? 'BLOCKED' : blocked.length ? 'PARTLY BLOCKED' : 'OPEN', n: blocked.length || gi.length, names: (blocked.length ? blocked : gi).map(([k]) => GATE_NAME[k] ?? k.replace(/_.*/, '')).join(', '), creditZ: g0?.creditZ ?? null, curveZ: g0?.curveZ ?? null } : null;
  const fi = Object.fromEntries((d.FUND?.items ?? []).map(i => [i.id, i.stat])), rrp = fi.rrp, res = fi.reserves, bas = fi.basisTrade;
  const hits = [rrp && rrp.pctile <= 10, res && res.change < -50, bas && bas.pctile <= 10].filter(Boolean).length;
  const funding = rrp || res || bas ? { level: hits >= 2 ? 'stress' : hits === 1 ? 'watch' : 'ok', rrp: rrp?.value ?? null, rrpPct: rrp?.pctile ?? null, res: res?.value ?? null, resChg: res?.change ?? null, basis: bas?.value ?? null } : null;
  const credit = ccc ? { level: foundation.level, ccc: ccc.oas, chg: ccc.chg20d, pct5: ccc.pctile5y, ig: ig?.oas ?? null, igPct: ig?.pctile1y ?? null } : null;
  const ladder = order.map(c => ({ ccy: c, w1: sc1w[c], w4: sc4h?.[c] ?? null, word: sc1w[c] >= 1 ? 'Firm' : sc1w[c] <= -1 ? 'Weak' : 'Neutral' }));
  const seen = new Set(), events = []; for (const r of calRows) { const kk = r.time + '|' + r.ccy; if (seen.has(kk)) continue; seen.add(kk); events.push({ name: r.name, ccy: r.ccy, time: lonHm(r.ms) }); if (events.length >= 3) break; }
  const br = run?.debate?.bookRisk?.summary, risk = br?.factors?.length ? { enb: br.effectiveBets ?? null, factors: br.factors.filter(f => f.share >= 0.03).sort((a, b) => b.share - a.share).map(f => ({ label: RISK_LABEL[f.key] ?? f.key, share: f.share })) } : null;
  const w0 = winds?.[0], fedLine = w0 ? `Fed futures price ${Math.round(w0.hike)}% for a rise by ${new Date(w0.ref + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}.` : null;
  const caution = !tone ? 'The desk run was not available, so there is no ruling to show.' : /off/.test(tone) ? `Means caution, not a directional equity call${verdict === 'NULL' ? `: credit stress has not led equities in the desk's tests` : ''}.` : /on/.test(tone) ? 'The desk reads conditions as supportive of risk. That is context, not a tested signal.' : 'The desk has no strong lean today.';
  const where = sc ? (sc.S > sc.placebo?.p95 ? 'above the random-coin band' : 'inside the random-coin band') : null;
  return { headline, tone, conviction: rul?.conviction || null, caution, surface, foundation, credit, gate, funding, ladder, events, fedLine, risk, S: sc?.S ?? null, p95: sc?.placebo?.p95 ?? null,
    review: sc ? { scored: sc.live ? `${sc.scored} of ${sc.live}` : `${sc.scored}`, race: sc.race?.resolved ? `${sc.race.leanFirst} of ${sc.race.resolved}` : null, band: where } : null,
    flips: (rul?.flips ?? []).slice(0, 3).map(t => shortClause(t, 66)).filter(Boolean), tested: verdict ? `The desk's tested result: credit stress leading equities is ${verdict}. Use it as context for caution, not as a call.` : '' };
}
const uniqEvents = rows => { const seen = new Set(), out = []; for (const c of rows) { const l = `${c.time} ${c.ccy}`; if (seen.has(l)) continue; seen.add(l); out.push({ hours: c.hours, label: l }); } return out.slice(0, 4); };
/** The 5 to 7 takeaways of the issue, each a short headline plus a visual: the poster is built from these, not from decoration. */
function buildTakeaways(x) {
  const t = [], f = (v, dgt = 1) => fmt(v, dgt);
  if (x.sc && fin(x.sc.S) && x.sc.placebo) t.push({ id: 'yesterday', tag: 'YESTERDAY', head: `The morning read scored ${f(x.sc.S, 2)}, ${x.sc.S > x.sc.placebo.p95 ? 'above' : 'inside'} what a random coin produces`, cap: x.rank?.rows?.length ? `Rarest move: ${x.rank.rows.filter(r => !r.stale && r.moves?.[1]).sort((a, b) => b.moves[1].pct - a.moves[1].pct)[0]?.label ?? ''}.` : 'One day is a small sample.', vis: { type: 'score', S: x.sc.S, mean: x.sc.placebo.mean, sd: x.sc.placebo.sd, p95: x.sc.placebo.p95 } });
  if (x.q || x.ws?.length) { const bad = (x.ws ?? []).filter(l => l.level !== 'ok').length; t.push({ id: 'setup', tag: 'TODAY', head: `${x.q ? String(x.q.name).toUpperCase() + ' regime' : 'Regime not available'}, ${bad} of ${(x.ws ?? []).length} stress gauges off OK`, cap: x.q ? `Growth ${x.q.growth}, inflation ${x.q.inflation}.` : '', vis: { type: 'lights', lights: x.ws ?? [] } }); }
  if (x.lead && x.lag) { const r = c => x.push?.[c], w = c => x.push?.[c]; t.push({ id: 'ccy', tag: 'CURRENCIES', head: `${x.lead} firmest, ${x.lag} weakest over a week`, cap: [r(x.lead), w(x.lag)].filter(Boolean).join(' '), vis: { type: 'duo', items: [{ label: x.lead, v: x.sc1w[x.lead] }, { label: x.lag, v: x.sc1w[x.lag] }] } }); }
  if (x.cur) t.push({ id: 'rates', tag: 'RATES', head: x.winds?.[0] ? `The Fed futures price ${Math.round(x.winds[0].hike)}% for a rise by ${new Date(`${x.winds[0].ref}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : 'The US curve against its past', cap: `2s10s at ${x.cur.data.s2s10 ?? 'n/a'}bp. Priced, not forecast.`, vis: { type: 'curve' } });
  if (x.lad && fin(x.price)) t.push({ id: 'could', tag: 'WHAT COULD HAPPEN', head: `A day like this usually covers about ${x.lad.oh.p50}% up and ${x.lad.ol.p50}% down on Nasdaq`, cap: `One session in ten goes ${x.lad.oh.p90}% up or ${x.lad.ol.p90}% down from the open.`, vis: { type: 'range' } });
  if (x.calRows?.length) { const r = x.calRows[0]; t.push({ id: 'risk', tag: 'THE EVENT', head: `${r.name} (${r.ccy}) at ${r.time} UTC`, cap: r.drill.replace(/\.$/, '').replace(/^In past prints t/, 'T'), vis: { type: 'events', items: uniqEvents(x.calRows) } }); }
  else if (x.busy) t.push({ id: 'risk', tag: 'THE RANGE', head: `${x.busy.sym} has used ${Math.round(x.busy.clock.used * 100)}% of its median range`, cap: 'Dials past the second tick mean a day bigger than nine in ten.', vis: { type: 'dial', tile: x.busy } });
  return t.slice(0, 7);
}
/** Words of prose: headings, paragraphs, captions, market/currency text and calendar text; chart labels and chips are not counted. */
export function proseWords(model) {
  let n = wordCount(model.headline) + wordCount(model.standfirst);
  for (const s of model.stories) {
    if (s.na) { n += wordCount(s.na); continue; }
    n += wordCount(s.title) + wordCount(s.how);
    for (const p of s.paras ?? []) n += wordCount(p);
    for (const r of s.rows ?? []) n += wordCount(r.name) + wordCount(r.text) + wordCount(r.drill);
    for (const h of s.h2h ?? []) n += wordCount(h.strength) + wordCount(h.forX) + wordCount(h.againstY);
    for (const c of s.ccys ?? []) n += wordCount(c.up) + wordCount(c.dn);
    for (const m of s.markets ?? []) n += wordCount(m.summary) + wordCount(m.note) + [...m.rise, ...m.fall].reduce((a, p) => a + wordCount(p.text), 0);
  }
  return n;
}
/** Every sentence of the issue (for the "no sentence printed twice" check). */
export function allSentences(model) {
  const out = [];
  const push = t => { for (const s of P.sentences(t)) out.push(s); };
  push(model.standfirst);
  for (const s of model.stories) { if (s.na) continue; for (const p of s.paras ?? []) push(p); for (const r of s.rows ?? []) { push(r.text); push(r.drill); } for (const h of s.h2h ?? []) { push(h.forX); push(h.againstY); } for (const c of s.ccys ?? []) { push(c.up); push(c.dn); } for (const m of s.markets ?? []) { push(m.note); for (const p of [...m.rise, ...m.fall]) push(p.text); } }
  return out;
}

// ── HTML: A4 portrait, the poster first, then the written issue ──────────────────────────────────────────────────────
const PAGE_CSS = (pal, light) => `
:root{${Object.entries(pal).map(([n, v]) => `--${n}:${v}`).join(';')};--glow:${light ? 'rgba(91,75,216,.10)' : 'rgba(139,124,246,.16)'}}
*{box-sizing:border-box}html{background:var(--bg)}html,body{margin:0;color:var(--tx);-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font:12.5px/1.55 ${SANS};background:var(--bg)}
@page{size:A4 portrait;margin:11mm 12mm}
.doc{max-width:186mm;margin:0 auto}
.poster{break-after:page;page-break-after:always;margin:0}.poster svg{display:block;width:186mm;height:auto;max-height:272mm}
.mh{display:flex;align-items:center;gap:10px;font:700 10px ${MONO};letter-spacing:.18em;color:var(--tx2);padding-bottom:8px;border-bottom:1px solid var(--line);margin-bottom:10px}
.mh b{color:var(--tx)}.mh b i{font-style:normal;color:var(--gold)}.mh .r{margin-left:auto;color:var(--tx3);letter-spacing:.06em}
.dot{width:9px;height:9px;border-radius:50%;background:var(--pur);box-shadow:0 0 10px var(--pur)}
h1{font:800 27px/1.14 ${SANS};margin:8px 0 6px;letter-spacing:-.01em}.stand{font-size:14px;color:var(--tx2);margin:0 0 6px}
.beat{font:800 11px ${MONO};letter-spacing:.24em;color:var(--gold);text-transform:uppercase;margin:16px 0 8px;padding-top:8px;border-top:2px solid var(--pur);break-after:avoid;page-break-after:avoid}
.story{background:radial-gradient(420px 160px at 90% -10%,var(--glow),transparent 70%),var(--bg1);border:1px solid var(--line);border-radius:14px;padding:11px 14px 11px;margin:0 0 10px}
.story.keep{break-inside:avoid;page-break-inside:avoid}
.story h2{font:700 16px/1.25 ${SANS};margin:2px 0 7px;break-after:avoid;page-break-after:avoid}.lbl{font:700 9px ${MONO};letter-spacing:.16em;text-transform:uppercase;color:var(--tx3)}
.cols{display:grid;grid-template-columns:1.15fr 1fr;gap:14px;align-items:start}.cols.solo{grid-template-columns:1fr}
.story p{margin:0 0 7px;color:var(--tx2)}.story p:first-of-type{color:var(--tx)}
.fig{break-inside:avoid;page-break-inside:avoid}.how{font-size:10.5px;color:var(--tx3);margin:4px 0 0}.asof{font:600 8.5px ${MONO};letter-spacing:.06em;color:var(--tx3);margin-top:6px}
.chip{display:inline-block;font:700 8.5px ${MONO};letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--tx2);background:var(--bg2);margin:5px 5px 0 0}.chip.ev{color:var(--gold);border-color:var(--gold)}
.na{color:var(--tx3);font-style:italic}
.lt{display:grid;grid-template-columns:14px 1fr;column-gap:8px;padding:4px 0;border-bottom:1px solid var(--line);font-size:11.5px}.lt:last-child{border-bottom:0}.lt b{color:var(--tx)}.lt i{grid-column:2;font-style:normal;color:var(--tx3);font-size:10.5px}.dotl{width:9px;height:9px;border-radius:50%;margin-top:5px}
.rg{display:flex;gap:12px;align-items:center;margin:0 0 8px}.rg .q{font:800 19px ${MONO};color:var(--gold);letter-spacing:.04em}.rg span{color:var(--tx2);font-size:11.5px}
.cr{display:grid;grid-template-columns:40px 34px 1fr;column-gap:8px;padding:5px 0;border-bottom:1px solid var(--line);font-size:11.5px}.cr:last-child{border-bottom:0}.cr .tm{font:700 11px ${MONO};color:var(--gold)}.cr b{font:700 10px ${MONO};color:var(--tx2)}.cr i{grid-column:3;font-style:normal;color:var(--tx3)}.cr em{grid-column:3;font-style:normal;color:var(--tx2)}
.rt{width:100%;border-collapse:collapse;font:600 10.5px ${MONO};margin-top:6px}.rt td{padding:3px 5px;border-bottom:1px solid var(--line);color:var(--tx2)}.rt .bar{height:7px;border-radius:4px;background:var(--pur);display:block}
.duo{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:6px 0 4px}.duo>div{border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--bg2)}.duo b{font:800 12px ${MONO};color:var(--tx)}.duo .for{border-top:2px solid var(--up)}.duo .against{border-top:2px solid var(--dn)}.duo p{font-size:11.5px;margin:4px 0 0}
.h2h{margin:0 0 10px;break-inside:avoid;page-break-inside:avoid}.h2h .st{font:700 11px ${MONO};color:var(--tx);margin:0 0 4px}
.ccy{break-inside:avoid;page-break-inside:avoid;margin:0 0 9px;padding:7px 0 0;border-top:1px solid var(--line)}.ccy .nm{font:800 13px ${MONO};color:var(--tx)}.ccy .nm span{font-weight:600;color:var(--tx3);font-size:10px;margin-left:8px}
.mkt{break-inside:avoid;page-break-inside:avoid;margin:0 0 10px;padding:7px 0 0;border-top:1px solid var(--line)}.mkt .nm{font:800 13px ${MONO};color:var(--tx)}.mkt .nm span{font:700 9.5px ${MONO};letter-spacing:.1em;margin-left:8px;color:var(--gold)}.mkt .sum{font-size:11.5px;color:var(--tx2);margin:3px 0 5px}
.mkt .who{font:700 9px ${MONO};letter-spacing:.1em;text-transform:uppercase;color:var(--tx3)}
.lab{font:700 9px ${MONO};letter-spacing:.12em;text-transform:uppercase;margin:0 0 3px}.lab.up{color:var(--up)}.lab.dn{color:var(--dn)}
.foot{border:1px solid var(--line);border-radius:12px;padding:10px 12px;color:var(--tx3);font-size:10px;margin-top:10px;break-inside:avoid}.foot b{font:700 9.5px ${MONO};letter-spacing:.14em;color:var(--tx2)}
@media screen{body{padding:14px 0;background:#05070f}}
`;
const chipHtml = c => (c ? `<span class="chip ev">${esc(c.label)}: ${esc(c.verdict)}</span>` : '');
const paras = ps => (ps ?? []).map(p => `<p>${esc(p)}</p>`).join('');
function storyHtml(s) {
  if (s.na) return `<div class="story keep"><div class="lbl">${esc(s.title)}</div><p class="na">Not available when this issue was built: ${esc(s.na)}.</p></div>`;
  const fig = [];
  if (s.regime) fig.push(`<div class="rg"><div class="q">${esc(s.regime.name)}</div><span>growth ${esc(s.regime.growth)}, inflation ${esc(s.regime.inflation)}${s.regime.met != null ? ` · ${s.regime.met} of ${s.regime.of} lenses agree` : ''}</span></div>`);
  if (s.svg) fig.push(s.svg);
  if (s.lights) fig.push(s.lights.map(t => `<div class="lt"><span class="dotl" style="background:var(--${t.level === 'ok' ? 'up' : t.level === 'watch' ? 'gold' : 'dn'})"></span><b>${esc(t.label)} · ${LEVEL_WORD[t.level] ?? esc(t.level)}</b><i>${esc(t.detail)}</i></div>`).join(''));
  if (s.reach) fig.push(`<table class="rt"><tbody>${s.reach.map(r => `<tr><td>${r.k}σ up</td><td>${Math.round(r.upLevel).toLocaleString('en-GB')}</td><td style="width:22%"><span class="bar" style="width:${Math.round((r.upP ?? 0) * 100)}%"></span></td><td>${r.upP == null ? '–' : Math.round(r.upP * 100) + '%'}</td><td>${r.k}σ down</td><td>${Math.round(r.downLevel).toLocaleString('en-GB')}</td><td style="width:22%"><span class="bar" style="width:${Math.round((r.downP ?? 0) * 100)}%"></span></td><td>${r.downP == null ? '–' : Math.round(r.downP * 100) + '%'}</td></tr>`).join('')}</tbody></table>`);
  const figHtml = fig.length ? `<div class="fig">${fig.join('')}${s.how ? `<p class="how">${esc(s.how)}</p>` : ''}</div>` : '';
  const text = paras(s.paras) + (!figHtml && s.how ? `<p class="how">${esc(s.how)}</p>` : '') + (s.rows ? s.rows.map(r => `<div class="cr"><span class="tm">${esc(r.time)}</span><b>${esc(r.ccy)}</b><span>${esc(r.name)}</span><i>${esc(r.text)}</i>${r.drill ? `<em>${esc(r.drill)}</em>` : ''}</div>`).join('') : '');
  let extra = '';
  if (s.h2h) extra += s.h2h.map(h => `<div class="h2h"><div class="st">${esc(h.x)} against ${esc(h.y)}: ${esc(h.strength)}</div><div class="duo"><div class="for"><div class="lab up">Reasons ${esc(h.x)} could hold up</div><p>${esc(h.forX || 'The analysts made no separate case.')}</p></div><div class="against"><div class="lab dn">Reasons ${esc(h.y)} could struggle</div><p>${esc(h.againstY || 'The analysts made no separate case.')}</p></div></div></div>`).join('');
  if (s.ccys) extra += s.ccys.map(c => `<div class="ccy"><div class="nm">${esc(c.ccy)}<span>1W ${esc(fmt(c.w1))}σ${fin(c.h4) ? ` · 4H ${esc(fmt(c.h4))}σ` : ''}</span></div><div class="duo"><div class="for"><div class="lab up">Reasons it could be firm</div><p>${esc(c.up || 'No separate case was made.')}</p></div><div class="against"><div class="lab dn">Reasons it could be weak</div><p>${esc(c.dn || 'No separate case was made.')}</p></div></div></div>`).join('');
  if (s.markets) extra += s.markets.map(m => `<div class="mkt"><div class="nm">${esc(m.name)}<span>${esc(m.stance.toUpperCase())}</span></div><div class="sum">${esc(m.summary)}</div><div class="duo"><div class="for"><div class="lab up">Reasons it could rise</div>${m.rise.length ? m.rise.map(p => `<p><span class="who">${esc(p.who)}</span><br>${esc(p.text)}</p>`).join('') : '<p>No analyst argued for it.</p>'}</div><div class="against"><div class="lab dn">Reasons it could fall</div>${m.fall.length ? m.fall.map(p => `<p><span class="who">${esc(p.who)}</span><br>${esc(p.text)}</p>`).join('') : '<p>No analyst argued against it.</p>'}</div></div>${m.note ? `<p class="sum">The desk's note: ${esc(m.note)}</p>` : ''}</div>`).join('');
  const short = !(s.ccys || s.markets || s.h2h) && (s.paras ?? []).join('').length < 1300;
  const body = figHtml && !extra && !s.rows ? `<div class="cols"><div>${text}</div>${figHtml}</div>` : figHtml && s.rows ? `<div class="cols"><div>${text}</div>${figHtml}</div>` : `${text}${figHtml}${extra}`;
  return `<div class="story ${short ? 'keep' : ''}">${s.label ? `<div class="lbl">${esc(s.label)}</div>` : ''}<h2>${esc(s.title)}</h2>${body}${(s.chips ?? []).map(chipHtml).join('')}${s.asOf ? `<div class="asof">as of ${esc(s.asOf)}</div>` : ''}</div>`;
}
/** The whole issue as one self-contained HTML page: the poster is page 1, then the three beats. theme: 'dark' | 'light'. */
export function renderIssue(model, { theme = 'dark', posterSvg = null } = {}) {
  const light = theme === 'light', pal = light ? LIGHT_PAL : HEX_PAL;
  const head = `<div class="mh"><span class="dot"></span><b>THE CHAIN <i>// TERMINAL</i></b><span class="r">${esc(model.date)} · as at ${esc(model.asOf)}</span></div><h1>${esc(model.headline)}</h1><p class="stand">${esc(model.standfirst)}</p>`;
  let last = '', body = '';
  for (const s of model.stories) { if (s.beat !== last) { body += `<div class="beat">${esc(s.beat)}${s.beat === 'Yesterday' ? ': what happened and what the output was' : s.beat === 'Today' ? ': where things stand and why' : ': what history says about a day like this'}</div>`; last = s.beat; } body += storyHtml(s); }
  const title = `${new Date(model.asOfMs).toISOString().slice(0, 10)} The Chain Terminal`;
  const poster = `<div class="poster">${posterSvg ?? renderPoster(model, { palette: pal })}</div>`;
  return `<!doctype html><html lang="en" class="${light ? 'light' : 'dark'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${PAGE_CSS(pal, light)}</style></head><body><div class="doc">${poster}${head}${body}<div class="foot"><b>NOT FINANCIAL ADVICE</b> ${esc(DISCLAIMER_V2)}</div></div></body></html>`;
}

// ── the poster: the pictogram of the issue's key points (js/newsletterTermV2Poster.js) ─────────────────────────────────
export { wrapLines };
export const POSTER = { W: 1080, H: 1500 };
/** The poster SVG string (hard colours: it is an image). options.setups switches the desk's setups panel on (default off: it is a trade plan). */
export function renderPoster(model, { palette = HEX_PAL, setups = null } = {}) { return renderPosterV2(model, { palette, setups }).svg; }
export { renderPosterV2 };
export const capFit = (text, chars, lines) => { const out = []; for (const sn of P.sentences(text)) { const cand = [...out, sn].join(' '); if (wrapLines(cand, chars).length > lines) break; out.push(sn); } return out.length ? out.join(' ') : P.fit(P.sentences(text)[0] ?? '', chars * lines - 6); };

// ── the network part (the only one): the routes the terminal's own boards use ─────────────────────────────────────────
export const ROUTES = {
  S: '/api/ccy-strength', CV: '/api/replay/curve', VC: '/api/vol-clock', FED: '/api/fed-path', WS: '/api/world-stress', REG: '/api/regime-board', CAL: '/api/calendar-ahead',
  BUNDLE: '/api/drill-series', SCORE: '/api/desk-score', RUN: '/api/desk-run', FC: '/api/vol-forecast', OI: '/api/oi-store', RR: '/api/release-reactions',
  CRED: '/api/credit-board', FUND: '/api/funding-read?spark=0', GATE: '/api/liquidity-gate/live', BARS5: '/api/desk-bars?inst=NQ&tf=5m&days=2', BARS15: '/api/desk-bars?inst=NQ&tf=15m&days=14',
};
/** getJson(url) resolves to parsed JSON or throws; a failed route is null and its story says "not available". Returns { data, failed }. */
export async function fetchTerminalData(getJson) {
  const keys = Object.keys(ROUTES), res = await Promise.allSettled(keys.map(k => getJson(ROUTES[k]))), data = {}, failed = [];
  res.forEach((r, i) => { if (r.status === 'fulfilled' && r.value && r.value.ok !== false) data[keys[i]] = r.value; else { data[keys[i]] = null; failed.push(keys[i]); } });
  return { data, failed };
}
/** For Atlas: the model, the page (dark and light) and the poster SVG. */
export function composeTerminalV2(data, nowMs = Date.now()) {
  const model = buildModel(data, nowMs), poster = renderPoster(model);
  return { model, subject: `The Chain // Terminal ${new Date(model.asOfMs).toISOString().slice(0, 10)}`, html: renderIssue(model, { theme: 'dark', posterSvg: poster }), htmlLight: renderIssue(model, { theme: 'light', posterSvg: renderPoster(model, { palette: LIGHT_PAL }) }), posterSvg: poster, words: model.words };
}
