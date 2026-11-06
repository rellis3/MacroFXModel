/**
 * The Options → Path chart made zoomable and movable "like a TradingView chart" (owner, 2026-11-06).
 *
 *   Desktop  mouse wheel / trackpad pinch zooms the time axis about the pointer; a sideways trackpad swipe or a drag
 *            pans; hovering shows the crosshair and the nearest dot's card; a click pins the card and jumps to the row.
 *   Phone    pinch zooms; a one-finger sideways drag pans; a vertical swipe still scrolls the page (touch-action:
 *            pan-y, and one-finger gestures decide their direction before they pan); a tap pins the card.
 *   Both     2W / 1M / 3M / All chips, Reset, "hide small books"; a table row tap centres the chart on its expiry;
 *            arrow keys pan and + / − zoom when the chart has focus.
 *
 * d3.zoom (already on the page) runs the wheel and the mouse drag and keeps the transform; touch is handled here,
 * because d3's own one-finger pan would swallow vertical page scrolls. The maths is js/terminal/pathZoom.js, the
 * drawing is renderWalk in js/terminal/optionsView.js. Without d3 the chart still draws, and pinch/drag/chips work.
 */
import * as PZ from './pathZoom.js';
import { walkModel, renderWalk, walkTip, fmtPx, fmtDay } from './optionsView.js';

const PHONE_W = 600;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Wire the chart inside `box` (pathHtml's markup). state persists for the session: { inst, win, hideSmall }. */
export function mountPathChart(box, { sm, walk, anchor = 'gammaCentre', o, width, inst, state = {} } = {}) {
  box?._pathChartOff?.();
  const plot = box?.querySelector('.opt-walk-plot'); if (!plot) return null;
  const m = walkModel(sm, walk, { w: width, o }); if (!m) return null;
  const win = globalThis.window ?? globalThis, d3 = globalThis.d3;
  const phone = (win.innerWidth ?? 1000) < PHONE_W, coarse = !!win.matchMedia?.('(pointer: coarse)')?.matches;
  state.hideSmall ??= phone;
  const defaultTr = () => PZ.presetTransform(m.base, phone ? '1M' : 'All', m.lim);
  let tr = state.inst === inst && state.win ? PZ.windowTransform(m.base, state.win[0], state.win[1], m.lim) : defaultTr();
  let cur = null, tip = null, raf = 0, xh = null;   // tip: { p, pinned }; xh: crosshair position or null

  plot.innerHTML = `<div class="opt-walk-svgbox"></div><svg class="opt-walk-xh" width="${m.w}" height="${m.h}" viewBox="0 0 ${m.w} ${m.h}" aria-hidden="true"></svg><div class="opt-walk-tip" role="status" hidden></div>`;
  plot.tabIndex = 0; plot.setAttribute('aria-label', 'option walk chart: arrow keys move, plus and minus zoom');
  plot.style.touchAction = 'pan-y';
  const svgBox = plot.querySelector('.opt-walk-svgbox'), xhSvg = plot.querySelector('.opt-walk-xh'), tipEl = plot.querySelector('.opt-walk-tip');
  const hint = box.querySelector('.opt-walk-hint');
  if (hint) hint.textContent = coarse ? 'pinch to zoom · drag sideways to move · tap a dot' : 'scroll to zoom · drag to move · hover or click a dot';

  // ── drawing ──
  const draw = () => {
    raf = 0;
    cur = renderWalk(m, tr, { hideSmall: state.hideSmall, hl: tip?.p?.expiry ?? null });
    svgBox.innerHTML = cur.svg;
    const p = PZ.presetOf(m.base, tr, m.lim);
    box.querySelectorAll('[data-wview]').forEach(b => { const on = b.dataset.wview === p; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    placeTip(); drawXh();
  };
  const schedule = () => { if (!raf) raf = (win.requestAnimationFrame ?? (f => setTimeout(f, 16)))(draw); };
  const save = () => { state.inst = inst; state.win = PZ.visibleWindow(m.base, tr); };

  // ── the transform: d3.zoom holds it when present, so a wheel after a pinch starts from the right place ──
  let zoom = null; const sel = d3 ? d3.select(plot) : null;
  const setT = (t, { draw: now = false } = {}) => {
    t = PZ.clampTransform(t, m.base, m.lim);
    if (zoom) sel.call(zoom.transform, d3.zoomIdentity.translate(t.x, 0).scale(t.k));
    else { tr = t; save(); schedule(); }
    if (now && raf) { (win.cancelAnimationFrame ?? clearTimeout)(raf); draw(); }
  };
  if (d3?.zoom) {
    zoom = d3.zoom().scaleExtent([1, m.lim.kMax]).extent([[m.L, 0], [m.R, m.h]]).translateExtent([[m.L, -1e6], [m.R, 1e6]])
      // wheel (not a sideways trackpad swipe, handled below) and a left-button mouse drag; touch is ours
      .filter(ev => (ev.type === 'wheel' ? Math.abs(ev.deltaY) >= Math.abs(ev.deltaX) : ev.type === 'mousedown' && !ev.button && !ev.ctrlKey))
      .on('zoom', ev => { tr = PZ.clampTransform({ k: ev.transform.k, x: ev.transform.x }, m.base, m.lim); save(); schedule(); });
    sel.call(zoom).on('dblclick.zoom', null);
    plot.style.touchAction = 'pan-y';   // d3 must not take the page's vertical scroll
    sel.call(zoom.transform, d3.zoomIdentity.translate(tr.x, 0).scale(tr.k));
  }
  draw();

  // ── geometry helpers ──
  const at = (cx, cy) => { const r = plot.getBoundingClientRect(), sx = r.width ? m.w / r.width : 1; return { x: (cx - r.left) * sx, y: (cy - r.top) * sx }; };
  const pick = (x, y) => (cur ? PZ.nearestPoint(cur.dots, x, y, { maxDx: coarse ? 26 : 18 }) : null);

  // ── the crosshair, with the date on the x axis and the price on the y axis ──
  function drawXh() {
    if (!xh || !cur || xh.x < m.L || xh.x > m.R) { xhSvg.innerHTML = ''; return; }
    const x = xh.x, y = Math.max(m.top, Math.min(m.bot, xh.y)), t = cur.Xinv(x), dd = Math.round(t - m.tNow);
    const dl = `${fmtDay(PZ.isoOfDay(t))}${dd ? ` · ${dd > 0 ? '+' : ''}${dd}d` : ' · today'}`, dw = PZ.textW(dl, 10) + 10;
    const bx = Math.max(m.L - 10, Math.min(m.w - dw - 1, x - dw / 2)), pl = fmtPx(cur.Yinv(y)), pw = PZ.textW(pl, 10) + 8;
    xhSvg.innerHTML = `<line x1="${x}" x2="${x}" y1="${m.top - 6}" y2="${m.bot}" stroke="var(--tx2,#bbb)" stroke-opacity=".7" stroke-dasharray="3 3"/>`
      + `<line x1="${m.L}" x2="${m.R}" y1="${y}" y2="${y}" stroke="var(--tx2,#bbb)" stroke-opacity=".45" stroke-dasharray="3 3"/>`
      + `<rect x="${bx}" y="${m.bot + 3}" width="${dw}" height="16" rx="3" fill="var(--bg3,#222)" stroke="var(--line2,#444)"/><text x="${bx + dw / 2}" y="${m.bot + 15}" font-size="10" text-anchor="middle" fill="var(--tx,#eee)">${esc(dl)}</text>`
      + `<rect x="${Math.max(1, m.L - pw - 2)}" y="${y - 8}" width="${pw}" height="16" rx="3" fill="var(--bg3,#222)" stroke="var(--line2,#444)"/><text x="${Math.max(1, m.L - pw - 2) + pw / 2}" y="${y + 4}" font-size="10" text-anchor="middle" fill="var(--tx,#eee)">${esc(pl)}</text>`;
  }
  const setXh = v => { xh = v; drawXh(); };

  // ── the tooltip card ──
  function placeTip() {
    const d = tip && cur?.dots.find(q => q.p.expiry === tip.p.expiry);
    if (!d) { tipEl.hidden = true; return; }
    tipEl.hidden = false;
    const r = plot.getBoundingClientRect(), s = r.width ? r.width / m.w : 1, tw = tipEl.offsetWidth || 180, th = tipEl.offsetHeight || 120;
    const W = r.width || m.w, px = d.x * s, py = d.y * s, gap = d.r * s + 10;
    let left = px + gap; if (left + tw > W - 2) left = px - gap - tw; if (left < 2) left = Math.max(2, Math.min(W - tw - 2, px - tw / 2));
    let topY = py - th / 2; topY = Math.max(m.top * s - 30, Math.min((m.h * s) - th - 2, topY));
    if (left <= px && left + tw >= px && topY <= py && topY + th >= py) topY = py - th - gap > 0 ? py - th - gap : py + gap;   // never cover the dot
    tipEl.style.left = `${Math.round(left)}px`; tipEl.style.top = `${Math.round(topY)}px`;
  }
  const rows = ex => box.querySelectorAll(`.opt-walk-t tr[data-exp="${CSS?.escape ? CSS.escape(ex) : ex}"]`);
  function showTip(p, { pinned = false, scrollRow = false } = {}) {
    if (!p) return hideTip();
    const same = tip?.p?.expiry === p.expiry;
    tip = { p, pinned: pinned || (same && tip.pinned) };
    tipEl.innerHTML = walkTip(sm, p, anchor);
    box.querySelectorAll('.opt-walk-t tr.opt-walk-hl').forEach(r => r.classList.remove('opt-walk-hl'));
    if (tip.pinned) { rows(p.expiry).forEach(r => r.classList.add('opt-walk-hl')); if (scrollRow) rows(p.expiry)[0]?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); }
    draw();
  }
  function hideTip() {
    if (!tip) return;
    tip = null; tipEl.hidden = true;
    box.querySelectorAll('.opt-walk-t tr.opt-walk-hl').forEach(r => r.classList.remove('opt-walk-hl'));
    draw();
  }

  // ── mouse: hover = crosshair + card, click = pin the card and go to the row ──
  const on = (el, ev, f, opt) => { el.addEventListener(ev, f, opt); offs.push(() => el.removeEventListener(ev, f, opt)); };
  const offs = [];
  on(plot, 'pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const q = at(e.clientX, e.clientY); setXh(q);
    if (!tip?.pinned) { const p = pick(q.x, q.y)?.p; if (p?.expiry !== tip?.p?.expiry) (p ? showTip(p) : hideTip()); }
  });
  on(plot, 'pointerleave', e => { if (e.pointerType !== 'mouse') return; setXh(null); if (tip && !tip.pinned) hideTip(); });
  on(plot, 'click', e => {
    const q = at(e.clientX, e.clientY), d = pick(q.x, q.y);
    if (d) showTip(d.p, { pinned: true, scrollRow: true }); else hideTip();
  });
  // a tap or click anywhere else dismisses a pinned card (the table rows pin their own)
  on(win.document ?? document, 'click', e => { if (tip && !plot.contains(e.target) && !e.target.closest?.('.opt-walk-t tr[data-exp]')) hideTip(); });
  // a sideways trackpad swipe pans (d3 takes the vertical wheel as zoom)
  on(plot, 'wheel', e => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); setT({ k: tr.k, x: tr.x - e.deltaX }); } }, { passive: false });

  // ── touch: pinch zooms, a sideways one-finger drag pans, a vertical swipe is left to the page ──
  let g = null, xhTimer = 0;
  const two = ts => { const a = at(ts[0].clientX, ts[0].clientY), b = at(ts[1].clientX, ts[1].clientY); return { d: Math.max(30, Math.hypot(a.x - b.x, a.y - b.y)), mid: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  const startOne = t => { const q = at(t.clientX, t.clientY); g = { mode: 'pending', x0: q.x, y0: q.y, tr0: tr }; };
  on(plot, 'touchstart', e => {
    clearTimeout(xhTimer);
    if (e.touches.length >= 2) { const s = two(e.touches); g = { mode: 'pinch', d0: s.d, bp: (s.mid - tr.x) / tr.k, tr0: tr }; setXh(null); if (e.cancelable) e.preventDefault(); }
    else if (e.touches.length === 1) startOne(e.touches[0]);
  }, { passive: false });
  on(plot, 'touchmove', e => {
    if (!g) return;
    if (g.mode === 'pinch' && e.touches.length >= 2) {
      const s = two(e.touches), k = g.tr0.k * s.d / g.d0;
      setT({ k, x: s.mid - Math.min(m.lim.kMax, Math.max(1, k)) * g.bp });
      if (e.cancelable) e.preventDefault(); return;
    }
    if (e.touches.length !== 1) return;
    const q = at(e.touches[0].clientX, e.touches[0].clientY), dx = q.x - g.x0, dy = q.y - g.y0;
    if (g.mode === 'pending') {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) g.mode = 'pan';
      else if (Math.abs(dy) > 8) { g.mode = 'scroll'; setXh(null); return; }
      else return;
    }
    if (g.mode === 'pan') { setT({ k: g.tr0.k, x: g.tr0.x + dx }); setXh(q); if (e.cancelable) e.preventDefault(); }
  }, { passive: false });
  const endTouch = e => {
    if (e.touches.length === 1 && g?.mode === 'pinch') { startOne(e.touches[0]); g.mode = 'pan'; return; }
    if (!e.touches.length) { g = null; xhTimer = setTimeout(() => setXh(null), 900); }
  };
  on(plot, 'touchend', endTouch); on(plot, 'touchcancel', endTouch);

  // ── keyboard ──
  on(plot, 'keydown', e => {
    const W = m.R - m.L, mid = (m.L + m.R) / 2, zoomBy = f => { const k = tr.k * f, kk = Math.min(m.lim.kMax, Math.max(1, k)); setT({ k, x: mid - kk * (mid - tr.x) / tr.k }); };
    if (e.key === 'ArrowLeft') setT({ k: tr.k, x: tr.x + W * 0.15 }); else if (e.key === 'ArrowRight') setT({ k: tr.k, x: tr.x - W * 0.15 });
    else if (e.key === '+' || e.key === '=') zoomBy(1.4); else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.4);
    else if (e.key === 'Escape') hideTip(); else return;
    e.preventDefault();
  });

  // ── the toolbar ──
  box.querySelectorAll('[data-wview]').forEach(b => (b.onclick = () => setT(PZ.presetTransform(m.base, b.dataset.wview, m.lim))));
  const rs = box.querySelector('[data-wreset]'); if (rs) rs.onclick = () => { hideTip(); setT(defaultTr()); };
  const hs = box.querySelector('[data-wsmall]');
  if (hs) { hs.checked = !!state.hideSmall; hs.onchange = () => { state.hideSmall = hs.checked; if (tip?.p?.thin && hs.checked) hideTip(); else draw(); }; }

  // ── the table: tap a row to centre the chart on that expiry and pin its card ──
  const focusExpiry = ex => {
    const p = m.pts.find(q => q.expiry === ex); if (!p) return;
    if (p.thin && state.hideSmall) { state.hideSmall = false; if (hs) hs.checked = false; }
    const [a, b] = PZ.visibleWindow(m.base, tr), t = PZ.dayNum(ex);
    let base = tr;
    if (b - a > 75) base = PZ.presetTransform(m.base, '1M', m.lim);   // from a wide view, zoom in first
    tip = null; setT(PZ.centreOn(m.base, base, t, m.lim), { draw: true });
    showTip(p, { pinned: true });
    plot.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };
  box.querySelectorAll('.opt-walk-t tr[data-exp]').forEach(r => {
    r.onclick = () => focusExpiry(r.dataset.exp);
    if (r.classList.contains('opt-walk-row')) r.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusExpiry(r.dataset.exp); } };
  });

  // a re-render rebuilds the whole box; the old listeners on document go with it
  box._pathChartOff = () => { offs.forEach(f => f()); offs.length = 0; if (sel) sel.on('.zoom', null); };
  return (box._pathChart = { get transform() { return tr; }, setTransform: t => setT(t, { draw: true }), focusExpiry, model: m, get view() { return cur; } });
}
