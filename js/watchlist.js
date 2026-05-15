// watchlist.js — CSV export of daily top-starred levels for TV indicator

import { S } from './state.js';
import { getDigits } from './utils.js';

// ── CSV export — entry,dir,sl,tp,stars,label (TV indicator format) ────────────

export function exportWatchlistCSV(pair, topN = null) {
  const all = S.dailyWatchlist[pair];
  if (!all?.length) return null;

  const levels = topN != null ? all.slice(0, topN) : all;
  const digits = getDigits(pair);
  const fmt    = v => (typeof v === 'number' ? v.toFixed(digits) : (v ?? ''));

  const header = [
    '# MacroFX Top Setups — ' + pair + ' — ' + (S.watchlistDate ?? new Date().toISOString().slice(0, 10)),
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
