// js/terminal/liveLayer.js: the Desk Terminal's live layer (owner, 2026-11-23: "a moving dashboard ... should show real-time data as the day
// progresses"). The morning views stay as they were; beside them, every card shows where its market is NOW and how the rule-based bias reads
// NOW, and both refresh in place through the day:
//   - asset cards: the move since the open in u (the day's p50 distance) and %, where price sits in the day's range, forecast lines touched,
//     a sparkline of the day (GET /api/market-live, every minute);
//   - the macro tilt through the day: the bias engine's hourly re-run (V1's logic on fresh data) against the morning issue, with the time of
//     any change of direction (GET /api/bias-engine-v2/intraday, every 5 minutes; owner only, as the route is);
//   - currency cards and a strip on the Currencies and Assets tabs: each currency's strength since the open across its pairs, ranked.
// The page leaves empty placeholders (data-lv-asset, data-lv-ccy, data-lv-strip) and calls patch() after it renders a section; this module
// fills them and refills them on every poll, without redrawing anything else (an open card and its chart stay put).
// Description only: a move since the open is not a forecast, and the tilt's back-test found no direction skill. Theme tokens only.

const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fin = v => typeof v === 'number' && Number.isFinite(v);
const sg = (v, d = 2) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}` : '–');
const cls = v => (fin(v) ? (v > 0.05 ? 'up' : v < -0.05 ? 'dn' : '') : '');
const hhmm = iso => { const d = new Date(iso ?? ''); return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : ''; };
const px = v => (fin(v) ? v.toFixed(v >= 1000 ? 1 : v >= 100 ? 2 : v >= 10 ? 3 : 5) : '–');
// the bias engine names some markets differently from the book (server.js _BEVI_ALIAS)
const ALIAS = { XAUUSD: 'GOLD', NAS100: 'NQ', NAS100USD: 'NQ', US100: 'NQ', SPX500USD: 'SPX500', US500: 'SPX500', XAGUSD: 'SILVER', WTICOUSD: 'WTI', USOIL: 'WTI', DE40: 'DE30', GER40: 'DE30' };
const DIRW = { BULLISH: ['▲', 'up', 'Bullish'], BEARISH: ['▼', 'dn', 'Bearish'], NEUTRAL: ['▬', '', 'Neutral'] };

let LIVE = null, BEI = null, liveErr = null;

/** The day's path as a sparkline: the line coloured by the move, a dashed line at the open. Two points at least, '' otherwise. */
export function sparkSvg(path, open, w = 120, h = 26) {
  const v = (path ?? []).filter(fin); if (v.length < 2) return '';
  const all = fin(open) ? [...v, open] : v, lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const X = i => (i / (v.length - 1)) * (w - 4) + 2, Y = a => h - 3 - ((a - lo) / span) * (h - 6);
  const d = v.map((a, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(a).toFixed(1)}`).join(' ');
  const c = fin(open) ? (v.at(-1) >= open ? 'var(--up)' : 'var(--dn)') : 'var(--tx2)';
  return `<svg class="lv-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="today so far">${fin(open) ? `<line x1="0" x2="${w}" y1="${Y(open).toFixed(1)}" y2="${Y(open).toFixed(1)}" stroke="var(--line2)" stroke-dasharray="3 3"/>` : ''}<path d="${d}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${X(v.length - 1).toFixed(1)}" cy="${Y(v.at(-1)).toFixed(1)}" r="2.4" fill="${c}"/></svg>`;
}

/** An asset card's "now" block from one market of /api/market-live. */
export function assetHtml(m, at) {
  if (!m) return '';
  const pos = fin(m.pos) ? Math.round(m.pos * 100) : null;
  const move = fin(m.nowU) ? `<b class="${cls(m.nowU)}">${m.nowU > 0 ? '▲' : m.nowU < 0 ? '▼' : '▬'} ${sg(m.nowU)}u</b>` : `<b class="${cls(m.chgPct)}">${sg(m.chgPct, 2)}%</b>`;
  return `<div class="lv-row"><span class="lv-tag" title="Live: where this market is now against the day's open (updated ${E(hhmm(at))} London). u = the day's p50 distance, so a move reads alike across markets.">NOW</span>${move}<span class="muted mono">${fin(m.nowU) ? `${sg(m.chgPct)}% · ` : ''}${px(m.last)}</span>${sparkSvg(m.path, m.open)}</div>
<div class="lv-row lv-sub">${pos != null ? `<span class="lv-rng" title="Where price sits in today's range: ${E(px(m.lo))} to ${E(px(m.hi))}"><i style="left:${pos}%"></i></span><span class="muted">${pos}% of the day's range${fin(m.highU) && fin(m.lowU) ? ` (${sg(m.lowU)}u to ${sg(m.highU)}u)` : ''}</span>` : ''}${(m.touched ?? []).length ? `<span class="lv-touch">lines hit: ${E(m.touched.join(', '))}</span>` : ''}</div>`;
}

/** The macro tilt through the day for one market, from the intraday timeline (v1r = V1's logic re-run on fresh data). */
export function tiltHtml(bei, name) {
  const key = ALIAS[name] ?? name, mk = (bei?.markets ?? []).find(x => x.market === key);
  const calls = mk?.calls?.v1r ?? []; if (!calls.length) return '';
  const first = calls[0], last = calls.at(-1), shifts = mk.shifts?.v1r ?? [];
  const one = c => { const [a, k, w] = DIRW[c[1]] ?? DIRW.NEUTRAL; return `<span class="${k}">${a} ${w} ${sg(c[2])}</span>`; };
  const pt = p => (p === 'issue' ? `issue ${hhmm(bei.issueAt)}` : p);
  const moved = last[0] !== first[0] && fin(last[2]) && fin(first[2]) ? last[2] - first[2] : null;
  return `<div class="lv-row lv-sub" title="The bias engine re-run hourly on fresh data (V1's logic). The morning issue stays the record. Back-test: no direction skill at 1, 5 or 20 days, so read it as context."><span class="lv-tag">TILT</span><span>now (${E(pt(last[0]))}) ${one(last)}</span>${last[0] !== first[0] ? `<span class="muted">· ${E(pt(first[0]))} ${one(first)}${fin(moved) ? ` · ${sg(moved)} since` : ''}</span>` : ''}${shifts.length ? `<span class="chip gold">turned ${E((DIRW[shifts.at(-1).to] ?? DIRW.NEUTRAL)[2].toLowerCase())} at ${E(shifts.at(-1).at)}</span>` : ''}</div>`;
}

/** A currency card's line: its strength since the open and its rank of 8. */
export function ccyHtml(row, at) {
  if (!row) return '';
  return `<div class="lv-row lv-sub" title="Live: the mean move since the open across this currency's pairs on the book, in u (base counts for, quote against). Updated ${E(hhmm(at))} London."><span class="lv-tag">NOW</span><b class="${cls(row.score)}">${sg(row.score)}u</b><span class="muted">today · ${row.rank === 1 ? 'strongest' : row.rank === 8 ? 'weakest' : `${row.rank} of 8`} · ${row.pairs} pair${row.pairs === 1 ? '' : 's'}</span></div>`;
}

/** The ranked strength strip: one bar per currency, strongest first. */
export function stripHtml(rows, at) {
  if (!rows?.length) return '';
  const max = Math.max(0.25, ...rows.map(r => Math.abs(r.score)));
  return `<div class="card lv-strip"><div class="ch"><span class="lbl">Currency strength today · live</span><span class="r muted">since the open, in u across each currency's pairs · ${E(hhmm(at))} London</span></div>
<div class="lv-bars">${rows.map(r => `<div class="lv-bar" data-ccy="${E(r.ccy)}"><span class="mono">${E(r.ccy)}</span><span class="lv-track"><i class="${r.score >= 0 ? 'up' : 'dn'}" style="${r.score >= 0 ? 'left:50%' : `left:${50 - (Math.abs(r.score) / max) * 50}%`};width:${(Math.abs(r.score) / max) * 50}%"></i></span><b class="mono ${cls(r.score)}">${sg(r.score)}</b></div>`).join('')}</div>
<p class="muted" style="margin:6px 0 0;font-size:11.5px">What the day has done, not what it will do.</p></div>`;
}

/** Fill every placeholder on the page from the latest reads. */
export function patch(doc = document) {
  const mk = LIVE?.markets ?? {}, at = LIVE?.at, ccy = Object.fromEntries((LIVE?.ccy ?? []).map(r => [r.ccy, r]));
  const set = (el, h) => { el.dataset.lvDone = '1'; if (el.innerHTML !== h) el.innerHTML = h; };
  doc.querySelectorAll('[data-lv-asset]').forEach(el => { const n = el.dataset.lvAsset; set(el, assetHtml(mk[n], at) + tiltHtml(BEI, n)); });
  doc.querySelectorAll('[data-lv-ccy]').forEach(el => set(el, ccyHtml(ccy[el.dataset.lvCcy], at)));
  doc.querySelectorAll('[data-lv-strip]').forEach(el => set(el, stripHtml(LIVE?.ccy, at)));
  // the ladder's price marker: the live price for every card (the trade watcher only prices the cards it watches)
  doc.querySelectorAll('[data-twpx]').forEach(el => {
    const lad = el.closest('.ladder'), lo = +lad?.dataset.lo, hi = +lad?.dataset.hi, v = mk[el.dataset.twpx]?.last;
    if (!fin(v) || !(hi > lo)) return;   // no live price here: leave whatever the trade watcher drew
    el.hidden = false; el.style.left = `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`; el.title = `live ${px(v)}`;
  });
  const chip = doc.getElementById('lvstamp');
  if (chip) { chip.textContent = at ? `live ${hhmm(at)}` : 'live –'; chip.title = liveErr ? `Live layer: ${liveErr}` : `Prices refreshed every minute; the macro tilt hourly. Last price update ${hhmm(at)} London.`; }
}

const may = u => { const A = globalThis.deskAccessState; return !A || A.role !== 'viewer' || A.mayCall('GET', u); };
const get = u => (may(u) ? fetch(u, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null));
async function pollLive() { const j = await get('/api/market-live'); if (j?.ok) { LIVE = j; liveErr = null; } else if (j) liveErr = j.error ?? 'no data'; patch(); dispatchEvent(new CustomEvent('marketlive', { detail: LIVE })); }
async function pollTilt() { const j = await get('/api/bias-engine-v2/intraday'); if (j?.ok) BEI = j; patch(); }

const CSS = `.lv{margin-top:8px;display:flex;flex-direction:column;gap:4px}
.lv:empty{display:none}
.lv-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px}
.lv-row b.up,.lv-row .up{color:var(--up)} .lv-row b.dn,.lv-row .dn{color:var(--dn)}
.lv-sub{font-size:11.5px}
.lv-tag{font:600 9.5px var(--mono);letter-spacing:.1em;color:var(--gold);border:1px solid rgba(var(--goldrgb),.45);border-radius:4px;padding:1px 5px}
.lv-spark{margin-left:auto;flex:none}
.lv-rng{position:relative;display:inline-block;width:70px;height:6px;border-radius:4px;background:linear-gradient(90deg,var(--dnbg),var(--bg3),var(--upbg))}
.lv-rng i{position:absolute;top:-3px;width:3px;height:12px;margin-left:-1px;border-radius:2px;background:var(--tx)}
.lv-touch{color:var(--gold)}
.lv-strip{margin-bottom:14px}
.lv-bars{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px 16px;margin-top:6px}
.lv-bar{display:grid;grid-template-columns:34px 1fr 46px;align-items:center;gap:8px;font-size:12px}
.lv-track{position:relative;height:8px;border-radius:4px;background:var(--bg3)}
.lv-track::after{content:'';position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--line2)}
.lv-track i{position:absolute;top:0;bottom:0;border-radius:4px}
.lv-track i.up{background:var(--up)} .lv-track i.dn{background:var(--dn)}
.lv-bar b{text-align:right}`;

if (typeof document !== 'undefined') {
  const st = document.createElement('style'); st.id = 'liveLayerCss'; st.textContent = CSS; document.head.appendChild(st);
  globalThis.liveLayer = { patch, last: n => LIVE?.markets?.[n]?.last ?? null };
  const start = () => { pollLive(); pollTilt(); setInterval(() => { if (!document.hidden) pollLive(); }, 60_000); setInterval(() => { if (!document.hidden) pollTilt(); }, 5 * 60_000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pollLive(); }); };
  // a section re-render leaves fresh, empty placeholders: fill them at once from the last reads (patch marks what it filled, so this never loops)
  let queued = false;
  new MutationObserver(() => { if (queued || !(LIVE || BEI) || !document.querySelector('[data-lv-asset]:not([data-lv-done]),[data-lv-ccy]:not([data-lv-done]),[data-lv-strip]:not([data-lv-done])')) return;
    queued = true; requestAnimationFrame(() => { queued = false; patch(); }); }).observe(document.body, { childList: true, subtree: true });
  if (globalThis.deskAccessState) start(); else addEventListener('deskaccess', start, { once: true });
}
