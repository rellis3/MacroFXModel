/**
 * Releases board (Desk Terminal, Macro tab): the pure shaping. No fetch, no DOM; `now` is passed in.
 *
 *   buildReleasesBoard({ events, cot, reactions, eventDay, now })   what /api/releases-board serves
 *   describeReleases(rb)                                            the rule-built sentence
 *
 * What it joins, from feeds that were only in the analysts' pack: the week's high-impact releases (/api/events) against the leveraged-fund
 * position in that currency (/api/cot-extremes, read through js/atlasPosition.js crowding(), long-the-currency terms), the Event Book's typical
 * 30-minute move for the release (js/eventImpactMap.js: SIZE is what this desk has shown is learnable), the Release Reaction layer's measured
 * reactions to the last releases and how each volatility regime has run (/api/release-reactions), and the front-end rate legs
 * (/api/event-day).
 *
 * Wording rules, from the Evidence Book: positioning-into-release-direction passed as registered (price drifted slightly against a crowded book,
 * +0.06 ATR) but the prereg itself calls it a hypothesis awaiting held-out years, and positioning-into-release-range is NULL (a crowded book does
 * not make the day wider). So the board says who is positioned and which side would have to act on a surprise; it does not say which way price goes.
 */
import { crowding } from './atlasPosition.js';
import { FLIPPED } from './cotState.js';
import { eventImpactFor } from './eventImpactMap.js';
import { COUNTRY_INSTRUMENTS } from './releaseScorecard.js';

const fin = v => v != null && Number.isFinite(+v);
const HOUR = 3600e3, DAY = 864e5;
const CCY = { US: 'USD', EU: 'EUR', DE: 'EUR', FR: 'EUR', GB: 'GBP', JP: 'JPY', AU: 'AUD', NZ: 'NZD', CA: 'CAD', CH: 'CHF' };
const CCY_ORDER = ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
/** The prereg's crowding rule for this question: share-of-OI percentile >= 80 (long) or <= 20 (short). */
export const CROWD_HI = 80, CROWD_LO = 20;

/** The leveraged-fund position per currency, in "long the currency" terms (the JPY / CAD / CHF futures rows are quoted the other way round).
    Crowded needs the percentile AND the sign to agree: a net long at the 10th percentile is a trimmed book, not a crowded short (the prereg's rule). */
export function positions(cot) {
  const rows = crowding(cot ?? {}).filter(r => CCY_ORDER.includes(r.sym));
  return CCY_ORDER.map(c => rows.find(r => r.sym === c)).filter(Boolean).map(r => {
    const flip = FLIPPED.has(r.sym), pct = Math.round(flip ? 100 - r.pct : r.pct), net = fin(r.share) ? (flip ? -r.share : r.share) : (fin(r.net) ? (flip ? -r.net : r.net) : null);
    const side = net == null ? null : pct >= CROWD_HI && net > 0 ? 'long' : pct <= CROWD_LO && net < 0 ? 'short' : null;
    return { ccy: r.sym, pct, side, crowded: side != null, state: r.ccyState ?? r.state, netSign: net == null ? null : Math.sign(net) };
  });
}

/** Group same-minute same-country prints into one release; keep high impact within the window. */
export function upcoming(events, now, { back = 12 * HOUR, ahead = 7 * DAY } = {}) {
  const by = new Map();
  for (const e of events ?? []) {
    if (!e?.ms || String(e.impact ?? '').toLowerCase() !== 'high' || e.ms < now - back || e.ms > now + ahead) continue;
    const k = `${e.country}|${e.ms}`;
    if (!by.has(k)) by.set(k, { country: e.country, ccy: CCY[e.country] ?? null, ms: e.ms, prints: [] });
    by.get(k).prints.push({ event: e.event, estimate: e.estimate ?? null, prev: e.prev ?? null, actual: e.actual ?? null });
  }
  return [...by.values()].sort((a, b) => a.ms - b.ms);
}

export function buildReleasesBoard({ events = [], cot = null, reactions = null, eventDay = null, now = Date.now() } = {}) {
  const pos = positions(cot), byCcy = Object.fromEntries(pos.map(p => [p.ccy, p]));
  const rel = upcoming(events, now).map(r => {
    const p = byCcy[r.ccy] ?? null, first = r.prints[0], imp = eventImpactFor(r.country, first.event);
    const main = COUNTRY_INSTRUMENTS[r.country]?.[0] ?? null;
    return { ...r, done: r.ms <= now, pos: p ? { pct: p.pct, side: p.side, crowded: p.crowded, state: p.state } : null,
      typical: imp ? { label: imp.label ?? null, spike: fin(imp.medSpike) ? imp.medSpike : null, events: imp.events ?? null, main, mainSpike: main ? (imp.instruments?.[main]?.spike ?? null) : null, mainN: main ? (imp.instruments?.[main]?.n ?? null) : null } : null };
  });
  // one row per release moment (same country, same minute): the prints share the market reaction, so the names are joined
  const seen = new Map();
  for (const x of [...(reactions?.live ?? []), ...(reactions?.recent ?? [])].filter(x => x?.surprise && x.ms).sort((a, b) => b.ms - a.ms)) {
    const k = `${x.country}|${x.ms}`; if (!seen.has(k)) seen.set(k, { ...x, _names: [x.event] }); else if (!seen.get(k)._names.includes(x.event)) seen.get(k)._names.push(x.event);
  }
  const rec = [...seen.values()].slice(0, 6).map(x => ({
    ms: x.ms, country: x.country, event: x._names.slice(0, 3).join(' · '), family: x.family ?? null, actual: x.surprise.actual ?? null, estimate: x.surprise.estimate ?? null, direction: x.surprise.direction ?? null, z: fin(x.surprise.z) ? Math.round(x.surprise.z * 100) / 100 : null,
    size: x.surprise.size ?? null, tone: x.regime?.tone ?? null, source: x.source,
    markets: (x.markets ?? []).filter(m => ['eurusd', 'usdjpy', 'gold', 'nq', 'es'].includes(m.id) && fin(m.m30)).slice(0, 3).map(m => ({ id: m.id, label: m.label, m30: m.m30, unit: m.unit ?? '%', label30: m.label30 ?? null, m240: fin(m.m240) ? m.m240 : null, label240: m.label240 ?? null })) }));
  const regimes = ['calm', 'normal', 'stressed'].map(rg => { const s = (reactions?.summary ?? []).find(x => x.family === 'ALL' && x.regime === rg); if (!s) return null;
    return { regime: rg, n: s.n, m30: { n: s.m30?.n ?? 0, nClear: s.m30?.nClear ?? 0, labels: s.m30?.labels ?? {}, asExpected: s.m30?.expected ?? null } }; }).filter(Boolean);
  const fe = eventDay?.frontEnds?.rows?.length ? { asOf: eventDay.frontEnds.asOf ?? null, stale: !!eventDay.frontEnds.stale, rows: eventDay.frontEnds.rows.map(r => ({ label: r.label, area: r.area, unit: r.unit, d1: fin(r.d1) ? Math.round(r.d1 * 10) / 10 : null, d5: fin(r.d5) ? Math.round(r.d5 * 10) / 10 : null })) } : null;
  if (!pos.length && !rel.length && !rec.length) return { ok: false, error: 'no calendar, positioning or reaction feed has landed yet' };
  return { ok: true, builtAt: new Date(now).toISOString(), now, positions: pos, releases: rel, recent: rec, regimes, studyN: reactions?.studyN ?? null, frontEnds: fe, cotDate: cot?.reportDate ?? null };
}

export const ord = n => { const k = Math.abs(n) % 100, j = k % 10; return `${n}${k >= 11 && k <= 13 ? 'th' : j === 1 ? 'st' : j === 2 ? 'nd' : j === 3 ? 'rd' : 'th'}`; };
const fmtT = ms => new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' });
export { fmtT as londonTime };

/** One paragraph by rule: how many releases are ahead, which currencies are crowded, and what the finding does and does not say. */
export function describeReleases(rb) {
  if (!rb?.ok) return null;
  const p = [], ahead = rb.releases.filter(r => !r.done);
  p.push(ahead.length ? `${ahead.length} high-impact release${ahead.length === 1 ? '' : 's'} on the calendar in the next seven days` : 'No high-impact release is on the calendar yet for the next seven days (next week fills in over the weekend)');
  const crowded = rb.positions.filter(x => x.crowded);
  if (crowded.length) p.push(`leveraged funds are crowded ${crowded.map(c => `${c.side} ${c.ccy} (${ord(c.pct)} percentile)`).join(', ')}`);
  else if (rb.positions.length) p.push('no currency is crowded either way among the seven');
  let out = `${p.join('; ')}.`;
  const hit = ahead.filter(r => r.pos?.crowded);
  if (hit.length) out += ` ${hit.map(r => `${r.ccy} is crowded ${r.pos.side} into ${r.prints[0].event}`).slice(0, 3).join('; ')}: that is the side that would have to act on a surprise against it.`;
  return out;
}
