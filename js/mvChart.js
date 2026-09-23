/**
 * Charts for the Market View, hand-built as SVG.
 *
 * WHY NO LIBRARY. The chain graphic on today.html is hand-rolled SVG and it is the
 * best thing on this site, because every mark on it means something specific and the
 * annotations are part of the drawing rather than a legend bolted on. A charting
 * library would give faster axes and worse explanations. These builders are small,
 * pure, and produce a string.
 *
 * WHAT EACH CHART IS FOR. Not decoration — each one exists because a particular
 * sentence is unconvincing without it:
 *
 *   dualLine   "crude fell two and a half points and the S&P closed flat" — two things
 *              that normally move together, drawn on one scale so the gap IS the point.
 *   levelLine  "two-year-to-ten went from 54bp to 20bp" — one series with the before
 *              and after called out on the line itself.
 *   histogram  "z of +2.4" means nothing to a reader. Where today sits against three
 *              years of the same measurement means everything.
 *   analogueStrip  "this is what broke the market in June" — past episodes, each shown
 *              as what actually followed, so the phrase has evidence under it.
 *
 * THEMING. Every colour is a CSS variable the page already defines, so these work in
 * both themes without being redrawn. Nothing here reads the DOM or fetches.
 *
 * Tested in js/mvChart.test.mjs.
 */

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nice = v => Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);

/** Drop leading/trailing nulls and report whether enough is left to draw. */
function clean(arr) {
  const out = (arr ?? []).map(v => (typeof v === 'number' && Number.isFinite(v)) ? v : null);
  const first = out.findIndex(v => v != null);
  if (first < 0) return [];
  let last = out.length - 1; while (last > first && out[last] == null) last--;
  return out.slice(first, last + 1);
}

/** Carry the last real value across gaps, so a holiday does not break the line. */
function fill(arr) {
  const out = clean(arr); let prev = null;
  return out.map(v => { if (v != null) prev = v; return prev; }).filter(v => v != null);
}

/**
 * Two series, each rebased to 0% at the left edge, with the gap between them shaded.
 *
 * Rebasing is what makes the comparison legible: crude in dollars and the S&P in index
 * points cannot share an axis, but "how far has each travelled since the start of the
 * window" can. The shaded area is the divergence, which is the thing being talked about.
 */
export function dualLine(aRaw, bRaw, { labelA = 'A', labelB = 'B', w = 640, h = 190, note = '' } = {}) {
  const A = fill(aRaw), B = fill(bRaw);
  const n = Math.min(A.length, B.length);
  if (n < 5) return `<div class="mvc-none">Not enough overlapping history to draw this.</div>`;
  const a = A.slice(-n), b = B.slice(-n);
  const rb = s => s[0] === 0 ? s.map(() => 0) : s.map(v => (v / s[0] - 1) * 100);
  const pa = rb(a), pb = rb(b);
  const all = [...pa, ...pb];
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const L = 42, R = 8, T = 10, Bm = 20;                 // room for the axis labels
  const x = i => L + (i / (n - 1)) * (w - L - R);
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (h - T - Bm);
  const path = s => s.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  // the divergence ribbon: A's line out, B's line back, closed
  const band = `${pa.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}` +
               `${pb.map((v, i) => `L${x(n - 1 - i).toFixed(1)},${y(pb[n - 1 - i]).toFixed(1)}`).join('')}Z`;
  const gap = pa[n - 1] - pb[n - 1];
  const ticks = [hi - pad, (hi + lo) / 2, lo + pad].map(v =>
    `<line x1="${L}" x2="${w - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="mvc-grid"/>
     <text x="${L - 5}" y="${(y(v) + 3).toFixed(1)}" class="mvc-ax" text-anchor="end">${v > 0 ? '+' : ''}${v.toFixed(0)}%</text>`).join('');
  return `<figure class="mvc"><svg viewBox="0 0 ${w} ${h}" role="img" preserveAspectRatio="none"
      aria-label="${esc(labelA)} against ${esc(labelB)} over ${n} sessions, both rebased to zero at the start; the shaded area is how far apart they have travelled">
    ${ticks}
    <line x1="${L}" x2="${w - R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="mvc-zero"/>
    <path d="${band}" class="mvc-band ${gap >= 0 ? 'pos' : 'neg'}"/>
    <path d="${path(pa)}" class="mvc-a"/><path d="${path(pb)}" class="mvc-b"/>
    <circle cx="${x(n - 1).toFixed(1)}" cy="${y(pa[n - 1]).toFixed(1)}" r="3" class="mvc-dota"/>
    <circle cx="${x(n - 1).toFixed(1)}" cy="${y(pb[n - 1]).toFixed(1)}" r="3" class="mvc-dotb"/>
  </svg>
  <figcaption class="mvc-cap"><span class="ka">${esc(labelA)} ${pa[n - 1] > 0 ? '+' : ''}${pa[n - 1].toFixed(1)}%</span>
    <span class="kb">${esc(labelB)} ${pb[n - 1] > 0 ? '+' : ''}${pb[n - 1].toFixed(1)}%</span>
    <span class="kg">${Math.abs(gap).toFixed(1)} points apart</span>
    ${note ? `<span class="kn">${esc(note)}</span>` : ''}</figcaption></figure>`;
}

/**
 * One series with its start and end called out on the line.
 *
 * Built for the sentence "two-year-to-ten went from 54bp to 20bp": the number that
 * matters is the CHANGE, and a chart that makes you read it off an axis has failed.
 */
export function levelLine(raw, { label = '', unit = '', w = 640, h = 170, mult = 1, decimals = 0 } = {}) {
  const S = fill(raw).map(v => v * mult);
  const n = S.length;
  if (n < 5) return `<div class="mvc-none">Not enough history to draw this.</div>`;
  let lo = Math.min(...S), hi = Math.max(...S);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.18; lo -= pad; hi += pad;
  const L = 46, R = 58, T = 12, Bm = 16;
  const x = i => L + (i / (n - 1)) * (w - L - R);
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (h - T - Bm);
  const d = S.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${d}L${x(n - 1).toFixed(1)},${(h - Bm).toFixed(1)}L${L},${(h - Bm).toFixed(1)}Z`;
  const first = S[0], last = S[n - 1], up = last >= first;
  const f = v => `${v.toFixed(decimals)}${unit}`;
  const zero = (lo < 0 && hi > 0)
    ? `<line x1="${L}" x2="${w - R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="mvc-zero"/>` : '';
  return `<figure class="mvc"><svg viewBox="0 0 ${w} ${h}" role="img" preserveAspectRatio="none"
      aria-label="${esc(label)} from ${f(first)} to ${f(last)} over ${n} sessions">
    ${zero}
    <path d="${area}" class="mvc-fill ${up ? 'pos' : 'neg'}"/>
    <path d="${d}" class="mvc-line ${up ? 'pos' : 'neg'}"/>
    <circle cx="${L}" cy="${y(first).toFixed(1)}" r="3.2" class="mvc-mark"/>
    <circle cx="${x(n - 1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="4" class="mvc-mark now"/>
    <text x="${L + 6}" y="${(y(first) - 7).toFixed(1)}" class="mvc-tag">${f(first)}</text>
    <text x="${(w - R + 6).toFixed(1)}" y="${(y(last) + 4).toFixed(1)}" class="mvc-tag now">${f(last)}</text>
  </svg>
  <figcaption class="mvc-cap"><span class="kn">${esc(label)} · ${f(first)} → ${f(last)}
    (${last - first > 0 ? '+' : ''}${(last - first).toFixed(decimals)}${unit}) over ${n} sessions</span></figcaption></figure>`;
}

/**
 * Where today's move sits against every other move of the same length.
 *
 * This is the chart that makes a z-score mean something. The bars are the past, the
 * marker is now, and a reader can see for themselves whether "rare" is being oversold.
 */
export function histogram(hist, now, { w = 300, h = 110, unit = '', bins = 27 } = {}) {
  const H = clean(hist);
  if (H.length < 20 || now == null) return `<div class="mvc-none">Not enough history.</div>`;
  const lo = Math.min(...H, now), hi = Math.max(...H, now);
  if (hi - lo < 1e-9) return `<div class="mvc-none">No variation to plot.</div>`;
  const step = (hi - lo) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of H) counts[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / step)))]++;
  const peak = Math.max(...counts, 1);
  const T = 6, Bm = 16;
  const bw = w / bins;
  const nowBin = Math.min(bins - 1, Math.max(0, Math.floor((now - lo) / step)));
  const bars = counts.map((c, i) => {
    const bh = (c / peak) * (h - T - Bm);
    return `<rect x="${(i * bw).toFixed(1)}" y="${(h - Bm - bh).toFixed(1)}" width="${(bw - 0.6).toFixed(1)}"
      height="${bh.toFixed(1)}" class="mvc-bar ${i === nowBin ? 'now' : ''}"/>`;
  }).join('');
  const nx = ((nowBin + 0.5) * bw).toFixed(1);
  const below = H.filter(v => v <= now).length / H.length;
  return `<figure class="mvc small"><svg viewBox="0 0 ${w} ${h}" role="img"
      aria-label="Today's move against ${H.length} past moves of the same length; today sits above ${Math.round(below * 100)}% of them">
    ${bars}
    <line x1="${nx}" x2="${nx}" y1="${T}" y2="${h - Bm}" class="mvc-nowline"/>
    <text x="${nx}" y="${(h - 4).toFixed(1)}" class="mvc-ax" text-anchor="${nowBin > bins * 0.75 ? 'end' : nowBin < bins * 0.25 ? 'start' : 'middle'}">today ${now > 0 ? '+' : ''}${nice(now)}${unit}</text>
  </svg>
  <figcaption class="mvc-cap"><span class="kn">bigger than ${Math.round(below * 100)}% of the last ${H.length} readings</span></figcaption></figure>`;
}

/** A tiny inline line, for a tile. No axes, no labels — shape only. */
export function spark(raw, { w = 90, h = 24 } = {}) {
  const S = fill(raw);
  if (S.length < 3) return '';
  const lo = Math.min(...S), hi = Math.max(...S), rng = (hi - lo) || 1;
  const pts = S.map((v, i) => `${(i / (S.length - 1) * w).toFixed(1)},${(h - ((v - lo) / rng) * h).toFixed(1)}`).join(' ');
  return `<svg class="mvc-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}"
    class="${S[S.length - 1] >= S[0] ? 'pos' : 'neg'}"/></svg>`;
}
