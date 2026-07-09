/**
 * Naked / untested levels — the market-structure filter for "prior" confluence
 * sources. A prior-session POC or high/low only matters as a level while price
 * has NOT returned to it; once a later session trades through it, it's "filled"
 * and stops acting as a magnet. So for nPOC (naked POC) and untested prior
 * highs/lows we scan back over the lookback and keep only the levels no
 * SUBSEQUENT session touched.
 *
 * Pure + horizon-agnostic: takes per-session summaries (oldest→newest), returns
 * the naked levels tagged by kind. No network. `sessions[i]` = {date, high, low,
 * poc?} — the caller computes POC from that session's volume profile.
 */

// A level formed on session `i` is NAKED if no session j > i traded through it,
// i.e. no later session's [low,high] band (± a tiny buffer) contains it. `bufferPips`
// (default 0) tolerates a wick that only grazed it — set >0 to require a real fill.
function isNaked(price, sessions, formedIdx, buffer) {
  for (let j = formedIdx + 1; j < sessions.length; j++) {
    const s = sessions[j];
    if (s.low - buffer <= price && price <= s.high + buffer) return false;   // touched → filled
  }
  return true;
}

// Build the naked-level list from per-session summaries. Emits, for each session
// in the lookback window (all but the most recent `keepForming` still-open ones),
// its POC / high / low IF still untested by a later session. Tagged so a consumer
// can weight nPOC differently from an untested swing extreme.
//   opts: { lookback=30, pip=0, bufferPips=0, kinds=['poc','high','low'], keepForming=0 }
export function nakedLevels(sessions, opts = {}) {
  const { lookback = 30, pip = 0, bufferPips = 0, kinds = ['poc', 'high', 'low'], keepForming = 0 } = opts;
  if (!Array.isArray(sessions) || sessions.length < 2) return [];
  const buffer = bufferPips * (pip || 0);
  const n = sessions.length;
  const from = Math.max(0, n - lookback - keepForming);
  const to = n - keepForming;                              // exclude the still-forming session(s)
  const out = [];
  const push = (price, kind, src, date) => {
    if (Number.isFinite(price)) out.push({ price, kind, source: src, date });
  };
  for (let i = from; i < to; i++) {
    const s = sessions[i];
    if (!s) continue;
    if (kinds.includes('poc') && Number.isFinite(s.poc) && isNaked(s.poc, sessions, i, buffer)) push(s.poc, 'npoc', 'npoc', s.date);
    if (kinds.includes('high') && Number.isFinite(s.high) && isNaked(s.high, sessions, i, buffer)) push(s.high, 'naked_high', 'naked_hilo', s.date);
    if (kinds.includes('low') && Number.isFinite(s.low) && isNaked(s.low, sessions, i, buffer)) push(s.low, 'naked_low', 'naked_hilo', s.date);
  }
  return out;
}

export { isNaked };
