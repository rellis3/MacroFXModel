/**
 * js/newsletterTermV2Poster.js: the terminal pictogram, version 2 (owner, 2026-11-16): ONE modern vector poster that explains the issue's key points to
 * someone who only glances ("right, I get what is going on"), in the desk terminal's purple-glow style. Pure SVG with hard colours (it is an image), built
 * from the same model as the written issue so the headline and every number match it. No image model: gradients, glow filters, drawn flags, dials and a
 * drawn metaphor hero (a calm sea surface over a cracked foundation) when the market looks calm on top while credit says otherwise.
 *
 * Text never runs outside its box or ends in "..." : every block goes through put(), which wraps by words, keeps whole sentences and records what it
 * placed so a test can measure it. The desk's setups table (entry, targets, invalidation) is NOT drawn: it is a trade plan in a shared document.
 * options.setups (an array of the desk's setups) switches a setups panel on for the owner's own copy; the default is off (owner decision pending).
 */
import * as G from './newsletterTermV2Svg.js';
import { wrapLines } from './newsletterTermV2Wrap.js';
import { DESK_EVIDENCE } from './deskEvidence.js';

const { MONO, SANS, esc, fmt, textWidth } = G;
const fin = v => typeof v === 'number' && Number.isFinite(v);
export const SIZE = { W: 1080, H: 1500 };

const evidenceVerdict = id => { const e = DESK_EVIDENCE.find(x => x.id === id); return e ? String(e.verdict).toUpperCase() : null; };

// ── drawn flags (simplified discs; not trademarked artwork, just recognisable colours and marks) ────────────────────────
export function flagDisc(ccy, cx, cy, r, id) {
  const clip = `<clipPath id="fl${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`, a = (x, y, w, h, f) => `<rect x="${(cx - r + x * 2 * r).toFixed(1)}" y="${(cy - r + y * 2 * r).toFixed(1)}" width="${(w * 2 * r).toFixed(1)}" height="${(h * 2 * r).toFixed(1)}" fill="${f}"/>`;
  const dot = (x, y, rr, f) => `<circle cx="${(cx - r + x * 2 * r).toFixed(1)}" cy="${(cy - r + y * 2 * r).toFixed(1)}" r="${(rr * 2 * r).toFixed(1)}" fill="${f}"/>`;
  let body = '';
  switch (ccy) {
    case 'USD': body = a(0, 0, 1, 1, '#f4f4f8') + [0, 2, 4, 6, 8, 10, 12].map(i => a(0, i / 13, 1, 1 / 13, '#c8283c')).join('') + a(0, 0, 0.5, 7 / 13, '#26356e') + [[.12, .1], [.3, .1], [.2, .24], [.38, .24], [.12, .38], [.3, .38]].map(([x, y]) => dot(x, y, .035, '#f4f4f8')).join(''); break;
    case 'CAD': body = a(0, 0, 1, 1, '#f4f4f8') + a(0, 0, .25, 1, '#d8283c') + a(.75, 0, .25, 1, '#d8283c')  + dot(.5, .5, .13, '#d8283c'); break;
    case 'GBP': body = a(0, 0, 1, 1, '#1d2f6b') + `<line x1="${cx - r}" y1="${cy - r}" x2="${cx + r}" y2="${cy + r}" stroke="#f4f4f8" stroke-width="${(r * .3).toFixed(1)}"/><line x1="${cx + r}" y1="${cy - r}" x2="${cx - r}" y2="${cy + r}" stroke="#f4f4f8" stroke-width="${(r * .3).toFixed(1)}"/><line x1="${cx - r}" y1="${cy - r}" x2="${cx + r}" y2="${cy + r}" stroke="#c8283c" stroke-width="${(r * .1).toFixed(1)}"/><line x1="${cx + r}" y1="${cy - r}" x2="${cx - r}" y2="${cy + r}" stroke="#c8283c" stroke-width="${(r * .1).toFixed(1)}"/>` + a(0, .38, 1, .24, '#f4f4f8') + a(.38, 0, .24, 1, '#f4f4f8') + a(0, .43, 1, .14, '#c8283c') + a(.43, 0, .14, 1, '#c8283c'); break;
    case 'JPY': body = a(0, 0, 1, 1, '#f4f4f8') + dot(.5, .5, .2, '#c8283c'); break;
    case 'CHF': body = a(0, 0, 1, 1, '#d8283c') + a(.42, .2, .16, .6, '#f4f4f8') + a(.2, .42, .6, .16, '#f4f4f8'); break;
    case 'EUR': body = a(0, 0, 1, 1, '#243f8f') + Array.from({ length: 12 }, (_, i) => dot(.5 + Math.cos(i / 12 * 6.283) * .28, .5 + Math.sin(i / 12 * 6.283) * .28, .035, '#f0c52c')).join(''); break;
    case 'AUD': case 'NZD': { const star = ccy === 'AUD' ? '#f4f4f8' : '#d8283c'; body = a(0, 0, 1, 1, '#1d2f6b') + a(0, 0, .5, .5, '#26356e') + a(0, .2, .5, .1, '#f4f4f8') + a(.2, 0, .1, .5, '#f4f4f8') + a(0, .22, .5, .06, '#c8283c') + a(.22, 0, .06, .5, '#c8283c') + [[.72, .3], [.82, .55], [.62, .7], [.35, .78]].map(([x, y]) => dot(x, y, .04, star)).join(''); break; }
    default: body = a(0, 0, 1, 1, '#3a4270');
  }
  return `<defs>${clip}</defs><g clip-path="url(#fl${id})">${body}</g><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ffffff" stroke-opacity=".35"/>`;
}

// ── the metaphor hero: a calm sea over a cracked foundation ──────────────────────────────────────────────────────────────
export function surfaceHero(k, x, y, w, h, id) {
  const hz = y + h * 0.5, cracks = [[.52, .52, .46, .62, .5, .74, .38, .9], [.52, .52, .6, .66, .58, .78, .7, .93], [.46, .62, .3, .7, .22, .84], [.6, .66, .78, .72, .9, .86], [.5, .74, .52, .86, .46, .98]];
  const px = u => (x + u * w).toFixed(1), py = v => (y + v * h).toFixed(1);
  return `<defs><linearGradient id="sk${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2f6e"/><stop offset="1" stop-color="#e8855a" stop-opacity=".85"/></linearGradient><linearGradient id="sea${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d5b8f"/><stop offset="1" stop-color="#0b1330"/></linearGradient><radialGradient id="sun${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd9a0"/><stop offset="1" stop-color="#ffd9a0" stop-opacity="0"/></radialGradient><clipPath id="hc${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18"/></clipPath></defs>
<g clip-path="url(#hc${id})"><rect x="${x}" y="${y}" width="${w}" height="${h * 0.5}" fill="url(#sk${id})"/><circle cx="${x + w * 0.5}" cy="${hz}" r="${h * 0.34}" fill="url(#sun${id})"/><rect x="${x}" y="${hz}" width="${w}" height="${h * 0.5}" fill="url(#sea${id})"/>
${[0.06, 0.12, 0.2, 0.3].map((d, i) => `<line x1="${px(0.1 + i * 0.05)}" x2="${px(0.9 - i * 0.05)}" y1="${(hz + d * h).toFixed(1)}" y2="${(hz + d * h).toFixed(1)}" stroke="#bcd8ff" stroke-opacity="${(0.45 - i * 0.1).toFixed(2)}" stroke-width="1.4"/>`).join('')}
${cracks.map(c => { const pts = []; for (let i = 0; i < c.length; i += 2) pts.push(`${px(c[i])},${py(c[i + 1])}`); return `<polyline points="${pts.join(' ')}" fill="none" stroke="#ff5d78" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round" filter="url(#cg${id})"/>`; }).join('')}</g>
<defs><filter id="cg${id}" filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="none" stroke="${k.line}"/>`;
}

const ICON = {   // small drawn icons, 44 units square, centred on (0,0)
  shield: c => `<path d="M0,-20 L17,-13 L17,3 Q17,16 0,22 Q-17,16 -17,3 L-17,-13 Z" fill="none" stroke="${c}" stroke-width="3"/><polyline points="-3,-10 4,-1 -4,5 3,15" fill="none" stroke="${c}" stroke-width="2.6"/>`,
  gate: c => `<rect x="-20" y="-14" width="40" height="8" fill="none" stroke="${c}" stroke-width="3"/><line x1="-14" y1="-6" x2="-14" y2="18" stroke="${c}" stroke-width="3"/><line x1="14" y1="-6" x2="14" y2="18" stroke="${c}" stroke-width="3"/><rect x="-6" y="4" width="12" height="11" rx="2" fill="${c}"/><path d="M-3,4 L-3,0 Q0,-5 3,0 L3,4" fill="none" stroke="${c}" stroke-width="2.4"/>`,
  gauge: c => `<path d="M-20,8 A20,20 0 0 1 20,8" fill="none" stroke="${c}" stroke-width="3"/><line x1="0" y1="8" x2="10" y2="-6" stroke="${c}" stroke-width="3" stroke-linecap="round"/><circle cx="0" cy="8" r="3" fill="${c}"/>`,
};

// ── text placement: wrap by words, whole sentences, never clipped; records what it placed ────────────────────────────────
function makePut(o, placed) {
  return function put(text, x, y, { chars, lines, size = 15, fill, weight, font = MONO, lh = null, anchor } = {}) {
    const L = wrapLines(text, chars), use = L.slice(0, lines), step = lh ?? Math.round(size * 1.3);
    if (L.length > lines) placed.push({ text, overflow: true, x, y });   // the test fails on any overflow: callers shorten the text instead
    use.forEach((ln, i) => { o.push(G.T(x, y + i * step, ln, { size, fill, weight, font, anchor })); placed.push({ text: ln, x, y: y + i * step, w: textWidth(ln, size), maxW: chars * size * 0.61, size, anchor }); });
    return y + use.length * step;
  };
}
const panel = (k, x, y, w, h, tint) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="${k.bg2}" fill-opacity=".72" stroke="${tint ?? k.line}" stroke-opacity="${tint ? 0.8 : 1}"/>`;
const label = (k, x, y, t) => G.T(x, y, t, { size: 13, weight: 800, fill: k.gold, ls: 3 });
const lonTime = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London', hour12: false });
const sgn = v => (v < 0 ? '−' : v > 0 ? '+' : '');
const fmtBn = v => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(2)}tn` : `$${Math.abs(v) < 10 ? v.toFixed(1) : Math.round(v)}bn`);
const ord = n => { const v = Math.round(n), s = ['th', 'st', 'nd', 'rd'], m = v % 100; return `${v}${s[(m - 20) % 10] || s[m] || s[0]}`; };

/** model.poster must carry: headline, date, asOf, tone, conviction, surface, foundation, credit, gate, funding, ladder, events, review, risk, flips, tested, S. */
export function renderPosterV2(model, { palette = G.HEX_PAL, setups = null } = {}) {
  const k = palette, p = model.poster ?? {}, { W, H } = SIZE, o = [], placed = [], put = makePut(o, placed);
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${MONO}">`);
  o.push(`<defs><radialGradient id="pg1" cx="85%" cy="0%" r="80%"><stop offset="0" stop-color="${k.pur}" stop-opacity=".30"/><stop offset="1" stop-color="${k.pur}" stop-opacity="0"/></radialGradient><radialGradient id="pg2" cx="8%" cy="62%" r="60%"><stop offset="0" stop-color="${k.gold}" stop-opacity=".09"/><stop offset="1" stop-color="${k.gold}" stop-opacity="0"/></radialGradient><linearGradient id="pbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${k.bg1}"/><stop offset="1" stop-color="${k.bg}"/></linearGradient>${G.glowU('pgl', W, H, 5)}${G.glowU('pgs', W, H, 2.4)}</defs><rect width="${W}" height="${H}" fill="url(#pbg)"/><rect width="${W}" height="${H}" fill="url(#pg1)"/><rect width="${W}" height="${H}" fill="url(#pg2)"/>`);
  // header and the story headline
  o.push(`<circle cx="62" cy="52" r="7" fill="${k.pur}" filter="url(#pgl)"/>${G.T(82, 58, 'THE CHAIN', { size: 21, weight: 700, fill: k.tx, ls: 5 })}${G.T(262, 58, '| TERMINAL', { size: 21, weight: 700, fill: k.gold, ls: 5 })}${G.T(W - 50, 58, `${p.date ?? model.date} · ${p.asOf ?? model.asOf}`, { anchor: 'end', size: 17, fill: k.tx3 })}`);
  put(p.headline ?? model.headline, 50, 118, { chars: 36, lines: 2, size: 46, weight: 800, fill: k.tx, font: SANS, lh: 52 });
  // ── big picture banner ──
  const bY = 196, bH = 214, bad = p.foundation && p.foundation.level !== 'ok', calm = p.surface && p.surface.level === 'ok', tint = bad ? '#ff5d78' : k.pur;
  o.push(panel(k, 40, bY, 1000, bH, tint));
  o.push(label(k, 66, bY + 36, 'BIG PICTURE'));
  o.push(G.T(66, bY + 92, String(p.tone ?? 'NO RULING').toUpperCase(), { size: 54, weight: 800, fill: p.tone && /off/i.test(p.tone) ? '#ff5d78' : p.tone && /on/i.test(p.tone) ? k.up : k.gold, font: SANS }));
  if (p.conviction) o.push(G.T(68, bY + 124, `${String(p.conviction).toUpperCase()} CONVICTION`, { size: 20, weight: 800, fill: k.tx, font: SANS, ls: 2 }));
  o.push(`<rect x="66" y="${bY + 138}" width="5" height="62" rx="2" fill="${k.gold}"/>`);
  put(p.caution ?? '', 86, bY + 158, { chars: 38, lines: 3, size: 18, fill: k.tx, font: SANS, lh: 23 });
  if (bad && calm) {
    o.push(surfaceHero(k, 580, bY + 14, 446, bH - 28, 'hero'));
    o.push(`<rect x="820" y="${bY + 24}" width="196" height="46" rx="12" fill="${k.bg1}" fill-opacity=".9" stroke="${k.up}"/>${G.T(832, bY + 42, 'MARKET SURFACE', { size: 10.5, fill: k.tx3, ls: 2 })}${G.T(832, bY + 62, String(p.surface.word).toUpperCase(), { size: 17, weight: 800, fill: k.up })}`);
    o.push(`<rect x="820" y="${bY + bH - 70}" width="196" height="46" rx="12" fill="${k.bg1}" fill-opacity=".9" stroke="#ff5d78"/>${G.T(832, bY + bH - 52, 'FOUNDATION', { size: 10.5, fill: k.tx3, ls: 2 })}${G.T(832, bY + bH - 32, String(p.foundation.word).toUpperCase(), { size: 17, weight: 800, fill: '#ff5d78' })}`);
  } else {
    [['SURFACE', p.surface], ['FOUNDATION', p.foundation]].forEach(([t, v], i) => { if (!v) return; const col = v.level === 'ok' ? k.up : v.level === 'watch' ? k.gold : '#ff5d78'; o.push(`<rect x="${620 + i * 210}" y="${bY + 60}" width="190" height="86" rx="16" fill="${k.bg1}" fill-opacity=".9" stroke="${col}"/>${G.T(640 + i * 210, bY + 92, t, { size: 12, fill: k.tx3, ls: 2 })}${G.T(640 + i * 210, bY + 124, String(v.word).toUpperCase(), { size: 20, weight: 800, fill: col })}`); });
  }
  // ── three warning lights ──
  const lY = 432; o.push(label(k, 50, lY + 14, '//  THREE WARNING LIGHTS'));
  const cardY = lY + 30, cardH = 220, cw = 320, gap = 20;
  const cards = [
    { t: 'CREDIT', icon: 'shield', lvl: p.credit?.level, rows: p.credit ? [['CCC OAS', p.credit.ccc != null ? `${Math.round(p.credit.ccc).toLocaleString('en-GB')} bp` : null, true], [p.credit.chg != null ? `${sgn(p.credit.chg)}${Math.abs(Math.round(p.credit.chg))} bp over 20 days` : null], [p.credit.pct5 != null ? `${ord(p.credit.pct5)} percentile of five years` : null], ['IG OAS', p.credit.ig != null ? `${Math.round(p.credit.ig)} bp` : null, true], [p.credit.igPct != null ? `${ord(p.credit.igPct)} percentile of one year` : null]] : [] },
    { t: 'LIQUIDITY', icon: 'gate', lvl: p.gate?.level, rows: p.gate ? [['Liquidity gate', p.gate.word, true], [p.gate.n ? `across ${p.gate.n} indices` : null], [p.gate.names ? p.gate.names : null], [p.gate.creditZ != null ? `Credit Z ${fmt(p.gate.creditZ, 2)}` : null], [p.gate.curveZ != null ? `Curve Z ${fmt(p.gate.curveZ, 2)}` : null]] : [] },
    { t: 'FUNDING', icon: 'gauge', lvl: p.funding?.level, rows: p.funding ? [['RRP', p.funding.rrp != null ? `${fmtBn(p.funding.rrp)} (${ord(p.funding.rrpPct)} pct)` : null, true], ['Reserves', p.funding.res != null ? `${fmtBn(p.funding.res)}` : null, true], [p.funding.resChg != null ? `${sgn(p.funding.resChg)}$${Math.abs(Math.round(p.funding.resChg))}bn over four weeks` : null], ['Funds net short', p.funding.basis != null ? fmtBn(Math.abs(p.funding.basis)) : null, true], [p.funding.basis != null ? 'of Treasury futures' : null]] : [] },
  ];
  cards.forEach((c, i) => {
    const x = 40 + i * (cw + gap), col = c.lvl === 'stress' ? '#ff5d78' : c.lvl === 'watch' ? k.gold : k.up;
    o.push(panel(k, x, cardY, cw, cardH, col));
    o.push(`<g transform="translate(${x + 40},${cardY + 42})">${ICON[c.icon](col)}</g>${G.T(x + 76, cardY + 50, c.t, { size: 24, weight: 800, fill: k.tx, font: SANS, ls: 1 })}`);
    let y = cardY + 88;
    for (const [a, b, big] of c.rows) { if (!a) continue; if (b) { o.push(G.T(x + 22, y, a, { size: 14, fill: k.tx2 })); o.push(G.T(x + cw - 22, y, b, { anchor: 'end', size: big ? 17 : 15, weight: 800, fill: big ? col : k.tx })); } else y = put(a, x + 22, y, { chars: 31, lines: 2, size: 14, fill: k.tx2 }) - Math.round(14 * 1.3); y += 26; }
    if (!c.rows.length) o.push(G.T(x + 22, cardY + 100, 'Not available at build time.', { size: 14, fill: k.tx3 }));
  });
  // ── currency strength ladder (left) ──
  const rY = cardY + cardH + 20; o.push(label(k, 50, rY + 14, '//  CURRENCY STRENGTH LADDER'));
  const lad = p.ladder ?? [], lx = 40, ly = rY + 30, lw = 500, rh = 35; o.push(panel(k, lx, ly, lw, rh * 8 + 70));
  lad.slice(0, 8).forEach((r, i) => {
    const y = ly + 14 + i * rh, col = r.word === 'Firm' ? k.up : r.word === 'Weak' ? '#ff5d78' : k.tx2;
    o.push(G.T(lx + 18, y + 24, String(i + 1), { size: 14, fill: k.tx3 })); o.push(flagDisc(r.ccy, lx + 62, y + 18, 15, `l${i}`)); o.push(G.T(lx + 90, y + 24, r.ccy, { size: 19, weight: 800, fill: k.tx }));
    const bx = lx + 160, bw = 170, mid = bx + bw / 2, v = Math.max(-1, Math.min(1, (r.w1 ?? 0) / 4));
    o.push(`<rect x="${bx}" y="${y + 9}" width="${bw}" height="16" rx="8" fill="${k.bg3}"/><rect x="${v >= 0 ? mid : mid + v * bw / 2}" y="${y + 9}" width="${Math.max(3, Math.abs(v) * bw / 2)}" height="16" rx="8" fill="${v >= 0 ? k.up : '#ff5d78'}" fill-opacity=".9"/><line x1="${mid}" x2="${mid}" y1="${y + 6}" y2="${y + 28}" stroke="${k.tx3}"/>`);
    o.push(G.T(lx + 350, y + 24, fin(r.w1) ? `${fmt(r.w1)}σ` : 'n/a', { size: 16, weight: 800, fill: col })); o.push(G.T(lx + lw - 18, y + 24, r.word, { anchor: 'end', size: 14, fill: col }));
  });
  const cy = ly + 14 + 8 * rh + 6; o.push(`<rect x="${lx + 16}" y="${cy}" width="200" height="34" rx="17" fill="${k.up}" fill-opacity=".14" stroke="${k.up}"/>${G.T(lx + 116, cy + 23, `${lad[0]?.ccy ?? ''} STRONGEST`, { anchor: 'middle', size: 14, weight: 800, fill: k.up })}<rect x="${lx + 240}" y="${cy}" width="${lw - 256}" height="34" rx="17" fill="#ff5d78" fill-opacity=".14" stroke="#ff5d78"/>${G.T(lx + 240 + (lw - 256) / 2, cy + 23, `${lad.at(-1)?.ccy ?? ''} WEAKEST`, { anchor: 'middle', size: 14, weight: 800, fill: '#ff5d78' })}`);
  const ladBottom = ly + rh * 8 + 70;
  // ── right column: events and yesterday's review (or the owner's setups panel when switched on) ──
  const rx = 560, rw = 480;
  if (setups?.length) {
    o.push(label(k, rx + 10, rY + 14, '//  THE DESK\'S SETUPS'));
    o.push(panel(k, rx, ly, rw, ladBottom - ly)); o.push(G.T(rx + rw - 18, ly + 26, 'NEWSLETTER SETUPS, NOT RECOMMENDATIONS', { anchor: 'end', size: 11, weight: 800, fill: k.gold }));
    setups.slice(0, 6).forEach((s, i) => { const y = ly + 60 + i * 44; o.push(G.T(rx + 18, y, s.name, { size: 14, weight: 800, fill: k.tx })); o.push(G.T(rx + 130, y, s.dir, { size: 13, weight: 800, fill: /short/i.test(s.dir) ? '#ff5d78' : k.up })); o.push(G.T(rx + 210, y, s.entry, { size: 12, fill: k.tx2 })); o.push(G.T(rx + rw - 18, y, `inv ${s.invalid}`, { anchor: 'end', size: 12, fill: k.tx2 })); });
  } else {
    o.push(label(k, rx + 10, rY + 14, '//  TODAY\'S EVENTS')); const eh = 156; o.push(panel(k, rx, ly, rw, eh));
    (p.events ?? []).slice(0, 3).forEach((e, i) => { const y = ly + 34 + i * 40; o.push(`<circle cx="${rx + 30}" cy="${y - 5}" r="12" fill="none" stroke="${k.tx2}" stroke-width="2"/><line x1="${rx + 30}" y1="${y - 5}" x2="${rx + 30}" y2="${y - 12}" stroke="${k.tx2}" stroke-width="2"/><line x1="${rx + 30}" y1="${y - 5}" x2="${rx + 36}" y2="${y - 2}" stroke="${k.tx2}" stroke-width="2"/>`); put(`${e.name} (${e.ccy})`, rx + 56, y, { chars: 27, lines: 1, size: 15, weight: 700, fill: k.tx }); o.push(G.T(rx + rw - 18, y, `${e.time} UK`, { anchor: 'end', size: 17, weight: 800, fill: k.gold })); });
    if (!(p.events ?? []).length) o.push(G.T(rx + 22, ly + 60, 'No high-impact release in the next day and a half.', { size: 14, fill: k.tx3 }));
    if (p.fedLine) put(p.fedLine, rx + 22, ly + eh - 20, { chars: 52, lines: 1, size: 13, fill: k.tx2 });
    const vy = ly + eh + 14, vh = ladBottom - vy; o.push(label(k, rx + 10, vy - 4 + 0, ''));
    o.push(panel(k, rx, vy, rw, vh)); o.push(G.T(rx + 22, vy + 30, 'YESTERDAY\'S REVIEW', { size: 13, weight: 800, fill: k.gold, ls: 3 }));
    if (fin(p.S)) { o.push(G.T(rx + 22, vy + 84, `${fmt(p.S, 2)}u`, { size: 42, weight: 800, fill: p.S > (p.p95 ?? 99) ? k.up : k.tx, font: SANS })); }
    const rl = [p.review?.scored && `${p.review.scored} markets scored`, p.review?.race && `${p.review.race} reached p50 first`, p.review?.band].filter(Boolean);
    rl.slice(0, 3).forEach((t, i) => put(t, rx + 190, vy + 62 + i * 26, { chars: 31, lines: 1, size: 14, fill: k.tx, font: SANS }));
    o.push(`<rect x="${rx + 22}" y="${vy + vh - 44}" width="${rw - 44}" height="30" rx="15" fill="none" stroke="${k.tx3}"/>${G.T(rx + rw / 2, vy + vh - 24, 'HISTORICAL REVIEW, NOT PROOF OF EDGE', { anchor: 'middle', size: 12, fill: k.tx2 })}`);
  }
  // ── risk concentration (left) and what could change the view (right) ──
  const bY2 = ladBottom + 20, bH2 = 168;
  o.push(label(k, 50, bY2 + 14, '//  RISK CONCENTRATION')); o.push(panel(k, 40, bY2 + 28, 500, bH2));
  if (p.risk?.factors?.length) {
    put(`${p.risk.enb != null ? `${p.risk.enb.toFixed(2)} effective bets` : ''}: one crowded macro bet, not many independent ones.`.replace(/^: /, ''), 62, bY2 + 66, { chars: 46, lines: 2, size: 16, weight: 700, fill: k.tx, font: SANS, lh: 22 });
    const tot = p.risk.factors.reduce((a, f) => a + f.share, 0) || 1; let bx = 62; const bw0 = 456, cols = [k.up, '#ff5d78', k.gold, k.pur2, k.tx3];
    p.risk.factors.slice(0, 4).forEach((f, i) => { const w = bw0 * f.share / tot; o.push(`<rect x="${bx.toFixed(1)}" y="${bY2 + 108}" width="${Math.max(3, w - 2).toFixed(1)}" height="30" rx="6" fill="${cols[i]}" fill-opacity=".85"/>`); if (w > 70) o.push(G.T(bx + w / 2, bY2 + 128, `${f.label} ${Math.round(f.share * 100)}%`, { anchor: 'middle', size: 11, weight: 800, fill: '#0b1020' })); bx += w; });
    p.risk.factors.slice(0, 4).forEach((f, i) => o.push(`<rect x="${62 + (i % 2) * 230}" y="${bY2 + 154 + Math.floor(i / 2) * 22}" width="12" height="12" rx="3" fill="${cols[i]}"/>${G.T(80 + (i % 2) * 230, bY2 + 165 + Math.floor(i / 2) * 22, `${f.label} ${Math.round(f.share * 100)}%`, { size: 12, fill: k.tx2 })}`));
  } else o.push(G.T(62, bY2 + 70, 'Not available at build time.', { size: 14, fill: k.tx3 }));
  o.push(label(k, 570, bY2 + 14, '//  WHAT COULD CHANGE THE VIEW')); o.push(panel(k, 560, bY2 + 28, 480, bH2));
  (p.flips ?? []).slice(0, 3).forEach((t, i) => { const y = bY2 + 62 + i * 48; o.push(`<circle cx="${584}" cy="${y - 5}" r="11" fill="${k.up}" fill-opacity=".18" stroke="${k.up}"/><polyline points="${578},${y - 5} ${583},${y} ${591},${y - 11}" fill="none" stroke="${k.up}" stroke-width="2.4"/>`); put(t, 606, y, { chars: 36, lines: 2, size: 15, fill: k.tx, font: SANS, lh: 19 }); });
  // ── the tested-results line ──
  const tY = bY2 + 28 + bH2 + 16, tH = 84; o.push(panel(k, 40, tY, 1000, tH, k.gold));
  o.push(`<circle cx="82" cy="${tY + tH / 2}" r="22" fill="none" stroke="${k.gold}" stroke-width="3"/>${G.T(82, tY + tH / 2 + 10, 'i', { anchor: 'middle', size: 28, weight: 800, fill: k.gold, font: SANS })}`);
  put(p.tested ?? '', 124, tY + 34, { chars: 66, lines: 2, size: 19, weight: 700, fill: k.gold, font: SANS, lh: 26 });
  put(`Educational market summary only, not financial advice. Drawn from the desk terminal as at ${p.asOf ?? model.asOf}. Leveraged trading can cause rapid losses; data feeds can be wrong or late.`, W / 2, H - 34, { chars: 120, lines: 2, size: 12, fill: k.tx3, anchor: 'middle', lh: 16 });
  o.push('</svg>');
  return { svg: o.join(''), placed };
}
export const posterSvg = (model, opts) => renderPosterV2(model, opts).svg;
export const posterPlaced = (model, opts) => renderPosterV2(model, opts).placed;
export { esc, evidenceVerdict };
