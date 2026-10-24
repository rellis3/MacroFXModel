/**
 * Plain-English reading of the numbers in the magazine edition. Everything here is a sentence built from the issue's own data, so the words and the figures cannot drift apart.
 * Nothing here is a model, a threshold or a forecast: it states what a figure is, why it matters and what it says about today, and it says what is uncertain.
 *
 * Three voices are kept apart wherever they appear:
 *   FACT          what the data directly shows
 *   INTERPRETATION what it might mean, and why
 *   UNCERTAINTY    what is missing, stale, statistically thin or open to another reading
 *
 * Pure. Tested in js/newsletterExplain.test.mjs.
 */
import { nodeMoves } from './macroTheories.js';

const MINUS = '−';
export const pct = (v, d = 1) => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(d)}%`;
export const bp = v => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(Math.round(v))}bp`;
const abs = v => Math.abs(Math.round(v));
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const lc = s => (s ? s.charAt(0).toLowerCase() + s.slice(1) : '');
const list = a => a.length < 2 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`;
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const word = n => NUM[n] ?? String(n);
const day = d => { const t = Date.parse(`${d}T00:00:00Z`); return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : d; };

/* ───────────────────────────── 1. the opening, in plain terms ───────────────────────────── */

/** Three short blocks the reader meets before any analysis: what happened (fact), why it might be happening (interpretation), what cannot be confirmed (uncertainty). */
export function storyIntro({ ys, links, checks, gdpnow }) {
  const m = nodeMoves(links), fact = [], why = [], unsure = [];
  const down = k => m[k]?.moved && m[k].dir === 'down', up = k => m[k]?.moved && m[k].dir === 'up';
  const realFell = Number.isFinite(ys?.dReal) ? ys.dReal <= -8 : down('real');
  if (Number.isFinite(ys?.dNom) && ys.dNom !== 0) {
    const share = Number.isFinite(ys.dReal) && ys.dNom ? Math.round(100 * ys.dReal / ys.dNom) : null;
    fact.push(`The US 10-year yield, what the government pays to borrow for ten years, ${ys.dNom < 0 ? 'fell' : 'rose'} ${abs(ys.dNom)}bp over the last 20 days.${share != null && share >= 50 ? ` About ${share}% of that is the real yield, the part left after allowing for inflation, and the rest is expected inflation.` : ''}`);
  }
  if (realFell) fact.push('A falling real yield normally helps gold and growth shares such as the Nasdaq, because it lowers the return on safe alternatives.');
  const hit = [down('nq') && `the Nasdaq fell ${pct(Math.abs(m.nq.delta)).replace('+', '')}`, down('gold') && `gold fell ${pct(Math.abs(m.gold.delta)).replace('+', '')}`].filter(Boolean);
  if (realFell && hit.length) fact.push(`This time ${list(hit)}${up('hy') ? `, and the extra interest that riskier companies pay over government bonds rose ${abs(m.hy.delta)}bp` : ''}.`);
  else if (up('hy')) fact.push(`The extra interest that riskier companies pay over government bonds rose ${abs(m.hy.delta)}bp.`);

  if (realFell && hit.length && up('hy')) why.push('One way to read that mix is a growth scare. Yields fall because investors expect a weaker economy, not because money has become easier. Shares and gold then do not benefit, and lenders ask for more to lend to weaker companies.');
  else if (realFell && hit.length) why.push('Yields fell without the usual lift to gold and shares, so something other than easier money is moving prices.');
  why.push('That is one of four explanations the issue tests, and several of them fit the same moves. The evidence in these pages cannot yet choose between them.');

  const dol = (checks ?? []).find(c => c.id === 'dollar');
  if (dol?.facts) unsure.push(`The dollar claim is unconfirmed. The broad dollar index used here last printed on ${day(dol.facts.asOf)}, ${dol.facts.days} days before the other data, and on daily data the dollar is stronger against only ${dol.facts.stronger} of ${dol.facts.n} major currencies. So the idea that investors are rushing into dollars for safety cannot be checked yet.`);
  else if ((checks ?? []).length) unsure.push('Some series in this issue stop earlier than the rest, so a few comparisons cover different windows. They are flagged where they appear.');
  if (Number.isFinite(gdpnow) && gdpnow >= 2 && why.length) unsure.push(`The Atlanta Fed's estimate of current growth is ${(+gdpnow).toFixed(1)}%, which does not show a slowdown in the quarter being measured. A growth scare is a worry about later, and it is the main fact here that does not fit it.`);
  return { fact, why, unsure };
}

/* ───────────────────────────── 2. the yield decomposition ───────────────────────────── */

export function yieldGuide(ys, links) {
  if (!Number.isFinite(ys?.dNom) || !Number.isFinite(ys?.dReal)) return null;
  const m = nodeMoves(links), share = ys.dNom ? Math.round(100 * ys.dReal / ys.dNom) : null, realLed = share != null && share >= 60, infLed = Number.isFinite(ys.dBei) && ys.dNom && Math.abs(ys.dBei / ys.dNom) >= 0.6;
  const hit = [m.gold?.moved && m.gold.dir === 'down' && `gold (${pct(m.gold.delta)})`, m.nq?.moved && m.nq.dir === 'down' && `the Nasdaq (${pct(m.nq.delta)})`].filter(Boolean);
  return {
    looking: 'The 10-year Treasury yield is what the US government pays to borrow for ten years. It has two parts. The real yield is what lenders earn after inflation, and expected inflation is what the market thinks prices will do. The lines show how much each part has moved since 20 days ago.',
    matters: 'Real yields are the main pull on gold and growth shares. Gold pays no interest and growth companies earn their profits far in the future, so both look worse when the real yield rises and better when it falls.',
    tells: realLed ? `${share}% of the fall is the real yield. That points to a change in growth or interest-rate expectations, not to inflation worries. It should have helped gold and growth shares${hit.length ? `, yet ${list(hit)} fell` : ''}. That contradiction is what the rest of the issue is about.`
      : infLed ? `Most of the move is expected inflation, so the bond market is changing its view on prices, not on the cost of money.` : `The move is shared between real yields and expected inflation, so it does not point clearly to one cause.`,
    unsure: ys.later ? `Expected inflation printed again on ${day(ys.later.date)}, a day after the other two. The figure uses the shared date so the parts add up.` : '',
  };
}

/* ───────────────────────────── 3. the relationship network ───────────────────────────── */

/** Reconcile the counts: defined, measurable, judged, broken, and what the others are. lagKeys = series that stop earlier than the rest. */
export function chainCounts(links, lagKeys = []) {
  const L = links ?? [], by = v => L.filter(l => l.verdict === v), lag = new Set(lagKeys);
  const judged = L.filter(l => l.verdict === 'holding' || l.verdict === 'broken'), timing = judged.filter(l => lag.has(l.a?.key) || lag.has(l.b?.key));
  return { defined: L.length, unmeasured: by('unmeasured').length, measurable: L.length - by('unmeasured').length, quiet: by('quiet').length, judged: judged.length, holding: by('holding').length, broken: by('broken').length, timing: timing.length, timingBroken: timing.filter(l => l.verdict === 'broken') };
}

export function chainGuide(links, lagKeys = []) {
  const c = chainCounts(links, lagKeys);
  return {
    c,
    looking: 'Each box is a market and each arrow a textbook link: if this moves, that should follow. The desk checks every link on the last 20 days. A link is judged only if both ends moved by more than their normal day-to-day noise.',
    counts: `${c.defined} links are defined. ${c.unmeasured ? `${c.unmeasured} cannot be measured today because a data series is missing, leaving ${c.measurable}. ` : ''}${c.quiet} of those are quiet, meaning at least one end barely moved, so there is nothing to judge. That leaves ${c.judged} judged: ${c.holding} behaved as the textbook says and ${c.broken} did not.`,
    matters: 'A link that holds tells us the usual transmission is working. A link that breaks means something else is moving that market harder than the usual cause, and that is where a new story usually starts.',
    tells: c.broken ? `${c.broken} of ${c.judged} judged links broke. That is a lot in one window, and it is why the issue asks what the textbook is missing. A break describes 20 days and is not a signal on its own.` : 'No judged link broke, so the textbook is working today.',
    unsure: c.timing ? `${c.timing} of the ${c.judged} judged links use a series that stops earlier than the others${c.timingBroken.length ? `, ${c.timingBroken.length} of them among the breaks (${list(c.timingBroken.map(l => `${l.a.label} to ${l.b.label}`))})` : ''}. Those compare different windows, so a break there may be timing, not market behaviour.` : '',
  };
}

/** One broken relationship in four plain parts. status: 'diverging' (clean) | 'timing' (an end stops earlier than the other, so the break is unconfirmed). */
export function relationNote(l, def, lagging = []) {
  const lag = lagging.filter(x => x.key === l.a.key || x.key === l.b.key);
  const together = l.sign > 0;
  const status = lag.length ? 'timing' : 'diverging';
  return {
    status,
    normal: `${def?.textbook ? def.textbook.replace(/[.\s]+$/, '') : `${l.a.label} drives ${l.b.label}`}. So they should move ${together ? 'in the same direction' : 'in opposite directions'}.`,
    observed: `${l.a.label} ${l.a.text} and ${l.b.label} ${l.b.text}.`,
    why: def?.broken?.[l.a.dir] ?? '',
    caveat: lag.length ? `${list(lag.map(x => x.label))} last printed ${day(x0(lag).asOf)}, ${x0(lag).days} days before the rest, so the two lines cover different windows and the break is unconfirmed.` : '',
  };
}
const x0 = a => a[0];

/* ───────────────────────────── 4. the stress dashboard ───────────────────────────── */

const thr = f => { const m = /flag\s*(?:at\s*)?[≥≤]\s*[+−-]?\s*([\d.]+)/.exec(f.detail ?? ''); return m ? +m[1] : null; };

/** The broad stress warnings against the narrower watched conditions, and what would change the reading. */
export function stressRead(riskFlags, watching, links) {
  if (!riskFlags) return null;
  const flags = (riskFlags.flags ?? []).map(f => ({ label: f.label, detail: f.detail ?? '', state: f.on === true ? 'on' : f.on === false ? 'off' : 'na', share: f.on === false && thr(f) && Number.isFinite(f.value) ? Math.max(0, f.value) / thr(f) : null }));
  const w = watching ?? [], chain = w.filter(x => /^chain link broken/i.test(x.label)), setup = w.filter(x => /^setup watch/i.test(x.label)), other = w.filter(x => !/^chain link broken/i.test(x.label) && !/^setup watch/i.test(x.label));
  const active = riskFlags.active ?? 0, measured = flags.filter(f => f.state !== 'na').length, closest = flags.filter(f => f.share != null).sort((a, b) => b.share - a.share)[0];
  const verdict = active === 0 ? (w.length ? 'Isolated warning signs, no broad stress event' : 'Calm') : active === 1 ? 'One broad signal is on' : 'Broad stress is building';
  const parts = [chain.length && `${word(chain.length)} ${chain.length === 1 ? 'is a broken market relationship' : 'are broken market relationships'}`, setup.length && `${word(setup.length)} ${setup.length === 1 ? 'is a setup watch, a pattern the desk monitors, and none says which way prices will go' : 'are setup watches, patterns the desk monitors, and none says which way prices will go'}`, other.length && `${word(other.length)} ${other.length === 1 ? 'is background context such as slow-moving credit data' : 'are background context such as slow-moving credit data'}`].filter(Boolean);
  return {
    verdict, flags, active, measured, total: riskFlags.total ?? flags.length, available: flags.length, watched: w.length,
    split: parts.length ? `Of the ${w.length} watched conditions, ${list(parts)}.` : '',
    why: `The broad warnings measure stress across the whole market: fear levels, the price of insurance, how fast credit is widening, the yen and the link between stocks and bonds. The watched conditions are narrower, one market or one relationship each, so several can fire while the broad five stay off.`,
    closest: closest ? `The closest to tripping is "${closest.label}", at about ${Math.round(100 * closest.share)}% of its trigger.` : '',
    change: active === 0 ? 'The overall reading changes if any of the five broad warnings trips. Each row shows the level that does it.' : 'Each row shows the level that trips it.',
    na: flags.filter(f => f.state === 'na').length ? `${cap(word(flags.filter(f => f.state === 'na').length))} of the ${flags.length} warnings cannot be measured today, so the dial counts ${active} of ${measured}, not of ${flags.length}.` : '',
  };
}

/* ───────────────────────────── 5. the forecast audit ───────────────────────────── */

export function auditGuide(record) {
  const s = record?.score, wk = record?.week, med = s?.median ?? wk?.median, past = s?.pastShare ?? wk?.pastShare;
  if (med == null) return null;
  const lean = med < 0.9 ? 'Days came in smaller than the forecast on average, so the ranges were a little too wide.' : med > 1.1 ? 'Days came in larger than the forecast on average, so the ranges were a little too narrow.' : 'The median day was close to the forecast size, which is what a calibrated forecast looks like.';
  const n = s ? `${s.rows?.length ?? ''} markets from one issue` : `${wk.n} market-days from ${wk.days} daily issues`;
  return {
    looking: 'Each issue prints how big a normal day should be for every market. This page checks those sizes against what happened. It measures how big the moves were, not which way they went.',
    matters: 'If the sizes are reliable, the ranges in the issue are a fair guide to what a normal day looks like. If they are not, they should be trusted less.',
    tells: `${lean} ${past}% of markets ran past the expected size, against about half for a well-calibrated forecast.`,
    unsure: `This is ${n}. That is too few to judge bias, and a forecast can look good or bad over a short run by chance.`,
    direction: 'The directional read is scored separately. In the desk\'s own tests, calls about direction made from price patterns are close to a coin flip, so a poor score there is expected and says nothing about the size forecast.',
  };
}

/* ───────────────────────────── 6. positioning ───────────────────────────── */

export function positioningGuide(posList, ageDays) {
  const L = posList ?? []; if (!L.length) return null;
  const most = L.slice(0, 3).map(c => `${c.name ?? c.sym} (${c.state}, ${ordinal(c.pct)} percentile)`);
  return {
    looking: 'Every week the US regulator publishes how large speculators, mainly funds, are positioned in futures. The gauges show where each position sits against its own history. The ends mean unusually crowded.',
    matters: 'A crowded position has the most to lose if the market moves against it, so it shows who may be forced to act. It does not say which way the market will go.',
    tells: `The most stretched positions are ${list(most)}. If a market moves hard against a crowded position, those holders are the ones with the most pressure to sell or buy back.`,
    unsure: `The report covers a Tuesday and is published the Friday after${Number.isFinite(ageDays) ? `, so this one is ${ageDays} days old` : ''}. It tracks speculators in futures, not every trader. The desk's own test found it does not predict direction, so it is shown as context.`,
  };
}
const ordinal = n => { const v = Math.round(n), s = ['th', 'st', 'nd', 'rd'], t = v % 100; return `${v}${s[(t - 20) % 10] || s[t] || s[0]}`; };

/* ───────────────────────────── 7. the Data Desk notes ───────────────────────────── */

const DEFENSIVE = new Set(['Consumer staples', 'Health care', 'Utilities']);
export function sectorNote(sectors, mega, m) {
  const S = (sectors ?? []).filter(x => Number.isFinite(x.d20)).sort((a, b) => b.d20 - a.d20); if (S.length < 4) return null;
  const top = S.slice(0, 2), bot = S.slice(-2), M = (mega ?? []).filter(x => Number.isFinite(x.d20)), dn = M.filter(x => x.d20 < 0);
  const defLead = top.filter(x => DEFENSIVE.has(x.label) || x.label === 'Energy').length;
  const gap = Number.isFinite(m?.nq?.delta) && Number.isFinite(m?.spx?.delta) ? ` The Nasdaq is ${pct(m.nq.delta)} while the S&P 500 is ${pct(m.spx.delta)}, so the damage is concentrated in growth.` : '';
  return {
    look: `Sector funds over 20 days. ${list(top.map(x => `${x.label} ${pct(x.d20)}`))} lead and ${list(bot.map(x => `${x.label} ${pct(x.d20)}`))} lag.`,
    matters: 'Which sectors lead shows where money is leaning. Defensive sectors and energy leading while technology lags is the pattern investors seek when they worry about growth, but it also appears in an ordinary rotation out of an expensive sector.',
    tells: `${defLead ? 'This fits the growth-scare and technology readings and does not separate them.' : 'The leaders are not the usual defensive sectors, which weakens the growth-scare reading.'}${gap}${M.length ? ` ${cap(word(dn.length))} of the ${word(M.length)} biggest Nasdaq companies fell over the window, ${dn.length > M.length / 2 ? 'so the weakness is broad inside the index, not one stock' : 'so the index weakness sits in a few names'}.` : ''}`,
  };
}

export function commodityNote(cm) {
  const by = k => (cm ?? []).find(c => new RegExp(k, 'i').test(c.name ?? '')); const oil = by('^(wti|brent|oil)') ?? by('oil'), copper = by('copper'), gold = by('^gold');
  const f = c => c && Number.isFinite(c.d20) ? `${c.name} ${pct(c.d20)}` : null;
  const parts = [f(oil), f(gold), f(copper)].filter(Boolean); if (!parts.length) return null;
  const split = oil && copper && Number.isFinite(oil.d20) && Number.isFinite(copper.d20) && oil.d20 >= 3 && copper.d20 <= -3;
  return {
    look: `Over 20 days: ${list(parts)}.`,
    matters: 'Oil moves with supply and geopolitics as well as demand. Copper is the growth metal, used in construction and manufacturing, so it follows the world economy more closely.',
    split,
    tells: split ? 'Oil is rising while copper falls. A growth scare would normally pull both down, so the oil rise looks like its own story, probably supply or geopolitics, and is one more thing the growth-scare reading does not explain.' : 'These are shown as context for the main story; none of them changes it.',
  };
}

export function fearNote(vo, credit, riskFlags) {
  const v = (vo ?? []).filter(x => /^VIX/.test(x.label) && Number.isFinite(x.v)); if (v.length < 2 && !(credit ?? []).length) return null;
  const shape = v.length >= 2 ? (v[0].v < v.at(-1).v ? 'rising with time, the normal calm shape: investors worry more about later than about this week' : 'falling with time, which means near-term fear is above long-term fear') : '';
  const ig = (credit ?? []).find(x => /invest/i.test(x.label)), hy = (credit ?? []).find(x => /high/i.test(x.label)), ccc = (credit ?? []).find(x => /ccc/i.test(x.label));
  const grad = ig && hy && ccc && Number.isFinite(ig.d20) && Number.isFinite(hy.d20) && Number.isFinite(ccc.d20) && ig.d20 < hy.d20 && hy.d20 < ccc.d20 ? `Over 20 days the extra yield widened ${bp(ig.d20 * 1)} for safer companies, ${bp(hy.d20)} for junk and ${bp(ccc.d20)} for the riskiest, so the weaker the borrower the more lenders now charge.` : '';
  return {
    look: `${shape ? `The VIX curve is ${shape}. ` : ''}${grad}`.trim(),
    matters: 'The VIX is the price of insurance against falling shares. The credit table is the extra interest companies pay over government bonds. A widening that is largest for the riskiest borrowers is how credit stress usually starts.',
    tells: `${grad ? 'The credit pattern is consistent with growing worry about growth and it is the strongest support for that reading. ' : ''}${riskFlags?.active === 0 ? 'The fear gauges themselves are calm, and the broad stress warnings are off, so this is not a panic.' : ''}`.trim(),
  };
}

export function currencyNote(strengths, cb) {
  const S = [...(strengths ?? [])].sort((a, b) => b.score - a.score); if (S.length < 3) return null;
  const rank = S.findIndex(s => s.ccy === 'USD') + 1, hawk = (cb ?? []).filter(c => /hawk/i.test(c.regime ?? '')).length, tot = (cb ?? []).filter(c => c.regime).length;
  return {
    look: `${S[0].ccy} is strongest today (${pct(S[0].score, 2)}) and ${S.at(-1).ccy} weakest (${pct(S.at(-1).score, 2)}).${rank ? ` The dollar ranks ${rank} of ${S.length}.` : ''}`,
    matters: 'In a rush to safety the dollar, the yen and the Swiss franc usually lead. A currency league table shows whether that is happening on the day, using daily prices.',
    tells: `${rank > 2 && rank <= S.length - 2 ? 'The dollar is mid-table, which does not look like a rush into dollars, and that is why the dollar claim in the story is unconfirmed. ' : rank === 1 ? 'The dollar leads, which supports a safety bid. ' : ''}${tot ? `${cap(word(hawk))} of ${word(tot)} central-bank statements read hawkish, leaning toward higher rates, even as bond yields fall. The bond market is not following central-bank language.` : ''}`.trim(),
  };
}
