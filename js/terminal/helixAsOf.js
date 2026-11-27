// js/terminal/helixAsOf.js: the shared, minimal as-of label every Helix view can draw (plans/HELIX_IMPROVEMENTS.md 0.18 / 3.2). The look lane draws the polished chip in the view header; this is the
// fallback so no view draws old data as live. Pure apart from drawAsOf (canvas 2D). DESCRIPTION ONLY: it says how old the data is, nothing else.
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const p2 = n => String(n).padStart(2, '0');
const toMs = v => (v == null || v === '' ? null : typeof v === 'number' ? (v > 1e12 ? v : v > 1e9 ? v * 1000 : null) : (ms => (Number.isFinite(ms) ? ms : null))(Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${v}T00:00:00Z` : String(v))));

/** { asOf: ms|null, stale: bool } from anything a loader hands back: a helixFetch load() result, an ISO string, epoch ms, or { asOf, stale }. maxAgeMs marks it stale by age. */
export function asOfInfo(src, { now = Date.now(), maxAgeMs = null } = {}) {
  const o = src && typeof src === 'object' ? src : { asOf: src };
  const asOf = toMs(o.asOf ?? o.at ?? null), age = asOf != null ? now - asOf : null;
  return { asOf, stale: !!o.stale || (maxAgeMs != null && age != null && age > maxAgeMs), ageMs: age };
}
/** "AS OF 07:02 UTC" today, "AS OF 26 NOV 21:00 UTC" before today, "AS OF 26 NOV" for a date-only stamp; "· STALE" when stale; "AS OF —" when unknown. UTC on purpose (no Intl). */
export function asOfLabel(info, now = Date.now()) {
  const { asOf, stale } = info ?? {};
  if (asOf == null) return stale ? 'DATA UNAVAILABLE' : 'AS OF —';
  const d = new Date(asOf), n = new Date(now), sameDay = d.toISOString().slice(0, 10) === n.toISOString().slice(0, 10);
  const dateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  const hm = `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())} UTC`, dm = `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
  const txt = dateOnly ? `AS OF ${dm}` : sameDay ? `AS OF ${hm}` : `AS OF ${dm} ${hm}`;
  return stale ? `${txt} · STALE` : txt;
}
/** Draw the label (small, right-aligned by default) on the HUD canvas. g: the view's draw context ({ W, C, fade, compact }). Returns the label. */
export function drawAsOf(ctx, g, info, { x = null, y = null, align = 'right', now = Date.now() } = {}) {
  const text = asOfLabel(info, now), stale = !!info?.stale;
  ctx.save(); ctx.globalAlpha = (g.fade ?? 1) * (stale ? 0.95 : 0.7); ctx.font = `${g.compact ? 9 : 10}px ${g.mono ?? 'ui-monospace,monospace'}`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = stale ? (g.C?.gold ?? '#e0b040') : (g.C?.tx2 ?? '#9aa');
  ctx.fillText(text, x ?? (align === 'right' ? g.W - 14 : 14), y ?? (g.compact ? 74 : 60)); ctx.restore();
  return text;
}
