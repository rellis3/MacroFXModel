// js/terminal/helixRecord.js: the client half of the Helix daily record (plans/HELIX_IMPROVEMENTS.md 3.7). When a broadcast is about to play, what it was given and what it will say
// (inputs, headline, plan, the text of every scene) is posted to /api/helix/record, which keeps it in R2 as helix/days/<date>.json for replay and scoring. The server adds the
// watcher summary. Pure apart from postDayRecord (fire and forget; a failure never touches the broadcast). DESCRIPTION ONLY: a record of what was said.
const londonDate = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const MAX = 300_000;

/** The body for POST /api/helix/record. inp: the broadcast's gathered inputs; P: planBroadcast's plan ({ items }). */
export function dayRecordBody(inp, P, { mode = null, part = 'morning', now = Date.now() } = {}) {
  const movers = (inp?.movers ?? []).slice(0, 8).map(m => ({ key: m?.key ?? null, oc: m?.oc ?? null, vsUsual: m?.ratio ?? null, tone: m?.tone ?? null }));
  const events = Array.isArray(inp?.events) ? inp.events : [];
  const inputs = {
    movers, board: inp?.board ?? null, chain: inp?.chain ?? null, events: { n: events.length, first: events.slice(0, 10).map(e => ({ time: e?.time ?? null, country: e?.country ?? null, event: e?.event ?? null })) },
    degraded: inp?.degraded ?? null, bundleAsOf: inp?.bundleAsOf ?? null,
  };
  const plan = (P?.items ?? []).map(x => ({ kind: x?.kind ?? null, id: x?.id ?? x?.scene?.id ?? null, title: x?.title ?? null, view: x?.view ?? null, text: typeof x?.text === 'string' ? x.text : null }));
  const body = { date: londonDate(now), part, mode, headline: inp?.headline ?? null, inputs, plan, degraded: inp?.degraded?.blocks ?? [] };
  if (JSON.stringify(body).length > MAX) body.headline = { dropped: 'too large for the record' };
  return body;
}
/** Post it; resolves to the server's reply or null. Never throws. */
export async function postDayRecord(jf, body) {
  try { return await jf('/api/helix/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch (e) { return null; }
}
