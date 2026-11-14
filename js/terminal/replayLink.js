/**
 * Desk Terminal: how the rest of the page opens the Replay tab.
 *
 *   globalThis.openReplay(inst, ts)   a "replay this" hook for any board: opens the Replay tab at that market and moment (ts in ms; null = the last session's morning)
 *   #replay/NQ/2026-11-12T14:30       the deep link (London wall clock; a trailing Z means UTC); followed on load and on hashchange
 *
 * The Replay view itself loads on first use (js/terminal/replayView.js); this tiny module is all the page needs up front.
 */
import { parseReplayHash, londonDate } from '../replayCore.js';

/** Open the tab (a click on its nav button, so the page's own tab handling runs). Returns false when the tab is not on this page (switched off for the desk login). */
export function openReplay(inst, ts = null, doc = globalThis.document) {
  const btn = doc?.querySelector('#tabs [data-t="replay"]');
  if (!btn || btn.hidden) return false;
  const root = doc.getElementById('replay');
  const built = !!root?.dataset.built;
  globalThis.__replayRequest = { inst, ts, date: ts != null ? londonDate(ts) : null };
  btn.click();
  if (built) { const r = globalThis.__replayRequest; globalThis.__replayRequest = null; root.__rp?.load(r.inst, r.ts); }
  return true;
}

export function installReplayLink() {
  globalThis.openReplay = (inst, ts) => openReplay(inst, ts);
  const follow = () => { const r = parseReplayHash(location.hash); if (r) openReplay(r.inst, r.ts); };
  addEventListener('hashchange', follow);
  if (parseReplayHash(location.hash)) setTimeout(follow, 0);
}
