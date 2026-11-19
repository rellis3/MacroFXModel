// js/jarvis/jarvisMorning.js: the "While you slept" digest (service id jarvisMorning). Sent once per London weekday from 06:30 (checked every 5 min, at most once per day by a flag kept
// in the shared jarvis_watch_v1 state). TEMPLATE TEXT, NO MODEL CALL: the chain's 1-day summary, the five biggest moves against their noise, the alerts the watcher raised overnight, and
// today's high-impact releases from /api/calendar-events when that route answers. DESCRIPTION ONLY, never a forecast or a trade.
import { getChain, evaluate, getState, saveState } from './jarvisWatch.js';
import { buildDigest, overnightAlerts, morningDue, todaysEvents, londonParts } from './jarvisLogic.js';

/** Assemble the digest for the current London day. Returns null when the chain inputs are not available yet. */
export async function assemble(deps, now = Date.now()) {
  const state = await getState(deps), date = londonParts(now).date;
  const chain = await getChain(deps, now);
  let ev = null;
  try { const r = await deps.selfJson(`/api/calendar-events?from=${date}&to=${date}&minRank=3`); if (Array.isArray(r?.events)) ev = todaysEvents(r.events, date); } catch { /* no calendar: the line is skipped */ }
  const e = chain ? evaluate(chain, 1) : null;
  return buildDigest({ date, summary: e?.sum, radar: e?.radar, alerts: overnightAlerts(state.log, now), events: ev });
}

export async function tick(deps, now = Date.now()) {
  const state = await getState(deps);
  if (!morningDue(now, state.digestDate)) return { due: false };
  state.digestDate = londonParts(now).date;           // mark first: at most once a day, even if the send fails
  await saveState(deps);
  const d = await assemble(deps, now);
  if (!d.summary) return { due: true, sent: false, why: 'chain inputs not available' };   // never send a digest with no chain in it
  let sent = false;
  try { sent = !!(await deps.tgSend(d.text)); } catch (e) { console.warn('[jarvisMorning] telegram failed:', e.message); }
  return { due: true, sent };
}

export async function mount(app, deps) {
  app.get('/api/jarvis/morning', deps.ownerOnly, async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try { const d = await assemble(deps); res.json({ ok: true, date: d.date, summary: d.summary, movers: d.movers, overnightAlerts: d.overnightAlerts, events: d.events, text: d.text }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
  deps.svcInterval('jarvisMorning', () => tick(deps).catch(e => console.warn('[jarvisMorning]', e.message)), 300_000);
}
