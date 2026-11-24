// js/terminal/broadcastHeadline.js: THE HEADLINE for Jarvis's broadcast, the same one-line story the daily newsletter leads with (js/newsletterToday.js todayOpening, the
// template headline: yesterday's big day, a wild Asian session, yields doing something odd, else the day's lead release). Owner, 24 Nov 2026: "like the newsletter, which has a
// headline article, should the morning brief not open with a headline item?". The inputs are built here from the same feeds atlas.html gives the newsletter
// (/api/drill-series daily closes, /api/daily-brief, /api/vol-forecast and /session, /api/macro-changes, /api/asia-today, /api/events), so the two say the same thing.
// No model call: the newsletter's own templates over numbers. In the EVENING the day just traded is the "last full day", so the headline is about today.
// Pure. Tested in js/terminal/broadcastHeadline.test.mjs. DESCRIPTION ONLY: observed figures and the schedule, never a direction call.
import { todayOpening, bigDayHeadline } from '../newsletterToday.js';
import { closeMove } from '../closeBasis.js';
import { changesRows, aheadEvents } from '../atlasPosition.js';

const fin = v => typeof v === 'number' && Number.isFinite(v);
/** The markets the newsletter's opening reads (atlas.html NL_RANGE_KEYS) and their daily close series in /api/drill-series (atlas.html MK_SERIES). */
export const HEAD_KEYS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'GOLD', 'NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100', 'BTCUSD'];
const SERIES = { EURUSD: 'eurusd', GBPUSD: 'gbpusd', USDJPY: 'usdjpy', AUDUSD: 'audusd', USDCAD: 'usdcad', USDCHF: 'usdchf', NZDUSD: 'nzdusd', GOLD: 'gold', NQ: 'nq', SPX500: 'spx', US2000: 'r2k', DE30: 'de30', UK100: 'uk100', BTCUSD: 'btc' };
const IDX = { GOLD: 'Gold', NQ: 'Nasdaq', SPX500: 'S&P 500', DE30: 'DAX', UK100: 'FTSE 100', US30: 'Dow', US2000: 'Russell 2000', BTCUSD: 'Bitcoin' };
/** The newsletter's label: "EUR/USD" for a pair, the index name otherwise (atlas.html labelOf). */
export const headLabel = k => (/^[A-Z]{6}$/.test(k) && !IDX[k] ? `${k.slice(0, 3)}/${k.slice(3)}` : IDX[k] ?? k);
const londonDate = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

/** The last two closes of a drill series: { last, prev, date, latest } (atlas.html lastTwo). */
// latest: the newest date BEFORE today (London). Later in the day the bundle carries a row for today with no market closes in it yet, and measured against that row
// every market would read as stale and drop out (the newsletter, built at 07:30, sees yesterday as the newest row, so this keeps the two the same at any hour).
function lastTwo(drill, key, today) {
  const a = drill?.series?.[key]; if (!Array.isArray(a)) return null;
  let i = a.length - 1; while (i >= 0 && a[i] == null) i--; let j = i - 1; while (j >= 0 && a[j] == null) j--;
  if (i < 0) return null; const dts = drill.dates ?? [], before = dts.filter(d => d && d < today);
  return { last: a[i], prev: j >= 0 ? a[j] : null, date: dts[i] ?? null, latest: before[before.length - 1] ?? drill.to ?? null, spark: a.slice(-40).filter(v => v != null) };
}

/**
 * The newsletter's asset rows from the raw feeds: [{ key, label, d1, d1Basis, d1AsOf, prevClose, lastClose, spark, yHigh, yLow, yDate, price, hlMed, used }].
 * evening: the day just traded counts as the last full day (d1 = today's move so far, dated today), so bigDayHeadline names today, not yesterday.
 */
export function headlineAssets({ drill, brief, sess, fc, nowMs = Date.now(), evening = false } = {}) {
  const out = [];
  for (const k of HEAD_KEYS) {
    const bi = brief?.instruments?.[k], si = sess?.instruments?.[k], fi = fc?.instruments?.[k];
    const hlMed = bi?.levels?.hl_med?.pct ?? fi?.hl_median ?? null, used = si?.hl != null && hlMed ? si.hl / hlMed : null, price = fin(bi?.current_price) ? bi.current_price : null;
    const t = SERIES[k] ? lastTwo(drill, SERIES[k], londonDate(nowMs)) : null;
    const cm = t ? closeMove({ last: t.last, prev: t.prev, lastDate: t.date, latestDate: t.latest, live: price, liveStale: !!bi?.stale, nowMs }) : null;
    const pd = bi?.prev_day, row = { key: k, label: headLabel(k), d1: cm?.d1 ?? null, d1Basis: cm?.basis ?? 'none', d1AsOf: cm?.asOf ?? null, prevClose: cm?.basis === 'live' && fin(t?.prev) ? t.prev : null,
      lastClose: fin(t?.last) ? t.last : null, spark: t?.spark ?? [], price, hlMed: fin(hlMed) ? hlMed : null, used: fin(used) ? used : null,
      ...(pd && fin(pd.high) && fin(pd.low) ? { yHigh: pd.high, yLow: pd.low, yDate: pd.date ?? null } : {}) };
    if (evening && row.d1Basis === 'live' && fin(row.d1)) Object.assign(row, { d1Basis: 'bars', d1AsOf: londonDate(nowMs) });     // tonight, today is the day that was
    out.push(row);
  }
  return out;
}

/** Today's calendar for the opening: high and medium releases from a day back to two days on, the ones already out included (atlas.html ahead + pastEvents). */
export const headlineEvents = (events, nowMs = Date.now()) => aheadEvents(Array.isArray(events) ? events : events?.events ?? [], nowMs - 864e5, { withinHours: 72, limit: 200 });

const BP = /(\d)\s*bp\b/g;
/** Spoken: "13bp" -> "13 basis points" (the broadcast's clean() does the rest: % and &). */
export const sayHead = t => String(t ?? '').replace(BP, '$1 basis points');
const firstSentence = t => (String(t ?? '').match(/^.*?[.!?](?=\s|$)/)?.[0] ?? String(t ?? '')).trim();

/**
 * The headline card: { kicker, headline, figure: { value, label }, tone 'up'|'dn'|'tx', key (the market to chart, or null), say (the spoken line), means (one sentence or '') } or null.
 * figure: the headline's first number (a percent, basis points or VIX points); key: the market the headline names first. Every word is the newsletter's.
 */
export function headlineCard(op, assets = []) {
  const head = String(op?.headline ?? '').trim(); if (!head) return null;
  const named = assets.filter(a => a?.label && head.includes(a.label)).sort((a, b) => head.indexOf(a.label) - head.indexOf(b.label)), hit = named[0] ?? null;
  const big = bigDayHeadline(assets), bigRow = big?.rows?.[0] ?? null;
  const m = head.match(/(\d+(?:\.\d+)?)\s*(%|bp\b| points\b)/);
  const sign = bigRow && hit && bigRow.key === hit.key ? Math.sign(bigRow.day.pct) : hit && fin(hit.d1) ? Math.sign(hit.d1) : 0;
  const unit = m ? (m[2] === '%' ? '%' : m[2] === 'bp' ? ' bp' : ' pts') : '';
  const figure = m ? { value: `${m[1]}${unit}`, label: hit ? `${hit.label}${bigRow && bigRow.key === hit.key ? `, ${bigRow.day.mult.toFixed(1)}× a normal day` : ''}` : '' } : null;
  const kicker = String(op.kicker ?? '').toUpperCase();
  // the second line explains the headline's own number: a big day in normal-day units; otherwise the opening's first sentence, but only when the headline is the opening's
  // own story (a big day overrides the opening's headline while its lede still describes the story underneath, so that sentence would not fit)
  const bigLead = bigRow && head.startsWith(big.headline('').slice(0, 12));
  const sentence = firstSentence(op.lede), x = bigLead ? bigRow.day.mult : null;
  const means = bigLead ? `For the ${bigRow.label} that is ${x >= 2.95 && x < 3.05 ? 'three times' : x >= 1.95 && x < 2.05 ? 'twice' : `${x.toFixed(1)} times`} a normal day's move.`
    : sentence.length > 12 && sentence.split(/\s+/).length <= 32 ? sentence : '';
  return { kicker, headline: head, figure, tone: sign > 0 ? 'up' : sign < 0 ? 'dn' : 'tx', key: hit?.key ?? null, keys: named.map(a => a.key), means, say: `The headline: ${sayHead(head)}.` };
}

/** Everything in one call: the opening (the newsletter's todayOpening) and its card. feeds = { drill, brief, sess, fc, mc, asia, events }. */
export function buildHeadline(feeds = {}, { nowMs = Date.now(), evening = false } = {}) {
  const assets = headlineAssets({ ...feeds, nowMs, evening });
  // tonight only today's figures count: a yield move that last printed days ago is not the evening's story (the macro rows print a day or more late)
  const changes = changesRows(feeds.mc).filter(c => !evening || c.lastDate === londonDate(nowMs));
  const op = todayOpening({ events: headlineEvents(feeds.events, nowMs), nowMs, assets, changes, asia: evening ? null : feeds.asia?.instruments ?? null });
  return headlineCard(op, assets);
}
