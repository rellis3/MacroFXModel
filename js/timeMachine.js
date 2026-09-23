/**
 * The time machine — read any past day exactly as the page would have read it.
 *
 * THE IDEA. Every engine on this page already takes a date index: `scanBoard(b, i)`,
 * `marketState(b, board, i)`, `deskRead(...)`. The page only ever passed the last one.
 * Pass a different one and the whole thing — the read, the map, the sectors, the
 * confirmations — regenerates as of that date, using only data that existed then.
 *
 * WHY THIS IS THE BEST LEARNING TOOL AVAILABLE HERE. You cannot get six years of
 * market experience by waiting six years. But you can step through 2022's hiking
 * cycle a fortnight at a time and watch what a rates-led market actually looked like
 * on the way through — what led, what lagged, which links held, what the page would
 * have told you. Reading about a regime teaches you the label; replaying one teaches
 * you the texture.
 *
 * AND IT IS AN HONESTY CHECK. You can go to any date and see what this page WOULD have
 * said, then look at what followed. No other part of the site can be audited that way.
 *
 * THE ONE THING IT IS NOT. Not point-in-time. FRED revises, so a 2023 replay sees the
 * revised 2023 data rather than the print of the day. That makes it excellent for
 * learning the SHAPE of a regime and unsuitable as a backtest — which is why the page
 * says so on the banner rather than in a footnote.
 *
 * Pure: no fetch, no DOM. Tested in js/timeMachine.test.mjs.
 */

const WIN = 20;

/** The 20-session change of a series at i, as a fraction. */
function chg(b, key, i, w = WIN) {
  const s = b?.series?.[key]; if (!s) return null;
  const now = s[i], then = s[i - w];
  return (now == null || then == null || !(then > 0)) ? null : now / then - 1;
}
const lvl = (b, key, i) => b?.series?.[key]?.[i] ?? null;

/**
 * Notable episodes, found in the data rather than hard-coded.
 *
 * Hard-coding "the 2022 hiking cycle" would bake in one person's idea of what mattered
 * and go stale the moment something new happens. These are the extremes of what the
 * bundle actually contains, so the list stays true as history extends.
 *
 * De-clustered by `apart` sessions, because the five worst days of one crash are one
 * episode, not five.
 */
export function episodes(bundle, { apart = 60, per = 3 } = {}) {
  const N = bundle?.dates?.length ?? 0;
  if (N < 400) return [];
  const out = [];
  const scan = (label, score, note) => {
    const rows = [];
    for (let i = 300; i < N; i++) { const v = score(i); if (v != null) rows.push({ i, v }); }
    rows.sort((a, b) => b.v - a.v);
    const picked = [];
    for (const r of rows) {
      if (picked.some(p => Math.abs(p.i - r.i) < apart)) continue;
      picked.push(r);
      if (picked.length >= per) break;
    }
    for (const p of picked) out.push({ i: p.i, date: bundle.dates[p.i], kind: label, note: note(p.i), score: +p.v.toFixed(3) });
  };

  scan('Equity drawdown', i => { const c = chg(bundle, 'spx', i); return c == null ? null : -c; },
    i => `S&P ${(chg(bundle, 'spx', i) * 100).toFixed(1)}% over twenty sessions`);
  scan('Fear spike', i => { const c = chg(bundle, 'vix', i); return c == null ? null : c; },
    i => `VIX ${lvl(bundle, 'vix', i)?.toFixed(1)}, up ${(chg(bundle, 'vix', i) * 100).toFixed(0)}%`);
  scan('Rates shock', i => {
    const a = lvl(bundle, 'us2y', i), b = lvl(bundle, 'us2y', i - WIN);
    return (a == null || b == null) ? null : Math.abs(a - b);
  }, i => `2-year ${((lvl(bundle, 'us2y', i) - lvl(bundle, 'us2y', i - WIN)) * 100).toFixed(0)}bp`);
  scan('Gold move', i => { const c = chg(bundle, 'gold', i); return c == null ? null : Math.abs(c); },
    i => `Gold ${(chg(bundle, 'gold', i) * 100).toFixed(1)}%`);

  // newest first: recent history is the history you are most likely to remember
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Where a date sits in the bundle. Accepts a date string or an index. */
export function resolveIndex(bundle, at) {
  const N = bundle?.dates?.length ?? 0;
  if (!N) return null;
  if (typeof at === 'number' && Number.isFinite(at)) return Math.max(0, Math.min(N - 1, Math.round(at)));
  if (typeof at !== 'string') return N - 1;
  // the last session on or before the requested date, so a weekend lands on Friday
  let best = -1;
  for (let i = 0; i < N; i++) { if (bundle.dates[i] <= at) best = i; else break; }
  return best < 0 ? 0 : best;
}

/**
 * How far back you are, and what is safe to say about it.
 *
 * `canScore` is the honest gate: a date inside the last `horizon` sessions has no
 * complete forward window yet, so "here is what followed" would be a partial answer
 * dressed as a whole one.
 */
export function context(bundle, i, { horizon = 20 } = {}) {
  const N = bundle?.dates?.length ?? 0;
  if (!N) return null;
  const idx = Math.max(0, Math.min(N - 1, i));
  const back = N - 1 - idx;
  return {
    index: idx, date: bundle.dates[idx], latest: bundle.dates[N - 1],
    sessionsBack: back, isLive: back === 0,
    canScore: back >= horizon,
    // what actually happened next, once there is enough of it to be a whole answer
    after: back >= horizon ? {
      horizon,
      spx: chg(bundle, 'spx', idx + horizon, horizon),
      vix: chg(bundle, 'vix', idx + horizon, horizon),
      date: bundle.dates[idx + horizon],
    } : null,
  };
}

/** One line of plain English about what followed, or null when it cannot be said yet. */
export function whatFollowed(ctx) {
  if (!ctx || ctx.isLive) return null;
  if (!ctx.canScore) return `This is ${ctx.sessionsBack} sessions ago — not yet a full month, so there is no complete "what happened next" to show.`;
  const a = ctx.after;
  if (a?.spx == null) return null;
  const up = a.spx > 0;
  return `Over the ${a.horizon} sessions after this, the S&P was ${up ? 'up' : 'down'} ${Math.abs(a.spx * 100).toFixed(1)}%${
    a.vix != null ? ` and the VIX ${a.vix > 0 ? 'rose' : 'fell'} ${Math.abs(a.vix * 100).toFixed(0)}%` : ''
  }. You are seeing the board as it stood BEFORE that, so read it forward, not backward.`;
}
