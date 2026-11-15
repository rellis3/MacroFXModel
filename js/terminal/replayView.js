/**
 * Desk Terminal, the REPLAY tab (the "time machine", stage 1). Pick a market and a London session day, go back to it, play it forward at 1x, 2x, 5x,
 * 10x, 60x or 300x (real-time multiples): the candles draw in with the forming candle building minute by minute, the option levels that were KNOWN at that
 * moment sit on the chart and pulse when price touches them, a touch log fills, currency strength (σ) moves beside it and the desk's book shows what it said.
 *
 * All the maths is in js/replayCore.js (pure, tested); this file fetches, draws and listens. Colours are theme tokens read at draw time (redrawn on 'themechange').
 * It describes what happened. It does not say what price will do next, and a line touch is not an edge (Evidence Book: line-touch book fails net).
 * Under prefers-reduced-motion there is no playback animation: the step buttons and the scrubber still move the clock.
 */
import * as R from '../replayCore.js';
import { esc, fin } from './boardViz.js';
import { replayHtml as beReplayHtml } from './biasEngineView.js';

const HOUR = 3600e3, MIN = 60e3;
const tc = n => (typeof themeColor === 'function' ? themeColor(n) : getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim());
const rgba = (n, a) => `rgba(${tc(n + 'rgb')},${a})`;
const reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const J = async p => { const r = await fetch(p); const j = await r.json().catch(() => null); if (!r.ok || !j || j.ok === false) throw new Error(j?.error ?? `HTTP ${r.status}`); return j; };
const ymd = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const LONDON_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });
const sgn = (v, d = 1) => (!fin(v) ? '–' : Number(Math.abs(v).toFixed(d)) === 0 ? (0).toFixed(d) : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`);
const KIND_CLS = l => (l.kind === 'oi' ? `k-${l.type}` : l.kind === 'fc' ? 'k-fc' : 'k-open');

/** Today's London date, and the most recent weekday session before it: where a first visit starts. */
export function defaultDate(now = Date.now()) {
  let d = R.prevDate(R.londonDate(now));
  for (let i = 0; i < 4 && [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()); i++) d = R.prevDate(d);
  return d;
}
/** The line colour token for a line, and whether it is drawn solid and glowing (the strong walls, max pain and the flips) or thin and dashed. */
export function lineStyle(l) {
  const tok = l.kind === 'oi' ? ({ call: 'blue2', put: 'teal', maxpain: 'gold', gammaflip: 'pur2', gexflip: 'pur2' }[l.type] ?? 'tx3') : l.kind === 'fc' ? 'flat' : 'tx3';
  const strong = l.kind === 'oi' && (l.tier === 'strong' || ['maxpain', 'gammaflip', 'gexflip'].includes(l.type));
  return { tok, strong, dash: l.kind === 'fc' ? [7, 5] : l.kind === 'open' ? [2, 4] : strong ? [] : [5, 4] };
}
/** The "published" lag label under an option level: when its capture was saved, which trade date it is, and that it stays until the next capture. */
export function lagLabel(l) {
  if (l.kind === 'fc') return 'archived vol forecast, drawn from the session open';
  if (l.kind === 'open') return 'first price of the London session';
  const at = `${R.londonDate(l.publishedAt)} ${R.londonHM(l.publishedAt)} London`;
  return `option book saved ${at}${l.tradeDate ? `, for the ${l.tradeDate} session's open interest` : ''}${l.stale ? ' · STALE (over 3 days old)' : ''}`;
}

export function mount(root) {
  if (!root) return;
  if (root.dataset.built) { root.__rp?.resize(); return; }
  root.dataset.built = '1';
  if (!document.getElementById('rp-css')) { const l = document.createElement('link'); l.id = 'rp-css'; l.rel = 'stylesheet'; l.href = 'js/terminal/replay.css'; document.head.appendChild(l); }

  const req = globalThis.__replayRequest ?? R.parseReplayHash(location.hash); globalThis.__replayRequest = null;
  const S = {
    inst: req?.inst ?? R.DEFAULT_INST, date: req?.date ?? defaultDate(), ts: req?.ts ?? null, speed: 60, playing: false, tf: 5, view: 'day', hz: '4H', skip: true,
    day: null, m1: [], agg: {}, lctx: null, touches: [], strength: null, snaps: [], meta: null, notable: null, token: 0, loading: false, error: null,
    pulses: [], shown: 0, lastReal: 0, raf: 0, lastHash: 0, lastSide: 0,
  };
  const noMotion = reduced();
  if (noMotion) S.speed = 60;

  root.innerHTML = `<div class="rp">
<div class="card glow"><div class="tt-head"><span class="lbl">Replay</span><h2 style="flex-basis:100%">Go back to a day and play it forward</h2></div>
<p class="tt-note" style="margin:0">Pick a market and a London session. The chart draws the minutes in as the clock runs; the option levels shown are the ones that had been published by that moment, the forecast lines start at the session open, and strength is rebuilt from the bars of that time. It describes what happened. It does not say what price will do next, and a touch of a line is not a signal.</p>
<div class="rp-ctl">
<label class="rp-f"><span class="lbl">Market</span><select id="rp-inst">${Object.entries(R.INSTRUMENTS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></label>
<label class="rp-f"><span class="lbl">London session</span><input id="rp-date" type="date" min="2015-01-01"></label>
<label class="rp-f"><span class="lbl">Start at (London)</span><input id="rp-time" type="time" step="300"></label>
<button class="btn rp-go" id="rp-go" type="button">Go to this moment</button>
<label class="rp-f" style="min-width:230px;flex:1 1 230px"><span class="lbl">Jump to a notable day</span><select id="rp-nb"><option value="">loading…</option></select></label>
</div></div>
<div class="rp-grid">
<div class="card rp-main">
<div class="rp-stage" id="rp-stage"><canvas id="rp-cv" role="img" aria-label="Candlestick replay with option and forecast levels"></canvas><div class="rp-hud" id="rp-hud"></div><div class="rp-msg rp-load" id="rp-msg">Loading the session…</div></div>
<p class="rp-cap" id="rp-cap" aria-live="off"></p>
<div class="rp-bar" role="group" aria-label="Playback">
<button class="btn" id="rp-start" type="button" title="Back to the start of the session">⏮</button><button class="btn" id="rp-bm" type="button" title="Back one candle (←)">◀ bar</button>
<button class="btn on" id="rp-play" type="button" title="Play or pause (space)" aria-pressed="false">▶ Play</button>
<button class="btn" id="rp-bp" type="button" title="Forward one candle (→)">bar ▶</button><button class="btn" id="rp-hp" type="button" title="Forward one hour (Shift →)">+1h</button>
<span class="rp-sp" id="rp-sp" role="group" aria-label="Speed (times real time)">${R.SPEEDS.map(s => `<button type="button" data-sp="${s}" aria-pressed="false" title="${s === 300 ? 'one 5-minute candle per second' : `${s}x real time`}">${s}x</button>`).join('')}</span>
<span class="rp-time" id="rp-clock"></span></div>
<div class="rp-bar" role="group" aria-label="Chart options">
<span class="rp-seg" id="rp-tf" role="group" aria-label="Candle size">${R.TIMEFRAMES.map(t => `<button type="button" data-tf="${t.min}" aria-pressed="false">${t.key}</button>`).join('')}</span>
<span class="rp-seg" id="rp-view" role="group" aria-label="View"><button type="button" data-v="day" aria-pressed="true">Whole session</button><button type="button" data-v="follow" aria-pressed="false">Follow (last 6h)</button></span>
<button class="btn" id="rp-skip" type="button" aria-pressed="true" title="While playing, jump over stretches with no prices (weekends, the daily break)">Skip empty stretches</button>
<button class="btn" id="rp-link" type="button" title="Copy a link to this exact moment">Copy link</button><button class="btn" id="rp-next" type="button" hidden>Next session ▶</button></div>
<div class="rp-mini"><canvas id="rp-mm" aria-hidden="true"></canvas><input class="rp-scrub" id="rp-scrub" type="range" aria-label="Replay clock" step="60000"></div>
<p class="rp-note" id="rp-note"></p></div>
<div class="rp-side">
<div class="card"><h3>Currency strength (σ) <span class="r" id="rp-hz" role="group" aria-label="Strength window">${R.HORIZONS.map(h => `<button type="button" class="chip" data-hz="${h}" aria-pressed="false" style="cursor:pointer">${h}</button>`).join('')}</span></h3><div id="rp-st"></div></div>
<div class="card rp-desk"><h3>The desk's book then</h3><div id="rp-desk"></div></div>
<div class="sfc" data-surface="panel.replay.engine"><div class="card" id="rp-be-card" hidden><h3>The bias engine that morning</h3><div id="rp-be"></div></div></div>
<div class="card"><h3>Levels known now</h3><div class="rp-lv" id="rp-lv"></div></div>
<div class="card"><h3>Touches so far <span class="r" id="rp-tn"></span></h3><div class="rp-log" id="rp-log"></div></div>
</div></div>
<div class="card"><div class="tt-head"><span class="lbl">Coverage</span><h2 style="font-size:15px">What can be replayed, and from when</h2></div><div class="rp-cov-w" id="rp-cov"><p class="muted">Loading…</p></div>
<p class="tt-note">A layer with nothing recorded at a moment says so; nothing is estimated to fill a hole. The option levels are drawn as stored (futures strikes already shifted onto the chart's price); the touch tolerance is 0.02% of the line's price.</p></div></div>`;

  const $ = id => root.querySelector('#' + id);
  const els = { cv: $('rp-cv'), mm: $('rp-mm'), msg: $('rp-msg'), hud: $('rp-hud'), cap: $('rp-cap'), clock: $('rp-clock'), scrub: $('rp-scrub'), note: $('rp-note') };

  // ── loading ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  async function load(inst, date, ts) {
    const tok = ++S.token; stop();
    Object.assign(S, { inst, date, ts: ts ?? R.londonWall(date, 7, 0), loading: true, error: null, day: null, m1: [], agg: {}, lctx: null, touches: [], strength: null, snaps: [], pulses: [], shown: 0 });
    $('rp-inst').value = inst; $('rp-date').value = date; setMsg('Loading the session…', true); beDraw(null); sideDraw(); paint();
    // the engine's stored issue for that day (never back-issued: a day without one, or today's unstored live read, shows nothing); apart from the bars
    J(`/api/bias-engine?date=${date}&market=${inst}`).then(r => { if (tok === S.token) beDraw(r && !r.live && r.market ? r : null); }).catch(() => { if (tok === S.token) beDraw(null); });
    try {
      const metaP = J(`/api/replay/meta?inst=${inst}`).catch(() => null), nbP = J(`/api/replay/notable?inst=${inst}`).catch(() => null);
      const day = await J(`/api/replay/day?inst=${inst}&date=${date}`);
      if (tok !== S.token) return;
      const win = day.win, m1 = day.bars;
      S.day = day; S.m1 = m1; for (const t of R.TIMEFRAMES) S.agg[t.min] = R.aggregateM1(m1, t.min);
      const inWin = m1.filter(r => r[0] >= win.start && r[0] < win.end);
      const open = R.sessionOpen(m1, win);
      S.lctx = { oi: day.oi?.entries ?? [], fc: day.forecast, open };
      S.touches = R.scanTouches(inWin, S.lctx);
      S.ts = R.clamp(ts ?? R.londonWall(date, 7, 0), win.start, win.end);
      S.loading = false; S.shown = R.touchesAt(S.touches, S.ts).length;
      els.scrub.min = win.start; els.scrub.max = win.end;
      $('rp-time').value = R.londonHM(S.ts);
      setMsg(inWin.length ? '' : `No prices for ${day.label} on ${date} (the market was shut, or this market's history starts later).`);
      sideDraw(); paint();
      metaP.then(m => { if (tok === S.token) { S.meta = m; coverageDraw(); } });
      nbP.then(n => { if (tok === S.token) { S.notable = n; notableDraw(); } });
      J(`/api/replay/strength?date=${date}`).then(s => { if (tok === S.token) { S.strength = s; sideDraw(); paint(); } }).catch(e => { if (tok === S.token) { S.strength = { error: e.message }; sideDraw(); } });
      J(`/api/desk-snapshots?from=${win.start}&to=${Math.min(win.end, Date.now())}&fields=desk&step=5&max=400`).then(r => { if (tok === S.token) { S.snaps = r.points ?? []; sideDraw(); } }).catch(() => { /* none stored then: the panel says so */ });
    } catch (e) { if (tok !== S.token) return; S.loading = false; S.error = e.message; setMsg(`The session did not load: ${e.message}`); sideDraw(); paint(); }
  }
  function beDraw(r) {
    const card = $('rp-be-card'), box = $('rp-be'); if (!card || !box) return;
    let html = ''; try { html = r ? beReplayHtml(r.market, r) : ''; } catch (e) { console.warn('bias engine replay', e); }
    box.innerHTML = html; card.hidden = !html;
  }
  function setMsg(t, loading = false) { els.msg.textContent = t; els.msg.style.display = t ? '' : 'none'; els.msg.classList.toggle('rp-load', !!loading); }

  // ── the moment ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const win = () => S.day?.win ?? { start: 0, end: 1 };
  const tfMs = () => S.tf * MIN;
  function moment() {
    const m1 = S.m1, n = R.m1Count(m1, S.ts), bars = R.barsAt(S.agg[S.tf] ?? [], m1, n);
    const lines = S.lctx ? R.levelsAt(S.lctx, S.ts) : [];
    const last = n ? m1[n - 1] : null, w = win();
    let hi = -Infinity, lo = Infinity;
    for (let i = 0; i < n; i++) { if (m1[i][0] < w.start) continue; if (m1[i][2] > hi) hi = m1[i][2]; if (m1[i][3] < lo) lo = m1[i][3]; }
    const touches = R.touchesAt(S.touches, S.ts), counts = {}; for (const e of touches) counts[e.id] = Math.max(counts[e.id] ?? 0, e.n);
    return { n, bars, lines, last, price: last ? last[4] : null, hi: hi > -Infinity ? hi : null, lo: lo < Infinity ? lo : null, touches, counts,
      strength: S.strength?.steps ? R.strengthAt(S.strength, S.ts) : null, desk: R.deskAt({ points: S.snaps, dawn: S.day?.dawn ?? null, ts: S.ts, inst: S.inst }), closed: n ? S.ts - (m1[n - 1][0] + MIN) > 30 * MIN : true };
  }

  // ── drawing ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function fitCanvas(cv) {
    const dpr = globalThis.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    return { g, w, h };
  }
  const niceStep = (range, n) => { const raw = range / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; };

  function draw(M) {
    const { g, w, h } = fitCanvas(els.cv), I = R.INSTRUMENTS[S.inst], W = win();
    const narrow = w < 560, PAD = { l: narrow ? 52 : 62, r: narrow ? 66 : 196, t: 30, b: 24 }, pw = w - PAD.l - PAD.r, ph = h - PAD.t - PAD.b;
    const vs = S.view === 'follow' ? S.ts - 6 * HOUR : W.start, ve = S.view === 'follow' ? S.ts + HOUR : W.end;
    const x = t => PAD.l + (t - vs) / (ve - vs) * pw;
    const vis = M.bars.filter(b => b.t + tfMs() >= vs && b.t <= ve);
    g.font = `10.5px ${tc('mono') || 'monospace'}`; g.textBaseline = 'middle';
    const gridC = tc('chart-grid'), txtC = tc('chart-text');
    // vertical axis
    const ref = M.price ?? S.lctx?.open?.price ?? null;
    let lo = Math.min(...vis.map(b => b.l)), hi = Math.max(...vis.map(b => b.h));
    if (!vis.length || !fin(lo)) { if (ref == null) { return; } lo = ref * 0.999; hi = ref * 1.001; }
    const R0 = Math.max(hi - lo, ref * 0.0006);
    const near = M.lines.filter(l => l.price >= lo - 0.7 * R0 && l.price <= hi + 0.7 * R0);
    for (const l of near) { if (l.price < lo) lo = l.price; if (l.price > hi) hi = l.price; }
    const pad = (hi - lo) * 0.07; lo -= pad; hi += pad;
    const y = p => PAD.t + (hi - p) / (hi - lo) * ph;
    // grid + price axis
    g.strokeStyle = gridC; g.lineWidth = 1; g.fillStyle = txtC; g.textAlign = 'right';
    const st = niceStep(hi - lo, 5);
    for (let p = Math.ceil(lo / st) * st; p <= hi; p += st) { const yy = Math.round(y(p)) + .5; g.beginPath(); g.moveTo(PAD.l, yy); g.lineTo(PAD.l + pw, yy); g.stroke(); g.fillText(st >= 1 ? Math.round(p).toLocaleString('en-GB') : R.fmtPrice(S.inst, p), PAD.l - 6, yy); }
    // time axis
    g.textAlign = 'center'; const hs = (ve - vs) > 12 * HOUR ? 3 * HOUR : HOUR;
    for (let t = Math.ceil(vs / hs) * hs; t <= ve; t += hs) { const xx = Math.round(x(t)) + .5; g.strokeStyle = gridC; g.beginPath(); g.moveTo(xx, PAD.t); g.lineTo(xx, PAD.t + ph); g.stroke(); if (xx < PAD.l + pw - 14) { g.fillStyle = txtC; g.fillText(R.londonHM(t), xx, h - 10); } }
    // closed stretches (no prices): shaded, so a gap is a gap
    const m1 = S.m1;
    g.fillStyle = rgba('flat', 0.07);
    for (let i = 1; i < m1.length; i++) { const a = m1[i - 1][0] + MIN, b = m1[i][0]; if (b - a > 20 * MIN && a < S.ts && b > vs && a < ve) g.fillRect(x(Math.max(a, vs)), PAD.t, x(Math.min(b, ve, S.ts)) - x(Math.max(a, vs)), ph); }
    // forecast band
    const fcH = M.lines.find(l => l.id.startsWith('fc:H50')), fcL = M.lines.find(l => l.id.startsWith('fc:L50'));
    if (fcH && fcL) { g.fillStyle = rgba('flat', 0.05); const t0 = Math.max(S.lctx.open.t, vs); g.fillRect(x(t0), y(fcH.price), PAD.l + pw - x(t0), y(fcL.price) - y(fcH.price)); }
    // lines
    const now = performance.now(); S.pulses = S.pulses.filter(p => now - p.t0 < 2200);
    const labels = [];
    for (const l of M.lines) {
      const sty = lineStyle(l), col = tc(sty.tok), yy = y(l.price), inside = yy >= PAD.t && yy <= PAD.t + ph, pulse = S.pulses.find(p => p.id === l.id);
      const x0 = l.kind === 'oi' ? PAD.l : x(Math.max(S.lctx.open?.t ?? vs, vs));
      if (inside) {
        g.save(); g.setLineDash(sty.dash); g.strokeStyle = col; g.lineWidth = pulse ? 2.6 : sty.strong ? 1.5 : 1; g.globalAlpha = pulse ? 1 : sty.strong ? 0.9 : 0.7;
        if (sty.strong || pulse) { g.shadowColor = col; g.shadowBlur = pulse ? 16 : 6; }
        g.beginPath(); g.moveTo(x0, yy); g.lineTo(PAD.l + pw, yy); g.stroke(); g.restore();
        if (pulse && !noMotion) { const k = (now - pulse.t0) / 2200; g.save(); g.strokeStyle = col; g.globalAlpha = (1 - k) * 0.8; g.lineWidth = 2; g.beginPath(); g.arc(PAD.l + pw - 6, yy, 4 + 22 * k, 0, Math.PI * 2); g.stroke(); g.restore(); }
      }
      labels.push({ y: Math.min(Math.max(yy, PAD.t + 4), PAD.t + ph - 4), dist: Math.abs(l.price - (M.price ?? l.price)), edge: yy < PAD.t ? '▲' : yy > PAD.t + ph ? '▼' : '', col, text: narrow ? (l.price >= 1000 ? Math.round(l.price).toLocaleString('en-GB') : R.fmtPrice(S.inst, l.price)) : `${l.label.replace('Forecast ', 'Fcst ').replace('Session open', 'Open')} ${R.fmtPrice(S.inst, l.price)}`, strong: sty.strong });
    }
    // a label for each line on the chart, plus the nearest two off the top and off the bottom (the Levels panel lists the rest); packed so none overlaps or leaves the plot
    const keep = labels.filter(L => !L.edge), up = labels.filter(L => L.edge === '▲').sort((a, b) => a.dist - b.dist).slice(0, 2), dn = labels.filter(L => L.edge === '▼').sort((a, b) => a.dist - b.dist).slice(0, 2);
    labels.length = 0; labels.push(...keep, ...up, ...dn);
    labels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 13) labels[i].y = labels[i - 1].y + 13;
    for (let i = labels.length - 1; i >= 0; i--) { const maxY = PAD.t + ph - 4 - (labels.length - 1 - i) * 13; if (labels[i].y > maxY) labels[i].y = maxY; }
    g.textAlign = 'left';
    for (const L of labels) { g.fillStyle = L.col; g.fillRect(PAD.l + pw + 5, L.y - 1.5, 8, 3); g.fillStyle = L.strong ? tc('tx') : tc('tx2'); g.fillText(`${L.edge}${L.text}`.trim(), PAD.l + pw + 17, L.y); }
    // candles
    const bw = Math.max(1, Math.min(14, tfMs() / (ve - vs) * pw * 0.72));
    for (const b of vis) {
      const up = b.c >= b.o, col = tc(up ? 'up' : 'dn'), xx = x(b.t + tfMs() / 2);
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1;
      g.beginPath(); g.moveTo(Math.round(xx) + .5, y(b.h)); g.lineTo(Math.round(xx) + .5, y(b.l)); g.stroke();
      const top = y(Math.max(b.o, b.c)), bh = Math.max(1, Math.abs(y(b.o) - y(b.c)));
      if (b.forming) { g.save(); g.shadowColor = col; g.shadowBlur = 8; g.fillRect(xx - bw / 2, top, bw, bh); g.restore(); } else g.fillRect(xx - bw / 2, top, bw, bh);
    }
    // touches
    for (const e of M.touches) { if (e.t < vs || e.t > ve) continue; const yy = y(e.price); if (yy < PAD.t || yy > PAD.t + ph) continue; g.strokeStyle = tc(lineStyle(M.lines.find(l => l.id === e.id) ?? { kind: e.kind, type: e.type }).tok); g.lineWidth = 1.4; g.beginPath(); g.arc(x(e.t), yy, 3.6, 0, Math.PI * 2); g.stroke(); }
    // the price now
    if (M.price != null && M.n) {
      const yy = y(M.price), col = tc('pur2'); g.save(); g.setLineDash([2, 3]); g.strokeStyle = col; g.globalAlpha = 0.8; g.beginPath(); g.moveTo(PAD.l, yy); g.lineTo(PAD.l + pw, yy); g.stroke(); g.restore();
      g.fillStyle = tc('pur'); g.fillRect(PAD.l + pw + 3, yy - 8, PAD.r - 8 > 70 ? 64 : PAD.r - 6, 16); g.fillStyle = tc('on-acc'); g.textAlign = 'left'; g.fillText(R.fmtPrice(S.inst, M.price), PAD.l + pw + 7, yy);
      const lastBar = M.bars[M.bars.length - 1]; if (lastBar && !noMotion) { const px = x(lastBar.t + tfMs() / 2); g.save(); g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 10; g.beginPath(); g.arc(px, yy, 2.6, 0, Math.PI * 2); g.fill(); g.restore(); }
    }
    // chips
    els.hud.innerHTML = `<span class="chip pur">${esc(R.INSTRUMENTS[S.inst].label)} · ${S.tf >= 60 ? '1h' : `${S.tf}m`}</span>${M.closed && M.n ? '<span class="chip gold">market closed</span>' : ''}${M.n && M.price != null && S.lctx?.open ? `<span class="chip ${M.price >= S.lctx.open.price ? 'up' : 'dn'}">${sgn((M.price / S.lctx.open.price - 1) * 100, 2)}% from the open</span>` : ''}`;
    void I;
  }

  function drawMini(M) {
    const { g, w, h } = fitCanvas(els.mm), W = win(), a = S.agg[15] ?? [];
    if (!a.length) return;
    const inW = a.filter(b => b.t >= W.start - 15 * MIN && b.t < W.end); if (!inW.length) return;
    let lo = Infinity, hi = -Infinity; for (const b of inW) { if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
    const x = t => (t - W.start) / (W.end - W.start) * w, y = p => 6 + (hi - p) / Math.max(hi - lo, 1e-9) * (h - 18);
    const cur = x(S.ts);
    g.lineWidth = 1.4; g.lineJoin = 'round';
    for (const [from, to, col, al] of [[0, cur, 'pur2', 1], [cur, w, 'tx3', 0.45]]) {
      g.save(); g.beginPath(); g.rect(from, 0, to - from, h); g.clip(); g.strokeStyle = tc(col); g.globalAlpha = al; g.beginPath();
      inW.forEach((b, i) => { const xx = x(b.t + 7.5 * MIN), yy = y(b.c); if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy); }); g.stroke(); g.restore();
    }
    g.fillStyle = tc('gold'); for (const e of S.touches) { const xx = x(e.t); g.globalAlpha = e.t <= S.ts ? 1 : 0.35; g.fillRect(xx - 0.5, h - 9, 1.5, 7); } g.globalAlpha = 1;
    g.strokeStyle = tc('tx'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(cur, 0); g.lineTo(cur, h); g.stroke();
  }

  function paint() {
    const M = moment();
    if (S.day && R.m1Count(S.m1, S.ts) === 0 && S.m1.length && !S.loading) setMsg(`Before the first price of this session (${R.londonHM(S.m1[0][0])} London). Play on, or step forward.`); else if (S.day && !S.loading && S.m1.some(r => r[0] >= win().start)) setMsg('');
    draw(M); drawMini(M);
    const W = win(); els.scrub.value = S.ts;
    els.clock.innerHTML = `${esc(LONDON_DAY.format(S.ts))} ${R.londonHM(S.ts)} London<small>${R.utcHM(S.ts)} UTC</small>`;
    els.cap.textContent = S.day ? R.captionFor({ ts: S.ts, inst: S.inst, price: M.price, lines: M.lines, counts: M.counts, dayHi: M.hi, dayLo: M.lo, open: S.lctx?.open ?? null, fc: S.day.forecast, strength: M.strength, hz: S.hz, desk: M.desk, marketClosed: M.closed && M.n > 0 }) : '';
    $('rp-play').textContent = S.playing ? '⏸ Pause' : (S.ts >= W.end && S.day ? '↺ Replay' : '▶ Play'); $('rp-play').setAttribute('aria-pressed', String(S.playing));
    $('rp-next').hidden = !(S.day && S.ts >= W.end && R.nextDate(S.date) <= R.londonDate(Date.now()));
    for (const b of root.querySelectorAll('[data-sp]')) b.setAttribute('aria-pressed', String(+b.dataset.sp === S.speed));
    for (const b of root.querySelectorAll('[data-tf]')) b.setAttribute('aria-pressed', String(+b.dataset.tf === S.tf));
    for (const b of root.querySelectorAll('[data-v]')) b.setAttribute('aria-pressed', String(b.dataset.v === S.view));
    for (const b of root.querySelectorAll('[data-hz]')) b.setAttribute('aria-pressed', String(b.dataset.hz === S.hz));
    $('rp-skip').setAttribute('aria-pressed', String(S.skip));
    sideDraw(M);
  }

  // ── the side panels (DOM updated only when something changed) ──────────────────────────────────────────────────────────────────────
  let stRows = null, lastSideKey = '';
  function strengthDraw(M) {
    const box = $('rp-st');
    if (S.strength?.error) { box.innerHTML = `<p class="rp-none">Strength for this day did not load (${esc(S.strength.error)}).</p>`; stRows = null; return; }
    if (!S.strength) { box.innerHTML = '<p class="rp-none rp-load">Rebuilding strength from the bars of 28 pairs…</p>'; stRows = null; return; }
    const rk = R.ranked(M.strength, S.hz);
    if (!rk) { box.innerHTML = `<p class="rp-none">No ${esc(S.hz)} strength at this moment: ${M.strength ? 'too few pairs had prices for that window.' : 'the session has not started yet.'}</p>`; stRows = null; return; }
    if (!stRows) { box.innerHTML = `<div class="rp-st" style="height:${rk.length * 26}px;position:relative">${rk.map(r => `<div class="rp-st-row" data-c="${r.ccy}" style="position:absolute;left:0;right:0;top:0"><b>${r.ccy}</b><div class="rp-st-t"><i class="rp-st-z"></i><i class="rp-st-b"></i></div><span class="rp-st-v mono"></span></div>`).join('')}</div><p class="muted" style="margin:8px 0 0;font-size:11.5px" id="rp-st-s"></p>`; stRows = {}; for (const el of box.querySelectorAll('.rp-st-row')) stRows[el.dataset.c] = el; }
    const max = Math.max(1.5, ...rk.map(r => Math.abs(r.score))) * 1.08;
    rk.forEach((r, i) => { const el = stRows[r.ccy]; if (!el) return; el.style.transform = `translateY(${i * 26}px)`; el.style.transition = noMotion ? 'none' : 'transform .35s ease';
      const b = el.querySelector('.rp-st-b'), pos = 50 + r.score / max * 50; b.style.left = `${Math.min(pos, 50)}%`; b.style.width = `${Math.abs(pos - 50)}%`; b.className = `rp-st-b ${r.score > 0.05 ? 'pos' : r.score < -0.05 ? 'neg' : ''}`;
      const v = el.querySelector('.rp-st-v'); v.textContent = `${sgn(r.score)}σ`; v.className = `rp-st-v mono ${r.score > 0.05 ? 'up' : r.score < -0.05 ? 'dn' : ''}`; });
    $('rp-st-s').textContent = `rebuilt for ${R.londonHM(M.strength.t)} London${M.strength.closed ? ' · market closed, windows end at the last price' : ''}. Price-based: it is not the desk's analyst read.`;
  }
  function deskDraw(M) {
    const d = M.desk, box = $('rp-desk');
    if (!d) { box.innerHTML = `<p class="rp-none">Not recorded then. The desk's morning book is shown from the minute it finished${S.day?.dawn ? ` (${esc(R.londonHM(S.day.dawn.finishedMs))} London)` : ' (no book was saved for this day)'}; the snapshot of its bias and tiles exists only since ${esc(S.meta?.coverage?.snapshots?.from ?? 'the capture began')}.</p>`; return; }
    const lean = d.rating ? `<span class="chip ${/LONG/i.test(d.rating) ? 'up' : /SHORT/i.test(d.rating) ? 'dn' : ''}">${esc(R.INSTRUMENTS[S.inst].label)} ${esc(String(d.rating).toLowerCase())}${d.conviction ? `<i>${esc(d.conviction)}</i>` : ''}</span>` : '';
    const ccy = d.ccy ? Object.entries(d.ccy).filter(([, v]) => fin(v)).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<span class="chip ${v > 0 ? 'up' : v < 0 ? 'dn' : ''}">${c}<i>${v > 0 ? '+' : ''}${v}</i></span>`).join('') : '';
    box.innerHTML = `<div><span class="chip pur">${d.source === 'snapshot' ? 'snapshot' : 'morning book'}</span> ${d.tone ? `<span class="chip">${esc(String(d.tone).replace('_', ' '))}</span>` : ''} ${lean}</div>${ccy ? `<div class="rp-chips" title="the desk's bias per currency, -2 to +2">${ccy}</div>` : ''}<p class="muted" style="margin:8px 0 0;font-size:11.5px">${d.source === 'snapshot' ? `snapshot saved ${esc(R.londonHM(d.at))} London; the book itself is from ${esc(String(d.asOf ?? '').slice(0, 16).replace('T', ' '))} UTC.` : `the morning read, finished ${esc(R.londonHM(d.at))} London. The snapshots that hold its currency bias start ${esc(S.meta?.coverage?.snapshots?.from ?? 'later')}.`} An analyst read; it is not a signal.</p>`;
  }
  function levelsDraw(M) {
    const p = M.price, box = $('rp-lv');
    if (!M.lines.length) { box.innerHTML = `<p class="rp-none">No levels yet at this moment: ${S.day?.oi?.error ? `the option store could not be read (${esc(S.day.oi.error)})` : !S.day?.oi?.pair ? 'this market has no option book in the capture' : 'no option capture had been saved yet'} and the session has not opened.</p>`; return; }
    const oiNote = !M.lines.some(l => l.kind === 'oi') ? `<p class="rp-none" style="margin-bottom:6px">No option levels at this moment: ${S.day?.oi?.error ? `the option store could not be read (${esc(S.day.oi.error)})` : !S.day?.oi?.pair ? 'this market has no option book in the capture' : 'no capture had been saved yet, or none within a week'}.</p>` : '';
    const I = R.INSTRUMENTS[S.inst];
    box.innerHTML = oiNote + [...M.lines].sort((a, b) => b.price - a.price).map(l => { const d = p != null ? (l.price - p) : null, nearL = d != null && Math.abs(d) <= Math.abs(l.price) * 0.0006, k = M.counts[l.id] ?? 0;
      return `<div class="rp-lv-row ${KIND_CLS(l)}${nearL ? ' near' : ''}"><i></i><span class="nm">${esc(l.label)}${l.tier === 'strong' ? ' · strong' : ''}${l.oi ? ` · OI ${l.oi.toLocaleString('en-GB')}` : ''}<small>${esc(lagLabel(l))}${k ? ` · touched ${k}×` : ''}</small></span><span class="px">${R.fmtPrice(S.inst, l.price)}<small>${d == null ? '' : `${d > 0 ? '+' : '−'}${(Math.abs(d) * I.mult).toLocaleString('en-GB', { maximumFractionDigits: I.mult > 1 ? 0 : 1 })} ${I.unit}`}</small></span></div>`; }).join('');
  }
  function logDraw(M) {
    const ev = [...M.touches].reverse().slice(0, 40); $('rp-tn').textContent = M.touches.length ? `${M.touches.length}` : '';
    $('rp-log').innerHTML = ev.length ? ev.map(e => `<div><span>${R.londonHM(e.t)}</span><span>${esc(e.label)} ${R.fmtPrice(S.inst, e.price)}</span><em>${e.from === 'below' ? '↗ from below' : '↘ from above'} · #${e.n}</em></div>`).join('') : '<p class="rp-none" style="margin:0">No line touched yet. A touch is price coming within 0.02% of a level that was on the chart.</p>';
  }
  function sideDraw(M) {
    M = M ?? moment();
    const key = `${S.inst}|${S.date}|${S.hz}|${M.strength?.t}|${!!S.strength}|${M.desk?.at}|${M.lines.map(l => l.id).join(',')}|${M.touches.length}|${S.loading}|${Math.round((M.price ?? 0) * 100)}`;
    if (key === lastSideKey) return; lastSideKey = key;
    if (!S.day) { $('rp-lv').innerHTML = ''; $('rp-log').innerHTML = ''; $('rp-desk').innerHTML = ''; $('rp-st').innerHTML = S.loading ? '<p class="rp-none rp-load">Loading…</p>' : ''; stRows = null; return; }
    strengthDraw(M); deskDraw(M); levelsDraw(M); logDraw(M);
  }
  function coverageDraw() {
    const rows = R.coverageRows(S.meta);
    $('rp-cov').innerHTML = rows.length ? `<table class="rp-cov"><thead><tr><th>Layer</th><th>From</th><th>To</th><th>What is and is not there</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.layer)} <span class="chip ${r.status === 'full' ? 'up' : r.status === 'none' ? 'dn' : 'gold'}">${esc(r.status)}</span></td><td class="mono">${esc(r.from ?? 'unknown')}</td><td class="mono">${esc(r.to ?? '–')}</td><td>${esc(r.note)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Coverage is not available right now.</p>';
  }
  function notableDraw() {
    const n = S.notable, sel = $('rp-nb');
    if (!n) { sel.innerHTML = '<option value="">not available</option>'; return; }
    const og = (label, items) => (items.length ? `<optgroup label="${esc(label)}">${items.join('')}</optgroup>` : '');
    sel.innerHTML = `<option value="">choose a day…</option>${og('Biggest ranges (last 200 days)', n.ranges.map(r => `<option value="d|${r.date}">${r.date} · range ${r.rangePct}%${r.movePct ? `, closed ${sgn(r.movePct, 2)}%` : ''}</option>`))}${og('Tested the most option levels', n.tests.map(t => `<option value="d|${t.date}">${t.date} · ${t.levels} of ${t.of} levels inside the day's range</option>`))}${og('Recent releases (starts 30 min before)', n.releases.map(r => `<option value="r|${r.ms}">${esc(R.londonDate(r.ms))} ${esc(R.londonHM(r.ms))} · ${esc(r.country ?? '')} ${esc(r.event ?? '')}</option>`))}`;
  }

  // ── the clock ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  function stop() { S.playing = false; cancelAnimationFrame(S.raf); S.raf = 0; }
  function tick(nowMs) {
    if (!S.playing) return;
    const dt = Math.min(250, nowMs - (S.lastReal || nowMs)); S.lastReal = nowMs;
    let st = R.advance({ ts: S.ts, speed: S.speed, playing: true }, dt, win());
    if (S.skip) { const j = R.gapJump(S.m1, st.ts); if (j != null && j <= win().end) st = { ...st, ts: j }; }
    S.ts = st.ts; S.playing = st.playing;
    const touches = R.touchesAt(S.touches, S.ts).length;
    if (touches > S.shown && touches - S.shown < 6 && !noMotion) for (const e of S.touches.slice(S.shown, touches)) S.pulses.push({ id: e.id, t0: performance.now() });
    S.shown = touches;
    paint(); hashSync();
    if (S.playing || S.pulses.length) S.raf = requestAnimationFrame(tick); else S.raf = 0;
  }
  function play() { if (noMotion || !S.day) return; if (S.ts >= win().end) S.ts = win().start; S.playing = true; S.lastReal = 0; S.shown = R.touchesAt(S.touches, S.ts).length; cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(tick); paint(); }
  function seek(ts, keepPlaying = false) { S.ts = R.clamp(ts, win().start, win().end); S.shown = R.touchesAt(S.touches, S.ts).length; S.pulses = []; if (!keepPlaying) { S.playing = false; } paint(); hashSync(true); }
  function hashSync(force) { const n = Date.now(); if (!S.day || (!force && n - S.lastHash < 2000)) return; S.lastHash = n; try { history.replaceState(null, '', R.formatReplayHash(S.inst, S.ts)); } catch { /* the address bar is not essential */ } }
  const barMs = () => Math.max(tfMs(), MIN);

  // ── controls ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  $('rp-play').onclick = () => (S.playing ? (stop(), paint()) : play());
  $('rp-start').onclick = () => seek(win().start);
  $('rp-bm').onclick = () => seek(S.ts - barMs());
  $('rp-bp').onclick = () => seek(S.ts + barMs());
  $('rp-hp').onclick = () => seek(S.ts + HOUR);
  $('rp-sp').onclick = e => { const b = e.target.closest('[data-sp]'); if (!b || noMotion) return; S.speed = +b.dataset.sp; paint(); };
  $('rp-tf').onclick = e => { const b = e.target.closest('[data-tf]'); if (!b) return; S.tf = +b.dataset.tf; paint(); };
  $('rp-view').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; S.view = b.dataset.v; paint(); };
  $('rp-hz').onclick = e => { const b = e.target.closest('[data-hz]'); if (!b) return; S.hz = b.dataset.hz; stRows = null; lastSideKey = ''; paint(); };
  $('rp-skip').onclick = () => { S.skip = !S.skip; paint(); };
  $('rp-link').onclick = async () => { const u = `${location.origin}${location.pathname}${R.formatReplayHash(S.inst, S.ts)}`; try { await navigator.clipboard.writeText(u); $('rp-link').textContent = 'Link copied'; } catch { $('rp-link').textContent = 'Copy failed: use the address bar'; } hashSync(true); setTimeout(() => { $('rp-link').textContent = 'Copy link'; }, 2200); };
  $('rp-next').onclick = () => { const d = R.nextDate(S.date); load(S.inst, d, R.sessionWindow(d).start).then(() => { if (!noMotion) play(); }); };
  els.scrub.oninput = () => seek(+els.scrub.value, S.playing);
  $('rp-go').onclick = () => { const d = $('rp-date').value, t = $('rp-time').value || '07:00'; if (!R.validDate(d)) return; const [hh, mm] = t.split(':').map(Number); load($('rp-inst').value, d, R.londonWall(d, hh, mm)); };
  $('rp-inst').onchange = () => { $('rp-go').click(); };
  $('rp-nb').onchange = e => { const v = e.target.value; if (!v) return; const [k, a] = v.split('|'); if (k === 'd') { const t = $('rp-time').value || '07:00', [hh, mm] = t.split(':').map(Number); load(S.inst, a, R.londonWall(a, hh, mm)); } else { const ms = +a - 30 * MIN; load(S.inst, R.londonDate(ms), ms); } e.target.value = ''; };
  const onKey = e => {
    if (!root.isConnected || root.hidden || /INPUT|SELECT|TEXTAREA/.test(e.target?.tagName ?? '') && e.target.type !== 'range') return;
    if (e.key === ' ') { e.preventDefault(); $('rp-play').click(); } else if (e.key === 'ArrowRight') { e.preventDefault(); seek(S.ts + (e.shiftKey ? HOUR : barMs())); } else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(S.ts - (e.shiftKey ? HOUR : barMs())); }
    else if (e.key === ']' || e.key === '[') { const i = R.SPEEDS.indexOf(S.speed) + (e.key === ']' ? 1 : -1); if (R.SPEEDS[i] && !noMotion) { S.speed = R.SPEEDS[i]; paint(); } }
  };
  document.addEventListener('keydown', onKey);
  const onTheme = () => { if (!root.isConnected) { removeEventListener('themechange', onTheme); document.removeEventListener('keydown', onKey); return; } paint(); };
  addEventListener('themechange', onTheme);
  const ro = new ResizeObserver(() => { if (!root.hidden) paint(); }); ro.observe($('rp-stage'));
  root.__rp = { resize: () => paint(), load: (inst, ts) => load(inst, ts != null ? R.londonDate(ts) : defaultDate(), ts ?? undefined) };
  if (noMotion) { $('rp-play').disabled = true; $('rp-play').title = 'Playback animation is off because your system asks for reduced motion. Use the step buttons or drag the clock.'; for (const b of root.querySelectorAll('[data-sp]')) b.disabled = true; els.note.textContent = 'Reduced motion is on: there is no autoplay. Step with the buttons or the arrow keys, or drag the clock.'; }
  else els.note.textContent = 'Space plays and pauses, the arrow keys step a candle (Shift: an hour), [ and ] change the speed. Speeds are multiples of real time; 300x is one five-minute candle a second.';
  $('rp-time').value = S.ts != null ? R.londonHM(S.ts) : '07:00';
  load(S.inst, S.date, S.ts);
}
