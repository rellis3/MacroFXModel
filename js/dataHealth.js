// js/dataHealth.js — when did each feed last actually update, and is that a problem?
//
// WHY. Staleness here is never a missing flag; it is a flag nobody is looking at.
// /api/cvol knew EVZ had been dead for 570 days and the brief narrated it anyway. The
// evening read correctly reports `stale` and still rendered "Into tomorrow" for a day that
// had already passed. The OECD CPI mirror died in 2025-03 and nothing said so. Each was
// visible in its own endpoint and invisible as a whole, so this collects the answers in
// one place a reader can glance at.
//
// TWO RULES THAT MAKE IT HONEST, both learned the hard way here.
//
// 1. JUDGE AGAINST THE SOURCE'S OWN CADENCE. A weekly series six days old is fine; a daily
//    one six days old is not. A single "older than N days" threshold reports the monthly
//    series as permanently broken and lets a dead daily feed through for a week.
//
// 2. COUNT BUSINESS DAYS FOR MARKET DATA. Friday's close is one session old on Monday and
//    three calendar days old. A calendar-day rule marks every market feed stale every
//    Monday morning, and an alarm that cries wolf weekly is one nobody reads.
//
// A SNAPSHOT IS NOT A STALE FEED. js/data/cmeCvolEod.json is a manual export; it is not
// failing when it is old, it is simply a file. It gets its own state so "needs a refresh"
// never reads as "something is broken".
//
// Pure: values in, plain object out. No fetch, no DOM.

export const STATES = ['fresh', 'lagging', 'stale', 'dead', 'snapshot', 'unknown'];

/** Weekdays strictly between two instants — Sat/Sun excluded. Holidays are not modelled. */
export function businessDaysBetween(fromMs, toMs) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return 0;
  let n = 0;
  const d = new Date(fromMs);
  d.setUTCHours(0, 0, 0, 0);
  const end = new Date(toMs); end.setUTCHours(0, 0, 0, 0);
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/**
 * Classify one source.
 *
 * @param {object} s
 * @param {string} s.id
 * @param {string} s.label
 * @param {string|number} s.last        ISO date/instant, or ms, of the last real update
 * @param {number} [s.cadenceDays=1]    how often it is SUPPOSED to update
 * @param {string} [s.kind='feed']      'feed' | 'snapshot' | 'manual'
 * @param {boolean} [s.market=true]     market data (count business days) vs wall-clock
 * @param {number} [now=Date.now()]
 */
export function classify(s, now = Date.now()) {
  const base = { id: s?.id ?? null, label: s?.label ?? s?.id ?? null, kind: s?.kind ?? 'feed',
                 cadenceDays: s?.cadenceDays ?? 1, last: s?.last ?? null };
  const ms = typeof s?.last === 'number' ? s.last : Date.parse(String(s?.last ?? ''));
  if (!Number.isFinite(ms)) {
    // "unknown" is usually not a fault: most of these caches live in memory and refill on
    // a 6- or 24-hour job, so every deploy empties them. Saying "no timestamp" about a
    // cache that simply has not run yet reads as breakage and trains the reader to ignore
    // the panel. Where the boot time and the refresh interval are known, say which it is.
    const bootMin = Number.isFinite(s?.bootedAt) ? Math.round((now - s.bootedAt) / 60000) : null;
    const why = bootMin != null && s?.refreshEveryH
      ? `not refreshed since the restart ${bootMin} min ago — this one runs every ${s.refreshEveryH}h, so it is waiting, not broken`
      : bootMin != null ? `nothing cached since the restart ${bootMin} min ago`
      : 'no last-update time reported';
    // `waiting` lets a reader tell the two unknowns apart: a cache with a refresh interval
    // will fill itself; a source with none has nothing recording its time at all.
    return { ...base, state: 'unknown', ageDays: null, overdue: null, why,
             waiting: !!s?.refreshEveryH, refreshEveryH: s?.refreshEveryH ?? null, bootMin };
  }

  const cad = Math.max(0.0001, base.cadenceDays);
  // business days for market data, calendar for anything on a wall clock
  const ageDays = (s?.market ?? true) ? businessDaysBetween(ms, now) : (now - ms) / 86400000;
  const overdue = +(ageDays / cad).toFixed(2);   // 1.0 = exactly one cadence behind
  const ageExact = +((now - ms) / 86400000).toFixed(2);

  if (base.kind === 'snapshot' || base.kind === 'manual') {
    return { ...base, state: 'snapshot', ageDays: ageExact, overdue,
      why: `a manual export, ${Math.round(ageExact)} days old. Not failing — it updates when someone refreshes it.` };
  }
  // THE BANDS ARE DELIBERATELY FORGIVING. Several "daily" FRED series are published on a
  // lag -- the H.10 FX fixings (DEXUSEU and friends) routinely sit five business days
  // behind and are working perfectly. Calling that stale would put the badge in alarm
  // most of the week, and a badge that is always red is a badge nobody reads, which is
  // the exact failure this module exists to fix. So: two cadences is nothing, up to six
  // is a publication lag or a holiday, past that someone should look, and past thirty it
  // is discontinued rather than late.
  const state = overdue <= 2 ? 'fresh' : overdue <= 6 ? 'lagging' : overdue <= 30 ? 'stale' : 'dead';
  const unit = cad >= 25 ? 'months' : cad >= 6 ? 'weeks' : 'sessions';
  const n = cad >= 25 ? (ageDays / 30).toFixed(1) : cad >= 6 ? (ageDays / 5).toFixed(1) : Math.round(ageDays);
  const why = state === 'fresh' ? `current — ${n} ${unit} behind on a ${cad}-day cadence`
    : state === 'lagging' ? `${n} ${unit} behind where a ${cad}-day cadence should be. Usually a holiday or a slow publisher.`
    : state === 'stale' ? `${n} ${unit} behind. Past what a holiday explains — check the job.`
    : `${n} ${unit} behind. This looks discontinued, not late.`;
  return { ...base, state, ageDays: ageExact, overdue, why };
}

const RANK = { dead: 0, stale: 1, lagging: 2, unknown: 3, snapshot: 4, fresh: 5 };

/**
 * Classify a list and summarise it.
 *
 * `worst` drives the pill's colour. A snapshot never drives it: an export that has not been
 * refreshed is not an outage, and letting it set the badge to red would teach the reader to
 * ignore red.
 */
export function health(sources = [], now = Date.now()) {
  const rows = (sources ?? []).filter(Boolean).map(s => classify(s, now))
    .sort((a, b) => RANK[a.state] - RANK[b.state] || String(a.label).localeCompare(String(b.label)));
  const counts = rows.reduce((o, r) => ({ ...o, [r.state]: (o[r.state] ?? 0) + 1 }), {});
  const alarming = rows.filter(r => r.state === 'dead' || r.state === 'stale' || r.state === 'lagging');
  const worst = alarming.length ? alarming[0].state : (counts.unknown ? 'unknown' : 'fresh');
  return {
    rows, counts, worst, n: rows.length,
    ok: counts.fresh ?? 0,
    needsEyes: alarming.length,
    // one line for the pill: the number that matters, not a sum of everything
    summary: alarming.length
      ? `${alarming.length} of ${rows.length} need eyes`
      : `${rows.length} sources current`,
  };
}
