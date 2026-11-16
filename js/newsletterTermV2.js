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
import * as M from './newsletterTermV2More.js';
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

  // ───────────────────────────── shared pieces used by several stories ─────────────────────────────
  const calRows = [], seenCal = new Set();
  for (const r of (d.CAL?.rows ?? [])) {
    if (r.impact !== 'High' || !(r.ms >= nowMs - 3600e3) || r.ms > nowMs + 36 * 3600e3) continue;
    const kk = `${r.time}|${r.event}|${r.country}`; if (seenCal.has(kk)) continue; seenCal.add(kk);
    const sim = (() => { try { return similarReleases({ country: r.country, event: r.event }); } catch { return null; } })();
    calRows.push({ ms: r.ms, time: hhmm(r.ms), uk: lonHm(r.ms), hours: (r.ms - nowMs) / 3600e3, ccy: r.country, name: clean(r.event), text: `estimate ${r.estimate ?? 'n/a'}, previous ${r.prev ?? 'n/a'}`, drill: sim ? `In past prints the 30-minute move has typically been ${sim.medSpike} times an ordinary half-hour (${sim.events} prints); next-day direction was close to a coin flip.` : '' });
    if (calRows.length >= 6) break;
  }
  const winds = (d.FED?.windows ?? []).slice(0, 4);
  const teach = (key, tells) => ({ what: M.TEACH[key].what, why: M.TEACH[key].why, tells, unc: M.TEACH[key].unc });
  const FLIP_RE = /^(what would flip|the (?:named )?flip|the ruling flips)/i;

  // ───────────────────────────── AT A GLANCE ─────────────────────────────
  const strip = M.mastheadStrip(bundle, d.FC), eve = (d.ARCH?.issues ?? []).find(i => i.kind === 'desk-evening' && String(i.date) < ukDate(nowMs));
  if (strip) add({ id: 'strip', beat: 'At a glance', title: 'The key markets at the last close', strip: strip.map(r => ({ ...r, pctText: fmt(r.pct, 2) + '%', multText: r.mult.toFixed(1) + '×' })), paras: [eve?.subject ? para(`Yesterday in one line, from the evening edition: ${clean(eve.subject).replace(/^evening:\s*/i, '')}.`) : '', para(M.biggestLine(strip))].filter(Boolean),
    how: '× is the move divided by the market\'s forecast median day range (high to low), so 1× is a typical whole day.', chips: [ev('calendar-range-profile', 'Range size')].filter(Boolean), asOf: `closes to ${strip[0].date}` });
  if (calRows.length) add({ id: 'clock', beat: 'At a glance', title: 'On the clock (UK time)', rows: calRows.slice(0, 5).map(r => ({ time: r.uk, ccy: r.ccy, name: r.name, text: '', drill: '' })), how: 'High-impact releases in the next day and a half, in UK time. What each has done to markets before is under Coming up, later in the issue.', chips: [ev('surprise-size', 'Surprise size')].filter(Boolean), asOf });

  // ───────────────────────────── YESTERDAY ─────────────────────────────
  const sc = d.SCORE?.ok ? d.SCORE.score : null, rv = d.SCORE?.ok ? P.reviewProse(d.SCORE.reflection) : null, ct = M.contributions(sc);
  if (sc && fin(sc.S) && sc.placebo && fin(sc.placebo.mean)) {
    const pl = sc.placebo, where = sc.S > pl.p95 ? 'above' : 'inside', ps = [];
    ps.push(`The desk's morning read of ${sc.date} was scored against what prices actually did. It came out at ${fmt(sc.S, 2)} across ${sc.scored} markets. A random coin, run through the same scoring, averages ${fmt(pl.mean, 2)} and goes past ${fmt(pl.p95, 2)} one day in twenty, so the day finished ${where} the range a coin produces. One day is a thin sample, and this record has not been tested long enough to say whether it repeats.`);
    if (rv?.headline) ps.push(rv.headline);
    if (rv?.worked?.length) ps.push(`What worked: ${rv.worked.join(' ')}`);
    if (rv?.failed?.length) ps.push(`What did not: ${rv.failed.join(' ')}`);
    if (rv?.lessons?.length) ps.push(`The desk's own lessons for today: ${rv.lessons.join(' ')}`);
    add({ id: 'yesterday-score', beat: 'Yesterday', title: 'How the morning read did against the day', paras: ps.map(para).filter(Boolean), svg: G.scoreBand(CSS_PAL, { S: sc.S, mean: pl.mean, sd: pl.sd, p95: pl.p95 }), how: 'The bar is what a random coin scores; the dot is the desk.', chips: [{ label: 'Desk direction reads', verdict: 'CONTEXT, NOT A SIGNAL' }], asOf: `scored for ${sc.date}` });
    if (ct) add({ id: 'yesterday-contrib', beat: 'Yesterday', half: true, title: 'Which markets helped and which hurt the score', paras: [para(`${ct.helped} markets added to the score and ${ct.hurt} took from it. Each bar is one market's contribution (its result multiplied by its weight in the day's read); green helped, red hurt. It is a record of what happened, with no view on what comes next.`)].filter(Boolean), svg: M.contributionBars(CSS_PAL, { ...ct, rows: [...ct.rows.slice(0, 5), ...ct.rows.slice(-5)].filter((r, i, a) => a.findIndex(x => x.inst === r.inst) === i) }), how: 'Green helped, red hurt. Markets are labelled by name only.', asOf: `scored for ${sc.date}` });
  } else na('yesterday-score', 'Yesterday', 'How the morning read did against the day', 'the desk score was not available');
  if (rank?.rows?.length) {
    const rows = rank.rows.filter(r => !r.stale && r.moves?.[1]).sort((a, b) => b.moves[1].pct - a.moves[1].pct).slice(0, 8), top = rows[0];
    const bigN = rank.rows.filter(r => !r.stale && r.moves?.[1]?.pct >= 0.95).length;
    add({ id: 'yesterday-moves', beat: 'Yesterday', half: true, title: 'The moves that stood out', paras: [para(`${top.label} had the rarest one-day move in the daily market bundle: ${top.moves[1].text}, bigger than ${Math.round(top.moves[1].pct * 100)}% of its own one-day moves since ${top.from}. ${bigN} of ${rank.rows.length} series moved more than 19 days in 20 would; the rest of the list shows the other biggest moves. A rare move says the day was unusual for that market, not which way the next one will go.`)].filter(Boolean),
      svg: G.rankedBars(CSS_PAL, rows.map(r => ({ label: r.label, value: r.moves[1].pct, text: r.moves[1].text, hot: r.moves[1].pct >= 0.95 })), { ariaLabel: 'Yesterday\'s biggest one-day moves, ranked by how rare they were' }), how: 'A full bar is a move bigger than every other day in that series\' own record.', asOf: `closes to ${rank.refDate}` });
  } else na('yesterday-moves', 'Yesterday', 'The moves that stood out', 'the daily market bundle was not available');
  const past = (d.RR?.live ?? []).filter(r => r?.ms && r.ms <= nowMs && r.ms > nowMs - 30 * 3600e3 && r.surprise?.ok).slice(0, 6);
  if (past.length) add({ id: 'yesterday-events', beat: 'Yesterday', title: 'Releases that came out', paras: [para('These are the releases of the last day with their surprise against the estimate. The size of a surprise is measured against that release\'s own past surprises; the market reaction to each is on the Release Reaction page.')].filter(Boolean), rows: past.map(r => ({ time: hhmm(r.ms), ccy: r.ccy ?? r.country, name: clean(r.event), text: `${r.surprise.actual} against ${r.surprise.estimate} expected, ${r.surprise.size}` })), chips: [ev('surprise-size', 'Surprise size')].filter(Boolean), asOf: 'last 30 hours' });

  // ───────────────────────────── TODAY ─────────────────────────────
  const backdrop = di?.byTitle('backdrop');
  if (di && backdrop) {
    add({ id: 'backdrop', beat: 'Today', title: di.subject || 'The backdrop', paras: [para(P.withoutFlips(backdrop.body))].filter(Boolean), lights: ws.length ? ws.map(t => ({ label: t.label, level: t.level, detail: clean(t.detail) })) : null, regime: q ? { name: String(q.name ?? '').toUpperCase(), growth: q.growth, inflation: q.inflation, met: d.REG.overall?.met, of: d.REG.overall?.of } : null,
      how: `The seven lights are the stress gauges at ${asOf}: OK, WATCH or STRESS, each with its own number. The regime is the growth and inflation quadrant the lenses agree on.`, label: `The desk's ruling · ${backdrop.label ?? 'Model output'}`, chips: [{ label: 'Desk ruling', verdict: 'CONTEXT, NOT A SIGNAL' }], asOf: `desk run ${run?.date ?? ''}` });
  } else {
    const ps = [q ? para(`The regime reads ${String(q.name).toUpperCase()}: growth ${q.growth}, inflation ${q.inflation}. ${clean(q.why ?? '')}`) : ''].filter(Boolean);
    if (ps.length || ws.length) add({ id: 'backdrop', beat: 'Today', title: 'The backdrop', paras: ps, lights: ws.length ? ws.map(t => ({ label: t.label, level: t.level, detail: clean(t.detail) })) : null, how: 'The lights are OK, WATCH or STRESS for each gauge, with its own number.', asOf });
    else na('backdrop', 'Today', 'The backdrop', 'the desk run and the stress board were not available');
  }
  const bt = M.backdropTable(bundle, { winds, ws, stress: d.WS?.overall });
  if (bt) add({ id: 'backdrop-table', beat: 'Today', title: 'The backdrop: rates, credit, fear and the dollar', table: { head: ['Market', 'Now', 'As of', 'Last move', 'What it measures'], rows: bt.map(r => [r.name, r.now, r.asOf, r.chg || '–', r.measures]) }, teach: teach('backdrop', `Ten readings give the day's common language. The ${bt[0].name.toLowerCase()} is ${bt[0].now} (${bt[0].chg || 'no change'}) and the ${bt.find(r => /junk/i.test(r.name))?.name.toLowerCase() ?? 'credit spread'} reads ${bt.find(r => /junk/i.test(r.name))?.now ?? 'n/a'}.`), chips: [], asOf: `closes to ${bundle?.to ?? ''}` });
  const ym = M.yieldsMadeOf(bundle);
  if (ym) add({ id: 'yields', beat: 'Today', title: 'What the move in yields is made of', svg: M.yieldBar(CSS_PAL, ym), teach: teach('yields', `The 10-year yield ${ym.d10 >= 0 ? 'rose' : 'fell'} ${Math.abs(Math.round(ym.d10))}bp between ${ym.from} and ${ym.to}: the real yield ${M.signed(ym.dReal, 0, 'bp')} (${ym.shareReal}% of the move) and expected inflation ${M.signed(ym.dBei, 0, 'bp')} (${ym.shareBei}%). ${ym.textbook}`), asOf: `shared dates ${ym.from} to ${ym.to}` });

  let ccysStory = null;
  // currencies: strength, what the desk read says against what price did, the head-to-heads, then each currency with the ruling first
  const heat = G.heatStrip(CSS_PAL, S);
  if (heat) {
    const lead = order[0], lag = order.at(-1), h4 = S.horizons['4H'], cur2 = di?.byTitle('currenc'), dv = M.deskVsPrice(S, run);
    const tells = `Over a week ${lead} is the strongest currency (${fmt(sc1w[lead])}σ) and ${lag} the weakest (${fmt(sc1w[lag])}σ). ${h4?.available ? `Over the last four hours ${h4.leader} leads and ${h4.laggard} trails. ` : ''}${Object.values(S.horizons).some(h => h.sinceClose) ? 'A window marked "since close" starts at the Friday close because the market was shut at its start.' : ''}`;
    add({ id: 'strength', beat: 'Today', title: 'Which currencies are firm: what price says', svg: heat, teach: teach('strength', para(tells)), asOf });
    if (dv?.ok) add({ id: 'deskvs', beat: 'Today', title: 'Desk read against what price did', paras: [para(`These are two different things. The desk read is the analysts' morning view of each currency (-2 weak to +2 firm). The price read is what the candles did: firm when both the 4-hour and 1-day strength are at least +0.5σ, weak when both are at most −0.5σ. ${dv.line}`)].filter(Boolean),
      table: { head: ['Currency', 'Desk read', '4H price σ', '1D price σ', 'Price read', 'Desk and price'], rows: dv.rows.map(r => [r.ccy, r.bias == null ? 'none' : `${r.bias > 0 ? '+' : ''}${r.bias}`, M.signed(r.s4h, 1), M.signed(r.s1d, 1), r.read, r.state]) }, how: 'Where they disagree it is flagged in words; neither is a signal, and a disagreement says one view is early or late, not which is right.', chips: [{ label: 'Desk direction reads', verdict: 'CONTEXT, NOT A SIGNAL' }], asOf: `run ${run?.date ?? ''}` });
    const pairs = [[lead, lag]]; if (h4?.available && h4.leader && h4.laggard) pairs.push([h4.leader, h4.laggard]); if (cc?.ranking?.length > 1) pairs.push([cc.ranking[0], cc.ranking.at(-1)]);
    const seen = new Set(), h2h = pairs.filter(([x, y]) => x && y && x !== y && !seen.has(`${x}${y}`) && seen.add(`${x}${y}`)).slice(0, 3).map(([x, y]) => ({ x, y, strength: `${x} is ${fmt(sc1w[x])}σ over a week and ${fmt(sc4h?.[x] ?? NaN)}σ over four hours; ${y} is ${fmt(sc1w[y])}σ and ${fmt(sc4h?.[y] ?? NaN)}σ.`, bx: cc?.cases?.[x]?.bias, by: cc?.cases?.[y]?.bias }));
    add({ id: 'h2h', beat: 'Today', title: 'Head to head: the firmest against the weakest', h2h, how: 'Each pairing is strength first, then the desk bias of each side (-2 to +2).', asOf });
    if (cc) ccysStory = ({ id: 'ccys', beat: 'Today', title: 'Each currency: the desk\'s ruling, then the two cases', paras: [para('For each currency the desk\'s manager gave a ruling and a bias from -2 (weak) to +2 (firm). Under it are the two advocates\' arguments: one argued the currency could strengthen, the other that it could weaken. They are the advocates\' cases, not a verdict; where one side made no separate case, it says so.')].filter(Boolean),
      ccys: order.map(c => ({ ccy: c, w1: sc1w[c], h4: sc4h?.[c], bias: cc.cases[c].bias, conviction: cc.cases[c].conviction, ruling: para(sentencesUpTo(cc.cases[c].ruling, 240)), up: para(sentencesUpTo(cc.cases[c].up, 300)), dn: para(sentencesUpTo(cc.cases[c].dn, 300)) })), how: THINKING, chips: [{ label: 'Currency direction', verdict: 'CONTEXT, NOT A SIGNAL' }], asOf: `run ${run?.date ?? ''}` });
  } else na('strength', 'Today', 'Which currencies are firm: what price says', 'the strength route was not available');

  // rates: two exhibits side by side
  const rcb = P.analystHeadlines(run, ['rates_cb', 'yields_curve']).map(x => para(x.text)).filter(Boolean), cv = cur ? G.curveChart(CSS_PAL, cur, ghosts) : '', fedSvg = G.fedBars(CSS_PAL, winds);
  if (cv) add({ id: 'curve', beat: 'Today', half: true, title: 'The US curve against its own past shape', svg: cv, teach: teach('curve', [para(`The 2s10s slope is ${cur.data.s2s10 ?? 'n/a'}bp${ghosts[1]?.frame?.data?.s2s10 != null ? `, against ${ghosts[1].frame.data.s2s10}bp a month ago` : ''}; official prints, last close ${cur.t}.`), ...rcb.slice(0, 1)].filter(Boolean).join(' ')), asOf: `last close ${cur.t}` });
  else na('curve', 'Today', 'The US curve against its own past shape', 'the curve history was not available');
  if (fedSvg) add({ id: 'fed', beat: 'Today', half: true, title: 'What the Fed futures price', svg: fedSvg, teach: teach('fed', [para(`The market prices ${Math.round(winds[0].hike)}% for a rise by ${new Date(`${winds[0].ref}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}${winds[1] ? ` and ${Math.round(winds[1].hike)}% by ${new Date(`${winds[1].ref}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''}.`), ...rcb.slice(1, 2)].filter(Boolean).join(' ')), chips: [{ label: 'Rate path', verdict: 'PRICED, NOT FORECAST' }], asOf });
  else na('fed', 'Today', 'What the Fed futures price', 'the Fed path was not available');

  const dl = G.dialsGrid(CSS_PAL, tiles), vh = P.analystHeadlines(run, ['vol_iv']).map(x => para(x.text)).filter(Boolean);
  if (dl) add({ id: 'vol', beat: 'Today', half: true, title: 'How much of the day\'s range is already used', svg: dl, teach: teach('vol', [para(`${busy.sym} has used ${Math.round(busy.clock.used * 100)}% of its median forecast range after ${busy.clock.hours} hours of the London day.`), ...vh.slice(0, 1)].filter(Boolean).join(' ')), chips: [ev('calendar-range-profile', 'Range timing')].filter(Boolean), asOf });
  else na('vol', 'Today', 'How much of the day\'s range is already used', 'the vol clock was not available');
  if (rank?.rows?.length) {
    const top = rank.rows.slice(0, 8), ex = expectedByChance(rank.rows), dtext = clean(top[0].driver?.text ?? ''), pre = /^sits/.test(dtext) ? 'it' : 'its';
    add({ id: 'unusual', beat: 'Today', half: true, title: 'What is unusual right now', svg: G.rankedBars(CSS_PAL, top.map(r => ({ label: r.label, value: r.score, text: `${Math.round(r.score * 100)}th`, hot: r.score >= 0.95 })), { ariaLabel: 'The most unusual series, ranked by percentile' }),
      teach: teach('unusual', para(`${ex.hits} of ${ex.measures} readings sit at or beyond the 95th percentile, against about ${Math.round(ex.expected)} that chance alone would give, so ${ex.hits > ex.expected * 1.3 ? 'more is unusual than a normal day would show' : 'this is an ordinary day for the whole set'}. The most extreme is ${top[0].label}: ${pre} ${dtext}.`)), asOf: `closes to ${rank.refDate}` });
  }
  if (ccysStory) add(ccysStory);
  // markets: the analysts' tailwinds and headwinds, the stance first
  const mk = run ? P.marketBlocks(run, { limit: 8 }) : [];
  if (mk.length) add({ id: 'markets', beat: 'Today', title: 'The markets: reasons it could rise, reasons it could fall', paras: [para('For each market the desk\'s analysts made their case. A tailwind is a point that pushes the market up, a headwind a point that pushes it down; each comes from one analyst and is shown as they wrote it. The chip is the net of all their points, not a forecast. A market with strong points on both sides is a contested one.')].filter(Boolean), markets: mk.map(m => ({ ...m, rise: m.rise.map(x => ({ ...x, text: para(x.text) })).filter(x => x.text), fall: m.fall.map(x => ({ ...x, text: para(x.text) })).filter(x => x.text), note: para(m.note) })), how: THINKING, chips: [{ label: 'Market direction', verdict: 'CONTEXT, NOT A SIGNAL' }], asOf: `run ${run?.date ?? ''}` });
  else na('markets', 'Today', 'The markets: reasons it could rise, reasons it could fall', 'the desk run was not available');
  const rt = M.rangeTables(run, tiles);
  if (rt) add({ id: 'rangelines', beat: 'Today', title: 'Today\'s range lines, market by market', paras: [para('For every market the desk covers: where today\'s open sits and the price reach of the median, 75th and 90th percentile sessions either side. The compact diagram draws the same marks: the gold dot is the open, the bars are the p50, p75 and p90 lines each side, the darker the nearer.')].filter(Boolean), rangeGroups: rt, how: 'The lines show how far a normal, a big and a very big session reaches. They say nothing about which side is reached first.', chips: [ev('calendar-range-profile', 'Range'), ev('band-reach-from-here', 'Level reach')].filter(Boolean), asOf: `forecast ${d.FC?.session_date ?? run?.date ?? ''}` });

  if (calRows.length) add({ id: 'calendar', beat: 'Today', title: 'Coming up, and what each release did before', paras: [para(`These are the high-impact releases in the next day and a half. Under each is what that release has done to markets in the past, as a multiple of an ordinary half-hour and not as a direction, which has not been predictable from the release alone.${calRows.some(r => !r.drill) ? ' A release with no line under it has rarely moved markets more than an ordinary half-hour.' : ''}`)].filter(Boolean), rows: calRows.map(r => ({ time: r.uk, ccy: r.ccy, name: r.name, text: r.text, drill: r.drill })), svg: G.eventStrip(CSS_PAL, uniqEvents(calRows)), how: 'Times are UK time; the dots show how far away each release is.', chips: [ev('surprise-size', 'Surprise size')].filter(Boolean), asOf });
  else na('calendar', 'Today', 'Coming up, and what each release did before', 'no high-impact release in the next 36 hours, or the calendar was not available');
  const eco = M.economistBrief(run);
  if (eco) add({ id: 'economist', beat: 'Today', title: `The economist's brief${eco.event ? `: ${eco.event}` : ''}`, paras: [para(eco.headline)].filter(Boolean), briefParts: eco.parts.map(p => ({ label: p.label, text: para(p.text) })).filter(p => p.text), how: eco.thin ? 'The history for this release is too thin to quote typical moves; the counts are shown as counts.' : 'Taken from the desk run\'s economist: what is priced, how big and how fast the release has moved markets before, and the hot and cold counts.', chips: [ev('surprise-size', 'Surprise size')].filter(Boolean), asOf: `run ${run?.date ?? ''}` });
  const brk = di?.byTitle('break');
  if (brk) add({ id: 'break', beat: 'Today', title: 'What could break the day', paras: [para(P.withoutFlips(brk.body))].filter(Boolean), how: THINKING, label: brk.label, asOf: `run ${run?.date ?? ''}` });
  if (rul?.flips?.length) add({ id: 'flips', beat: 'Today', title: 'What could change the view', bullets: rul.flips.map(para).filter(Boolean), how: 'The conditions the desk named that would flip its ruling, each printed once.', asOf: `run ${run?.date ?? ''}` });
  if (rul?.gaps?.length) add({ id: 'unseen', beat: 'Today', title: 'What the desk could not see', bullets: rul.gaps.map(para).filter(Boolean), how: 'Feeds that were stale or missing this morning, so the analysis above rests on less than usual in those places.', asOf: `run ${run?.date ?? ''}` });

  // ───────────────────────────── WHAT COULD HAPPEN ─────────────────────────────
  const sym = 'NQ', fc = d.FC?.instruments?.[sym], bars5 = d.BARS5?.bars, price = bars5?.at(-1)?.close ?? null, lad = fc?.ladder;
  if (fc && lad?.oh && lad?.ol && fin(price)) {
    const today5 = (bars5 ?? []).filter(b => ukDate(b.time * 1000) === ukDate(nowMs)), open = today5.length ? today5[0].open : price, hi = today5.length ? Math.max(...today5.map(b => b.high)) : null, lo = today5.length ? Math.min(...today5.map(b => b.low)) : null;
    let rows = []; try { rows = ladderRows({ sym, fc, bars: bars5, nowMs }, [0.5, 1, 1.5, 2]); } catch { rows = []; }
    const one = rows.find(r => r.k === 1), shown = rows.filter(r => fin(r.up.p) || fin(r.down.p));
    add({ id: 'range', beat: 'What could happen', title: 'Nasdaq: the range a day like this usually covers', svg: G.rangeBand(CSS_PAL, { price, open, up: lad.oh, down: lad.ol, high: hi, low: lo }), reach: shown.length ? shown.map(r => ({ k: r.k, upLevel: r.up.level, upP: r.up.p, downLevel: r.down.level, downP: r.down.p })) : null,
      teach: teach('range', [para(`From the open, the median Nasdaq session reaches ${lad.oh.p50}% up and ${lad.ol.p50}% down; one session in four reaches ${lad.oh.p75}% up or ${lad.ol.p75}% down, and one in ten reaches ${lad.oh.p90}% up or ${lad.ol.p90}% down. Today the price is ${price.toLocaleString('en-GB', { maximumFractionDigits: 1 })} against an open of ${open.toLocaleString('en-GB', { maximumFractionDigits: 1 })}.`), one && fin(one.up.p) ? para(`Measured in the day's own σ, a move to ${Math.round(one.up.level).toLocaleString('en-GB')} (one σ up) has about a ${Math.round(one.up.p * 100)}% chance of being touched before the day ends, and a move to ${Math.round(one.down.level).toLocaleString('en-GB')} (one σ down) about ${Math.round((one.down.p ?? 0) * 100)}%.`) : ''].filter(Boolean).join(' ')), chips: [ev('calendar-range-profile', 'Range'), ev('band-reach-from-here', 'Level reach')].filter(Boolean), asOf: `price ${asOf}` });
  } else na('range', 'What could happen', 'Nasdaq: the range a day like this usually covers', 'the forecast or the price bars were not available');
  const paths = sessionPaths(d.BARS15?.bars, fc?.hl_median, nowMs);
  if (paths.past.length >= 3) add({ id: 'ghosts', beat: 'What could happen', half: true, title: 'Nasdaq: how the last sessions unfolded', paras: [para(`Each faint line is one of the last ${paths.past.length} London days, from its open, in units of today's forecast median range, so they lie on top of each other. ${paths.today ? `Today so far is ${fmt(paths.today.pts.at(-1)[1], 2)} of a median range from the open.` : 'Today has not started yet.'} The spread of the ghosts shows how different days can be from the same start; they show how big days have been, not which way the next one goes.`)].filter(Boolean), svg: G.ghostPaths(CSS_PAL, paths.past, paths.today), how: 'Faint violet lines are past sessions; gold is today.', asOf: `${paths.past[0].label} to ${paths.past.at(-1).label}` });
  const oiE = d.OI?.data?.NAS100_USD ?? d.OI?.NAS100_USD;
  if (oiE && fin(price)) {
    const unit = oiE.refMove?.move ?? null, lv = [['call wall', oiE.callWall], ['gamma flip', oiE.gexFlip], ['max pain', oiE.maxPain], ['put wall', oiE.putWall], ['snapshot spot', oiE.spot]].filter(x => fin(x[1])).map(([label, p]) => ({ label, price: p }));
    add({ id: 'levels', beat: 'What could happen', half: true, title: 'Nasdaq: option levels against the price', paras: [para(`The open-interest capture puts the call wall at ${Math.round(oiE.callWall).toLocaleString('en-GB')}, the put wall at ${Math.round(oiE.putWall).toLocaleString('en-GB')} and the gamma flip at ${Math.round(oiE.gexFlip).toLocaleString('en-GB')}. Price is ${fmt((oiE.callWall - price) / (unit || 1), 1)}σ below the call wall and ${fmt((price - oiE.putWall) / (unit || 1), 1)}σ above the put wall. Tests on this desk found these levels describe where price is, not where it will go.`)].filter(Boolean), svg: G.levelLadder(CSS_PAL, lv, price, unit), how: 'Dashed lines are option levels; gold is the price now; the note is the distance in σ.', chips: [ev('gex-range', 'Option levels')].filter(Boolean), asOf: `capture ${oiE.savedAt ?? 'saved'}` });
  }

  // ───────────────────────────── BACK PAGE ─────────────────────────────
  const qod = M.questionOfDay(ukDate(nowMs));
  if (qod) add({ id: 'question', beat: 'Back page', half: true, title: 'Question of the day', question: qod, how: 'Think it through first; yesterday\'s answer is below.', asOf: ukDate(nowMs) });
  add({ id: 'sources', beat: 'Back page', half: !!qod, title: 'Where this comes from', sources: M.sources(d, nowMs), how: 'Green is current for that feed, amber is older than it should be, grey is not available. Each chart also carries its own as-of.', asOf });

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
  if (x.sc && fin(x.sc.S) && x.sc.placebo) t.push({ id: 'yesterday', tag: 'YESTERDAY', head: `The morning read scored ${f(x.sc.S, 2)}, ${x.sc.S > x.sc.placebo.p95 ? 'above' : 'inside'} what a random coin produces`, cap: x.rank?.rows?.length ? `Rarest move: ${x.rank.rows.filter(r => !r.stale && r.moves?.[1]).sort((a, b) => b.moves[1].pct - a.moves[1].pct)[0]?.label ?? ''}.` : 'One day is a thin sample.', vis: { type: 'score', S: x.sc.S, mean: x.sc.placebo.mean, sd: x.sc.placebo.sd, p95: x.sc.placebo.p95 } });
  if (x.q || x.ws?.length) { const bad = (x.ws ?? []).filter(l => l.level !== 'ok').length; t.push({ id: 'setup', tag: 'TODAY', head: `${x.q ? String(x.q.name).toUpperCase() + ' regime' : 'Regime not available'}, ${bad} of ${(x.ws ?? []).length} stress gauges off OK`, cap: x.q ? `Growth ${x.q.growth}, inflation ${x.q.inflation}.` : '', vis: { type: 'lights', lights: x.ws ?? [] } }); }
  if (x.lead && x.lag) { const r = c => x.push?.[c], w = c => x.push?.[c]; t.push({ id: 'ccy', tag: 'CURRENCIES', head: `${x.lead} firmest, ${x.lag} weakest over a week`, cap: [r(x.lead), w(x.lag)].filter(Boolean).join(' '), vis: { type: 'duo', items: [{ label: x.lead, v: x.sc1w[x.lead] }, { label: x.lag, v: x.sc1w[x.lag] }] } }); }
  if (x.cur) t.push({ id: 'rates', tag: 'RATES', head: x.winds?.[0] ? `The Fed futures price ${Math.round(x.winds[0].hike)}% for a rise by ${new Date(`${x.winds[0].ref}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : 'The US curve against its past', cap: `2s10s at ${x.cur.data.s2s10 ?? 'n/a'}bp. Priced, not forecast.`, vis: { type: 'curve' } });
  if (x.lad && fin(x.price)) t.push({ id: 'could', tag: 'WHAT COULD HAPPEN', head: `A day like this usually covers about ${x.lad.oh.p50}% up and ${x.lad.ol.p50}% down on Nasdaq`, cap: `One session in ten goes ${x.lad.oh.p90}% up or ${x.lad.ol.p90}% down from the open.`, vis: { type: 'range' } });
  if (x.calRows?.length) { const r = x.calRows[0]; t.push({ id: 'risk', tag: 'THE EVENT', head: `${r.name} (${r.ccy}) at ${r.time} UTC`, cap: r.drill.replace(/\.$/, '').replace(/^In past prints t/, 'T'), vis: { type: 'events', items: uniqEvents(x.calRows) } }); }
  else if (x.busy) t.push({ id: 'risk', tag: 'THE RANGE', head: `${x.busy.sym} has used ${Math.round(x.busy.clock.used * 100)}% of its median range`, cap: 'Dials past the second tick mean a day bigger than nine in ten.', vis: { type: 'dial', tile: x.busy } });
  return t.slice(0, 7);
}
/** Words of prose: headings, paragraphs, teaching boxes, table text, captions, market/currency text and calendar text; chart labels and chips are not counted. */
export function proseWords(model) {
  let n = wordCount(model.headline) + wordCount(model.standfirst);
  for (const s of model.stories) {
    if (s.na) { n += wordCount(s.na); continue; }
    n += wordCount(s.title) + wordCount(s.how);
    for (const p of s.paras ?? []) n += wordCount(p);
    for (const b of s.bullets ?? []) n += wordCount(b);
    if (s.teach) n += wordCount(s.teach.what) + wordCount(s.teach.why) + wordCount(s.teach.tells) + wordCount(s.teach.unc);
    for (const r of s.table?.rows ?? []) n += wordCount(r[r.length - 1]);
    for (const r of s.rows ?? []) n += wordCount(r.name) + wordCount(r.text) + wordCount(r.drill);
    for (const h of s.h2h ?? []) n += wordCount(h.strength);
    for (const c of s.ccys ?? []) n += wordCount(c.ruling) + wordCount(c.up) + wordCount(c.dn);
    for (const m of s.markets ?? []) n += wordCount(m.summary) + wordCount(m.note) + [...m.rise, ...m.fall].reduce((a, p) => a + wordCount(p.text), 0);
    for (const p of s.briefParts ?? []) n += wordCount(p.text);
    if (s.question) n += wordCount(s.question.question) + wordCount(s.question.clue) + wordCount(s.question.prevAnswer);
  }
  return n;
}
/** Every text unit of the issue (paragraphs, bullets, teaching boxes, notes, cases) for the repeat guards. */
export function allUnits(model) {
  const out = []; const push = t => { if (t && String(t).trim()) out.push(String(t)); };
  push(model.standfirst);
  for (const s of model.stories) {
    if (s.na) continue;
    for (const p of s.paras ?? []) push(p); for (const b of s.bullets ?? []) push(b);
    if (s.teach) { push(s.teach.what); push(s.teach.why); push(s.teach.tells); push(s.teach.unc); }
    for (const r of s.rows ?? []) { push(r.text); push(r.drill); }
    for (const c of s.ccys ?? []) { push(c.ruling); push(c.up); push(c.dn); }
    for (const m of s.markets ?? []) { push(m.note); for (const p of [...m.rise, ...m.fall]) push(p.text); }
    for (const p of s.briefParts ?? []) push(p.text);
  }
  return out;
}
/** Every sentence of the issue (for the "no sentence printed twice" check). */
export function allSentences(model) { return allUnits(model).flatMap(u => P.sentences(u)); }

// ── HTML: A4 portrait, full-bleed, the poster first, then the written issue ───────────────────────────────────────────────
const PAGE_CSS = (pal, light) => `
:root{${Object.entries(pal).map(([n, v]) => `--${n}:${v}`).join(';')};--glow:${light ? 'rgba(91,75,216,.10)' : 'rgba(139,124,246,.16)'}}
*{box-sizing:border-box}html{background:var(--bg)}html,body{margin:0;color:var(--tx);-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font:11px/1.45 ${SANS};background:var(--bg)}
@page{size:A4 portrait;margin:0}
.doc{width:210mm;margin:0 auto;padding:11mm 12mm;background:var(--bg);box-decoration-break:clone;-webkit-box-decoration-break:clone}
.poster{margin:-11mm -12mm 0;width:210mm;height:297mm;break-after:page;page-break-after:always;background:var(--bg);overflow:hidden}.poster svg{display:block;width:210mm;height:297mm}
.mh{display:flex;align-items:center;gap:10px;font:700 10px ${MONO};letter-spacing:.18em;color:var(--tx2);padding-bottom:8px;border-bottom:1px solid var(--line);margin-bottom:10px}
.mh b{color:var(--tx)}.mh b i{font-style:normal;color:var(--gold)}.mh .r{margin-left:auto;color:var(--tx3);letter-spacing:.06em}
.dot{width:9px;height:9px;border-radius:50%;background:var(--pur);box-shadow:0 0 10px var(--pur)}
h1{font:800 27px/1.14 ${SANS};margin:8px 0 6px;letter-spacing:-.01em}.stand{font-size:14px;color:var(--tx2);margin:0 0 6px}
.beat{font:800 11px ${MONO};letter-spacing:.24em;color:var(--gold);text-transform:uppercase;margin:14px 0 8px;padding-top:8px;border-top:2px solid var(--pur);break-after:avoid;page-break-after:avoid}
.story{background:radial-gradient(420px 160px at 90% -10%,var(--glow),transparent 70%),var(--bg1);border:1px solid var(--line);border-radius:14px;padding:9px 12px 9px;margin:0 0 8px}
.story.long{break-inside:auto;page-break-inside:auto}
.story h2{font:700 16px/1.25 ${SANS};margin:2px 0 7px;break-after:avoid;page-break-after:avoid}.lbl{font:700 9px ${MONO};letter-spacing:.16em;text-transform:uppercase;color:var(--tx3);break-after:avoid;page-break-after:avoid}
.fig.sm svg{max-height:24mm;width:auto;max-width:100%}
.cols{display:grid;grid-template-columns:1.15fr 1fr;gap:14px;align-items:start}.cols .fig{break-inside:auto;page-break-inside:auto}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:stretch;break-inside:avoid;page-break-inside:avoid;margin:0 0 8px}.pair .story{margin:0}
.story p{margin:0 0 7px;color:var(--tx2)}.story p:first-of-type{color:var(--tx)}
.fig{break-inside:avoid;page-break-inside:avoid}.how{font-size:10.5px;color:var(--tx3);margin:4px 0 0}.asof{font:600 8.5px ${MONO};letter-spacing:.06em;color:var(--tx3);margin-top:6px}
.teach{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:6px 0 4px}.pair .teach{grid-template-columns:1fr 1fr}
.exh{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:12px;align-items:start}.exh .teach{grid-template-columns:1fr 1fr;margin:0}.exh .fig svg{max-height:78mm;max-width:100%}.pair .exh{grid-template-columns:1fr}.fig svg{max-width:100%}
.cg{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.cg .duo{grid-template-columns:1fr}.cg .ccy,.cg .mkt{margin:0 0 8px}
.tb td svg{width:110px;height:12px;display:block}.rgt .tb td{font-size:8.5px;padding:0 4px;line-height:1.25}.rgt .tb th{padding:2px 4px;font-size:7.5px}.rgt .tb tr{break-inside:avoid}.teach>div{border:1px solid var(--line);border-radius:10px;padding:7px 9px;background:var(--bg2)}
.teach b{display:block;font:700 8.5px ${MONO};letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-bottom:3px}.teach p{margin:0;font-size:10px;color:var(--tx2)}.teach p:first-of-type{color:var(--tx2)}
.chip{display:inline-block;font:700 8.5px ${MONO};letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--tx2);background:var(--bg2);margin:5px 5px 0 0}.chip.ev{color:var(--gold);border-color:var(--gold)}.chip.up{color:var(--up);border-color:var(--up)}.chip.dn{color:var(--dn);border-color:var(--dn)}
.na{color:var(--tx3);font-style:italic}.mute{color:var(--tx3);font-style:italic;font-size:11px}
.lt{display:grid;grid-template-columns:14px 1fr;column-gap:8px;padding:4px 0;border-bottom:1px solid var(--line);font-size:11.5px}.lt:last-child{border-bottom:0}.lt b{color:var(--tx)}.lt i{grid-column:2;font-style:normal;color:var(--tx3);font-size:10.5px}.dotl{width:9px;height:9px;border-radius:50%;margin-top:5px}
.rg{display:flex;gap:12px;align-items:center;margin:0 0 8px}.rg .q{font:800 19px ${MONO};color:var(--gold);letter-spacing:.04em}.rg span{color:var(--tx2);font-size:11.5px}
.cr{display:grid;grid-template-columns:40px 34px 1fr;column-gap:8px;padding:5px 0;border-bottom:1px solid var(--line);font-size:11.5px}.cr:last-child{border-bottom:0}.cr .tm{font:700 11px ${MONO};color:var(--gold)}.cr b{font:700 10px ${MONO};color:var(--tx2)}.cr i{grid-column:3;font-style:normal;color:var(--tx3)}.cr em{grid-column:3;font-style:normal;color:var(--tx2)}
.tb{width:100%;border-collapse:collapse;font-size:10.5px;margin:4px 0}.tb th{font:700 8.5px ${MONO};letter-spacing:.1em;text-transform:uppercase;color:var(--tx3);text-align:left;padding:3px 5px;border-bottom:1px solid var(--line)}.tb td{padding:3px 5px;border-bottom:1px solid var(--line);color:var(--tx2);vertical-align:top}.tb td:first-child{color:var(--tx);font-weight:700}.tb td.n{font-family:${MONO};white-space:nowrap}
.rt{width:100%;border-collapse:collapse;font:600 10.5px ${MONO};margin-top:6px}.rt td{padding:3px 5px;border-bottom:1px solid var(--line);color:var(--tx2)}.rt .bar{height:7px;border-radius:4px;background:var(--pur);display:block}
.duo{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:6px 0 4px}.duo.one{grid-template-columns:1fr}.duo>div{border:1px solid var(--line);border-radius:10px;padding:7px 10px;background:var(--bg2)}.duo .for{border-top:2px solid var(--up)}.duo .against{border-top:2px solid var(--dn)}.duo p{font-size:11.5px;margin:4px 0 0}
.h2h{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:6px 0}.h2h>div{border:1px solid var(--line);border-radius:10px;padding:7px 9px;background:var(--bg2);font-size:11px;color:var(--tx2)}.h2h b{font:800 12px ${MONO};color:var(--tx);display:block;margin-bottom:3px}
.ccy,.mkt{break-inside:avoid;page-break-inside:avoid;margin:0 0 9px;padding:7px 0 0;border-top:1px solid var(--line)}
.ccy .nm,.mkt .nm{font:800 13px ${MONO};color:var(--tx);display:flex;align-items:center;gap:10px;flex-wrap:wrap}.ccy .nm span,.mkt .nm span{font-weight:600;color:var(--tx3);font-size:10px}.mkt .nm .chip{margin:0}
.ruling{font-size:11.5px;color:var(--tx);margin:3px 0 4px}.mkt .sum{font-size:11.5px;color:var(--tx2);margin:3px 0 5px}.who{font:700 8.5px ${MONO};letter-spacing:.1em;text-transform:uppercase;color:var(--tx3)}
.lab{font:700 9px ${MONO};letter-spacing:.12em;text-transform:uppercase;margin:0 0 3px}.lab.up{color:var(--up)}.lab.dn{color:var(--dn)}
.rg2{margin:6px 0 2px;font:800 11px ${MONO};letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}.rline{font-size:10.5px;color:var(--tx3);margin:2px 0 4px}
.bl{margin:2px 0 4px;padding-left:18px;color:var(--tx2)}.bl li{margin:0 0 4px}
.src{display:grid;grid-template-columns:12px 1fr auto;gap:2px 8px;font-size:10.5px;align-items:center}.src .ld{width:9px;height:9px;border-radius:50%}.src span:nth-child(3n){color:var(--tx3);font-family:${MONO};font-size:9.5px}
.q1{font:700 13px/1.4 ${SANS};color:var(--tx);margin:0 0 6px}.q2{color:var(--tx2);font-size:11.5px;margin:0 0 8px}.q3{border-top:1px solid var(--line);padding-top:6px;font-size:11px;color:var(--tx3)}
.foot{border:1px solid var(--line);border-radius:12px;padding:10px 12px;color:var(--tx3);font-size:10px;margin-top:10px;break-inside:avoid}.foot b{font:700 9.5px ${MONO};letter-spacing:.14em;color:var(--tx2)}
@media screen{body{padding:14px 0;background:#05070f}.doc{box-shadow:0 0 0 1px var(--line)}}
`;
const chipHtml = c => (c ? `<span class="chip ev">${esc(c.label)}: ${esc(c.verdict)}</span>` : '');
const paras = ps => (ps ?? []).map(p => `<p>${esc(p)}</p>`).join('');
const dotCol = lv => `var(--${lv === 'ok' ? 'up' : lv === 'watch' ? 'gold' : 'dn'})`;
const teachHtml = t => (t ? `<div class="teach"><div><b>What you are looking at</b><p>${esc(t.what)}</p></div><div><b>Why it matters</b><p>${esc(t.why)}</p></div><div><b>What it tells us</b><p>${esc(t.tells)}</p></div><div><b>What is uncertain</b><p>${esc(t.unc)}</p></div></div>` : '');
const tableHtml = t => `<table class="tb"><thead><tr>${t.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map((c, i) => `<td${i > 0 && i < r.length - 1 ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const stancePair = (up, dn, upLab, dnLab, none) => {
  if (!up && !dn) return `<p class="mute">${esc(none)}</p>`;
  const side = (t, lab, cls, box) => `<div class="${box}"><div class="lab ${cls}">${esc(lab)}</div><p>${t}</p></div>`;
  if (up && dn) return `<div class="duo">${side(up, upLab, 'up', 'for')}${side(dn, dnLab, 'dn', 'against')}</div>`;
  return `<div class="duo one">${up ? side(up, upLab, 'up', 'for') : side(dn, dnLab, 'dn', 'against')}</div><p class="mute">${esc(up ? `No separate case was made for the other side.` : `No separate case was made for the other side.`)}</p>`;
};
function storyHtml(s) {
  if (s.na) return `<div class="story"><div class="lbl">${esc(s.title)}</div><p class="na">Not available when this issue was built: ${esc(s.na)}.</p></div>`;
  const fig = [];
  if (s.regime) fig.push(`<div class="rg"><div class="q">${esc(s.regime.name)}</div><span>growth ${esc(s.regime.growth)}, inflation ${esc(s.regime.inflation)}${s.regime.met != null ? ` · ${s.regime.met} of ${s.regime.of} lenses agree` : ''}</span></div>`);
  if (s.svg) fig.push(s.svg);
  if (s.lights) fig.push(s.lights.map(t => `<div class="lt"><span class="dotl" style="background:${dotCol(t.level)}"></span><b>${esc(t.label)} · ${LEVEL_WORD[t.level] ?? esc(t.level)}</b><i>${esc(t.detail)}</i></div>`).join(''));
  if (s.reach) fig.push(`<table class="rt"><tbody>${s.reach.map(r => `<tr><td>${r.k}σ up</td><td>${Math.round(r.upLevel).toLocaleString('en-GB')}</td><td style="width:22%"><span class="bar" style="width:${Math.round((r.upP ?? 0) * 100)}%"></span></td><td>${r.upP == null ? '–' : Math.round(r.upP * 100) + '%'}</td><td>${r.k}σ down</td><td>${Math.round(r.downLevel).toLocaleString('en-GB')}</td><td style="width:22%"><span class="bar" style="width:${Math.round((r.downP ?? 0) * 100)}%"></span></td><td>${r.downP == null ? '–' : Math.round(r.downP * 100) + '%'}</td></tr>`).join('')}</tbody></table>`);
  const figHtml = fig.length ? `<div class="fig${s.id === 'calendar' ? ' sm' : ''}">${fig.join('')}${s.how && !s.teach ? `<p class="how">${esc(s.how)}</p>` : ''}</div>` : '';
  let text = paras(s.paras);
  if (s.bullets) text += `<ul class="bl">${s.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`;
  if (s.rows) text += s.rows.map(r => `<div class="cr"><span class="tm">${esc(r.time)}</span><b>${esc(r.ccy)}</b><span>${esc(r.name)}</span><i>${esc(r.text)}</i>${r.drill ? `<em>${esc(r.drill)}</em>` : ''}</div>`).join('');
  if (s.strip) text += `<table class="tb"><thead><tr><th>Market</th><th>Last close</th><th>Move</th><th>× a normal day</th></tr></thead><tbody>${s.strip.map(r => `<tr><td>${esc(r.name)}</td><td class="n">${esc(r.last >= 1000 ? Math.round(r.last).toLocaleString('en-GB') : r.last >= 10 ? r.last.toFixed(2) : r.last.toFixed(4))}</td><td class="n" style="color:var(--${r.pct >= 0 ? 'up' : 'dn'})">${esc(r.pctText)}</td><td class="n">${esc(r.multText)}</td></tr>`).join('')}</tbody></table>`;
  if (s.table) text += tableHtml(s.table);
  if (s.briefParts) text += s.briefParts.map(p => `<p><span class="who">${esc(p.label)}</span><br>${esc(p.text)}</p>`).join('');
  if (s.question) text += `<p class="q1">${esc(s.question.question)}</p><p class="q2">${esc(s.question.clue)}</p>${s.question.prevAnswer ? `<div class="q3"><b>Yesterday's question:</b> ${esc(s.question.prevQuestion)}<br><b>Answer:</b> ${esc(s.question.prevAnswer)}</div>` : ''}`;
  if (s.sources) text += `<div class="src">${s.sources.map(x => `<span class="ld" style="background:var(--${x.dot === 'green' ? 'up' : x.dot === 'amber' ? 'gold' : 'tx3'})"></span><span>${esc(x.label)} <span class="mute">via ${esc(x.via)}</span></span><span>${esc(x.asOf)}</span>`).join('')}</div>`;
  let extra = '';
  if (s.h2h) extra += `<div class="h2h">${s.h2h.map(h => `<div><b>${esc(h.x)} against ${esc(h.y)}</b>${esc(h.strength)}<br>Desk read: ${esc(h.x)} ${h.bx == null ? 'n/a' : (h.bx > 0 ? '+' : '') + h.bx}, ${esc(h.y)} ${h.by == null ? 'n/a' : (h.by > 0 ? '+' : '') + h.by}.</div>`).join('')}</div>`;
  if (s.ccys) extra += '<div class="cg">' + s.ccys.map(c => `<div class="ccy"><div class="nm">${esc(c.ccy)}${G.biasBar(CSS_PAL, c.bias)}<span>desk ${c.bias > 0 ? '+' : ''}${c.bias}${c.conviction ? ` · ${esc(c.conviction)} conviction` : ''} · price 1W ${esc(fmt(c.w1))}σ${fin(c.h4) ? ` · 4H ${esc(fmt(c.h4))}σ` : ''}</span></div>${c.ruling ? `<p class="ruling">${esc(c.ruling)}</p>` : ''}${stancePair(esc(c.up), esc(c.dn), 'Argued: it could strengthen', 'Argued: it could weaken', 'No separate case was made for either side.')}</div>`).join('') + '</div>';
  if (s.markets) extra += '<div class="cg">' + s.markets.map(m => `<div class="mkt"><div class="nm">${esc(m.name)}<span class="chip ${m.net > 0 ? 'up' : m.net < 0 ? 'dn' : ''}">${esc(m.stance)}${m.strength !== 'none' ? ` · ${esc(m.strength)}` : ''}</span></div><div class="sum">${esc(m.summary)}</div>${stancePair(m.rise.map(p => `<span class="who">${esc(p.who)}</span><br>${esc(p.text)}`).join('<br>'), m.fall.map(p => `<span class="who">${esc(p.who)}</span><br>${esc(p.text)}`).join('<br>'), 'Reasons it could rise', 'Reasons it could fall', 'No analyst made a case either way.')}${m.note ? `<p class="mute">The desk's note: ${esc(m.note)}</p>` : ''}</div>`).join('') + '</div>';
  if (s.rangeGroups) extra += '<div class="rgt">' + s.rangeGroups.map(g => `<div class="rg2">${esc(g.label)}</div><p class="rline">${esc(g.line)}</p><table class="tb"><thead><tr><th>Market</th><th>Open</th><th>Up p50 · p75 · p90</th><th>Down p50 · p75 · p90</th><th>Range lines</th></tr></thead><tbody>${g.rows.map(r => `<tr><td>${esc(r.name)}${r.tag ? ` <span class="mute">${esc(r.tag)}</span>` : ''}</td><td class="n">${esc(M.px(r.lv.open))}</td><td class="n">${[r.lv.up.p50, r.lv.up.p75, r.lv.up.p90].map(v => esc(M.px(v))).join(' · ')}</td><td class="n">${[r.lv.down.p50, r.lv.down.p75, r.lv.down.p90].map(v => esc(M.px(v))).join(' · ')}</td><td>${M.rangeLine(CSS_PAL, r.lv)}</td></tr>`).join('')}</tbody></table>`).join('') + '</div>';
  const exh = figHtml && s.teach && !s.half;
  const body = exh ? `<div class="exh"><div>${text}${figHtml}</div>${teachHtml(s.teach)}</div>` : figHtml && !extra && !s.rows && !s.table && !s.teach && !s.strip && !s.briefParts && !s.question && !s.sources && !s.half ? `<div class="cols"><div>${text}</div>${figHtml}</div>` : `${text}${figHtml}${s.teach ? teachHtml(s.teach) : ''}${extra}`;
  const long = !!(s.ccys || s.markets || s.rangeGroups);
  return `<div class="story ${long ? 'long' : ''}">${s.label ? `<div class="lbl">${esc(s.label)}</div>` : ''}<h2>${esc(s.title)}</h2>${body}${s.teach && s.how ? `<p class="how">${esc(s.how)}</p>` : ''}${!figHtml && !s.teach && s.how ? `<p class="how">${esc(s.how)}</p>` : ''}${(s.chips ?? []).map(chipHtml).join('')}${s.asOf ? `<div class="asof">as of ${esc(s.asOf)}</div>` : ''}</div>`;
}
const BEAT_NOTE = { 'At a glance': ': the key markets and the clock', Yesterday: ': what happened and what the output was', Today: ': where things stand and why', 'What could happen': ': what history says about a day like this', 'Back page': ': a question and where the figures come from' };
/** The whole issue as one self-contained HTML page: the poster is page 1 (full bleed), then the beats flow across A4 pages. theme: 'dark' | 'light'. */
export function renderIssue(model, { theme = 'dark', posterSvg = null } = {}) {
  const light = theme === 'light', pal = light ? LIGHT_PAL : HEX_PAL;
  const head = `<div class="mh"><span class="dot"></span><b>THE CHAIN <i>// TERMINAL</i></b><span class="r">${esc(model.date)} · as at ${esc(model.asOf)}</span></div><h1>${esc(model.headline)}</h1><p class="stand">${esc(model.standfirst)}</p>`;
  let last = '', body = '', i = 0; const st = model.stories;
  while (i < st.length) {
    const s = st[i];
    if (s.beat !== last) { body += `<div class="beat">${esc(s.beat)}${BEAT_NOTE[s.beat] ?? ''}</div>`; last = s.beat; }
    if (s.half && st[i + 1]?.half && st[i + 1].beat === s.beat && !s.na && !st[i + 1].na) { body += `<div class="pair">${storyHtml(s)}${storyHtml(st[i + 1])}</div>`; i += 2; } else { body += storyHtml(s); i += 1; }
  }
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
  BUNDLE: '/api/drill-series', ARCH: '/api/newsletter/archive', SCORE: '/api/desk-score', RUN: '/api/desk-run', FC: '/api/vol-forecast', OI: '/api/oi-store', RR: '/api/release-reactions',
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
