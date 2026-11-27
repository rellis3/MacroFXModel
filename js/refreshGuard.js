// js/refreshGuard.js: createRefreshGuard(run) for server refresh jobs (plans/HELIX_IMPROVEMENTS.md 0.17): one shared promise while a refresh is in flight (no refresh storm when many
// requests find the cache old at once), and a growing back-off after a failure (a failed run leaves the cache's `at` unchanged, so without this every request started its own refresh).
// Pure; tested in js/refreshGuard.test.mjs.

/**
 * run(): the refresh; resolves to a state object. isFail(result, error) decides whether it failed (default: it threw, or the result has an `error`).
 * Returns refresh({ force }) -> Promise<result>. While backing off, refresh() resolves to `idle()` (the caller's current state) without running.
 */
export function createRefreshGuard(run, { isFail = (r, e) => !!e || !!r?.error, backoffMs = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000], idle = () => null, now = () => Date.now(), log = null } = {}) {
  let inflight = null, fails = 0, nextOk = 0;
  function refresh({ force = false } = {}) {
    if (inflight) return inflight;
    if (!force && fails && now() < nextOk) return Promise.resolve(idle());
    inflight = (async () => {
      let r = null, err = null;
      try { r = await run(); } catch (e) { err = e; }
      if (isFail(r, err)) { fails++; nextOk = now() + backoffMs[Math.min(fails, backoffMs.length) - 1]; log?.(`failed (${fails} in a row), next try in ${Math.round((nextOk - now()) / 1000)} s: ${err?.message ?? r?.error ?? '?'}`); }
      else { fails = 0; nextOk = 0; }
      if (err) throw err;
      return r;
    })().finally(() => { inflight = null; });
    return inflight;
  }
  refresh.state = () => ({ inflight: !!inflight, fails, nextTryAt: fails ? new Date(nextOk).toISOString() : null });
  return refresh;
}

