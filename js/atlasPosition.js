/**
 * ATLAS POSITION — where today sits, in three tenses.
 *
 *   BEHIND US   what history says about this backdrop and what has already happened: the macro regime and what each
 *               market did in it, what changed this week, central-bank tone, who has been beating or missing
 *               consensus, who is crowded.
 *   RIGHT NOW   the state of play: the five global axes, dealer gamma and the option walls, the conditions the desk
 *               is watching that are firing, the central-bank and crowding context for this instrument.
 *   AHEAD       what is already scheduled: releases by impact, the Fed-path odds, the next meeting, the nowcasts,
 *               and the scenario probabilities.
 *
 * Every function takes the JSON a live endpoint already returns and gives back plain rows. No DOM, no fetch. The point of
 * keeping it here is that each reading can be tested against a fixture, and that the page cannot quietly invent one.
 *
 * What this does NOT do: forecast direction. The ledger says direction claims test null almost every time; the regime
 * tilt, the crowding and the Fed odds are context and every row says what it is. Where a validated range effect applies
 * the page says so; nothing else is dressed as an edge.
 */
import { FLIPPED } from './cotState.js';

export const CCY_OF_COUNTRY = { US: 'USD', EU: 'EUR', GB: 'GBP', JP: 'JPY', AU: 'AUD', NZ: 'NZD', CA: 'CAD', CH: 'CHF' };
export const BANK_OF = { USD: 'FOMC', EUR: 'ECB', GBP: 'BoE', JPY: 'BoJ', NZD: 'RBNZ', AUD: 'RBA', CAD: 'BoC', CHF: 'SNB' };
const MARKET_LABEL = { SPX500: 'S&P 500', NQ: 'Nasdaq', GOLD: 'Gold', US10Y: 'US 10Y', COPPER: 'Copper', EURUSD: 'EUR/USD', USDJPY: 'USD/JPY', AUDUSD: 'AUD/USD', DXY: 'Dollar', WTI: 'Oil (WTI)' };
export const REGIME_MARKET_FOR = { SPX500: 'SPX500', NQ: 'NQ', GOLD: 'GOLD', EURUSD: 'EURUSD', USDJPY: 'USDJPY', AUDUSD: 'AUDUSD' };
export const OI_PAIR_FOR = { EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY', AUDUSD: 'AUD/USD', GOLD: 'XAU/USD', USDCAD: 'USD/CAD', USDCHF: 'USD/CHF', NQ: 'NAS100_USD', US30: 'US30_USD', SPX500: 'SPX500_USD', US2000: 'US2000_USD' };
export const COUNTRIES_FOR_INDEX = { NQ: ['US'], SPX500: ['US'], US30: ['US'], US2000: ['US'], DE30: ['EU'], UK100: ['GB'], GOLD: ['US'], BTCUSD: ['US'] };

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
const r2 = v => (v == null ? null : Math.round(v * 100) / 100);

/** Currencies of an FX name like EURUSD, else null. */
export function ccysOf(name, ac) { return ac === 'fx' && /^[A-Z]{6}$/.test(name) ? [name.slice(0, 3), name.slice(3, 6)] : null; }

// ── BEHIND US ──────────────────────────────────────────────────────────────

/** The macro regime now, and what each market has done in it. regime = /api/regime. */
export function regimeCard(regime) {
  const now = regime?.now; if (!now?.regime || !regime?.table) return null;
  const markets = Object.keys(regime.table).map(k => {
    const c = regime.table[k]?.[now.regime]; if (!c || !num(c.n) || c.n < 12) return null;
    return { key: k, label: MARKET_LABEL[k] ?? k, n: c.n, mean: r2(c.mean), median: r2(c.median), posShare: c.posShare == null ? null : Math.round(c.posShare * 100), range: r2(c.range), tilt: c.tilt ?? null };
  }).filter(Boolean);
  return {
    label: now.label, what: now.what, usual: now.usual, months: now.months, since: now.since,
    previous: now.previous ? { regime: now.previous.regime, months: now.previous.months } : null,
    watchFor: now.watchFor ? { to: now.watchFor.to, tells: now.watchFor.tells, typical: now.watchFor.typical } : null,
    markets,
    note: 'Monthly base rates for this regime since 2007: what happened, not what will. Forward windows overlap, so read the size of the effect and the sample, not a significance.',
  };
}

/** Rows of what changed. macroChanges = /api/macro-changes. */
export function changesRows(mc) {
  return (mc?.rows ?? []).map(r => ({ key: r.key, label: r.label, unit: r.unit, last: num(r.last), d1: num(r.deltas?.['1']), d5: num(r.deltas?.['5']), d20: num(r.deltas?.['20']), dir: r.dir ?? '', lastDate: r.lastDate ?? null, stale: (r.refGapDays?.['1'] ?? 0) > 2 }));
}

/** Central-bank tone histories. h = { USD: fomcHistory[], EUR: [], GBP: [], JPY: [] } (the `history` arrays). */
export function cbTone(h) {
  return Object.entries(h ?? {}).map(([ccy, hist]) => {
    const rows = (hist ?? []).filter(x => num(x?.hawkishScore) != null); if (rows.length < 2) return null;
    const last = rows[rows.length - 1], prev = rows[rows.length - 2], d = r2(last.hawkishScore - prev.hawkishScore);
    return { ccy, bank: BANK_OF[ccy] ?? ccy, scores: rows.map(x => x.hawkishScore), dates: rows.map(x => x.meetingDate), latest: r2(last.hawkishScore), delta: d, regime: last.regime ?? null, headline: last.headline ?? null, trend: d > 0.05 ? 'more hawkish' : d < -0.05 ? 'more dovish' : 'steady' };
  }).filter(Boolean);
}

/** Who has been beating or missing consensus. es = /api/econ-surprise. */
export function surpriseBars(es) {
  return Object.entries(es?.byCcy ?? {}).filter(([, v]) => num(v?.score) != null).map(([ccy, v]) => ({
    ccy, score: r2(v.score), n: v.n ?? null, nRecent: v.nRecent ?? null, stale: !!v.staleOnly, top: (v.top ?? []).slice(0, 3).map(t => ({ event: t.event, z: r1(t.z), actual: t.actual, estimate: t.estimate })),
  })).sort((a, b) => b.score - a.score);
}

/**
 * Crowding: a speculative position is crowded only when its percentile AND its sign agree. ce = /api/cot-extremes,
 * cs = /api/cot-state (optional).
 *
 * TWO sets of words per row, because the feed's JPY, CAD and CHF rows are in USD-PAIR terms (positive = long
 * USDJPY / USDCAD / USDCHF = SHORT the yen, loonie, franc; js/cotState.js header):
 *   state      in the terms of the instrument the row maps to (EURUSD, USDJPY, NQ...): use it on a market card.
 *   ccyState   in "long the currency" terms: use it on a currency card or for a cross's leg. Same as `state` for every
 *              row except JPY/CAD/CHF, where long and short swap. Using `state` on the yen card said "traders are
 *              heavily long" when they were heavily short the yen (fixed 2026-10-24).
 *   cot        where the instrument sits on the crowding map and what the registered study found (from cs), or null.
 */
const _STATE_WORD = (extreme, trimmed, long) => extreme ? (long ? 'crowded long' : 'crowded short') : trimmed ? (long ? 'smallest long in years' : 'smallest short in years') : 'mid-range';
const _SWAP = { 'crowded long': 'crowded short', 'crowded short': 'crowded long', 'smallest long in years': 'smallest short in years', 'smallest short in years': 'smallest long in years', 'mid-range': 'mid-range' };
export function crowding(ce, cs = null) {
  const bySym = {};
  for (const [inst, v] of Object.entries(cs?.instruments ?? {})) if (v?.sym) bySym[v.sym] = { inst, ...v };
  return (ce?.instruments ?? []).filter(i => i.group === 'fx' || ['NQ', 'ES', 'YM', 'RTY', 'GOLD', 'BTC', 'WTI'].includes(i.sym)).map(i => {
    const pct = num(i.specSharePct ?? i.specPct), share = num(i.specShare), net = num(i.specNet);
    const sign = share ?? net; if (pct == null || sign == null) return null;
    const long = sign > 0, extreme = (pct >= 90 && long) || (pct <= 10 && !long);
    const trimmed = (pct >= 90 && !long) || (pct <= 10 && long);   // percentile and sign disagree: positions already cut
    const state = _STATE_WORD(extreme, trimmed, long);
    const flipped = FLIPPED.has(i.sym);
    const c = bySym[i.sym];
    return { sym: i.sym, pct, net, share, state, ccyState: flipped ? _SWAP[state] : state, ccyPct: flipped ? 100 - pct : pct,
             inst: c?.inst ?? null, cot: c ? { key: c.key, label: c.label, line: c.line, ev: c.ev, verdict: c.verdict, vol: c.vol ?? null, zone: c.zone } : null };
  }).filter(Boolean);
}

/** A crowding row read as "long the currency" (state and pct swapped for JPY/CAD/CHF), for currency cards and pair legs. */
export function crowdCcy(c) { return c ? { ...c, state: c.ccyState ?? c.state, pct: c.ccyPct ?? c.pct } : c; }

// ── RIGHT NOW ──────────────────────────────────────────────────────────────

/** The five global axes with the inputs behind each. gr = /api/global-read. */
export function axesRows(gr) {
  const NAMES = { risk: 'Risk appetite', usd: 'Dollar', rates: 'Rates', vol: 'Volatility', credit: 'Credit' };
  return Object.entries(gr?.axes ?? {}).map(([k, a]) => ({ key: k, label: NAMES[k] ?? k, score: r2(a.score), agree: a.agree ?? null, inputs: (a.inputs ?? []).map(i => ({ id: i.id, v: r2(i.v), text: i.text })) }));
}
export function scenarios(gr) { return (gr?.scenarios ?? []).map(s => ({ name: s.name, p: s.p == null ? null : Math.round(s.p * 100), why: s.pWhy ?? null, text: s.text ?? null })); }

/** Dealer gamma and the walls, per instrument. oi = /api/oi-today. */
export function gammaRows(oi) {
  return (oi?.pairs ?? []).map(p => {
    const spot = num(p.spot), cw = num(p.callWall), pw = num(p.putWall), mp = num(p.maxPain);
    const pctTo = x => (spot && x ? Math.round((x / spot - 1) * 10000) / 100 : null);
    let where = null;
    if (spot && cw && pw) where = spot > cw ? 'above the call wall' : spot < pw ? 'below the put wall' : Math.abs(spot - cw) < Math.abs(spot - pw) ? 'between the walls, nearer the call wall' : 'between the walls, nearer the put wall';
    return { pair: p.pair, spot, regime: p.regime ?? null, dte: p.dte ?? null, callWall: cw, putWall: pw, maxPain: mp, toCall: pctTo(cw), toPut: pctTo(pw), toMaxPain: pctTo(mp), pc: num(p.pcRatio) == null ? null : r2(p.pcRatio), where, stale: !!p.basisStale };
  });
}
export function gammaFor(oi, instrument) { const k = OI_PAIR_FOR[instrument]; return k ? gammaRows(oi).find(r => r.pair === k) ?? null : null; }

/** Desk Watch conditions firing; `instrument` filters to ones that name it (conditions naming none are global). ds = /api/desk-watch. */
export function deskFiring(ds, instrument = null) {
  return (ds?.states ?? []).filter(s => s.firing && (instrument == null || !s.instruments?.length || s.instruments.includes(instrument)))
    .map(s => ({ id: s.id, label: s.label, detail: s.detail ?? '', evidenceId: s.evidenceId ?? null, kind: s.kind ?? null, since: s.since ?? null, instruments: s.instruments ?? [] }));
}

// ── AHEAD ──────────────────────────────────────────────────────────────────

/** Scheduled releases still to come. events = /api/events (array). opts: countries, impacts, withinHours, limit. */
export function aheadEvents(events, now = Date.now(), { countries = null, impacts = ['high', 'medium'], withinHours = 72, limit = 12 } = {}) {
  const cut = now + withinHours * 3.6e6;
  return (Array.isArray(events) ? events : []).filter(e => num(e.ms) != null && e.ms > now - 1800e3 && e.ms <= cut && impacts.includes(String(e.impact).toLowerCase()) && (!countries || countries.includes(e.country) || e.country === 'ALL'))
    .sort((a, b) => a.ms - b.ms).slice(0, limit).map(e => ({ ms: e.ms, country: e.country, ccy: CCY_OF_COUNTRY[e.country] ?? null, event: e.event, impact: String(e.impact).toLowerCase(), estimate: e.estimate ?? null, prev: e.prev ?? null, inHours: r1((e.ms - now) / 3.6e6) }));
}

/** The Fed path from the Atlanta Fed tracker. fp = /api/fed-path. */
export function fedPathCard(fp) {
  const w = fp?.windows?.[0]; if (!w) return null;
  const dist = Object.entries(w.dist ?? {}).map(([band, p]) => ({ band, p: r1(p) })).filter(x => x.p != null);
  const top = [...dist].sort((a, b) => b.p - a.p)[0] ?? null;
  return { asOf: fp.asOf ?? null, current: fp.currentRange ?? null, ref: w.ref, hike: r1(w.hike), cut: r1(w.cut), meanBps: r1(w.mean), dist, mostLikely: top, hikeWeekAgo: r1(w.hikeAgo?.w1), source: 'Atlanta Fed Market Probability Tracker', note: 'Market-implied, a window and not a meeting. Context: no measured link from these odds to FX or index moves on this desk.' };
}
export function nextMeeting(cal, now = Date.now()) {
  const m = (cal?.meetings ?? []).map(x => ({ ...x, ms: Date.parse(x.date + 'T18:00:00Z') })).find(x => x.ms > now);
  return m ? { date: m.date, sep: !!m.sep, inDays: Math.ceil((m.ms - now) / 86400e3) } : null;
}
export function nowcastCard(n) {
  if (!n?.ok) return null;
  return { gdpnow: n.gdpnow?.value ?? null, gdpQuarter: n.gdpnow?.quarter ?? null, cpi: num(n.cleveland?.cpi), core: num(n.cleveland?.core), month: n.cleveland?.month ?? null, note: n.tested ?? 'context, not a lean' };
}

/** Instrument-level history from the regime table (only the markets the study covers). */
export function regimeFor(regime, instrument) {
  const k = REGIME_MARKET_FOR[instrument]; const now = regime?.now?.regime; const c = k && now ? regime?.table?.[k]?.[now] : null;
  return c && c.n >= 12 ? { key: k, regime: regime.now.label, n: c.n, mean: r2(c.mean), median: r2(c.median), posShare: Math.round((c.posShare ?? 0) * 100), range: r2(c.range), tilt: c.tilt ?? null } : null;
}

/**
 * Today in three sentences, assembled from the rows above. Deterministic: every clause names the number it came from.
 */
export function positionLines({ regime, axes, firing, events, fedPath, meeting, now = Date.now() }) {
  const behind = [], right = [], ahead = [];
  if (regime) {
    behind.push(`The backdrop is ${regime.label.toLowerCase()} (${regime.what}), month ${regime.months}${regime.previous ? ` after ${regime.previous.months} months of ${regime.previous.regime}` : ''}.`);
    // The textbook and the measured record are kept as two lines on purpose: the study's own prose and its own table can disagree
    // (on 2026-10-22 the prose said growth stocks had not liked reflation while the table had the Nasdaq +2.38% a month, 75% of months up).
    if (regime.usual) behind.push(`The textbook says: ${regime.usual}.`);
    const pick = ['SPX500', 'NQ', 'GOLD', 'DXY'].map(k => regime.markets?.find(m => m.key === k)).filter(Boolean);
    if (pick.length) behind.push(`The measured record since 2007 in this regime: ${pick.map(m => `${m.label} ${m.mean >= 0 ? '+' : ''}${m.mean}% a month (${m.posShare}% of months up)`).join(', ')}.`);
  }
  if (regime?.watchFor) behind.push(`The usual next step is ${regime.watchFor.to}; its tells are ${regime.watchFor.tells}.`);
  if (axes?.length) { const strongest = [...axes].sort((a, b) => Math.abs(b.score ?? 0) - Math.abs(a.score ?? 0))[0]; right.push(`The global axes are mostly mixed; the strongest is ${strongest.label.toLowerCase()} at ${strongest.score >= 0 ? '+' : ''}${strongest.score} with ${strongest.agree} of its inputs agreeing.`); }
  right.push(firing?.length ? `${firing.length} desk-watch condition${firing.length > 1 ? 's are' : ' is'} firing: ${firing.slice(0, 3).map(f => f.label).join('; ')}.` : 'No desk-watch condition is firing.');
  if (events?.length) { const e = events[0]; ahead.push(`Next on the calendar: ${e.country} ${e.event} in ${e.inHours < 1 ? 'under an hour' : Math.round(e.inHours) + ' hours'} (${e.impact} impact${e.estimate ? `, expected ${e.estimate}` : ''}). ${events.length - 1} more high or medium releases follow in the next three days.`); }
  else ahead.push('No high or medium impact release is listed in the next three days.');
  if (fedPath) ahead.push(`The Fed path prices ${fedPath.hike}% odds of a higher rate by ${fedPath.ref}${fedPath.current ? ` (now ${fedPath.current})` : ''}${meeting ? `; the next FOMC is ${meeting.date}, ${meeting.inDays} days away` : ''}.`);
  return { behind, right, ahead };
}
