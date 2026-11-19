// js/terminal/jarvisWeatherCore.js: the pure half of Jarvis's WEATHER view: today's measured stress and calm turned into the knobs of a sky. Every knob maps ONE measured input; nothing is invented
// (no storm "coming", no wind direction). DESCRIPTION ONLY. Inputs: /api/world-stress (tiles), /api/fredhistory (vix, vix3m, hy, sofr, iorb), /api/vol-forecast/live (instruments), the chain's broken links.
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const last = s => { const a = Array.isArray(s) ? s : []; for (let i = a.length - 1; i >= 0; i--) { const v = num(a[i]?.value); if (v != null) return { v, i, date: a[i].date }; } return null; };
const LEVEL = { ok: 0, watch: 0.5, stress: 1 };

/** The desk's stress lights: how many are not green, and their weighted share (amber half, red full). null when the feed is missing. */
export function stressLights(ws) {
  const tiles = Array.isArray(ws?.tiles) ? ws.tiles.filter(t => t && t.level in LEVEL) : [];
  if (!tiles.length) return null;
  const on = tiles.filter(t => t.level !== 'ok').length, red = tiles.filter(t => t.level === 'stress').length, share = tiles.reduce((s, t) => s + LEVEL[t.level], 0) / tiles.length, by = Object.fromEntries(tiles.map(t => [t.id, t]));
  return { n: tiles.length, on, red, share, overall: ws.overall ?? null, credit: by.credit ? LEVEL[by.credit.level] : null, funding: by.funding ? LEVEL[by.funding.level] : null, by };
}
/** VIX level and its term structure: spot over three-month. Above 1 = backwardation (the short end costs more). */
export function vixRead(h) {
  const v = last(h?.vix); if (!v) return null; const m = last(h?.vix3m), ratio = m && m.v > 0 ? v.v / m.v : null;
  return { vix: v.v, ratio, inverted: ratio != null && ratio > 1, level: clamp((v.v - 12) / 23) };
}
/** High-yield spread (percent) and its change over the last 20 readings, in basis points. */
export function creditRead(h) {
  const a = last(h?.hy); if (!a) return null; const arr = h.hy, b = arr[Math.max(0, a.i - 20)], bv = num(b?.value);
  return { hy: a.v * 100, d20: bv != null ? (a.v - bv) * 100 : null };
}
/** Funding: SOFR less the Fed's IORB, in basis points (positive = overnight money costs more than the Fed pays). */
export function fundingRead(h) { const s = last(h?.sofr), i = last(h?.iorb); return s && i ? { spread: (s.v - i.v) * 100 } : null; }
/** The share of desk markets whose move today is already beyond their usual open-to-close move (|oc| > forecast.oc_median). */
export function movedShare(vol) {
  let n = 0, past = 0;
  for (const v of Object.values(vol ?? {})) { const oc = num(v?.oc), md = num(v?.forecast?.oc_median); if (oc == null || !(md > 0)) continue; n++; if (Math.abs(oc) > md) past++; }
  return n ? { n, past, share: past / n } : null;
}

/** All the knobs, 0..1 unless noted, plus the list of feeds that are missing. */
export function weatherModel({ ws, hist, vol, broken } = {}) {
  const L = stressLights(ws), V = vixRead(hist), K = creditRead(hist), F = fundingRead(hist), M = movedShare(vol), b = num(broken), missing = [];
  if (!L) missing.push('stress lights'); if (!V) missing.push('VIX'); if (!K) missing.push('credit spread'); if (!M) missing.push('market moves');
  const density = L ? L.share : null;
  return {
    L, V, K, F, M, broken: b, missing,
    density,                                            // cloud cover = the stress lights
    turbulence: V ? V.level : null,                     // how violently the cloud churns = VIX level
    rain: L?.credit ?? null,                            // rain = the credit light
    mist: L?.funding ?? null,                           // ground mist = the dollar-funding light
    lightning: M ? M.share : null,                      // lightning rate = share of markets past their usual move
    jag: V?.ratio != null ? clamp((V.ratio - 0.92) / 0.16) : null,   // ridge roughness = VIX term structure (jagged when inverted)
    aurora: density != null ? clamp(1 - density * 1.6) : null,       // aurora = lights off
    embers: b != null ? Math.min(40, Math.round(b)) : null,          // sparks on the ground = broken chain links
    tone: !L ? 'quiet' : L.overall === 'stress' ? 'dn' : L.overall === 'watch' ? 'gold' : 'blue',
  };
}

const W = n => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
/** The spoken weather report, plain measured terms. null when the stress lights are missing. */
export function weatherScript(m) {
  if (!m?.L) return null;
  const s = [], L = m.L;
  s.push(`Now the market weather. ${L.on === 0 ? `Stress is low: none of the ${W(L.n)} stress lights is on.` : `${W(L.on)} of ${W(L.n)} stress lights are on, ${W(L.red)} of them red.`}`);
  if (m.K) s.push(`High yield credit is ${m.K.hy < 330 ? 'calm' : m.K.hy < 450 ? 'steady' : 'wide'}, at ${Math.round(m.K.hy)} basis points${m.K.d20 != null ? `, ${m.K.d20 >= 0 ? 'up' : 'down'} ${Math.round(Math.abs(m.K.d20))} over twenty days` : ''}.`);
  if (m.V) s.push(`The VIX is ${m.V.vix.toFixed(1)}${m.V.ratio != null ? m.V.inverted ? ', and the short end costs more than the three month, which is an inverted curve' : ', with the usual upward curve' : ''}.`);
  if (m.M) s.push(`${Math.round(m.M.share * 100)} percent of markets have moved more than their usual amount today, which is the lightning.`);
  if (m.broken != null) s.push(m.broken === 0 ? 'No chain links are broken.' : `${W(m.broken)} chain ${m.broken === 1 ? "link is" : "links are"} broken.`);
  s.push('This is a description of what has been measured, not a forecast.');
  return s.join(' ');
}
