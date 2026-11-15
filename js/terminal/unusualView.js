// js/terminal/unusualView.js: the "What is unusual right now" board (Insight tab). Draws js/terminal/unusualCore.js: a sky map of every series (brighter =
// more extreme against its own history), then a ranked list with the plain-words reason, a bar on the percentile scale, a glowing sparkline and the
// last close. Click a row for the working (every measure, the window, how far to trust it) and a link to the source board.
// Presentation only. Theme tokens only (insight.css), motion is the shared .bv-sweep / .in-fill CSS and is off under prefers-reduced-motion.
import { rankBundle, expectedByChance, groupCounts, trustNote } from './unusualCore.js';
import { GROUPS } from './insightSeries.js';
import { esc } from './boardViz.js';

const TOP = 20;
const nth = p => { const n = Math.round(p * 100), s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'); return `${n}${s}`; };
const niceDate = iso => { const d = new Date(`${iso}T00:00:00Z`); return Number.isNaN(+d) ? String(iso) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };

/** A tiny line with a glowing end point. Normalised to its own range; no value is claimed by the axis. */
export function spark(vals, w = 96, h = 26) {
  const v = (vals ?? []).filter(x => Number.isFinite(x)); if (v.length < 3) return '';
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1, P = 3;
  const pts = v.map((a, i) => [P + (i / (v.length - 1)) * (w - 2 * P), P + (1 - (a - lo) / span) * (h - 2 * P)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const [ex, ey] = pts[pts.length - 1];
  return `<svg class="in-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--tx3)" stroke-width="1.4" class="bv-sweep" pathLength="1"/><circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="2.6" fill="var(--pur2)" class="in-dot"/></svg>`;
}

const bar = s => `<span class="in-bar" style="--s:${s.toFixed(3)}" role="img" aria-label="${nth(s)} percentile of extremeness"><i class="in-fill"></i><u style="left:90%"></u><u style="left:95%"></u><u style="left:99%"></u></span>`;

function detail(r) {
  const ms = Object.entries(r.moves).map(([k, m]) => `<li><b>${k === '1' ? '1-day' : `${k}-day`} move</b> ${esc(m.text)} <span class="muted">bigger than ${Math.round(m.pct * 100)}% of ${m.n.toLocaleString('en-GB')} such moves</span></li>`).join('');
  const lv = r.level ? `<li><b>Level</b> ${esc(r.lastFmt)} <span class="muted">${nth(r.level.pct)} percentile of its own history (${r.level.side === 'high' ? 'near the top' : 'near the bottom'})</span></li>` : '';
  const go = r.go ? `<button type="button" class="btn in-go" data-go="${esc(r.go)}">Open the source board</button>` : '<span class="muted">No separate board for this one.</span>';
  return `<div class="in-detail" role="region" aria-label="${esc(r.label)} working"><ul>${ms}${lv}</ul><p class="muted">${esc(trustNote(r))}.</p>${go}</div>`;
}

function rowHtml(r, open) {
  return `<li class="in-li"><button type="button" class="in-row" data-key="${esc(r.key)}" aria-expanded="${open ? 'true' : 'false'}">
<span class="in-rk">${r.rank}</span>
<span class="in-nm"><b>${esc(r.label)}</b><i class="in-gr">${esc(GROUPS[r.group] ?? r.group)}${r.short ? ' · short history' : ''}${r.stale ? ' · stale' : ''}</i></span>
<span class="in-why">${esc(r.driver.text)}</span>
${bar(r.score)}<span class="in-pc">${nth(r.score)}</span>
${spark(r.spark)}<span class="in-val">${esc(r.lastFmt)}</span></button>${open ? detail(r) : ''}</li>`;
}

/** The whole board as HTML for a ranking (rankBundle) and view state { group, all, open }. Pure. */
export function unusualHtml(rank, { group = 'all', all = false, open = null, threshold = 0.95 } = {}) {
  const rows = rank.rows;
  if (!rows.length) return `<div class="in-empty">No series had enough history to rank (${rank.tooShort.length} too short).</div>`;
  const chance = expectedByChance(rows, threshold), gc = groupCounts(rows, GROUPS, threshold);
  const shown = (group === 'all' ? rows : rows.filter(r => r.group === group)), list = all ? shown : shown.slice(0, TOP);
  const sky = rows.map(r => `<button type="button" class="in-cell" data-key="${esc(r.key)}" style="--s:${r.score.toFixed(3)}" title="${esc(`${r.label}: ${r.driver.text}`)}" aria-label="${esc(`${r.label}, rank ${r.rank}`)}"></button>`).join('');
  const quiet = chance.hits <= Math.ceil(chance.expected * 1.25);
  const pills = [`<button type="button" class="in-pill" data-group="all" aria-pressed="${group === 'all'}">All <b>${rows.length}</b></button>`,
    ...gc.map(g => `<button type="button" class="in-pill" data-group="${esc(g.group)}" aria-pressed="${group === g.group}">${esc(g.label)} <b>${g.n}</b>${g.hot ? ` <span class="in-hot">${g.hot} hot</span>` : ''}</button>`)].join('');
  return `<div class="in-head"><div class="in-asof">As at the close of <b>${esc(niceDate(rank.refDate))}</b>. ${rows.length} series, each against its own history since ${esc(niceDate(rank.windowFrom))}. A reading is "hot" at the ${Math.round(threshold * 100)}th percentile or beyond.</div>
<div class="in-chance ${quiet ? 'quiet' : 'busy'}"><b>${chance.hits}</b> of ${chance.measures} readings are hot; about <b>${Math.round(chance.expected)}</b> would be on any day by chance alone. ${quiet ? 'So this is an ordinary-looking day: the top of the list is mostly what chance throws up.' : 'More than chance would give, so the top of the list is worth a look.'}</div></div>
<div class="in-sky" role="group" aria-label="Every series, brightest = most unusual">${sky}</div>
<div class="in-pills" role="group" aria-label="Filter by group">${pills}</div>
<ol class="in-list">${list.map(r => rowHtml(r, open === r.key)).join('')}</ol>
${shown.length > TOP ? `<button type="button" class="btn in-more" data-all="${all ? 0 : 1}">${all ? `Show the top ${TOP}` : `Show all ${shown.length}`}</button>` : ''}
${rank.tooShort.length ? `<p class="in-foot muted">Too little history to rank (under 120 closes): ${esc(rank.tooShort.map(r => r.label).join(', '))}.</p>` : ''}
<p class="in-foot muted">What this says: how big a reading is against that series' own past (a percentile, not a size). What it does not say: which way anything goes next. Moves are on completed daily closes; the 5 and 20 day windows overlap. This is context, not a signal.</p>`;
}

/** Mount the board into host. ctx: { getBundle(), go(target), win, doc }. Returns { destroy }. */
export function mountUnusual(host, ctx) {
  const state = { group: 'all', all: false, open: null };
  let rank = null, alive = true;
  const draw = () => { if (rank) host.innerHTML = unusualHtml(rank, state); };
  const onClick = e => {
    const t = e.target.closest?.('button'); if (!t || !host.contains(t)) return;
    if (t.dataset.group) { state.group = t.dataset.group; state.open = null; draw(); return; }
    if (t.dataset.all != null) { state.all = t.dataset.all === '1'; draw(); return; }
    if (t.dataset.go) { ctx.go?.(t.dataset.go); return; }
    if (t.dataset.key) {
      state.open = state.open === t.dataset.key ? null : t.dataset.key;
      if (t.classList.contains('in-cell') && rank) { const r = rank.rows.find(x => x.key === t.dataset.key); if (r && !(state.group === 'all' || state.group === r.group)) state.group = 'all'; if (r && r.rank > TOP) state.all = true; }
      draw(); host.querySelector(`.in-row[data-key="${t.dataset.key}"]`)?.scrollIntoView?.({ block: 'nearest' });
    }
  };
  host.addEventListener('click', onClick);
  host.innerHTML = '<div class="in-empty">Ranking every series against its own history…</div>';
  ctx.getBundle().then(b => {
    if (!alive) return;
    if (!b?.ok) { host.innerHTML = `<div class="in-empty">${esc(b?.error || 'The daily market bundle is not available.')}</div>`; return; }
    rank = rankBundle(b); draw();
  });
  return { destroy() { alive = false; host.removeEventListener('click', onClick); } };
}
