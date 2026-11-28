/**
 * OI over time: one frame as one HTML string for each of the three views (terrain, level walk, gauge). Pure; every colour is a theme token. Description only: it shows where
 * price was against the stored option-OI, not where it will go. The pictures use the same colours as the ghost walk: calls green, puts red, max pain gold, the flip plain.
 */
import { ordinal } from './ordinal.js';
import { esc, fin } from './boardViz.js';
import { gaugeSvg } from './optionsView.js';
import { recentCandles } from '../oiTimeCore.js';

const f1 = v => (Math.round(v * 10) / 10).toString();
let uidN = 0;
const px = (v, dp) => (fin(v) ? Number(v).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '–');
const candle = (x, p, y, w, now, reduced, id) => {
  if (!p) return '';
  const up = p.c >= p.o, col = up ? 'var(--up)' : 'var(--dn)', top = y(Math.max(p.o, p.c)), bot = y(Math.min(p.o, p.c));
  return `${now && !reduced ? `<rect x="${f1(x - w)}" y="${f1(y(p.h) - 3)}" width="${f1(w * 2)}" height="${f1(y(p.l) - y(p.h) + 6)}" rx="3" fill="${col}" fill-opacity=".16" filter="url(#${id})"/>` : ''}`
    + `<line x1="${f1(x)}" x2="${f1(x)}" y1="${f1(y(p.h))}" y2="${f1(y(p.l))}" stroke="${col}" stroke-width="${now ? 1.6 : 1}" stroke-opacity="${now ? 1 : 0.6}"/>`
    + `<rect x="${f1(x - w / 2)}" y="${f1(top)}" width="${f1(w)}" height="${f1(Math.max(1.5, bot - top))}" fill="${col}" fill-opacity="${now ? 0.95 : 0.55}"/>`;
};

/** 1. The strike profile on the left, price on the right, one shared price axis. mode 'day': recent daily candles; mode 'intraday': the day's 15-minute path against that day's capture. */
export function terrainStage(frames, i, extra, { w = 640, reduced = false } = {}) {
  const f = frames?.[i]; if (!f || !extra?.days?.length) return '<p class="muted">Nothing to draw for this step.</p>';
  const intraday = extra.mode === 'intraday', d = extra.days[intraday ? extra.dayIndex : f.data.i], sc = extra.scale, dp = extra.dp ?? 2, id = `oit${++uidN}`;
  const L = 60, T = 14, ph = 270, P1 = 318, xc = (L + P1) / 2, R0 = P1 + 14, R1 = w - 12, half = sc.half, lo = d.spot * (1 - half), hi = d.spot * (1 + half);
  const y = p => T + (1 - (p - lo) / (hi - lo)) * ph, inWin = p => fin(p) && p >= lo && p <= hi, barMax = (P1 - L) / 2 - 4;
  let grid = '';
  for (let k = 0; k <= 4; k++) { const p = lo + (hi - lo) * k / 4; grid += `<line x1="${L}" x2="${R1}" y1="${f1(y(p))}" y2="${f1(y(p))}" stroke="var(--line2)" stroke-opacity=".3"/><text x="${L - 6}" y="${f1(y(p) + 3.5)}" text-anchor="end" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${px(p, dp > 3 ? 4 : 0)}</text>`; }
  let bars = '';
  for (const [side, list] of [['call', d.calls], ['put', d.puts]]) for (const wl of list) {
    if (!inWin(wl.k)) continue; const len = Math.max(2, Math.min(barMax, wl.oi / sc.oiMax * barMax)), col = side === 'call' ? 'var(--up)' : 'var(--dn)', x0 = side === 'call' ? xc : xc - len;
    bars += `<rect x="${f1(x0)}" y="${f1(y(wl.k) - 3)}" width="${f1(len)}" height="6" rx="2" fill="${col}" fill-opacity="${wl.tier === 'strong' ? 0.9 : 0.5}"/>`;
  }
  const lines = [[d.maxPain, 'var(--gold)', '6 4', 'max pain'], [d.gammaFlip, 'var(--tx)', '2 3', 'gamma flip'], ...(d.flips ?? []).slice(0, 1).map(fl => [fl.k, 'var(--tx2)', '2 3', 'GEX flip'])].filter(l => inWin(l[0]));
  const lyOf = (() => { const o = lines.map((l, k) => ({ k, y: y(l[0]) })).sort((a, b) => a.y - b.y), m = {}; let prev = -1e9; for (const e of o) { const ly = Math.max(e.y, prev + 11); m[e.k] = ly; prev = ly; } return m; })();
  const lineSvg = lines.map(([p, col, dash, t], k) => `<line x1="${L}" x2="${R1}" y1="${f1(y(p))}" y2="${f1(y(p))}" stroke="${col}" stroke-width="1.3" stroke-dasharray="${dash}" stroke-opacity=".9"/><text x="${R1 - 2}" y="${f1(lyOf[k] - 3)}" text-anchor="end" font-size="9" fill="${col}" font-family="var(--mono)">${t} ${px(p, dp)}</text>`).join('');
  let right = '';
  if (!intraday) {
    const rc = recentCandles(extra.days, f.data.i, 20), n = 20, slot = (R1 - R0) / n, cw = Math.max(3, slot * 0.55);
    const trail = key => rc.map((c, k) => { const dd = extra.days.find(x => x.date === c.date), p = key(dd); return fin(p) ? `${f1(R0 + slot * (n - rc.length + k + 0.5))},${f1(y(p))}` : null; }).filter(Boolean);
    const mp = trail(x => x.maxPain), gf = trail(x => x.gammaFlip);
    right = `<g clip-path="url(#${id}c)">${mp.length > 1 ? `<path d="M${mp.join('L')}" fill="none" stroke="var(--gold)" stroke-width="1" stroke-opacity=".5"/>` : ''}${gf.length > 1 ? `<path d="M${gf.join('L')}" fill="none" stroke="var(--tx)" stroke-width="1" stroke-opacity=".4" stroke-dasharray="1 3"/>` : ''}`
      + rc.map((c, k) => candle(R0 + slot * (n - rc.length + k + 0.5), c.px, y, cw, c.now, reduced, id)).join('') + '</g>';
  } else if (extra.focus) {
    const day = 24 * 3600e3, x = ms => R0 + (ms / day) * (R1 - R0), seen = extra.focus.path.filter(p => p[0] <= f.data.x), pts = seen.map(p => `${f1(x(p[0]))},${f1(y(p[1]))}`);
    const hx = x(f.data.x), hy = y(f.data.price);
    right = `<g clip-path="url(#${id}c)">${pts.length > 1 ? `<path d="M${pts.join('L')}" fill="none" stroke="var(--pur2)" stroke-width="2.2" stroke-linejoin="round"${reduced ? '' : ` filter="url(#${id})"`}/>` : ''}<circle cx="${f1(hx)}" cy="${f1(hy)}" r="4.5" fill="var(--pur2)" stroke="var(--bg1)" stroke-width="1.5"/></g>`
      + [0, 6, 12, 18, 24].map(h => `<text x="${f1(x(h * 3600e3))}" y="${T + ph + 14}" text-anchor="middle" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${String(h % 24).padStart(2, '0')}</text>`).join('');
  }
  const spotMark = `<path d="M${xc - 5},${f1(y(d.spot))}l5,-5l5,5l-5,5z" fill="var(--pur2)" stroke="var(--bg1)" stroke-width="1"/>`;
  const title = intraday ? 'the day, 15 minutes at a time' : 'the last 20 days of candles';
  return `<svg class="rpv-svg oit-svg" viewBox="0 0 ${w} ${T + ph + 34}" width="100%" role="img" aria-label="${esc(extra.label)} option open interest by strike on ${esc(d.date)}: ${d.calls.length} call strikes right, ${d.puts.length} put strikes left, max pain ${px(d.maxPain, dp)}, with price on the same axis">
<defs><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><clipPath id="${id}c"><rect x="${R0}" y="${T}" width="${R1 - R0}" height="${ph}"/></clipPath></defs>
<rect x="${L}" y="${T}" width="${R1 - L}" height="${ph}" rx="4" fill="var(--bg2)" fill-opacity=".5" stroke="var(--line2)" stroke-opacity=".5"/>${grid}
<line x1="${f1(xc)}" x2="${f1(xc)}" y1="${T}" y2="${T + ph}" stroke="var(--tx3)" stroke-opacity=".5"/>${bars}${lineSvg}${right}${spotMark}
<text x="${L}" y="${T + ph + 14}" font-size="9.5" fill="var(--tx3)">puts ◂ open interest ▸ calls</text>
<text x="${L}" y="${T + ph + 28}" font-size="9.5" fill="var(--tx3)">${esc(`bars = contracts, one scale for the whole replay · right: ${title}`)}</text></svg>`;
}

/** 2. The level walk: candles after the start day with the fixed level across them, the DTE under each, touches ringed, and the real-vs-mirror tally bars. */
export function walkStage(frames, k, extra, { w = 640, reduced = false } = {}) {
  const f = frames?.[k]; if (!f || !extra?.walk) return '<p class="muted">Nothing to draw for this step.</p>';
  const W = extra.walk, id = `oiw${++uidN}`, dp = extra.dp ?? 2, n = W.steps.length + 1, upTo = f.data.step;
  const L = 60, R = 14, T = 12, ph = 220, pw = w - L - R, slot = pw / (HORIZON_SLOTS), cw = Math.max(8, Math.min(26, slot * 0.5));
  const lows = [W.level, W.start.spot, ...W.steps.flatMap(s => [s.px.l, s.px.h])], lo0 = Math.min(...lows), hi0 = Math.max(...lows), pad = (hi0 - lo0) * 0.1 || hi0 * 0.002, lo = lo0 - pad, hi = hi0 + pad;
  const y = p => T + (1 - (p - lo) / (hi - lo)) * ph, xs = j => L + slot * (j + 0.5);
  let grid = ''; for (let g = 0; g <= 4; g++) { const p = lo + (hi - lo) * g / 4; grid += `<line x1="${L}" x2="${L + pw}" y1="${f1(y(p))}" y2="${f1(y(p))}" stroke="var(--line2)" stroke-opacity=".3"/><text x="${L - 6}" y="${f1(y(p) + 3.5)}" text-anchor="end" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${px(p, dp > 3 ? 4 : 0)}</text>`; }
  const col = { call: 'var(--up)', put: 'var(--dn)', maxpain: 'var(--gold)', gamma: 'var(--tx)' }[W.kind] ?? 'var(--gold)';
  const band = fin(W.adr) ? [1, -1].map(s => `<line x1="${L}" x2="${L + pw}" y1="${f1(y(W.level * (1 + s * W.adr)))}" y2="${f1(y(W.level * (1 + s * W.adr)))}" stroke="${col}" stroke-opacity=".25" stroke-dasharray="3 4"/>`).join('') : '';
  const start = `<circle cx="${f1(xs(0))}" cy="${f1(y(W.start.spot))}" r="5" fill="var(--pur2)" stroke="var(--bg1)" stroke-width="1.5"/><text x="${f1(xs(0))}" y="${T + ph + 14}" text-anchor="middle" font-size="9.5" fill="var(--tx2)" font-family="var(--mono)">start${fin(W.start.dte) ? ` ${W.start.dte}d` : ''}</text>`;
  let cs = '', ev = '';
  for (let j = 0; j < upTo; j++) {
    const s = W.steps[j]; cs += candle(xs(j + 1), s.px, y, cw, j === upTo - 1, reduced, id);
    ev += `<text x="${f1(xs(j + 1))}" y="${T + ph + 14}" text-anchor="middle" font-size="9.5" fill="${j === upTo - 1 ? 'var(--tx)' : 'var(--tx3)'}" font-family="var(--mono)">${fin(s.dte) ? `${s.dte}d` : '–'}</text>`;
    if (s.touched) ev += `<circle class="${j === upTo - 1 && !reduced ? 'gw-ring' : ''}" cx="${f1(xs(j + 1))}" cy="${f1(y(W.level))}" r="9" fill="none" stroke="${col}" stroke-width="1.8"/>`;
  }
  const svg = `<svg class="rpv-svg oit-svg" viewBox="0 0 ${w} ${T + ph + 32}" width="100%" role="img" aria-label="${esc(extra.label)}: a fixed ${esc(extra.kindLabel)} at ${px(W.level, dp)} followed for ${W.steps.length} sessions, with price over it">
<defs><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<rect x="${L}" y="${T}" width="${pw}" height="${ph}" rx="4" fill="var(--bg2)" fill-opacity=".5" stroke="var(--line2)" stroke-opacity=".5"/>${grid}${band}
<line x1="${L}" x2="${L + pw}" y1="${f1(y(W.level))}" y2="${f1(y(W.level))}" stroke="${col}" stroke-width="2" stroke-opacity=".9"/><text x="${L + pw - 2}" y="${f1(y(W.level) - 4)}" text-anchor="end" font-size="10" fill="${col}" font-family="var(--mono)">${esc(extra.kindLabel.toLowerCase())} ${px(W.level, dp)}</text>
${cs}${start}${ev}<text x="${L}" y="${T + ph + 28}" font-size="9.5" fill="var(--tx3)">fixed level · dotted = one average daily range either side · days under each candle = days to the primary expiry on that day's capture</text></svg>`;
  const t = extra.tally, bar = (label, o) => `<div class="oit-bar"><span>${label}</span><i style="--a:${(o.lo ?? 0).toFixed(1)}%;--b:${(o.hi ?? 0).toFixed(1)}%;--p:${(o.p ?? 0).toFixed(1)}%"><b></b></i><em>${fin(o.p) ? `${Math.round(o.p)}%` : '–'} <small>(${fin(o.lo) ? `${Math.round(o.lo)} to ${Math.round(o.hi)}` : ''})</small></em></div>`;
  const tal = t?.all?.n ? `<div class="oit-tally">${bar('level touched', t.all.real)}${bar('mirror touched', t.all.mirror)}</div>` : '';
  return `${svg}${tal}<p class="gw-touch muted">${esc(extra.tallyText)}</p><div class="gw-meta">${(extra.evChips ?? []).join('')}</div>`;
}
const HORIZON_SLOTS = 9;

/** 3. The OI gauge: the Options tab's own dial, tinted by what price did that day, with the strip of daily changes behind it. */
export function gaugeStage(frames, k, extra, { w = 520 } = {}) {
  const f = frames?.[k]; if (!f) return '<p class="muted">Nothing to draw for this step.</p>';
  const d = f.data, up = d.chg == null ? null : d.chg >= 0, tone = up == null ? 'var(--line2)' : up ? 'var(--up)' : 'var(--dn)';
  const from = Math.max(0, k - 39), rows = frames.slice(from, k + 1), mx = Math.max(0.2, ...rows.map(r => Math.abs(r.data.chg ?? 0))), sw = 300 / 40, base = 44;
  const strip = rows.map((r, j) => { const c = r.data.chg ?? 0, h = Math.max(1, Math.abs(c) / mx * 38), x = 10 + (from + j - from) * sw; return `<rect x="${f1(x)}" y="${c >= 0 ? f1(base - h) : base}" width="${f1(sw - 1.5)}" height="${f1(h)}" rx="1" fill="${c >= 0 ? 'var(--up)' : 'var(--dn)'}" fill-opacity="${j === rows.length - 1 ? 1 : 0.5}"/>`; }).join('');
  const hist = frames.slice(0, k + 1).map(r => r.data.pc), pct = Math.round((hist.filter(v => v <= d.pc).length / hist.length) * 100);
  return `<div class="oit-gauge" style="border-color:${tone}"><div class="oit-g-dial">${gaugeSvg(d.pc, { w: 300, pct })}</div>
<div class="oit-g-read"><b class="mono">${d.pc.toFixed(2)}</b> puts per call<br><span class="muted">${d.callOI != null ? `${Number(d.callOI).toLocaleString('en-GB')} calls · ${Number(d.putOI).toLocaleString('en-GB')} puts` : ''}</span><br><span style="color:${tone}">${d.chg == null ? 'price change not held' : `price ${d.chg >= 0 ? '+' : '−'}${Math.abs(d.chg).toFixed(2)}% that day`}</span></div>
<svg class="rpv-svg oit-strip" viewBox="0 0 320 ${base * 2}" width="320" height="${base * 2}" role="img" aria-label="daily price change over the last ${rows.length} days"><line x1="10" x2="310" y1="${base}" y2="${base}" stroke="var(--line2)"/>${strip}</svg>
<p class="muted oit-g-note">Strip: daily price change over the last ${rows.length} days (green up, red down). Tick on the dial: where this day's ratio sits among the days so far (${ordinal(pct)} percentile).</p></div>`;
}
