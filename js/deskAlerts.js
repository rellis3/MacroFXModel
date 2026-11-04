/**
 * Desk alerts across the new data (owner, 2026-11-04, build list item 6): one Telegram message per STATE CHANGE,
 * deduped and rate-limited, with the state kept in KV so a restart never resends.
 *
 * Each check reduces a board to a set of keyed states. An alert fires when a key moves INTO an alerting state it
 * was not in at the last check:
 *   stress:overall           world stress overall colour changes (calm / watch / stress), either way
 *   skew:<mkt>               options-skew 1m risk reversal at a 1-year percentile extreme (<= 5 or >= 95), once the
 *                            market has >= 20 days of history (js/optionsSkew.js rrPct is null before that)
 *   skewslope:<mkt>          1-week minus 1-month ATM vol >= 1 vol point (js/optionsSkew.js `event`): near-term vol bid
 *   fair:<area>              real effective rate newly beyond +/-10% of its 20-year average
 *   carry:<pair>             carry-to-vol ratio of a top-carry pair (top 5 by |ratio| five days ago, |ratio| >= 0.3)
 *                            has fallen by half or more in 5 days
 *   cli:<area>               OECD leading-indicator phase change (expansion / slowdown / contraction / recovery)
 *   drift:<bank>             speaker drift (js/cbSpeeches.js) newly "big": |drift| >= 0.25 against the last statement
 * A key seen for the first time is recorded silently (a deploy must not flood the channel). Returning to normal is
 * recorded and logged but not sent, except for world stress, whose every colour change is news.
 *
 * Rate limits: the same key at most once per `minGapH` hours (a value flickering across a line does not ping each
 * time), and at most `maxPerHour` messages in any hour; anything held back is logged as `held` and NOT re-sent later.
 *
 * Context, never a signal: every message says so.
 *
 * Pure: no fetch, no KV, no clock (pass `now`). Tested in js/deskAlerts.test.mjs.
 */
export const ALERT_DEFAULTS = { minGapH: 6, maxPerHour: 6, skewLo: 5, skewHi: 95, skewMinHistory: 20, fairBand: 10, carryTop: 5, carryMinRatio: 0.3, carryDropFrac: 0.5, carryDays: 5, keepLog: 300 };

const r2 = x => (Number.isFinite(x) ? +x.toFixed(2) : null);

/** Board payloads → { key: { state, alert (bool: is this an alerting state), text, data } }. Missing boards contribute nothing. */
export function readStates({ stress, skew, fair, carry, cli, drift } = {}, carryHist = {}, o = ALERT_DEFAULTS) {
  const out = {};
  if (stress?.overall) {
    const reds = (stress.tiles ?? []).filter(t => t.level !== 'ok').map(t => `${t.label} ${t.level}`).join(', ');
    out['stress:overall'] = { state: stress.overall, alert: true, text: `World stress is now <b>${stress.overall}</b>${reds ? ` (${reds})` : ''}`, data: { score: stress.score ?? null } };
  }
  for (const r of skew?.rows ?? []) {
    if ((r.history ?? 0) >= o.skewMinHistory && Number.isFinite(r.rrPct)) {
      const st = r.rrPct >= o.skewHi ? 'high' : r.rrPct <= o.skewLo ? 'low' : 'normal';
      out[`skew:${r.id}`] = { state: st, alert: st !== 'normal', data: { rr: r.rr, rrPct: r.rrPct, pairRr: r.pairRr },
        text: `${r.pair ?? r.id} 1m risk reversal at its <b>${r.rrPct}th percentile</b> of a year (${r.rr > 0 ? '+' : ''}${r.rr} vol): ${r.lean || (st === 'high' ? 'upside protection unusually dear' : 'downside protection unusually dear')}` };
    }
    if (r.slope != null) {
      const st = r.event ? 'event' : 'normal';
      out[`skewslope:${r.id}`] = { state: st, alert: st === 'event', data: { slope: r.slope }, text: `${r.pair ?? r.id} 1-week vol is ${r.slope} points over 1-month: <b>a near-term event is priced</b>` };
    }
  }
  for (const r of fair?.rows ?? []) {
    if (!Number.isFinite(r.devPct)) continue;
    const st = r.devPct >= o.fairBand ? 'over' : r.devPct <= -o.fairBand ? 'under' : 'inside';
    out[`fair:${r.area}`] = { state: st, alert: st !== 'inside', data: { devPct: r.devPct, period: r.period },
      text: `${r.name ?? r.area} (${r.ccy}) real effective rate is <b>${r.devPct > 0 ? '+' : ''}${r.devPct}%</b> from its 20-year average (${r.period}): ${st === 'over' ? 'dear' : 'cheap'} in real terms, a slow anchor` };
  }
  for (const r of carry?.rows ?? []) {
    const h = carryHist[r.pair] ?? [], then = h.length > o.carryDays ? h.at(-1 - o.carryDays) : null;
    if (!then || !then.top) continue;
    const was = Math.abs(then.ratio), now = Math.abs(r.ratio ?? 0);
    if (!(was >= o.carryMinRatio)) continue;
    const st = now <= was * (1 - o.carryDropFrac) ? 'collapsed' : 'ok';
    out[`carry:${r.pair}`] = { state: st, alert: st === 'collapsed', data: { ratio: r.ratio, was: then.ratio, since: then.date },
      text: `${r.pair} carry-to-vol has <b>collapsed</b>: ${r2(was)} on ${then.date} to ${r2(now)} now (carry ${r.carry}%, vol ${r.vol}%). Carry trades unwind together in risk-off` };
  }
  for (const r of cli?.rows ?? []) {
    if (!r.phase) continue;
    out[`cli:${r.area}`] = { state: r.phase, alert: true, data: { cli: r.cli, chg3m: r.chg3m, period: r.period },
      text: `${r.name ?? r.area} leading indicator moved into <b>${r.phase}</b> (${r.cli}, ${r.chg3m > 0 ? '+' : ''}${r.chg3m} over 3 months, ${r.period})` };
  }
  for (const b of Object.values(drift?.banks ?? {})) {
    if (b.drift == null) continue;
    const st = b.big ? (b.drift > 0 ? 'hawkish' : 'dovish') : 'inline';
    out[`drift:${b.bank}`] = { state: st, alert: st !== 'inline', data: { drift: b.drift, speeches: b.speeches },
      text: `${b.bank} speakers sound <b>${b.label}</b> than its last statement: drift ${b.drift > 0 ? '+' : ''}${b.drift} over ${b.speeches} speech${b.speeches === 1 ? '' : 'es'} (statement ${b.statement?.score ?? '?'} on ${b.statement?.date ?? '?'})${b.latest?.[0] ? `; latest ${b.latest[0].speaker ?? '?'} ${b.latest[0].score}` : ''}` };
  }
  return out;
}

/** Keep one carry-to-vol point per pair per day, with whether the pair was in the top N that day. */
export function updateCarryHist(hist = {}, carry, day, { top = ALERT_DEFAULTS.carryTop, keep = 30 } = {}) {
  if (!carry?.rows?.length || !day) return hist;
  const ranked = [...carry.rows].sort((a, b) => Math.abs(b.ratio ?? 0) - Math.abs(a.ratio ?? 0)), tops = new Set(ranked.slice(0, top).map(r => r.pair));
  const out = { ...hist };
  for (const r of carry.rows) {
    if (!Number.isFinite(r.ratio)) continue;
    const h = [...(out[r.pair] ?? [])], pt = { date: day, ratio: r.ratio, top: tops.has(r.pair) };
    if (h.at(-1)?.date === day) h[h.length - 1] = pt; else h.push(pt);
    out[r.pair] = h.slice(-keep);
  }
  return out;
}

/**
 * Compare the new states with the stored ones. Returns { state, events } where events are
 * { key, from, to, text, send (bool), held (why not sent, or null) }. `state` = { keys: { key: { state, since, sentAt } }, sentTimes: [ms] }.
 */
export function evaluate(prev = {}, states = {}, now, o = ALERT_DEFAULTS) {
  const keys = { ...(prev.keys ?? {}) }, events = [];
  let sentTimes = (prev.sentTimes ?? []).filter(t => now - t < 3600e3);
  for (const [key, s] of Object.entries(states)) {
    const old = keys[key];
    if (!old) { keys[key] = { state: s.state, since: now, sentAt: null }; continue; }   // first sight: baseline, silent
    if (old.state === s.state) continue;
    keys[key] = { ...old, state: s.state, since: now };
    const isStress = key === 'stress:overall', wants = isStress || s.alert;
    let held = null;
    if (!wants) held = 'back to normal (logged, not sent)';
    else if (old.sentAt && now - old.sentAt < o.minGapH * 3600e3) held = `same alert sent ${Math.round((now - old.sentAt) / 60e3)} min ago (min gap ${o.minGapH} h)`;
    else if (sentTimes.length >= o.maxPerHour) held = `rate limit: ${o.maxPerHour} sent in the last hour`;
    if (!held) { keys[key].sentAt = now; sentTimes.push(now); }
    events.push({ key, from: old.state, to: s.state, text: s.text ?? `${key}: ${old.state} -> ${s.state}`, data: s.data ?? null, send: !held, held, at: new Date(now).toISOString() });
  }
  return { state: { keys, sentTimes }, events };
}

/** Telegram HTML for one event. */
export function alertMessage(ev) {
  const kind = ev.key.split(':')[0], icon = { stress: '🌐', skew: '🎯', skewslope: '📅', fair: '⚖️', carry: '💱', cli: '🧭', drift: '🎙' }[kind] ?? '🔔';
  return `${icon} <b>Desk alert</b> · ${ev.text}.\n<i>was ${ev.from}, now ${ev.to}. Context, not a signal.</i>`;
}

/** Append events to the log, newest first, capped. */
export const appendLog = (log = [], events = [], { keep = ALERT_DEFAULTS.keepLog } = {}) => [...[...events].reverse(), ...(log ?? [])].slice(0, keep);
