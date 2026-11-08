// MP3 briefing: status polling and remembered position (pure, injectable fetch/timers).
export const audioUrl = (id, mode = 'briefing') => `/api/library/audio?id=${encodeURIComponent(id)}&mode=${mode}`;
export const POS_KEY = id => 'libraryAudioPos:' + id;

/** Poll until ready/error. getBriefing() -> {status,secs,error} (GET /api/library/audio?id=&status=1). A status that stays 'none' after the job was started is an error. */
export async function pollBriefing(getBriefing, { onTick, sleep = ms => new Promise(r => setTimeout(r, ms)), every = 3000, maxPolls = 200 } = {}) {
  let none = 0;
  for (let n = 0; n < maxPolls; n++) {
    const b = (await getBriefing()) || { status: 'none' };
    if (onTick) onTick(b);
    if (b.status === 'ready' || b.status === 'error') return b;
    if (b.status === 'none' && ++none > 3) return { status: 'error', error: 'the briefing did not start' };
    await sleep(every);
  }
  return { status: 'error', error: 'timed out waiting for the briefing' };
}
export function loadPos(storage, id) { try { const v = parseFloat(storage.getItem(POS_KEY(id))); return isFinite(v) && v > 0 ? v : 0; } catch { return 0; } }
export function savePos(storage, id, t, dur) {
  try { if (dur && t > dur - 3) storage.removeItem(POS_KEY(id)); else storage.setItem(POS_KEY(id), String(Math.floor(t))); } catch { /* ignore */ }
}
export function mediaMeta(paper) {
  return { title: (paper.title || 'Paper') + ' (briefing)', artist: 'MacroFX Library', album: 'Paper briefings' };
}
