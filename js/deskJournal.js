/**
 * Phases 8 and 13: the journal coach and the execution analyst (plans/DESK_ANALYST_PIPELINE.md §9s). Private: the
 * Desk Office "You" tab only, never a newsletter.
 *
 * Source: the owner's MT5 bot trade logs (range_line_trade_log, oi_bot_trade_log, confluence_trade_log), the
 * closed trades the server rolls up every 10 minutes.
 *
 * Phase 8 (coach): each trade against the desk's morning book for its London date:
 *   with      the card for that market leaned the same way as the trade;
 *   against   the card leaned the other way;
 *   no view   the book had the market but no lean (neutral, or size 0);
 *   off book  no book that day (no eligible run), or the market is not in it.
 * For each group: count, win rate, profit, R. Also where the entry sat in the day's forecast range (in u, signed by
 * the trade's direction, so +1 means it bought one unit above the open: chasing), and the London hour.
 *
 * Phase 13 (execution): per bot, from the rows themselves: the planned R (target distance / stop distance at entry),
 * the realised R, how much of the best move (MFE) was kept, R left on the table, the exit reasons and what each
 * returned, holding time, and the entry against the zone's planned entry where the bot recorded one.
 *
 * Description, not a test: small samples are labelled with their count. Pure. Tested in js/deskJournal.test.mjs.
 */

const ALIAS = { XAUUSD: 'GOLD', XAU: 'GOLD', XAGUSD: 'SILVER', NAS100: 'NQ', NAS100USD: 'NQ', US100: 'NQ', USTEC: 'NQ', NDX: 'NQ',
  SPX: 'SPX500', US500: 'SPX500', SPX500USD: 'SPX500', ES: 'SPX500', DOW: 'US30', US30USD: 'US30', DJI: 'US30', RUT: 'US2000', US2000USD: 'US2000',
  DAX: 'DE30', GER40: 'DE30', DE40: 'DE30', DE30EUR: 'DE30', FTSE: 'UK100', UK100GBP: 'UK100', BTC: 'BTCUSD', OIL: 'WTI', USOIL: 'WTI', UKOIL: 'BRENT' };
/** The desk's instrument name for a bot key or broker symbol (eurusd, EUR_USD, XAUUSD.r, nq → NQ). */
export function deskName(keyOrSymbol) {
  const clean = String(keyOrSymbol ?? '').toUpperCase().split('.')[0].replace(/[^A-Z0-9]/g, '');
  return ALIAS[clean] ?? clean;
}

const isLong = d => /^(BUY|LONG)$/i.test(String(d ?? ''));
const DIR = { STRONG_LONG: 1, LONG: 1, SHORT: -1, STRONG_SHORT: -1 };
const med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = a => { const s = a.filter(Number.isFinite); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; };
const r2 = x => (Number.isFinite(x) ? +x.toFixed(2) : null);
const sum = a => a.filter(Number.isFinite).reduce((x, y) => x + y, 0);

const LONDON = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
export function londonParts(ms) {
  const p = Object.fromEntries(LONDON.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour };
}

/**
 * Normalise log rows to one shape. logs: { botId: rows[] }. MT5 stamps broker-clock epoch seconds; tz_offset_sec
 * restores UTC, and rows written before it was kept use `tzNow` (exact except across a DST change).
 */
export function tradeRows(logs, { tzNow = 0 } = {}) {
  const out = [];
  for (const [bot, rows] of Object.entries(logs ?? {})) {
    const seen = new Set();
    for (const t of rows ?? []) {
      const id = t.position_id ?? t.ticket ?? null;
      if (id != null) { if (seen.has(id)) continue; seen.add(id); }
      if (!t.time_open || !Number.isFinite(t.open_price)) continue;
      const tz = Number.isFinite(t.tz_offset_sec) ? t.tz_offset_sec : tzNow;
      const openMs = (t.time_open - tz) * 1000, closeMs = t.time_close ? (t.time_close - tz) * 1000 : null;
      const dir = isLong(t.direction) ? 1 : -1;
      const risk = Number.isFinite(t.sl_at_entry) ? Math.abs(t.open_price - t.sl_at_entry) : null;
      const reward = Number.isFinite(t.tp_at_entry) ? Math.abs(t.tp_at_entry - t.open_price) : null;
      const pts = Number.isFinite(t.close_price) ? dir * (t.close_price - t.open_price) : null;
      const R = Number.isFinite(t.r) ? t.r : (risk > 0 && pts != null ? pts / risk : null);
      const f = t.features ?? {};
      const planned = [f.entry, f.entry_price, f.level].find(Number.isFinite) ?? null;
      const { date, hour } = londonParts(openMs);
      out.push({ bot, id, inst: deskName(t.key || t.symbol), dir, entry: t.open_price, exit: t.close_price ?? null, openMs, closeMs, date, hour,
        profit: Number.isFinite(t.profit) ? t.profit : null, pts, R: Number.isFinite(R) ? R : null, risk, reward,
        mfePts: Number.isFinite(t.mfe_pips) && t.pip ? t.mfe_pips * t.pip : (Number.isFinite(t.mfe_pts) ? t.mfe_pts : null),
        mfePips: Number.isFinite(t.mfe_pips) ? t.mfe_pips : null, reason: t.reason ?? null, zoneId: t.zone_id ?? (String(t.comment ?? '').match(/\[([^\]~]+)/) ?? [])[1] ?? null,
        plannedEntry: planned });
    }
  }
  return out.sort((a, b) => a.openMs - b.openMs);
}

/**
 * Which way the book leaned on this trade's market that day. books: { date: { at: ms the book was written,
 * cards: { INST: { rating, size, levels } } } }. A trade opened before the book was written could not follow it.
 */
export function stanceOf(trade, books) {
  const book = books?.[trade.date];
  if (!book) return { stance: 'off book', why: 'no book that day' };
  if (Number.isFinite(book.at) && trade.openMs < book.at) return { stance: 'off book', why: 'opened before the book was written' };
  const card = book.cards?.[trade.inst];
  if (!card) return { stance: 'off book', why: 'market not in the book' };
  const d = DIR[card.rating] ?? 0;
  if (!d || !(Number(card.size ?? 1) > 0)) return { stance: 'no view', card };
  return { stance: d === trade.dir ? 'with' : 'against', card };
}

/** Entry location in the day's forecast unit, signed by the trade's direction (+ = paid up / sold down: chasing). */
export function entryU(trade, card) {
  const L = card?.levels;
  if (!L || !Number.isFinite(L.open) || !Number.isFinite(L.up?.p50) || !Number.isFinite(L.down?.p50)) return null;
  const u = ((L.up.p50 - L.open) + (L.open - L.down.p50)) / 2;
  return u > 0 ? trade.dir * (trade.entry - L.open) / u : null;
}

const groupStats = rows => {
  const won = rows.filter(t => (t.profit ?? t.pts ?? 0) > 0).length;
  return { n: rows.length, winRate: rows.length ? r2(won / rows.length) : null, profit: r2(sum(rows.map(t => t.profit))),
    meanR: r2(mean(rows.map(t => t.R))), medianR: r2(med(rows.map(t => t.R))), withR: rows.filter(t => Number.isFinite(t.R)).length };
};
const isoWeek = date => { const d = new Date(`${date}T12:00:00Z`); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); const y = d.getUTCFullYear(); const w1 = new Date(Date.UTC(y, 0, 4)); return `${y}-W${String(1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`; };

/** Phase 8: the journal coach. */
export function coach(trades, books) {
  const rows = trades.map(t => { const s = stanceOf(t, books); return { ...t, stance: s.stance, why: s.why ?? null, entryU: s.card ? r2(entryU(t, s.card)) : null, rating: s.card?.rating ?? null }; });
  const STANCES = ['with', 'against', 'no view', 'off book'];
  const byStance = Object.fromEntries(STANCES.map(s => [s, groupStats(rows.filter(t => t.stance === s))]));
  const bots = [...new Set(rows.map(t => t.bot))];
  const byBot = Object.fromEntries(bots.map(b => [b, Object.fromEntries(STANCES.map(s => [s, groupStats(rows.filter(t => t.bot === b && t.stance === s))]))]));
  const weeks = [...new Set(rows.map(t => isoWeek(t.date)))].sort().reverse().slice(0, 8).map(w => {
    const ws = rows.filter(t => isoWeek(t.date) === w);
    return { week: w, n: ws.length, with: ws.filter(t => t.stance === 'with').length, against: ws.filter(t => t.stance === 'against').length, profit: r2(sum(ws.map(t => t.profit))),
      withProfit: r2(sum(ws.filter(t => t.stance === 'with').map(t => t.profit))), againstProfit: r2(sum(ws.filter(t => t.stance === 'against').map(t => t.profit))) };
  });
  const located = rows.filter(t => Number.isFinite(t.entryU));
  const chase = { n: located.length, medianU: r2(med(located.map(t => t.entryU))), chased: groupStats(located.filter(t => t.entryU > 0.5)), patient: groupStats(located.filter(t => t.entryU < -0.25)) };
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, ...groupStats(rows.filter(t => t.hour === h)) })).filter(h => h.n);
  const notes = coachNotes({ byStance, chase });
  return { n: rows.length, from: rows[0]?.date ?? null, to: rows.at(-1)?.date ?? null, byStance, byBot, weeks, chase, hours, notes,
    trades: rows.slice(-40).reverse().map(t => ({ date: t.date, bot: t.bot, inst: t.inst, side: t.dir > 0 ? 'buy' : 'sell', stance: t.stance, rating: t.rating, entryU: t.entryU, R: r2(t.R), profit: r2(t.profit), reason: t.reason })) };
}

/** Plain sentences for the coach panel. Never more certain than its counts. */
export function coachNotes({ byStance, chase }) {
  const n = [], w = byStance.with, a = byStance.against, small = k => (k < 20 ? ` (only ${k} trades, too few to lean on)` : '');
  if (w.n + a.n === 0) n.push('No trades yet on a day with a book: the coach needs the desk to have run and the bots to have traded the same markets.');
  else {
    n.push(`With the book: ${w.n} trades, win rate ${w.winRate ?? '–'}, mean R ${w.meanR ?? '–'}${small(w.n)}.`);
    n.push(`Against the book: ${a.n} trades, win rate ${a.winRate ?? '–'}, mean R ${a.meanR ?? '–'}${small(a.n)}.`);
    if (w.n >= 20 && a.n >= 20 && Number.isFinite(w.meanR) && Number.isFinite(a.meanR)) n.push(w.meanR > a.meanR ? 'So far, trades that agreed with the desk did better than trades that fought it.' : 'So far, trades that fought the desk did no worse than trades that agreed with it: the book is not yet adding to the bots.');
  }
  if (chase.n >= 10 && chase.chased.n && chase.patient.n) n.push(`Entries more than half a unit beyond the open in the trade's direction (chasing): ${chase.chased.n} trades, mean R ${chase.chased.meanR ?? '–'}; entries a quarter unit or more on the other side (patient): ${chase.patient.n}, mean R ${chase.patient.meanR ?? '–'}.`);
  return n;
}

/** Phase 13: the execution analyst, per bot. */
export function execution(trades) {
  const bots = [...new Set(trades.map(t => t.bot))];
  const per = Object.fromEntries(bots.map(b => {
    const rs = trades.filter(t => t.bot === b);
    const planR = rs.filter(t => t.risk > 0 && t.reward > 0).map(t => t.reward / t.risk);
    const mfeR = rs.filter(t => t.risk > 0 && Number.isFinite(t.mfePts)).map(t => ({ mfe: t.mfePts / t.risk, R: t.R }));
    const kept = mfeR.filter(x => x.mfe > 0.1 && Number.isFinite(x.R)).map(x => x.R / x.mfe);
    const left = mfeR.filter(x => Number.isFinite(x.R)).map(x => x.mfe - x.R);
    const reasons = Object.entries(rs.reduce((m, t) => { const k = String(t.reason ?? 'unknown').toLowerCase(); (m[k] ||= []).push(t); return m; }, {}))
      .map(([reason, xs]) => ({ reason, n: xs.length, share: r2(xs.length / rs.length), meanR: r2(mean(xs.map(t => t.R))), profit: r2(sum(xs.map(t => t.profit))) })).sort((a, b) => b.n - a.n);
    const holdMin = rs.filter(t => t.closeMs > t.openMs).map(t => (t.closeMs - t.openMs) / 60_000);
    const slip = rs.filter(t => Number.isFinite(t.plannedEntry) && t.risk > 0).map(t => t.dir * (t.entry - t.plannedEntry) / t.risk);
    const greenThenRed = mfeR.filter(x => x.mfe >= 0.5 && Number.isFinite(x.R) && x.R <= 0).length;
    return [b, {
      n: rs.length, withStops: rs.filter(t => t.risk > 0).length, plannedR: r2(med(planR)), realisedR: r2(mean(rs.map(t => t.R))), medianR: r2(med(rs.map(t => t.R))),
      mfeR: r2(med(mfeR.map(x => x.mfe))), keptOfBest: r2(med(kept)), leftOnTableR: r2(mean(left)), withMfe: mfeR.length, greenThenRed,
      holdMin: r2(med(holdMin)), reasons: reasons.slice(0, 6),
      entrySlipR: slip.length ? { n: slip.length, median: r2(med(slip)), worse: slip.filter(x => x > 0.05).length } : null,
    }];
  }));
  return { bots: per, notes: execNotes(per) };
}

export function execNotes(per) {
  const n = [];
  for (const [b, x] of Object.entries(per)) {
    if (!x.n) continue;
    const bits = [`${b}: ${x.n} trades`];
    if (Number.isFinite(x.plannedR) && Number.isFinite(x.realisedR)) bits.push(`planned ${x.plannedR}R to the target, realised ${x.realisedR}R on average`);
    if (Number.isFinite(x.mfeR) && Number.isFinite(x.keptOfBest)) bits.push(`the typical trade got ${x.mfeR}R in its favour and kept ${Math.round(x.keptOfBest * 100)}% of it`);
    if (x.greenThenRed) bits.push(`${x.greenThenRed} trades were half an R up and closed at or below zero`);
    if (x.entrySlipR?.n >= 5) bits.push(`entries were ${x.entrySlipR.median > 0 ? 'worse' : 'better'} than the zone's planned entry by a median ${Math.abs(x.entrySlipR.median)}R`);
    n.push(bits.join('; ') + (x.n < 20 ? ` (only ${x.n} trades).` : '.'));
  }
  return n;
}
