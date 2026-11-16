/**
 * Browser history for the Pair page (flow review item 3, 2026-11-16). Pure decisions, so they are tested without a browser.
 *
 * Before: opening a market rewrote the current history entry (replaceState), so the Back button left the page instead of returning
 * to the previous market or the tab you came from. Now a market the USER picks (selector, chip, card, command, link) adds an entry;
 * a market the page FOLLOWS (linked selection, history navigation) never does, so nothing loops or doubles.
 *
 *   historyAction({ want, current, replace, fromHistory })  'push' | 'replace' | 'none'
 *   backTarget({ hash, tab, from })                         what to show when the hash changed under us: { pair } | { tab } | null
 */
import { parseDeepHash } from './deepDive.js';
export const pairHash = inst => `#pair=${String(inst).toUpperCase()}`;
export const pairOf = hash => (String(hash ?? '').match(/pair=([A-Za-z0-9]+)/)?.[1] ?? '').toUpperCase() || null;

export function historyAction({ want, current, replace = false, fromHistory = false }) {
  if (fromHistory || want === current) return 'none';   // the URL already says it (Back/Forward, or the same market again)
  return replace ? 'replace' : 'push';
}

// The hash changed (Back, Forward, a pasted link). On a pair hash: show that market. On an empty hash while the Pair tab is up:
// return to the tab the Pair page was opened from. Any other hash belongs to another handler (Macro, Replay...): leave it alone.
export function backTarget({ hash, tab, from = null }) {
  const p = pairOf(hash);
  if (p) return { pair: p };
  const d = parseDeepHash(hash);
  if (d) return { deep: d };
  if ((hash === '' || hash === '#') && tab === 'pair') return { tab: from || 'assets' };
  if ((hash === '' || hash === '#') && tab === 'deep') return { tab: from || 'pair' };
  return null;
}
