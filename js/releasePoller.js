/**
 * Release Poller — a refresh cadence that cannot miss the release.
 *
 * Every macro feed on this server used the same scheduler:
 *
 *     if (_xxxLastRun === today) return;
 *     _xxxLastRun = today;
 *
 * One fetch per calendar day, taken by whichever tick fired first after midnight. On a
 * server that has been up overnight that is hours BEFORE the statistical office
 * publishes (08:30 ET for most US releases), and the flag then blocks every further
 * attempt until tomorrow. So on the one day a month the number actually changes, the
 * page serves last month's print all day.
 *
 * Observed 2026-09-10 on the PPI page: the new print landed at 13:30 UK and the page
 * still read the July observation at 14:40. It refreshed at all only because an
 * unrelated deploy restarted the process and reset the flag — luck, not design.
 *
 * The fix is to stop tracking "did we run today" and start tracking THE DATA. Poll
 * eagerly while a new observation is plausibly due, back off once it actually lands.
 *
 * Two thresholds, deliberately different, because "worth looking" and "something is
 * wrong" are different claims:
 *   • dueAfterDays  — start polling hard. Eager on purpose; a wasted request is cheap.
 *   • lateAfterDays — tell the reader a release is genuinely missing. Warning on the
 *                     first threshold would cry wolf for most of every month, since a
 *                     40-day-old monthly print is the normal state for three weeks.
 *
 * Pure except for the two callbacks the caller supplies. Tested in
 * js/releasePoller.test.mjs (no network, no clock dependence — `now` is injectable).
 */

const DAY_MS = 864e5;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Keys whose values are wall-clock bookkeeping, not observations. Including these in
// the scan would make every payload look permanently fresh — the exact confusion
// between "when we asked" and "how old the data is" that this module exists to end.
const META_KEYS = new Set([
  'generatedat', 'builtat', 'fetchedat', 'updatedat', 'checkedat', 'timestamp',
  'lastrun', 'asofrun', 'refreshedat', 'ranat',
]);

/**
 * Newest observation date anywhere in a payload, as `YYYY-MM-DD`, or null.
 *
 * Deep-scans rather than requiring each engine to declare where its dates live: the
 * nine feeds this replaces have nine different payload shapes, and a per-engine
 * accessor is nine more things to get silently wrong. Anything that parses as an ISO
 * date counts, except under a metadata key.
 */
export function latestObservationDate(payload, { maxDepth = 8 } = {}) {
  let best = null;
  const walk = (node, depth, keyLower) => {
    if (node == null || depth > maxDepth) return;
    if (typeof node === 'string') {
      if (META_KEYS.has(keyLower)) return;
      // Accept a bare date, or the date half of an ISO timestamp.
      const d = ISO_DATE.test(node) ? node
        : (/^\d{4}-\d{2}-\d{2}T/.test(node) ? node.slice(0, 10) : null);
      if (d && (best === null || d > best)) best = d;
      return;
    }
    if (Array.isArray(node)) { for (const v of node) walk(v, depth + 1, keyLower); return; }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, depth + 1, String(k).toLowerCase());
    }
  };
  walk(payload, 0, '');
  return best;
}

/** Age in whole days of an observation date, or null when it cannot be parsed. */
export function observationAgeDays(dateStr, now = Date.now()) {
  if (!dateStr) return null;
  const t = Date.parse(dateStr + 'T00:00:00Z');
  return Number.isFinite(t) ? Math.floor((now - t) / DAY_MS) : null;
}

/**
 * Should we poll right now?
 *
 * `lastObs` is the newest observation we have already stored; `lastPollAt` is when we
 * last asked. A null `lastObs` means we have nothing at all, which always polls.
 */
export function shouldPoll({
  lastObs, lastPollAt = 0, now = Date.now(),
  dueAfterDays = 35, eagerMs = 20 * 60_000, idleMs = 6 * 3600_000,
}) {
  const age = observationAgeDays(lastObs, now);
  const due = age == null || age > dueAfterDays;      // nothing stored, or a print is due
  const interval = due ? eagerMs : idleMs;
  return { poll: (now - lastPollAt) >= interval, due, ageDays: age, interval };
}

/** Is a release genuinely missing (as opposed to merely due)? */
export function isLate(lastObs, { now = Date.now(), lateAfterDays = 62 } = {}) {
  const age = observationAgeDays(lastObs, now);
  return age != null && age > lateAfterDays;
}

/**
 * Build a poller for one feed.
 *
 * `build()` refreshes the feed; `read()` returns the stored payload (or null). The
 * poller owns only the cadence — it never touches the data itself, so a feed whose
 * build throws simply retries on the next tick rather than corrupting anything.
 *
 * Returns `{ tick, state }`. Call `tick()` on an interval; `state` is exposed so a
 * status route can show what the poller believes without triggering a fetch.
 */
export function createReleasePoller({
  name, build, read,
  dueAfterDays = 35, lateAfterDays = 62,
  eagerMs = 20 * 60_000, idleMs = 6 * 3600_000,
  log = () => {},
}) {
  const state = { name, lastObs: null, lastPollAt: 0, running: false, seeded: false, lastError: null };

  async function tick(now = Date.now()) {
    if (state.running) return { skipped: 'already running' };
    // Seed from storage on the first tick so a redeploy does not forget what it had and
    // poll aggressively for a month.
    if (!state.seeded) {
      try { state.lastObs = latestObservationDate(await read()); } catch { state.lastObs = null; }
      state.seeded = true;
      // If what we already have is CURRENT, start the idle clock rather than firing a
      // fetch immediately. With `lastPollAt` left at 0 the interval check trivially
      // passes, so every feed would poll the moment the process boots — and this repo
      // has already been bitten by exactly that: synchronised FRED bursts get
      // 403-throttled. A feed whose data is up to date has nothing to ask for.
      // A feed that is DUE (or has nothing stored) still polls straight away, which is
      // the case that actually matters.
      const seed = shouldPoll({ lastObs: state.lastObs, lastPollAt: 0, now, dueAfterDays, eagerMs, idleMs });
      if (!seed.due) state.lastPollAt = now;
    }
    const s = shouldPoll({ lastObs: state.lastObs, lastPollAt: state.lastPollAt, now, dueAfterDays, eagerMs, idleMs });
    if (!s.poll) return { skipped: 'not due', ...s };
    state.lastPollAt = now;
    state.running = true;
    try {
      await build();
      const obs = latestObservationDate(await read());
      if (obs && obs !== state.lastObs) {
        log(`[${name}] new observation: ${state.lastObs ?? 'none'} -> ${obs}`);
        state.lastObs = obs;
      }
      state.lastError = null;
      return { polled: true, observation: state.lastObs, advanced: obs !== null && obs !== state.lastObs };
    } catch (e) {
      state.lastError = e?.message ?? String(e);
      return { polled: true, error: state.lastError };
    } finally { state.running = false; }
  }

  return { tick, state };
}
