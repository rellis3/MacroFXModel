/**
 * Desk Terminal: the live layer. Numbers from js/liveLayerCore.js (/api/live-layer); tokens only.
 *
 *   boardHtml(payload)         Macro tab: implied intraday yields beside the official prints (with the curve drawn now against the last close), the index tiles
 *                              (small vs big, tech vs broad), range used so far against the forecast day, the majors' correlation regime
 *   priceReadHtml(read, ...)   Overview: the analyst's dawn read beside the price read, and where they disagree
 *   liveEmCell(id) / liveWiderChip(key)   one small live figure inside the EM gauges table and the wider-market tiles, updated in place
 *   mount({ getJson, getAnalyst })   starts the refresh (about every 90 s, only while the page is visible); idempotent
 *
 * The daily numbers stay where they are as the reference: this layer only says how far the market has moved since, labelled price-based / implied and
 * stamped with the quote time. "Quiet" means small moves so far, not that there is no direction. The price read is a description of recent movement.
 */
import { ordinal } from './ordinal.js';
import { priceRead } from '../liveLayerCore.js';
import { clockState } from '../marketClock.js';
import { esc, fin } from './boardViz.js';

const sg = (v, d = 1) => (!fin(v) ? '–' : Number(Math.abs(+v).toFixed(d)) === 0 ? (0).toFixed(d) : `${v > 0 ? '+' : '−'}${Math.abs(+v).toFixed(d)}`);
const tone = v => (!fin(v) || Number(Math.abs(+v).toFixed(2)) === 0 ? '' : v > 0 ? 'up' : 'dn');
const pairName = n => (/^[A-Z]{6}$/.test(n) ? `${n.slice(0, 3)}/${n.slice(3)}` : n);
const FLAG = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CHF: '🇨🇭', CAD: '🇨🇦', AUD: '🇦🇺', NZD: '🇳🇿' };
const London = iso => (iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '–');

const LL = { payload: null, at: 0, timer: null, loading: false, getJson: null, getAnalyst: null, strength: null, prRoot: null };
export const _state = LL;

/** "Markets closed · showing the close, Fri 21:00 UTC (London 22:00)" from the shared clock (js/marketClock.js); a plain fallback if it cannot say. */
const closedLabel = () => { try { const st = clockState(Date.now()); return st.open ? 'market closed · showing the last prints' : st.label; } catch { return 'market closed · showing the last prints'; } };
/** The stamp line: quote time in London, and the shut-market flag. */
export function stampHtml(p) {
  return `<span class="ll-stamp">quotes as of ${esc(London(p?.quoteAt ?? p?.builtAt))} London${p?.closed ? ` · <span class="chip gold">${esc(closedLabel())}</span>` : ''}</span>`;
}

// ── the curve now against the last daily close ─────────────────────────────────────────────────────────────────────────────────────────
const TEN = { us2y: 2, us5y: 5, us10y: 10, us30y: 30 };
export function curveGlyph(rows, { w = 300, h = 120 } = {}) {
  const pts = ['us2y', 'us5y', 'us10y', 'us30y'].map(k => rows.find(r => r.key === k)).filter(r => r && fin(r.implied) && fin(r.refImplied));
  if (pts.length < 3) return '';
  const xs = pts.map(r => Math.log(TEN[r.key])), x0 = Math.min(...xs), x1 = Math.max(...xs), padX = 26, padT = 14, padB = 22;
  const all = pts.flatMap(r => [r.implied, r.refImplied]), lo = Math.min(...all), hi = Math.max(...all), span = Math.max(hi - lo, 0.06);
  const X = r => padX + ((Math.log(TEN[r.key]) - x0) / (x1 - x0)) * (w - 2 * padX), Y = v => padT + (1 - (v - lo + span * 0.15) / (span * 1.3)) * (h - padT - padB);
  const line = k => pts.map((r, i) => `${i ? 'L' : 'M'}${X(r).toFixed(1)},${Y(r[k]).toFixed(1)}`).join('');
  const area = `${line('implied')}${[...pts].reverse().map(r => `L${X(r).toFixed(1)},${Y(r.refImplied).toFixed(1)}`).join('')}Z`;
  return `<svg class="bv-svg" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:340px" role="img" aria-label="US Treasury curve now against the last daily close">
<path d="${area}" fill="var(--pur2)" opacity=".18"/>
<path d="${line('refImplied')}" fill="none" stroke="var(--tx3)" stroke-width="1.4" stroke-dasharray="4 4" pathLength="1"/>
<path class="bv-sweep" d="${line('implied')}" fill="none" stroke="var(--gold)" stroke-width="2.4" stroke-linecap="round" pathLength="1" style="filter:drop-shadow(0 0 5px var(--gold))"/>
${pts.map(r => `<circle cx="${X(r).toFixed(1)}" cy="${Y(r.implied).toFixed(1)}" r="3.4" fill="var(--gold)"/><text x="${X(r).toFixed(1)}" y="${h - 6}" text-anchor="middle" fill="var(--tx3)" font-family="JetBrains Mono" font-size="10">${r.label.replace('US ', '')}</text>`).join('')}
</svg>`;
}

function yieldsCard(y) {
  if (!y?.ok) return `<div class="card"><div class="ch"><span class="lbl">Yields, live (implied)</span></div><p class="muted">${esc(y?.error ?? 'not available')}. The official daily prints are on the global yields and curve boards.</p></div>`;
  const rows = y.rows.map(r => `<tr title="official ${r.official ? `${r.official.value}% on ${esc(r.official.date)}` : 'not loaded'}; implied from the bond CFD through a duration of ${r.D ?? '–'}">
<td><b>${esc(r.label)}</b></td><td class="n mono">${r.official ? r.official.value.toFixed(2) : '–'}<span class="muted ll-d">${r.official ? esc(r.official.date.slice(5)) : ''}</span></td><td class="n mono"><b>${fin(r.implied) ? r.implied.toFixed(3) : '–'}</b></td><td class="n mono ${r.deltaBp > 0 ? 'dn' : r.deltaBp < 0 ? 'up' : ''}">${sg(r.deltaBp, 1)}bp</td></tr>`).join('');
  const slopes = (y.slopes ?? []).map(s => `<span class="chip ll-nc">${esc(s.label)} <b class="mono">${sg(s.nowBp, 0)}bp</b> <span class="muted mono">${sg(s.deltaBp, 1)}</span></span>`).join(' ');
  const gap = y.bundGap ? `<span class="chip ll-nc">Bund–UST 10y <b class="mono">${sg(y.bundGap.nowBp, 0)}bp</b> <span class="muted mono">${sg(y.bundGap.deltaBp, 1)}</span></span>` : '';
  return `<div class="card"><div class="ch"><span class="lbl">Yields, live (implied)</span><span class="r muted">beside the official prints, which are unchanged</span></div>
<div><div class="scroll"><table><thead><tr><th></th><th class="n" title="the last official daily print (FRED / Bundesbank) and its date">Official</th><th class="n">Implied now</th><th class="n" title="the implied move since the last daily close, in basis points">Since close</th></tr></thead><tbody>${rows}</tbody></table></div>
<div style="margin-top:10px">${curveGlyph(y.rows)}<div class="bv-legend"><span><i class="bv-dot" style="background:var(--gold)"></i>implied now</span><span><i class="bv-dot" style="background:var(--tx3)"></i>at the last close</span></div></div></div>
<div class="drv" style="margin-top:8px">${slopes} ${gap}</div>
${y.line ? `<div class="bv-say card"><p>${esc(y.line)}</p></div>` : ''}
<p class="muted bv-note">${esc(y.basis)}. US yields are re-anchored at the 15:30 New York print; the Bund at the Bundesbank's. Expect a bp or two of drift: this is a live look, the official print is the record.</p></div>`;
}

function indicesCard(ix) {
  if (!ix?.ok) return `<div class="card"><div class="ch"><span class="lbl">Equity indices, since the close</span></div><p class="muted">${esc(ix?.error ?? 'not available')}.</p></div>`;
  const tiles = Object.values(ix.rows).map(r => `<div class="ll-tile"><span class="lbl">${esc(r.label)}</span><div class="mono ll-big ${tone(r.chgPct)}">${sg(r.chgPct, 2)}%</div><span class="muted mono">${Number(r.live).toLocaleString('en-GB', { maximumFractionDigits: 0 })}</span></div>`).join('');
  const sv = (k, name) => (ix[k] == null ? '' : `<span class="chip ll-nc">${name} <b class="mono ${tone(ix[k])}">${sg(ix[k], 2)}pp</b></span>`);
  return `<div class="card"><div class="ch"><span class="lbl">Equity indices, since the close</span><span class="r muted">index CFDs vs the last daily close</span></div>
<div class="ll-tiles">${tiles}</div><div class="drv" style="margin-top:8px">${sv('smallVsBig', 'Russell − S&P')} ${sv('techVsBroad', 'Nasdaq − S&P')}</div>
${ix.line ? `<p style="margin:8px 0 0">${esc(ix.line)}</p>` : ''}
<p class="muted bv-note">The wider-market board's equity tiles are daily; this is the same question answered live. A move since the close, not a forecast.</p></div>`;
}

const PSTATE = { active: 'gold', quiet: '', normal: 'pur', early: '' };
function rangeCard(rs) {
  if (!rs?.ok) return `<div class="card"><div class="ch"><span class="lbl">Range used so far</span></div><p class="muted">${esc(rs?.error ?? 'not available')}.</p></div>`;
  const rows = rs.rows.slice(0, 12).map(r => {
    const w = Math.min(100, (r.used / 2) * 100), mid = 50;       // the track is 0 to 200% of the forecast day's median range; the tick is 100%
    return `<div class="ll-rr" title="${esc(pairName(r.name))}: ${r.hl}% from the London open against a median day of ${r.forecast}%"><b>${esc(pairName(r.name))}</b>
<div class="ll-rt" aria-hidden="true"><i class="ll-rf ${PSTATE[r.state] ?? ''}" style="width:${w}%"></i><i class="ll-rm" style="left:${mid}%"></i></div><span class="mono">${Math.round(r.used * 100)}%</span><span class="chip ${PSTATE[r.state] ?? ''}">${r.state}</span></div>`;
  }).join('');
  return `<div class="card"><div class="ch"><span class="lbl">Range used so far</span><span class="r"><span class="chip ${rs.market === 'active' ? 'gold' : ''}">${esc(rs.market ?? 'too early')}</span></span></div>
${rows}<p style="margin:8px 0 0">${esc(rs.line)}</p>
<p class="muted bv-note">Range since London midnight as a share of the forecast day's median range; the tick is 100%. A range grows with the square root of time, so "active" means wider than the forecast day implies for this hour. A size reading, not a direction: quiet means small moves so far.</p></div>`;
}

function corrCard(c) {
  if (!c?.ok) return `<div class="card"><div class="ch"><span class="lbl">Correlation of the majors</span></div><p class="muted">${esc(c?.error ?? 'not available')}.</p></div>`;
  const TONE = { HIGH: 'gold', LOW: 'pur', NORMAL: 'up' };
  return `<div class="card"><div class="ch"><span class="lbl">Correlation of the majors, last five days</span><span class="r"><span class="chip ${TONE[c.state] ?? ''}">${esc(c.state)}</span></span></div>
<div class="ll-rail" aria-hidden="true"><i class="ll-z lo" style="width:20%"></i><i class="ll-z hi" style="left:80%;width:20%"></i><i class="ll-mk" style="left:${Math.max(1, Math.min(99, c.pctile))}%"></i></div>
<div class="bv-legend"><span>mean |rho| <b class="mono">${c.value.toFixed(2)}</b> (median ${c.median.toFixed(2)})</span><span>${ordinal(c.pctile)} percentile of ${c.windows} earlier 5-day windows</span></div>
<p style="margin:8px 0 0">${esc(c.line)}</p>
<p class="muted bv-note">Hourly returns across the seven majors' ${c.pairs} pairs. A price-based, intraday rebuild of the correlation idea, not the daily regime board's reading and not the validated HMM.</p></div>`;
}

/** The Macro tab block. p = /api/live-layer (or the freshest copy the refresh holds). */
export function boardHtml(p0) {
  const p = LL.payload ?? p0;
  const head = `<div class="sec"><h2>Live layer <span class="cs-tag">price-based, live</span></h2><span class="lbl">the daily boards stay the reference; this is how far the market has moved since · refreshes about every 90 seconds while the page is open</span></div>`;
  if (!p?.ok) return `<div class="sfc" data-surface="panel.macro.livelayer">${head}<div class="card"><p class="muted">${esc(p?.error ?? 'the live layer has not loaded yet')}.</p></div></div>`;
  return `<div class="sfc" data-surface="panel.macro.livelayer">${head}<div data-llroot data-mktboard>${inner(p)}</div></div>`;
}
function inner(p) {
  return `<div class="card ll-meta">${stampHtml(p)}</div><div class="grid g2" style="margin-top:12px">${yieldsCard(p.yields)}${indicesCard(p.indices)}</div><div class="grid g2" style="margin-top:12px">${rangeCard(p.state?.range)}${corrCard(p.state?.corr)}</div>`;
}

// ── the price read beside the dawn read (Overview) ────────────────────────────────────────────────────────────────────────────────────
const RT = { firm: 'up', soft: 'dn', mixed: '' };
export function priceReadHtml(pr, { closed = false } = {}) {
  const head = `<div class="sec"><h2>Analyst read vs price read <span class="cs-tag">price-based, live</span></h2><span class="lbl">the desk's dawn read per currency beside how each has actually been moving since · by sign only</span></div>`;
  if (!pr?.ok) return `${head}<div class="card"><p class="muted">${esc(pr?.error ?? 'loading the price bars')}.</p></div>`;
  const rows = pr.rows.map(r => {
    const a = r.analyst, aw = fin(a) ? Math.min(50, Math.abs(a) / 2 * 50) : 0, pw = Math.min(50, Math.abs(r.s4h + r.s1d) / 2 / 2 * 50);
    return `<div class="ll-pr ${r.state === 'disagree' ? 'dis' : ''}"><b>${FLAG[r.ccy] ?? ''} ${r.ccy}</b>
<div class="ll-pt" aria-hidden="true"><i class="ll-pz"></i><i class="ll-pa ${a > 0 ? 'pos' : 'neg'}" style="${a > 0 ? 'left:50%' : `left:${50 - aw}%`};width:${aw}%"></i></div>
<span class="mono ${tone(a)}">${fin(a) ? sg(a, 0) : '–'}</span>
<div class="ll-pt" aria-hidden="true"><i class="ll-pz"></i><i class="ll-pa ${r.s4h + r.s1d > 0 ? 'pos' : 'neg'}" style="${r.s4h + r.s1d > 0 ? 'left:50%' : `left:${50 - pw}%`};width:${pw}%"></i></div>
<span class="chip ${RT[r.read]}">${r.read}</span><span class="muted mono ll-ps">4H ${sg(r.s4h, 1)} · 1D ${sg(r.s1d, 1)}</span>
<span class="ll-tag ${r.state}">${r.state === 'disagree' ? 'disagree' : r.state === 'agree' ? 'agree' : r.state === 'no-analyst' ? '' : 'open'}</span></div>`;
  }).join('');
  return `${head}<div class="card" data-mktboard><div class="ch"><span class="lbl">Dawn read (left) · price read (right)</span><span class="r">${closed ? `<span class="chip gold">${esc(closedLabel())}</span>` : ''}</span></div>
<div class="ll-prh"><span></span><span>analyst bias</span><span></span><span>4H + 1D strength</span><span></span><span></span><span></span></div>${rows}
<p class="cs-say">${esc(pr.line)}</p>${pr.partial ? `<p class="muted bv-note">${esc(pr.partial)}</p>` : ''}
<p class="muted bv-note">${esc(pr.basis)} The dawn read is an analyst's daily view and the price read is a rule over recent prices: they measure different things and may disagree. Neither is a trade instruction, and the price read never changes the desk's book.</p></div>`;
}

// ── small live figures inside the existing boards, updated in place ───────────────────────────────────────────────────────────────────
const emInner = id => { const p = LL.payload?.em?.pairs?.[id]; return p && fin(p.chgLive) ? `<span class="ll-live" title="live ${p.live} against the last daily close ${p.ref}${LL.payload.closed ? '; market closed' : ''}"><i class="ll-pulse"></i>${sg(p.chgLive, 2)}% live</span>` : ''; };
export const liveEmCell = id => `<td class="n mono" data-lv="em:${esc(id)}">${emInner(id)}</td>`;
const WM = { spx: 'SPX', nq: 'NQ', r2k: 'RUT' };
const wmInner = key => {
  const ix = LL.payload?.indices; if (!ix?.ok) return '';
  if (key === 'smallVsBig') { const a = ix.rows?.RUT?.chgPct, b = ix.rows?.NQ?.chgPct; return fin(a) && fin(b) ? `<span class="ll-live"><i class="ll-pulse"></i>${sg(a - b, 2)}pp live</span>` : ''; }
  const r = ix.rows?.[WM[key]]; return r && fin(r.chgPct) ? `<span class="ll-live ${tone(r.chgPct)}"><i class="ll-pulse"></i>${sg(r.chgPct, 2)}% live</span>` : '';
};
export const liveWiderChip = key => (WM[key] || key === 'smallVsBig' ? ` <span data-lv="wm:${esc(key)}">${wmInner(key)}</span>` : '');

function applyLive() {
  if (typeof document === 'undefined') return;
  for (const el of document.querySelectorAll('[data-lv]')) { const [kind, key] = el.dataset.lv.split(':'); el.innerHTML = kind === 'em' ? emInner(key) : wmInner(key); }
  const root = document.querySelector('[data-llroot]'); if (root && LL.payload?.ok) root.innerHTML = inner(LL.payload);
  paintPriceRead();
}

function paintPriceRead() {
  const root = LL.prRoot; if (!root?.isConnected) return;
  const analyst = LL.getAnalyst?.() ?? {};
  root.innerHTML = priceReadHtml(LL.strength ? priceRead({ strength: LL.strength, analyst }) : null, { closed: !!LL.payload?.closed });
}

async function refresh() {
  if (LL.loading || !LL.getJson) return; LL.loading = true;
  try {
    const [p, s] = await Promise.all([LL.getJson('/api/live-layer'), LL.getJson('/api/ccy-strength')]);
    if (p?.ok) { LL.payload = p; LL.at = Date.now(); }
    if (s?.ok) LL.strength = s;
    applyLive();
  } catch (e) { console.warn('live layer', e); } finally { LL.loading = false; }
}
const EVERY = 90e3;
function tick() { if (typeof document !== 'undefined' && document.hidden) return; if (Date.now() - LL.at > (LL.payload?.closed ? 10 * 60e3 : EVERY)) refresh(); }

/** The Overview slot for the price read. */
export const priceReadSlot = () => '<div class="sfc" data-surface="panel.ov.priceread"><div id="prx" class="ll-prroot"></div></div>';

/** Attach the refresh (idempotent). getJson = the page's fetcher; getAnalyst = () => { USD: { bias }, ... } (the desk's dawn read). */
export function mount({ getJson, getAnalyst } = {}) {
  if (getJson) LL.getJson = getJson; if (getAnalyst) LL.getAnalyst = getAnalyst;
  LL.prRoot = typeof document !== 'undefined' ? document.getElementById('prx') : null;
  paintPriceRead(); applyLive();
  if (!LL.timer) LL.timer = setInterval(tick, 20e3);
  if (!LL.bound && typeof window !== 'undefined') { LL.bound = true; window.addEventListener('marketstate', () => { LL.at = 0; refresh(); }); }     // the market opened or shut: rebuild at once, back to now
  if (!LL.payload || !LL.strength) refresh();
}
