// watchlist.js — CSV export of top-starred levels for TV indicator

import { getDigits } from './utils.js';

// ── CSV export — entry,dir,sl,tp,stars,label (TV indicator format) ────────────
// entries: array of level objects (pass window._lastEntries or any filtered array)

export function exportWatchlistCSV(pair, topN = null, entries = null) {
  const all = entries ?? window._lastEntries ?? [];
  if (!all?.length) return null;

  const sorted = [...all]
    .filter(e => e.direction && (e.totalStars ?? 0) >= 4)
    .sort((a, b) => (b.totalStars ?? 0) - (a.totalStars ?? 0) || (b.signalScore ?? 0) - (a.signalScore ?? 0));

  const levels = topN != null ? sorted.slice(0, topN) : sorted;
  if (!levels.length) return null;

  const digits = getDigits(pair);
  const fmt    = v => (typeof v === 'number' ? v.toFixed(digits) : (v ?? ''));

  const header = [
    '# MacroFX Top Setups — ' + pair + ' — ' + new Date().toISOString().slice(0, 10),
    '# ' + levels.length + ' levels · ≥4★ sorted by stars then signal score',
    '# entry,dir,sl,tp,stars,label',
  ].join('\n');

  const rows = levels.map(e => {
    const tagStr = (e.tags ?? []).map(t => typeof t === 'string' ? t : (t.label ?? '')).join('+') || 'Fib';
    const label  = `${e.totalStars ?? 1}* ${tagStr}`;
    return `${fmt(e.price)},${e.direction === 'long' ? 1 : -1},${fmt(e.sl)},${fmt(e.tp)},${e.totalStars ?? 1},"${label}"`;
  });

  return header + '\n' + rows.join('\n');
}
