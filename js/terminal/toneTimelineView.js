/**
 * The central-bank tone timeline: the last ten meetings' tone as a flowing ribbon, the wording that changed since the previous
 * statement, how the weight on each theme moved, and (on the Fed's tile) the Beige Book's change chip. Pure HTML-string builders, no
 * fetch, no DOM: the Macro > Central-bank statements tiles (cbBoardView.js) and the Currency modal both use them.
 *
 * CONTEXT, NOT A SIGNAL. The tone of a statement is priced inside 30 minutes and does not predict the next-day dollar (Evidence Book
 * cb-tone-direction, NULL, N=82 meetings); the post-FOMC USD drift is VALIDATED but fragile (post-fomc-usd-drift). So this shows how a
 * bank's language has moved and when, never which way a currency will go. A meeting with no stored read is a hollow gap, never filled in.
 * Colour follows the board's rule: gold above the line = hawkish, purple below = dovish. Theme tokens only.
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fin = v => v != null && v !== '' && Number.isFinite(+v);
const sg = (v, dp = 2) => (fin(v) ? `${+v > 0 ? '+' : ''}${(+v).toFixed(dp)}` : '–');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-10-28' -> '28 Oct' (the date as written, never through a timezone). */
export const dshort = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? '')); return m ? `${+m[3]} ${MON[+m[2] - 1] ?? ''}` : '–'; };

let uid = 0;

/** A smooth path through [x, y] points (Catmull-Rom to Bezier), clamped to [yMin, yMax] so a bend never leaves the drawing. */
export function smoothPath(pts, yMin = -1e9, yMax = 1e9, t = 0.5) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const cl = y => Math.min(yMax, Math.max(yMin, y));
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + ((p2[0] - p0[0]) * t) / 3, cl(p1[1] + ((p2[1] - p0[1]) * t) / 3)];
    const c2 = [p2[0] - ((p3[0] - p1[0]) * t) / 3, cl(p2[1] - ((p3[1] - p1[1]) * t) / 3)];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * The ribbon. timeline = [{ date, score, regime, headline } | { date, unread: true }] oldest first. Tone -1..+1 on a fixed scale
 * (so two banks' ribbons are comparable), the zero line dashed, a hollow dot where a meeting has no stored read.
 */
export function ribbonSvg(timeline, { w = 300, h = 86 } = {}) {
  const tl = Array.isArray(timeline) ? timeline.filter(x => x && x.date) : [];
  const scored = tl.filter(x => !x.unread && fin(x.score));
  if (scored.length < 1) return '';
  const id = `tt${++uid}`, padX = 14, padR = 46, top = 10, bot = 22, mid = top + (h - top - bot) / 2, amp = (h - top - bot) / 2 - 3;
  const X = i => (tl.length === 1 ? (padX + w - padR) / 2 : padX + (i * (w - padR - padX)) / (tl.length - 1));
  const Y = s => mid - Math.max(-1, Math.min(1, +s)) * amp;
  const pts = tl.map((x, i) => (x.unread || !fin(x.score) ? null : [X(i), Y(x.score), x, i])).filter(Boolean);
  const line = smoothPath(pts.map(p => [p[0], p[1]]), top, h - bot);
  const area = pts.length > 1 ? `${line} L${pts.at(-1)[0].toFixed(1)},${mid.toFixed(1)} L${pts[0][0].toFixed(1)},${mid.toFixed(1)} Z` : '';
  const last = pts.at(-1), lastCls = +last[2].score >= 0 ? 'var(--gold)' : 'var(--pur)';
  const showLbl = i => i === 0 || i === tl.length - 1 || (tl.length <= 6) || i === Math.floor((tl.length - 1) / 2);
  const dots = tl.map((x, i) => {
    const cx = X(i).toFixed(1);
    const lab = showLbl(i) ? `<text x="${cx}" y="${h - 8}" text-anchor="${i === 0 ? 'start' : i === tl.length - 1 ? 'end' : 'middle'}" class="tt-d">${esc(dshort(x.date))}</text>` : '';
    if (x.unread || !fin(x.score)) return `${lab}<circle cx="${cx}" cy="${mid.toFixed(1)}" r="3" class="tt-gap"><title>${esc(dshort(x.date))}: no stored read for this meeting</title></circle>`;
    const hawk = +x.score >= 0, cy = Y(x.score).toFixed(1);
    return `${lab}<circle cx="${cx}" cy="${cy}" r="${i === tl.length - 1 ? 3.6 : 2.4}" fill="${hawk ? 'var(--gold)' : 'var(--pur)'}"><title>${esc(dshort(x.date))}: ${esc(sg(x.score))}${x.regime ? ` (${esc(String(x.regime).toLowerCase())})` : ''}${x.headline ? `. ${esc(x.headline)}` : ''}</title></circle>`;
  }).join('');
  const aria = `Tone at ${scored.length} of the last ${tl.length} meetings, oldest to newest: ${scored.map(x => `${dshort(x.date)} ${sg(x.score)}`).join(', ')}. Context only.`;
  return `<svg class="tt" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(aria)}">
<defs><linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${h - bot}"><stop offset="0" stop-color="var(--gold)"/><stop offset="0.5" stop-color="var(--gold)"/><stop offset="0.5" stop-color="var(--pur)"/><stop offset="1" stop-color="var(--pur)"/></linearGradient>
<filter id="${id}f" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="2.6"/></filter></defs>
<line x1="${padX - 6}" x2="${w - padR + 8}" y1="${mid.toFixed(1)}" y2="${mid.toFixed(1)}" class="tt-zero"/>
<text x="${w - 2}" y="${(top + 4).toFixed(1)}" text-anchor="end" class="tt-d">hawkish</text><text x="${w - 2}" y="${(h - bot - 1).toFixed(1)}" text-anchor="end" class="tt-d">dovish</text>
${area ? `<path d="${area}" fill="url(#${id}g)" opacity="0.14"/>` : ''}
${pts.length > 1 ? `<path d="${line}" fill="none" stroke="url(#${id}g)" stroke-width="7" stroke-linecap="round" opacity="0.38" filter="url(#${id}f)"/>` : ''}
${pts.length > 1 ? `<path class="tt-ribbon" pathLength="1" d="${line}" fill="none" stroke="url(#${id}g)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
${dots}
<circle class="tt-pulse" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="6" fill="none" stroke="${lastCls}" stroke-width="1.2"/>
</svg>`;
}

/** "Wording that changed since <previous meeting>": up to three swaps (removed in muted strike-through, added in the lead colour). */
export function phrasesHtml(b) {
  const ph = b?.read?.phrases;
  if (!Array.isArray(ph) || !ph.length) return '';
  const since = b.change?.from ? ` since ${esc(dshort(b.change.from))}` : '';
  return `<div class="tt-ph"><span class="lbl">Wording that changed${since}</span>${ph.map(p => `<span class="tt-sw"><s>${esc(p.from)}</s><i aria-hidden="true">→</i><b>${esc(p.to)}</b></span>`).join('')}</div>`;
}

/** How much the statement dwells on each theme moved against the previous one (concern, not direction): up to three chips. */
export function themesHtml(b) {
  const th = b?.themes;
  if (!Array.isArray(th) || !th.length) return '';
  return `<div class="tt-th"><span class="lbl">Weight shifted</span>${th.map(x => `<span class="chip" title="how much the text dwells on ${esc(x.label.toLowerCase())}, against the previous statement: more attention, not a lean" style="color:var(${x.delta > 0 ? '--gold' : '--pur2'})">${esc(x.label)} ${x.delta > 0 ? '▲' : '▼'}${esc(Math.abs(x.delta).toFixed(2))}</span>`).join('')}</div>`;
}

/** A bank whose statement pages are blocked and has only the decision headline: say the tone is frozen, with the date it froze at. */
export function frozenHtml(b) {
  if (b?.status !== 'headline_only') return '';
  const r = b.read;
  return `<p class="tt-note">${r ? `Tone frozen at the last captured statement (${esc(dshort(r.date))}, ${esc(sg(r.score))}${r.regime ? `, ${esc(String(r.regime).toLowerCase())}` : ''}). ` : 'No statement has been captured. '}${b.blocked ? 'Newer ones are blocked by the bank\'s firewall, so nothing is estimated for them.' : 'Newer ones have not been captured, so nothing is estimated for them.'}</p>`;
}

/** The Beige Book's change chip for the Fed's tile: release date, tone and its move, and the themes that moved most. */
export function beigeChipHtml(beige) {
  const r = beige?.read;
  if (!r || beige.status === 'no_read') return '';
  const d = beige.change?.delta, th = (beige.themes ?? []).slice(0, 2);
  const tip = `Beige Book released ${dshort(r.date)}: tone ${sg(r.score)}${fin(d) ? `, ${Math.abs(d) < 0.05 ? 'unchanged' : `${d > 0 ? 'up' : 'down'} ${Math.abs(d).toFixed(2)}`} on the release before` : ''}. Context: the Beige Book reads the twelve districts' own words; its tone has not been tested against the dollar.`;
  return `<div class="tt-bb" title="${esc(tip)}"><span class="lbl">Beige Book ${esc(dshort(r.date))}</span><span class="chip">tone ${esc(sg(r.score))}</span>${fin(d) && Math.abs(d) >= 0.05 ? `<span class="chip" style="color:var(${d > 0 ? '--gold' : '--pur2'})">${d > 0 ? '▲' : '▼'} ${esc(Math.abs(d).toFixed(2))}</span>` : ''}${th.map(x => `<span class="chip" style="color:var(${x.delta > 0 ? '--gold' : '--pur2'})">${esc(x.label)} ${x.delta > 0 ? '▲' : '▼'}${esc(Math.abs(x.delta).toFixed(2))}</span>`).join('')}</div>`;
}

/** The whole strip: ribbon, coverage, wording swaps, theme shifts. compact = the Currency modal (no theme row). */
export function stripHtml(b, { beige = null, compact = false } = {}) {
  if (!b) return '';
  const tl = b.timeline ?? [];
  const svg = ribbonSvg(tl);
  const unit = b.id === 'beige' || b.beige ? 'releases' : 'meetings';   // the Beige Book is a report, not a meeting
  const cov = b.coverage ? `${b.coverage.read} of the last ${b.coverage.of} ${unit} have a stored read` : '';
  if (!svg && b.status !== 'headline_only') return '';
  const hist = `${svg ? `<div class="tt-head"><span class="lbl">Tone, last ${tl.length} ${unit}</span><span class="muted tt-cov">${esc(cov)}</span></div>${svg}` : ''}${phrasesHtml(b)}${compact ? '' : themesHtml(b)}`;
  // the board (not the Currency modal) folds the history and the wording swaps away: four screens of statement cards were mostly this part
  const fold = !compact && hist ? `<details class="tt-more"><summary class="muted" style="cursor:pointer;font-size:12px">Tone history, wording and weight changes</summary>${hist}</details>` : hist;
  return `<div class="tt-wrap">${fold}${frozenHtml(b)}${beige ? beigeChipHtml(beige) : ''}<p class="tt-ctx">Context for tone and timing, not a direction signal: tone is priced in within 30 minutes (cb-tone-direction, tested, no next-day lean).</p></div>`;
}
