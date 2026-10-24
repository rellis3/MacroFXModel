/**
 * Short narratives for each currency and each market, built from the issue's own data so they change every day.
 *
 * Each narrative is a few sentences (the synthesis), up to three drivers, and what is uncertain. It describes what today's inputs say: where the currency or market stands,
 * what its central bank and recent data say, who is positioned and what is due. It never scores a direction. The desk's tests found direction calls from these inputs are close
 * to a coin flip, so a "bullish 7 of 10" would be a claim the evidence does not support. Where two currencies differ most today it says so as a description, not a trade.
 *
 * Pure. Tested in js/newsletterNarrative.test.mjs.
 */
import { nodeMoves, plainText } from './macroTheories.js';

const MINUS = '−';
const pct = (v, d = 2) => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(d)}%`;
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const ord = n => { const v = Math.round(n), s = ['th', 'st', 'nd', 'rd'], t = v % 100; return `${v}${s[(t - 20) % 10] || s[t] || s[0]}`; };
const list = a => (a.length < 2 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
/** The first sentence of a statement summary, or a clip at a word boundary. */
export const clip = (s, n = 150) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); if (t.length <= n) return t; const first = t.match(/^.{20,}?[.!?](?=\s|$)/)?.[0]; if (first && first.length <= n) return first; const cut = t.slice(0, n); return `${cut.slice(0, cut.lastIndexOf(' '))}…`; };
const POS = { 'crowded long': 'crowded long', 'crowded short': 'crowded short', 'smallest long in years': 'at their smallest long in years', 'smallest short in years': 'at their smallest short in years' };
const regimeWord = r => String(r ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Which chain nodes belong to which tracked market, so a market can say how it sits in the day's story. */
const NODE_OF = { NQ: ['nq'], GOLD: ['gold'], SPX500: ['spx'], AUDUSD: ['audusd'], USDCAD: ['usdcad'], USDJPY: ['usdjpy'], GBPUSD: ['gbpusd'], EURUSD: ['eurusd'], BTCUSD: ['btc'] };

function nextEvent(events, ccys, nowMs) {
  return (events ?? []).filter(e => ccys.includes(e.ccy) && (e.impact === 'high' || e.impact === 'medium') && e.ms >= nowMs).sort((a, b) => a.ms - b.ms || (a.impact === 'high' ? -1 : 1))[0] ?? null;
}

/** One currency: where it stands today, what its central bank and recent data say, who is positioned, what is due, and where it differs most from another currency. */
export function currencyNarrative(ccy, ctx) {
  const { strengths = [], cb = [], surprise = [], crowding = [], events = [], fedPath = null, assets = [], when = () => '', nowMs = Date.now(), names = {}, banks = {} } = ctx;
  const S = [...strengths].filter(s => Number.isFinite(s.score)).sort((a, b) => b.score - a.score), me = S.find(s => s.ccy === ccy); if (!me) return null;
  const rank = S.indexOf(me) + 1, N = S.length, name = names[ccy] ?? ccy;
  const state = rank === 1 ? 'Strongest today' : rank === N ? 'Weakest today' : rank <= N / 2 ? 'Upper half today' : 'Lower half today';
  // positioning read as long the currency (JPY/CAD/CHF crowding rows are in USD-pair terms; atlasPosition.crowding)
  const c = cb.find(x => x.ccy === ccy), su = surprise.find(x => x.ccy === ccy), cr0 = crowding.find(x => x.sym === ccy), cr = cr0 && { ...cr0, state: cr0.ccyState ?? cr0.state, pct: cr0.ccyPct ?? cr0.pct }, ev = nextEvent(events, [ccy], nowMs);
  const bank = c?.bank ?? banks[ccy] ?? null, regime = regimeWord(c?.regime), hawk = /hawk/.test(regime), dove = /dov/.test(regime);

  const lines = [];
  lines.push(`${name} is ${rank === 1 ? 'the strongest' : rank === N ? 'the weakest' : `${ord(rank)} of ${N}`} of the ${N} currencies tracked today, ${pct(me.score)} against the others.`);
  if (c && regime) lines.push(`${bank}'s latest statement reads ${regime}.${(hawk && rank > N / 2) || (dove && rank <= N / 2) ? ` The currency is ${rank > N / 2 ? 'in the lower half' : 'in the upper half'} today, so price and policy language point different ways.` : ''}`);
  if (ccy === 'USD' && fedPath && Number.isFinite(fedPath.hike) && fedPath.ref) lines.push(`Markets put ${Math.round(fedPath.hike)}% on a higher Fed rate by ${new Date(`${fedPath.ref}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}${Number.isFinite(fedPath.hikeWeekAgo) ? `, against ${Math.round(fedPath.hikeWeekAgo)}% a week ago` : ''}.`);
  if (su && !su.stale) lines.push(`Recent ${ccy} data have on balance ${su.score > 0 ? 'beaten' : su.score < 0 ? 'missed' : 'met'} expectations (surprise score ${su.score > 0 ? '+' : su.score < 0 ? MINUS : ''}${Math.abs(su.score).toFixed(2)}).`);
  if (cr && POS[cr.state]) lines.push(`Speculators are ${POS[cr.state]}, which shows who has the most to lose if the market turns, not which way it goes.`);

  const drivers = [];
  if (c?.headline) drivers.push({ tag: 'Central bank', text: `${bank}: ${clip(c.headline, 140)}` });
  if (su && !su.stale && su.top?.[0]) { const t = su.top[0]; drivers.push({ tag: 'Data', text: `${t.event}: ${t.actual} against ${t.estimate} expected` }); }
  if (ccy === 'USD' && fedPath && Number.isFinite(fedPath.hike)) drivers.push({ tag: 'Rates path', text: `${Math.round(fedPath.hike)}% priced for a higher rate by ${fedPath.ref}; current range ${fedPath.current ?? 'n/a'}` });
  else if (cr && POS[cr.state]) drivers.push({ tag: 'Positioning', text: `Speculators ${POS[cr.state]} (${ord(cr.pct)} percentile of their own history)` });
  if (ev) drivers.push({ tag: 'Calendar', text: `${ev.event}, ${when(ev.ms)}` });

  const pairs = assets.filter(a => /^[A-Z]{6}$/.test(a.key) && a.key.includes(ccy)).map(a => {
    const b = a.key.slice(0, 3), q = a.key.slice(3), sb = S.find(s => s.ccy === b), sq = S.find(s => s.ccy === q); if (!sb || !sq) return null;
    return { key: a.key, label: a.label, gap: Math.abs(sb.score - sq.score), text: `${a.label}: ${b} ${pct(sb.score)} against ${q} ${pct(sq.score)}, a gap of ${Math.abs(sb.score - sq.score).toFixed(2)} points.` };
  }).filter(Boolean).sort((x, y) => y.gap - x.gap).slice(0, 2);

  const uncertain = [];
  if (!c) uncertain.push(`No central-bank statement is tracked for ${name}.`);
  if (su?.stale) uncertain.push('Its data-surprise score rests on old releases only.');
  if (!su) uncertain.push('No data-surprise score is available.');
  if (!cr) uncertain.push('Speculator positioning is not tracked for this currency.');
  return {
    ccy, name, bank, state, rank, n: N, score: me.score, synthesis: lines.join(' '), drivers: drivers.slice(0, 3), pairs, uncertain,
    cycle: c && regime ? { label: cap(regime), note: `${bank} tone score ${Number.isFinite(c.latest) ? c.latest : 'n/a'}${Number.isFinite(c.delta) && c.delta !== 0 ? `, ${c.delta > 0 ? 'up' : 'down'} ${Math.abs(c.delta)} since the last statement` : ''}` } : null,
  };
}

/** The other markets that move the story around each market: what to read alongside it. */
const AROUND = { NQ: ['real', 'hy', 'smh', 'vix'], SPX500: ['real', 'hy', 'vix'], US30: ['hy', 'vix', 'us10y'], US2000: ['hy', 'vix', 'us10y'], GOLD: ['real', 'dxy', 'vix'], BTCUSD: ['dxy', 'vix', 'hy'], DE30: ['hy', 'vix', 'us10y'], UK100: ['hy', 'vix', 'us10y'], USDJPY: ['us10y', 'vix'], AUDUSD: ['copper', 'dxy'], USDCAD: ['oil', 'dxy'], EURUSD: ['dxy', 'us10y'], GBPUSD: ['dxy', 'us10y'], USDCHF: ['dxy', 'vix'], NZDUSD: ['copper', 'dxy'] };
const HOME = { NQ: ['USD', 'the US'], SPX500: ['USD', 'the US'], US30: ['USD', 'the US'], US2000: ['USD', 'the US'], GOLD: ['USD', 'the US'], BTCUSD: ['USD', 'the US'], DE30: ['EUR', 'the euro area'], UK100: ['GBP', 'the UK'] };

/** One market in a short paragraph: how it moved, where it stands against its currencies or the story, what the central banks and recent data say, who is positioned, what the options price, what is around it and what is due. Never a direction. */
export function pairNarrative(asset, ctx) {
  const { strengths = [], cb = [], surprise = [], crowding = [], events = [], links = [], fedPath = null, when = () => '', nowMs = Date.now(), cotFor = {} } = ctx;
  const key = asset.key, fx = /^[A-Z]{6}$/.test(key), base = fx ? key.slice(0, 3) : null, quote = fx ? key.slice(3) : null;
  const S = [...strengths].filter(s => Number.isFinite(s.score)).sort((a, b) => b.score - a.score), N = S.length, rk = c => S.findIndex(s => s.ccy === c) + 1, sc = c => S.find(s => s.ccy === c)?.score;
  const lines = [], drivers = [], uncertain = [];

  // 1. how it moved, and whether today runs with the 20-day move
  if (Number.isFinite(asset.d1) && Number.isFinite(asset.d20)) {
    const withTrend = Math.sign(asset.d1) === Math.sign(asset.d20) || asset.d1 === 0;
    lines.push(`${asset.label} ${asset.d1 < 0 ? 'fell' : asset.d1 > 0 ? 'rose' : 'was flat'} ${Math.abs(asset.d1).toFixed(2)}% today and has moved ${pct(asset.d20, 1)} over 20 days, so today ${withTrend ? 'runs with' : 'cuts against'} the 20-day move.`);
  }
  // 2. currencies and policy (FX)
  if (fx && sc(base) != null && sc(quote) != null) {
    const gap = sc(base) - sc(quote), lead = gap === 0 ? null : gap > 0 ? base : quote;
    lines.push(`${base} is ${ord(rk(base))} of ${N} and ${quote} ${ord(rk(quote))} in today's currency table${lead ? `, so ${lead} has the edge by ${Math.abs(gap).toFixed(2)} points` : ', level with each other'}.`);
    const cb1 = cb.find(x => x.ccy === base), cb2 = cb.find(x => x.ccy === quote);
    if (cb1?.regime && cb2?.regime) { const same = regimeWord(cb1.regime) === regimeWord(cb2.regime); lines.push(same ? `Both central banks read ${regimeWord(cb1.regime)}, so policy language does not separate the pair.` : `${cb1.bank} reads ${regimeWord(cb1.regime)} and ${cb2.bank} ${regimeWord(cb2.regime)}, so policy language does separate them.`); drivers.push({ tag: 'Central banks', text: `${cb1.bank} ${regimeWord(cb1.regime)}; ${cb2.bank} ${regimeWord(cb2.regime)}` }); }
    // 3. recent data, side by side
    const s1 = surprise.find(x => x.ccy === base), s2 = surprise.find(x => x.ccy === quote), sg = v => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(2)}`;
    if (s1 && s2 && !s1.stale && !s2.stale) { const fav = s1.score === s2.score ? null : s1.score > s2.score ? base : quote; lines.push(`Recent data ${fav ? `have favoured ${fav}: ${base} surprise score ${sg(s1.score)} against ${quote} ${sg(s2.score)}` : `are level: ${base} ${sg(s1.score)} and ${quote} ${sg(s2.score)}`}.`); drivers.push({ tag: 'Data', text: `${base} ${sg(s1.score)} against ${quote} ${sg(s2.score)} on recent surprises` }); }
    // 4. the dollar's rates path
    if ((base === 'USD' || quote === 'USD') && fedPath && Number.isFinite(fedPath.hike)) { lines.push(`Markets put ${Math.round(fedPath.hike)}% on a higher Fed rate by ${new Date(`${fedPath.ref}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}.`); drivers.push({ tag: 'Rates path', text: `${Math.round(fedPath.hike)}% priced for a higher Fed rate by ${fedPath.ref}` }); }
  }
  // 5. what is around it in the day's story: the nearby markets and the textbook link
  const nm = nodeMoves(links), touch = links.filter(l => (l.verdict === 'broken' || l.verdict === 'holding') && (NODE_OF[key] ?? []).some(k => l.a.key === k || l.b.key === k));
  const inLink = new Set(touch.flatMap(l => [l.a.key, l.b.key])), around = (AROUND[key] ?? []).filter(k => nm[k] && !inLink.has(k)).map(k => nm[k]);
  if (around.length) lines.push(`Around it: ${list(around.map(e => `${e.label} ${e.text}${e.moved ? '' : ' (inside its noise)'}`))}.`);
  if (touch.length) { const l = touch.find(x => x.verdict === 'broken') ?? touch[0], why = plainText(l.read ?? '');
    lines.push(`In the day's story, ${l.a.label} ${l.a.text} and ${l.b.label} ${l.b.text}, so the textbook link ${l.verdict === 'broken' ? 'did not hold' : 'held'}.${why ? ` ${why.replace(/\s*[.]*$/, '')}.` : ''}`);
    drivers.push({ tag: 'Story link', text: `${l.a.label} to ${l.b.label}: ${l.verdict === 'broken' ? 'broken' : 'holding'}` }); }
  // 6. who is positioned, and what the options price
  const pos = (cotFor[key] ?? []).map(sy => crowding.find(c => c.sym === sy)).filter(Boolean).find(c => POS[c.state]);
  if (pos) { lines.push(`Speculators are ${POS[pos.state]} (${ord(pos.pct)} percentile of their own history), which shows who has the most to lose if the market turns, not which way it goes.`); drivers.push({ tag: 'Positioning', text: `Speculators ${POS[pos.state]}` }); }
  if (asset.implied?.words) lines.push(`Options price ${String(asset.implied.words).replace(/^a typical day of about/, 'a typical day of about')}${asset.used != null ? `, and ${Math.round(asset.used * 100)}% of a normal day's range has been used so far` : ''}.`);
  // 7. what is due
  const home = HOME[key], ccys = fx ? [base, quote] : home ? [home[0]] : [], ev = nextEvent(events, ccys, nowMs);
  if (ev) { lines.push(`Next big release for ${fx ? `${base} or ${quote}` : home[1]}: ${ev.event}, ${when(ev.ms)}.`); drivers.push({ tag: 'Calendar', text: `${ev.event}, ${when(ev.ms)}` }); }
  const meaningful = lines.length > 1 || (lines.length === 1 && !/^.* (fell|rose|was flat) /.test(lines[0]));
  if (!asset.implied) uncertain.push('No options-implied size is available for this market.');
  if (fx && !cb.find(x => x.ccy === base) && !cb.find(x => x.ccy === quote)) uncertain.push('No central-bank statement is tracked for either currency.');
  return { synthesis: meaningful ? lines.join(' ') : '', drivers: drivers.slice(0, 4), uncertain: meaningful ? uncertain : [], hasStory: touch.length > 0 };
}
