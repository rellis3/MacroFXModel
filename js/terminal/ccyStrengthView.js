/**
 * Desk Terminal, Overview: "Currency strength (σ)", price-based and live. Numbers from js/ccyStrengthCore.js (/api/ccy-strength).
 *
 * Eight currencies as diverging bars from a centre line, one pill per horizon (1H, 4H, 1D, 1W), every other horizon in small figures on each row,
 * a ghost mark where the same currency stood at the previous refresh, a glow on the leader and the laggard, and a rule-built footer. The bars and the
 * rows SLIDE when new values land: the board is drawn once and then only its style properties are updated, so the CSS transitions run.
 *
 * It is labelled "price-based, live" because the desk's own strength strip above is the Currency Manager's analyst read, once a day: the two measure
 * different things and may disagree. Ordering only; no direction or trade wording. 1H and 4H refresh every ~90 seconds, 1D and 1W every ~5 minutes,
 * and only while the board is on screen.
 */
import { describeStrength, CCYS, HORIZONS } from '../ccyStrengthCore.js';
import { esc, fin } from './boardViz.js';

const ROW = 40;
const sg = (v, d = 1) => (!fin(v) ? '–' : Number(Math.abs(v).toFixed(d)) === 0 ? (0).toFixed(d) : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`);
const tone = v => (!fin(v) || Number(Math.abs(v).toFixed(1)) === 0 ? '' : v > 0 ? 'up' : 'dn');
const FLAG = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CHF: '🇨🇭', CAD: '🇨🇦', AUD: '🇦🇺', NZD: '🇳🇿' };

/** Geometry for one horizon: scale (σ at the track's edge), and per currency the bar's left / width in percent of the track. */
export function geometry(h, prevH) {
  if (!h?.available) return null;
  const max = Math.max(1.5, ...h.scores.map(s => Math.abs(s.score)), ...(prevH?.available ? prevH.scores.map(s => Math.abs(s.score)) : [0])) * 1.08;
  const pos = v => 50 + (v / max) * 50;
  const rows = h.scores.map((s, i) => ({ ccy: s.ccy, score: s.score, rank: i, left: Math.min(pos(s.score), 50), width: Math.abs(pos(s.score) - 50), neg: s.score < 0,
    ghost: prevH?.available ? pos(prevH.scores.find(x => x.ccy === s.ccy)?.score ?? 0) : null }));
  return { max, rows };
}

/** The "as of" stamp: the last price bar, in London time, and whether the market is shut. */
export function stampHtml(payload) {
  const asOf = payload?.asOf ? new Date(payload.asOf) : null;
  return `as of ${asOf ? asOf.toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '–'} London${payload?.closed ? ' · <span class="chip gold">market closed</span>' : ''}`;
}

function otherHorizons(payload, hz, ccy) {
  return HORIZONS.filter(x => x.key !== hz).map(x => { const v = payload.horizons?.[x.key]?.scores?.find(s => s.ccy === ccy)?.score; return `<span class="cs-o" title="${x.key}"><i>${x.key}</i><b class="mono ${tone(v)}">${sg(v)}</b></span>`; }).join('');
}

/** The whole board as a string. payload = /api/ccy-strength, hz = the pill, prev = the previous payload (the ghost). Pure. */
export function boardHtml(payload, hz = '1H', prev = null) {
  const head = `<div class="sec"><h2>Currency strength <span class="cs-tag">price-based, live</span></h2><span class="lbl">how far each currency has moved against the other seven, in units of its own normal move for the window · the strip above is the analyst read, daily</span></div>`;
  if (!payload) return `${head}<div class="card"><p class="muted">Loading the price bars…</p></div>`;
  if (!payload.ok) return `${head}<div class="card"><p class="muted">${esc(payload.error ?? 'currency strength is not available')}. The desk's own strength strip above stands on its own.</p></div>`;
  const h = payload.horizons?.[hz], g = geometry(h, prev?.horizons?.[hz]);
  const pills = `<div class="filters cs-pills" role="group" aria-label="Currency strength: window">${HORIZONS.map(x => `<button data-cshz="${x.key}" aria-pressed="${x.key === hz}">${x.key}</button>`).join('')}</div>`;
  const stamp = `<span class="cs-asof" data-csasof>${stampHtml(payload)}</span>`;
  const rows = g ? g.rows.map(r => `<div class="cs-row${r.rank === 0 ? ' cs-lead' : r.rank === g.rows.length - 1 ? ' cs-lag' : ''}" data-ccy="${r.ccy}" style="top:${r.rank * ROW}px">
<span class="cs-n mono">${r.rank + 1}</span><span class="cs-c"><b>${r.ccy}</b></span>
<div class="cs-t" aria-hidden="true"><i class="cs-z"></i><i class="cs-g" style="left:${r.ghost ?? 50}%;${r.ghost == null ? 'opacity:0' : ''}"></i><i class="cs-b ${r.neg ? 'neg' : 'pos'}" style="left:${r.left}%;width:${r.width}%"></i></div>
<b class="mono cs-v ${tone(r.score)}">${sg(r.score)}σ</b><span class="cs-os">${otherHorizons(payload, hz, r.ccy)}</span></div>`).join('') : '';
  const body = g ? `<div class="cs-board" style="height:${CCYS.length * ROW}px" data-csbody>${rows}</div>` : `<p class="muted">${esc(h?.reason ?? 'no data for this window')}.</p>`;
  const say = describeStrength(payload, hz);
  const unit = h?.available && h.unitPct != null ? `1.0σ is a typical currency's normal move over ${hz}, about ${h.unitPct < 0.1 ? h.unitPct.toFixed(3) : h.unitPct.toFixed(2)}% against the others.` : '';
  return `${head}<div class="card" data-csroot><div class="ch"><span class="lbl">${esc(hz)} window</span><span class="r">${pills} ${stamp}</span></div>
${body}
<p class="cs-say" data-cssay>${esc(say ?? '')}</p>
<p class="muted bv-note">${esc(unit)} Each pair's move over the window is weighted by how quiet that pair normally is, and the eight scores are fitted so they sum to zero. The ghost dot is where the currency stood at the last refresh. Price-based and live: it can disagree with the analyst strip above, which is the Currency Manager's read once a day. Ordering only, not a trade.</p></div>`;
}

// ── the live board: drawn once, then only updated, so the bars and rows slide ──────────────────────────────────────────────────────────────────────
const S = { payload: null, prev: null, hz: '1H', root: null, at: 0, timer: null, loading: false, getJson: null };
const EVERY = { '1H': 90e3, '4H': 90e3, '1D': 300e3, '1W': 300e3 };

function paint(first) {
  const root = S.root; if (!root?.isConnected) return;
  const fresh = boardHtml(S.payload, S.hz, S.prev);
  if (first || !root.querySelector('[data-csbody]')) { root.innerHTML = fresh; return; }
  // update in place: new bar geometry, new rank positions, new numbers; the CSS transitions animate it
  const g = geometry(S.payload?.horizons?.[S.hz], S.prev?.horizons?.[S.hz]);
  if (!g) { root.innerHTML = fresh; return; }
  for (const r of g.rows) {
    const row = root.querySelector(`[data-ccy="${r.ccy}"]`); if (!row) { root.innerHTML = fresh; return; }
    row.style.top = `${r.rank * ROW}px`;
    row.classList.toggle('cs-lead', r.rank === 0); row.classList.toggle('cs-lag', r.rank === g.rows.length - 1);
    row.querySelector('.cs-n').textContent = r.rank + 1;
    const b = row.querySelector('.cs-b'); b.style.left = `${r.left}%`; b.style.width = `${r.width}%`; b.classList.toggle('neg', r.neg); b.classList.toggle('pos', !r.neg);
    const gh = row.querySelector('.cs-g'); gh.style.left = `${r.ghost ?? 50}%`; gh.style.opacity = r.ghost == null ? '0' : '';
    const v = row.querySelector('.cs-v'); v.textContent = `${sg(r.score)}σ`; v.className = `mono cs-v ${tone(r.score)}`;
    row.querySelector('.cs-os').innerHTML = otherHorizons(S.payload, S.hz, r.ccy);
  }
  const say = root.querySelector('[data-cssay]'); if (say) say.textContent = describeStrength(S.payload, S.hz) ?? '';
  const asof = root.querySelector('[data-csasof]'); if (asof) asof.innerHTML = stampHtml(S.payload);
}

async function load() {
  if (S.loading || !S.getJson) return; S.loading = true;
  try {
    const p = await S.getJson('/api/ccy-strength');
    if (p?.ok) { S.prev = S.payload?.asOf !== p.asOf || S.payload?.builtAt !== p.builtAt ? S.payload : S.prev; S.payload = p; S.at = Date.now(); paint(false); }
    else if (!S.payload) { S.payload = p ?? { ok: false, error: 'no answer' }; paint(true); }
  } catch (e) { if (!S.payload) { S.payload = { ok: false, error: e.message }; paint(true); } } finally { S.loading = false; }
}
function tick() {
  if (!S.root?.isConnected || document.hidden || S.root.offsetParent === null) return;        // only while the board is on screen
  if (Date.now() - S.at > (EVERY[S.hz] ?? 90e3)) load();
}

/** Attach the live board to its slot (idempotent: the Overview re-renders its slot, the state survives). */
export function mount(root, { getJson } = {}) {
  if (!root) return;
  S.root = root; S.getJson = getJson ?? S.getJson;
  paint(true);
  if (!root.dataset.csBound) {
    root.dataset.csBound = '1';
    root.addEventListener('click', e => { const b = e.target.closest?.('[data-cshz]'); if (!b || b.dataset.cshz === S.hz) return; S.hz = b.dataset.cshz; S.prev = null; paint(true); if (Date.now() - S.at > 20e3) load(); });
  }
  if (!S.timer) S.timer = setInterval(tick, 20e3);
  if (!S.payload || Date.now() - S.at > (EVERY[S.hz] ?? 90e3)) load();
}
export const _state = S;
