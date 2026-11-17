/**
 * Desk Terminal, Calendar tab: the "since the last close" surprise strip. Pure: no DOM, no fetch.
 *
 * Takes the live release log (/api/release-surprises: high-impact prints read within a minute, each with its currency and the
 * z of its surprise against that release's own history) and adds it up per currency over a window (24 h by default).
 *
 * What it says and does not say. z > 0 means the print came in ABOVE consensus, z < 0 BELOW. That is not "good" or "bad" for the
 * currency (a higher unemployment rate is above consensus and is bad news), so the strip carries no good/bad colour and no
 * direction call: it explains what was released, not where the currency goes. Each z is clipped at +/-3 so one outlier cannot be
 * the whole sum, and the sum is shown with the count and the biggest single print so a total built on one release reads as one.
 * Only high-impact releases are in the log, so a quiet strip means no big print, not no print.
 */
export const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
export const Z_CLIP = 3;
const fin = v => v != null && Number.isFinite(+v);

/**
 * @param {Array} log     release-surprise log rows: { ms, ccy, event, surprise: { ok, z } }
 * @param {number} now    ms
 * @param {number} windowH hours back from now
 * @returns {{ rows: Array<{ccy,n,sum,mean,top}>, from: number, to: number, used: number, skipped: number }}
 */
export function surpriseRollup(log, now, windowH = 24) {
  const from = now - windowH * 3600e3, by = {};
  let used = 0, skipped = 0;
  for (const x of log ?? []) {
    const ms = Number(x?.ms);
    if (!fin(ms) || ms < from || ms > now) continue;
    const z = x?.surprise?.ok ? x.surprise.z : null;
    if (!x?.ccy || !fin(z)) { skipped++; continue; }      // no currency, or no z (first print of a series, no history): counted, never zero-filled
    const c = Math.max(-Z_CLIP, Math.min(Z_CLIP, +z));
    (by[x.ccy] ||= []).push({ ms, event: x.event, z: +z, c });
    used++;
  }
  const rows = CCYS.map(ccy => {
    const l = by[ccy] ?? [];
    if (!l.length) return { ccy, n: 0, sum: null, mean: null, top: null };
    const sum = l.reduce((s, p) => s + p.c, 0), top = l.reduce((m, p) => (Math.abs(p.z) > Math.abs(m.z) ? p : m));
    return { ccy, n: l.length, sum: +sum.toFixed(2), mean: +(sum / l.length).toFixed(2), top: { event: top.event, z: +top.z.toFixed(2), ms: top.ms } };
  });
  return { rows, from, to: now, used, skipped };
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sgn = (v, d = 1) => (fin(v) ? `${v > 0 ? '+' : ''}${(+v).toFixed(d)}` : '–');

/** The strip: one chip per currency. Above consensus = gold, below = purple (the terminal's existing surprise colours), none = muted. */
export function rollupHtml(r, windowH = 24) {
  if (!r || !r.used) return `<p class="muted" style="font-size:12px;margin:6px 0">No high-impact print with a z in the last ${windowH} h${r?.skipped ? ` (${r.skipped} without a z)` : ''}.</p>`;
  const chip = x => x.n
    ? `<span class="chip mono ${x.sum > 0.05 ? 'gold' : x.sum < -0.05 ? 'pur' : ''}" title="${esc(x.top.event)} z ${sgn(x.top.z, 2)}; ${x.n} print${x.n > 1 ? 's' : ''}, each z clipped at ±${Z_CLIP}">${x.ccy} ${sgn(x.sum)}σ <span class="muted" style="font-size:11px">${x.n}× · ${esc(String(x.top.event).slice(0, 22))} ${sgn(x.top.z)}</span></span>`
    : `<span class="chip mono muted">${x.ccy} –</span>`;
  return `<div class="drv" style="margin:6px 0 10px"><span class="muted" style="font-size:12px">Last ${windowH} h, summed z:</span> ${r.rows.map(chip).join(' ')}</div>
<p class="muted" style="font-size:12px;margin:0 0 8px">Above consensus (gold) or below (purple), not good or bad: a higher jobless rate is above consensus. High-impact prints only, so a dash means no big print. Describes the release flow; not a signal.</p>`;
}

/** The Pair-tab card: only the pair's own currencies (an asset priced in dollars shows USD), same rules as the strip. */
export function pairStripHtml(log, now, ccys, windowH = 24) {
  const want = new Set((ccys ?? []).filter(Boolean));
  if (!want.size) return '';
  const r = surpriseRollup(log, now, windowH);
  return rollupHtml({ ...r, rows: r.rows.filter(x => want.has(x.ccy)) }, windowH);
}
