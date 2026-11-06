/**
 * The Chain, pictograph (owner, 2026-11-04): the desk brief on one landscape page in a hand-drawn infographic style
 * (textured cream paper, inked double-line boxes that wobble like pen strokes, taped section labels, watercolour
 * washes behind cartoon icons, handwriting fonts), built beside the desk magazine, the desk brief and the terminal
 * edition, never instead of them.
 *
 * Every number and word on it comes from the same desk run and Atlas data as the other editions: nothing is drawn by
 * an image model, so nothing on the page can be invented. Panels with no data are left out of the grid rather than
 * filled with placeholders.
 *
 * Self-contained like every issue: no scripts and nothing fetched. The two handwriting fonts are embedded
 * (js/pictoFonts.js, SIL OFL), the pen wobble and the watercolour are SVG filters, every graphic is inline SVG. The
 * world map's paths come from worldPaths (js/newsletterTerminal.js), computed on Atlas.
 *
 * Pure. Tested in js/newsletterPicto.test.mjs.
 */
import { instName, prose } from './newsletterDesk.js';
import { clean, grade } from './newsletterTerminal.js';
import { KALAM_700, PATRICK_HAND } from './pictoFonts.js';
import { tapeRows, yesterdayLine, rowText, dayName, fmtMult } from './morningTape.js';

const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
const SYM = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', AUD: 'A$', NZD: 'NZ$', CAD: 'C$', CHF: '₣' };
const ZONE = { 840: 'USD', 124: 'CAD', 826: 'GBP', 392: 'JPY', 36: 'AUD', 554: 'NZD', 756: 'CHF' };
for (const id of [40, 56, 191, 196, 233, 246, 250, 276, 300, 372, 380, 428, 440, 442, 470, 528, 620, 703, 705, 724]) ZONE[id] = 'EUR';
const DIR = { STRONG_LONG: 2, LONG: 1, FLAT: 0, NEUTRAL: 0, SHORT: -1, STRONG_SHORT: -2 };
const CONV = { low: 0.6, medium: 0.8, high: 1 };
const K = { paper: '#f8f3e6', ink: '#1b2550', ink2: '#4b557c', tape: '#bcd7ef', navy: '#1e2b5c', up: '#2e9a4c', dn: '#d9392b', amber: '#eba935', gold: '#f2c14b', note: '#f9e49a', land: '#8fa9d4', sea: '#dfe9f6' };
const HEAD = "'Kalam','Segoe Print','Chalkboard SE','Comic Sans MS',cursive";
const BODY = "'Patrick Hand','Segoe Print','Chalkboard SE','Comic Sans MS',cursive";

/** One short line: the first sentence, cut on a word boundary. */
export const short = (t, n = 70) => {
  const s = prose(clean(t ?? ''), { sentences: 1, chars: 400 }).replace(/\.$/, '').trim();
  return s.length > n ? s.slice(0, n - 1).replace(/[\s,;:]+\S*$/, '') + '…' : s;
};
const fmtPct = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}%`;
const hhmm = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const dayOf = ms => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Europe/London' });
const ukDay = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

// ── the pen and the paint: SVG filters every drawing on the page uses ──────────────────────────────────────────
const FILTERS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<filter id="pen" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="3"/></filter>
<filter id="pen2" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="11"/><feDisplacementMap in="SourceGraphic" scale="3.6"/></filter>
<filter id="wash" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="9" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="22"/><feGaussianBlur stdDeviation="1.6"/></filter>
<filter id="brush" x="-5%" y="-30%" width="110%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.09" numOctaves="3" seed="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="14"/></filter>
</defs></svg>`;
const wash = (cx, cy, rx, ry, col, op = 0.45) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${col}" opacity="${op}" filter="url(#wash)"/>`;
const svg = (vb, w, body, label = '') => `<svg viewBox="${vb}" width="${w}" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} style="overflow:visible">${body}</svg>`;
// a cartoon stroke: a dark outline under a coloured line
const inkLine = (d, col, w = 7) => `<g filter="url(#pen)"><path d="${d}" fill="none" stroke="${K.ink}" stroke-width="${w + 3.5}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/></g>`;

// ── icons ───────────────────────────────────────────────────────────────────────────────────────────────────
const zigDown = (s = 74) => svg('0 0 80 96', s, wash(40, 50, 34, 40, '#f4b4a8', 0.35) + inkLine('M10 8 L34 36 L22 42 L52 70 L44 74 L64 88', K.dn, 8) + `<g filter="url(#pen)"><path d="M44 90 L70 92 L66 66 Z" fill="${K.dn}" stroke="${K.ink}" stroke-width="3.2" stroke-linejoin="round"/></g>`);
const arrowUp = (s = 74) => svg('0 0 80 96', s, wash(40, 50, 34, 40, '#b5e0bf', 0.4) + `<g filter="url(#pen)"><path d="M30 90 L30 46 L14 46 L42 8 L70 46 L54 46 L54 90 Z" fill="${K.up}" stroke="${K.ink}" stroke-width="3.4" stroke-linejoin="round"/><path d="M36 84 L36 44" stroke="#bfe8c8" stroke-width="3" stroke-linecap="round" opacity=".7"/></g>`);
const miniArrow = v => (v > 0.05 ? `<span class="tri up">▲</span>` : v < -0.05 ? `<span class="tri dn">▼</span>` : `<span class="tri">●</span>`);
function gauge(level, s = 96) {
  const ang = { ok: 32, calm: 32, watch: 90, stress: 150 }[level] ?? 90, r = 34, cx = 48, cy = 50, rad = a => (a * Math.PI) / 180;
  const pt = (a, rr = r) => [(cx + rr * Math.cos(rad(180 - a))).toFixed(1), (cy - rr * Math.sin(rad(180 - a))).toFixed(1)];
  const seg = (a0, a1, col) => { const [x0, y0] = pt(a0), [x1, y1] = pt(a1); return `<path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" fill="none" stroke="${col}" stroke-width="12"/>`; };
  const [nx, ny] = pt(180 - ang, r - 6), [ox0, oy0] = pt(0, r + 8), [ox1, oy1] = pt(180, r + 8), [ix0, iy0] = pt(0, r - 7), [ix1, iy1] = pt(180, r - 7);
  return svg('0 0 96 62', s, wash(48, 40, 44, 26, '#f6e1a6', 0.4) + `<g filter="url(#pen)">${seg(0, 60, K.dn)}${seg(60, 120, K.amber)}${seg(120, 180, K.up)}<path d="M${ox0} ${oy0} A${r + 8} ${r + 8} 0 0 1 ${ox1} ${oy1} M${ix0} ${iy0} A${r - 7} ${r - 7} 0 0 1 ${ix1} ${iy1}" fill="none" stroke="${K.ink}" stroke-width="2.4"/><line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${K.ink}" stroke-width="5" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="5.5" fill="${K.ink}"/></g>`);
}
const coins = (s = 96) => svg('0 0 96 62', s, wash(48, 36, 42, 26, '#f6e1a6', 0.45) + `<g filter="url(#pen)">${[[30, 54], [30, 46], [30, 38], [30, 30], [62, 54], [62, 46], [62, 38], [62, 30], [62, 22], [62, 14]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="15" ry="5.5" fill="${K.gold}" stroke="${K.ink}" stroke-width="2"/>`).join('')}<ellipse cx="62" cy="14" rx="15" ry="5.5" fill="#f8d77a" stroke="${K.ink}" stroke-width="2"/><ellipse cx="30" cy="30" rx="15" ry="5.5" fill="#f8d77a" stroke="${K.ink}" stroke-width="2"/></g>`);
const bag = (s = 96) => svg('0 0 96 62', s, wash(48, 34, 40, 28, '#e9d5ae', 0.5) + `<g filter="url(#pen)"><path d="M36 14 Q48 22 60 14 L56 22 Q76 32 74 50 Q72 60 48 60 Q24 60 22 50 Q20 32 40 22 Z" fill="#d8b98a" stroke="${K.ink}" stroke-width="2.6" stroke-linejoin="round"/><path d="M40 22 Q48 26 56 22" fill="none" stroke="${K.ink}" stroke-width="2.4"/><text x="48" y="50" text-anchor="middle" font-family="${HEAD}" font-weight="700" font-size="22" fill="${K.ink}">$</text></g>`);
const globe = (s = 96) => svg('0 0 96 62', s, wash(48, 32, 34, 28, '#bfd6f0', 0.5) + `<g filter="url(#pen)"><circle cx="48" cy="32" r="24" fill="#cfe0f4" stroke="${K.ink}" stroke-width="2.6"/><path d="M34 18 q8 4 6 10 q-6 4 -2 10 l-6 2 q-8 -8 2 -22 Z M56 30 q8 -2 10 6 q-4 8 -10 6 Z" fill="${K.up}" opacity=".7"/><path d="M48 8 Q34 32 48 56 M48 8 Q62 32 48 56 M24 32 H72 M28 20 H68 M28 44 H68" fill="none" stroke="${K.ink}" stroke-width="1.6"/></g>`);
const bars = (s = 96) => svg('0 0 96 62', s, wash(48, 34, 40, 26, '#d7d0f2', 0.5) + `<g filter="url(#pen)"><path d="M18 56 H80 M18 56 V10" stroke="${K.ink}" stroke-width="2.6" fill="none"/>${[[26, 34], [40, 26], [54, 18], [68, 30]].map(([x, h]) => `<rect x="${x}" y="${56 - h}" width="10" height="${h}" fill="#8b9fd6" stroke="${K.ink}" stroke-width="2"/>`).join('')}<path d="M24 40 L42 30 L58 22 L74 12" fill="none" stroke="${K.dn}" stroke-width="3" stroke-linecap="round"/></g>`);
const iconFor = label => (/fund|sofr|repo/i.test(label) ? coins : /credit|bank|loan/i.test(label) ? bag : /em\b|carry|emerg|world/i.test(label) ? globe : /term|yield|curve|basis/i.test(label) ? bars : null);
const calendar = (s = 80) => svg('0 0 80 80', s, wash(40, 44, 36, 34, '#c9daf2', 0.5) + `<g filter="url(#pen)"><rect x="8" y="16" width="64" height="56" rx="8" fill="#eef3fb" stroke="${K.ink}" stroke-width="3"/><path d="M8 24 Q8 16 16 16 H64 Q72 16 72 24 V32 H8 Z" fill="${K.navy}" stroke="${K.ink}" stroke-width="3"/><path d="M24 8 v16 M56 8 v16" stroke="${K.ink}" stroke-width="5" stroke-linecap="round"/>${[0, 1, 2].map(r => [0, 1, 2, 3].map(c => `<rect x="${15 + c * 13.5}" y="${38 + r * 11}" width="10" height="7.5" rx="1.6" fill="${r === 0 && c === 1 ? K.dn : K.land}" stroke="${K.ink}" stroke-width="1.5"/>`).join('')).join('')}</g>`);
const tick = svg('0 0 24 24', 20, `<path d="M3 13 L9 19 L21 4" fill="none" stroke="${K.up}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" filter="url(#pen)"/>`);
function weather(tone, s = 150) {
  const sun = (x, y, r) => `<g filter="url(#pen)">${Array.from({ length: 10 }, (_, i) => { const a = (i * Math.PI) / 5; return `<line x1="${(x + Math.cos(a) * (r + 6)).toFixed(1)}" y1="${(y + Math.sin(a) * (r + 6)).toFixed(1)}" x2="${(x + Math.cos(a) * (r + 17)).toFixed(1)}" y2="${(y + Math.sin(a) * (r + 17)).toFixed(1)}" stroke="${K.amber}" stroke-width="4.5" stroke-linecap="round"/>`; }).join('')}<circle cx="${x}" cy="${y}" r="${r}" fill="${K.gold}" stroke="${K.ink}" stroke-width="3"/></g>`;
  const cloud = (x, y, col) => `<g filter="url(#pen)"><path d="M${x} ${y} q-26 0 -26 -21 q0 -21 24 -21 q7 -24 36 -21 q26 3 28 26 q22 0 22 19 q0 18 -22 18 Z" fill="${col}" stroke="${K.ink}" stroke-width="3.2" stroke-linejoin="round"/><path d="M${x + 6} ${y - 30} q6 -12 20 -10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/></g>`;
  const bolt = (x, y) => `<g filter="url(#pen)"><path d="M${x} ${y} l-13 22 h11 l-9 22 l23 -29 h-11 l9 -15 Z" fill="${K.gold}" stroke="${K.ink}" stroke-width="2.6" stroke-linejoin="round"/></g>`;
  const rain = (x, y) => `<g filter="url(#pen)">${[0, 1, 2, 3].map(i => `<line x1="${x + i * 15}" y1="${y + (i % 2) * 6}" x2="${x + i * 15 - 6}" y2="${y + 14 + (i % 2) * 6}" stroke="#4c86d6" stroke-width="3.4" stroke-linecap="round"/>`).join('')}</g>`;
  const t = String(tone ?? '').toLowerCase();
  const art = /off/.test(t) ? wash(70, 56, 58, 42, '#b9c6e0', 0.55) + cloud(48, 72, '#c4cde2') + rain(38, 80) + bolt(84, 70)
    : /on/.test(t) ? wash(70, 56, 56, 44, '#f8dd8a', 0.55) + sun(70, 54, 26)
      : wash(70, 56, 58, 42, '#d5e2f3', 0.55) + sun(92, 38, 19) + cloud(44, 82, '#eef2f8');
  return svg('0 0 140 120', s, art);
}

function mapSketch(map, ccy, ranking) {
  if (!map?.countries?.length) return '';
  const fill = c => { const b = ccy[c]?.bias ?? 0; return b > 0 ? `rgba(46,154,76,${0.45 + 0.18 * Math.min(2, b)})` : b < 0 ? `rgba(217,57,43,${0.45 + 0.18 * Math.min(2, -b)})` : '#c3cbe0'; };
  const OFF = { USD: [-12, 26], CAD: [-10, -14], GBP: [-30, -20], EUR: [24, -22], CHF: [26, 26], JPY: [16, -6], AUD: [-12, 26], NZD: [-8, 30] };
  const lab = CCYS.map(c => { const [x, y] = map.banks?.[c] ?? []; if (x == null) return ''; const b = ccy[c]?.bias ?? 0, [lx, ly] = OFF[c];
    return `<circle cx="${x}" cy="${y}" r="6" fill="${b > 0 ? K.up : b < 0 ? K.dn : K.ink2}" stroke="${K.ink}" stroke-width="2"/><text x="${x + lx}" y="${y + ly}" text-anchor="${lx < 0 ? 'end' : 'start'}" font-family="${HEAD}" font-size="21" font-weight="700" fill="${K.ink}" paint-order="stroke" stroke="${K.paper}" stroke-width="5">${c} ${b > 0 ? '▲' : b < 0 ? '▼' : ''}</text>`; }).join('');
  const arc = ranking?.length >= 2 && typeof map.arc === 'string' ? `<path d="${map.arc}" fill="none" stroke="${K.amber}" stroke-width="4" stroke-dasharray="9 7" stroke-linecap="round"/>` : '';
  const land = `<g filter="url(#pen2)">${map.countries.map(f => `<path d="${f.d}" fill="${ZONE[f.id] ? fill(ZONE[f.id]) : K.land}" fill-opacity="${ZONE[f.id] ? 1 : 0.75}" stroke="${K.ink}" stroke-width=".9" stroke-linejoin="round"/>`).join('')}</g>`;
  return svg(`0 0 ${map.W} ${map.H}`, '100%', `${wash(map.W / 2, map.H / 2, map.W * 0.46, map.H * 0.42, K.sea, 0.9)}${land}${arc}${lab}`, "the desk's currency bias on the world map");
}
// the strongest and weakest currency as big symbols with their arrows, laid over the map (the example's "$ ↘")
const strongWeak = (ranking, ccy) => { const s = ranking.filter(c => ccy[c])[0], w = ranking.filter(c => ccy[c]).at(-1); if (!s || !w || s === w) return '';
  const big = (c, up) => `<div class="sym ${up ? 'up' : 'dn'}"><b>${SYM[c] ?? c}</b>${up ? svg('0 0 40 50', 30, inkLine('M8 44 L30 10 M16 10 H30 V24', K.up, 5)) : svg('0 0 40 50', 30, inkLine('M6 6 L18 20 L12 24 L32 44 M20 44 H32 V32', K.dn, 5))}</div>`;
  return `<div class="sw">${big(s, true)}${big(w, false)}</div>`; };

const fontFace = `@font-face{font-family:'Kalam';font-weight:700;font-style:normal;src:url(data:font/woff2;base64,${KALAM_700}) format('woff2')}@font-face{font-family:'Patrick Hand';font-weight:400;font-style:normal;src:url(data:font/woff2;base64,${PATRICK_HAND}) format('woff2')}`;
const PAPER = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .42  0 0 0 0 .36  0 0 0 0 .22  0 0 0 .09 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;
const CSS = `${fontFace}
*{box-sizing:border-box}html,body{margin:0;background:${K.paper};color:${K.ink};-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:${BODY};background-image:${PAPER}}
@page{size:A4 landscape;margin:0}
.sheet{width:297mm;height:210mm;margin:0 auto;padding:5mm 7mm 3.5mm;display:flex;flex-direction:column;gap:3mm;overflow:hidden;background-image:radial-gradient(ellipse at 50% 40%,rgba(255,255,255,.55),rgba(255,255,255,0) 70%)}
.ttl{text-align:center;position:relative}
.ttl h1{position:relative;display:inline-block;margin:0;padding:3px 46px 1px;font:700 38px/1.15 ${HEAD};letter-spacing:.05em;color:#fff;z-index:0}
.ttl h1::before{content:"";position:absolute;inset:-2px -6px;background:${K.navy};border-radius:6px 18px 8px 16px;filter:url(#brush);z-index:-1}
.dt{display:flex;align-items:center;gap:14px;margin-top:2px}.dt i{flex:1;height:3px;background:${K.ink};border-radius:3px;filter:url(#pen)}.dt span{font:700 24px ${HEAD}}
.grid{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1.02fr 1fr;grid-template-rows:1fr 1fr 1fr;gap:4.2mm 4mm}
.bx{position:relative;padding:26px 14px 8px;min-height:0;overflow:hidden}
.bx::before,.bx::after{content:"";position:absolute;pointer-events:none;border:2.8px solid ${K.ink};border-radius:12px 6px 14px 8px;filter:url(#pen)}
.bx::before{inset:6px 2px 2px 2px;background:rgba(255,255,255,.42)}.bx::after{inset:9px 0 -1px 5px;border-width:1.2px;opacity:.55;filter:url(#pen2)}
.bx>.tp{position:absolute;top:0;left:12px;z-index:2;padding:0 16px;font:700 20px/1.35 ${HEAD};text-transform:uppercase;letter-spacing:.03em;color:${K.ink};transform:rotate(-1.2deg);white-space:nowrap}
.bx>.tp::before{content:"";position:absolute;inset:0;background:${K.tape};border:2.2px solid ${K.ink};border-radius:4px 10px 5px 9px;filter:url(#pen);z-index:-1}
.bx>.in{position:relative;z-index:1;height:100%}
.bx.note::before{background:${K.note};border-color:${K.ink}}
.bx.plain{padding:0;display:flex;align-items:center;justify-content:center}.bx.plain::before,.bx.plain::after{display:none}
ul{margin:0;padding-left:20px}li{margin:3px 0;font-size:18px;line-height:1.18}
.up{color:${K.up}}.dn{color:${K.dn}}.mut{color:${K.ink2};font-size:14px}
.tri{font-family:Arial,sans-serif;font-size:15px}.tri.up{color:${K.up}}.tri.dn{color:${K.dn}}
.mv{display:flex;gap:6px;height:100%;align-items:center}.mv .col{flex:1;display:flex;align-items:center;gap:4px}.mv .col+.col{border-left:2px solid rgba(27,37,80,.35);padding-left:8px}
.mv .ls{display:flex;flex-direction:column;gap:6px}.mv .it{white-space:nowrap;line-height:1.1}.mv .it b{font:700 17px ${HEAD}}.mv .it .n{font:700 22px ${HEAD};margin-left:6px}.mv .it .p{display:block;font-size:13px;color:${K.ink2};margin-top:-3px}
.mv{justify-content:space-evenly}.mv .col{flex:0 1 auto}.mv.two .it .n{display:block;margin:-4px 0 0}.mv.two .ls{gap:2px}
.mv .it .x{font:700 14px ${HEAD};margin-left:5px;color:${K.ink2}}
.mvw{display:flex;flex-direction:column;height:100%}.mvw .mv{flex:1;min-height:0;height:auto}.mvw .yd{font-size:13px;line-height:1.15;margin-top:2px;white-space:normal}.mv.dense .ls{gap:0}.mv.dense .it b{font-size:15px}.mv.dense .it .n,.mv.two.dense .it .n{display:inline;font-size:18px;margin:0 0 0 5px}.mv.dense .col>svg{display:none}.mv.dense .it .p{font-size:11.5px;margin-top:-2px}.mvw .yd b{font:700 14px ${HEAD}}.mvw .yk{font-size:10.5px;color:${K.ink2};line-height:1.1}
.hero{text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;height:100%}
.hero .word{font:700 30px/1 ${HEAD};letter-spacing:.06em;margin-top:-8px}
.hero .sign{position:relative;margin:5px 0 4px;padding:4px 14px;font:700 17px/1.18 ${HEAD};max-width:96%;z-index:0}
.hero .sign::before{content:"";position:absolute;inset:0;background:#fffdf6;border:3px solid ${K.ink};border-radius:6px 12px 6px 10px;filter:url(#pen);box-shadow:4px 4px 0 rgba(27,37,80,.22);z-index:-1}
.sig{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:4px;text-align:center;height:100%;align-items:start}
.sig>div{padding:0 3px}.sig>div+div{border-left:2px dashed rgba(27,37,80,.3)}
.sig b{display:block;font:700 17px/1.1 ${HEAD}}.sig .lv{font-size:16px;letter-spacing:.04em}.sig i{display:block;font-style:normal;font-size:14px;line-height:1.1;color:${K.ink2}}
.cc{display:grid;grid-template-columns:auto auto 1fr;gap:0 10px;align-items:center;font:700 17px/1.02 ${HEAD}}
.cc .sep{grid-column:1/-1;height:2.5px;background:${K.ink};margin:2px 0;filter:url(#pen)}.cc em{font:400 14px ${BODY};color:${K.ink2};font-style:normal}
.mapc{position:relative;width:100%;height:100%;display:flex;align-items:center}
.sw{position:absolute;left:2px;bottom:6px;display:flex;gap:10px}
.sym{position:relative;display:flex;align-items:center;line-height:1}.sym b{font:700 46px/1 ${HEAD};-webkit-text-stroke:1.5px ${K.ink};paint-order:stroke}.sym.up b{color:${K.up}}.sym.dn b{color:${K.dn}}.sym i{position:absolute;left:0;top:44px;font:400 13px ${BODY};font-style:normal;color:${K.ink2};white-space:nowrap}
.ev{display:flex;gap:10px;align-items:center;height:100%}.ev ul{overflow:hidden}.ev ul{flex:1;padding:0 0 0 12px;border-left:2.5px solid ${K.ink}}
.ck{padding:0}.ck li{list-style:none;display:flex;gap:7px;align-items:flex-start;margin:4px 0}.ck li svg{flex:none;margin-top:2px}
.ev li{font-size:16px;line-height:1.1;margin:3px 0;white-space:nowrap}.ev li span{overflow:hidden;text-overflow:ellipsis}.ev .tm{font:700 16px ${HEAD}}
.vw li{font-size:17px;line-height:1.15;white-space:nowrap}.vw b{font:700 18px ${HEAD}}
.bl{display:flex;flex-direction:column;justify-content:center;height:100%;font:700 22px/1.28 ${HEAD};padding:0 4px}
.tapebit{position:absolute;top:3px;right:26px;width:70px;height:20px;background:rgba(188,215,239,.75);transform:rotate(6deg);z-index:3;filter:url(#pen)}
.foot{font-size:11.5px;color:${K.ink2};text-align:center;line-height:1.2}
@media screen and (max-width:1100px){.sheet{width:100%;height:auto}.grid{grid-template-columns:1fr;grid-template-rows:none}.bx{min-height:200px}.ttl h1{font-size:26px}}`;

/**
 * run: today's desk run (the same object the other desk editions use); base: the Atlas newsletter input (assets with
 * d1, events, riskFlags); stress: /api/world-stress; map: worldPaths output. H: { esc }.
 */
export function composePicto({ run, base = {}, stress = null, map = null } = {}, H) {
  const { esc } = H, b = run?.head?.book; if (!b) return null;
  const date = run.date, long = new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const g = run.debate?.global?.view ?? b.global ?? {}, cv = run.debate?.currency?.view, ccy = cv?.currencies ?? b.currencies ?? {}, ranking = cv?.ranking ?? CCYS;
  const nl = run.newsletter?.ok ? run.newsletter.issue : null, tone = String(g.tone ?? 'mixed').replace('_', '-');
  const box = (label, body, cls = '', extra = '') => (body ? `<div class="bx ${cls}"><span class="tp">${esc(label)}</span>${extra}<div class="in">${body}</div></div>` : '');

  // market moves: the four biggest on the morning tape (js/morningTape.js, the same helper as the daily and the magazine, so the
  // figures match exactly), fallers beside risers (the big arrows). A 'live' move runs from the live price to the last daily
  // close (overnight), so the last full day sits under it; each carries its multiple of a normal day, and the ranking takes
  // the larger of the two: on 2026-11-06 the box showed Nasdaq +1.42% (the overnight bounce) and nothing of the -7% day.
  const moves = tapeRows(base.assets).slice(0, 4).map(r => ({ ...r, main: r.night ?? r.day }));
  const liveFrom = moves.find(m => m.night)?.night.date ?? null;
  const ud = v => (v > 0 ? 'up' : v < 0 ? 'dn' : '');
  const item = m => `<div class="it"><b>${esc(m.label)}</b><span class="n ${ud(m.main.pct)}">${fmtPct(m.main.pct)}${Number.isFinite(m.main.mult) ? `<span class="x">${fmtMult(m.main.mult)}</span>` : ''}</span>${m.night && m.day ? `<span class="p">${esc(dayName(m.day.date))} <span class="${ud(m.day.pct)}">${fmtPct(m.day.pct)}</span>${Number.isFinite(m.day.mult) ? ` ${fmtMult(m.day.mult)}` : ''}</span>` : !m.night && m.day ? `<span class="p">${esc(dayName(m.day.date))}, full day</span>` : ''}</div>`;
  const falls = moves.filter(m => m.main.pct < 0), rises = moves.filter(m => m.main.pct >= 0);
  const yLine = yesterdayLine({ assets: base.assets, evening: base.evening });
  const pMv = moves.length ? `<div class="mv${falls.length && rises.length ? ' two' : ''}${Math.max(falls.length, rises.length) >= 3 ? ' dense' : ''}">${falls.length ? `<div class="col">${zigDown(rises.length ? 46 : 60)}<div class="ls">${falls.map(item).join('')}</div></div>` : ''}${rises.length ? `<div class="col">${arrowUp(falls.length ? 46 : 60)}<div class="ls">${rises.map(item).join('')}</div></div>` : ''}</div>` : '';
  const pMoves = pMv ? `<div class="mvw">${pMv}${yLine ? `<div class="yd"><b>Yesterday:</b> ${esc(short(yLine.source === 'evening' ? yLine.text.replace(/^\w+, from last night's evening edition: /, '') : yLine.text.replace(/^\w+'s full day: /, `${dayName(yLine.date)}: `), 120))}</div>` : ''}${moves.some(m => Number.isFinite(m.score)) ? '<div class="yk">× = the move ÷ the forecast median day range (high to low)</div>' : ''}</div>` : '';

  // the hero: the ruling, as weather, on a signboard with the headline
  const headline = short(nl?.subject ?? b.headline ?? '', 100);
  const pHero = `<div class="bx plain"><div class="hero">${weather(tone, 118)}<div class="word ${/off/i.test(tone) ? 'dn' : /on/i.test(tone) ? 'up' : ''}">${esc(tone.toUpperCase())}</div>${g.conviction ? `<div class="mut">global ruling: ${esc(g.conviction)} conviction</div>` : ''}${headline ? `<div class="sign">${esc(headline)}</div>` : ''}</div></div>`;

  // key signals: the world-stress readings, each with its own drawing, else the risk flags
  const tiles = stress?.tiles?.length ? stress.tiles.slice(0, 3) : base.riskFlags ? [{ label: 'Risk flags', level: base.riskFlags.active >= 3 ? 'stress' : base.riskFlags.active >= 1 ? 'watch' : 'ok', detail: `${base.riskFlags.active} of ${base.riskFlags.total} on` }] : [];
  const pSig = tiles.length ? `<div class="sig">${tiles.map(t => `<div>${(iconFor(t.label) ?? (() => gauge(t.level)))()}<b>${esc(t.label)}</b><b class="lv ${t.level === 'stress' ? 'dn' : t.level === 'watch' ? '' : 'up'}"${t.level === 'watch' ? ` style="color:${K.amber}"` : ''}>${esc(String(t.level).toUpperCase())}</b><i>${esc(short(t.detail ?? '', 40))}</i></div>`).join('')}</div>` : '';

  // the big picture: the newsletter's own key points (each section's opening line), else the drivers of the ruling
  const fromIssue = (nl?.sections ?? []).filter(x => !/could not see|break the day/i.test(x.title ?? '')).map(x => short(x.body ?? x.text ?? '', 72)).filter(Boolean);
  const drivers = (fromIssue.length >= 2 ? fromIssue : (g.drivers ?? []).map(x => short(x, 72)).filter(Boolean)).slice(0, 4);
  const pBig = drivers.length ? `<ul>${drivers.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';

  // currencies: the ranking with each bias, a pen line where bullish turns bearish
  const rows = ranking.filter(c => ccy[c]); let sepDone = false;
  const pCcy = rows.length ? `<div class="cc">${rows.map((c, i) => { const v = Number(ccy[c]?.bias) || 0; const sep = !sepDone && v <= 0 && i > 0 ? (sepDone = true, '<span class="sep"></span>') : ''; if (v <= 0) sepDone = true;
    return `${sep}<span>${esc(c)}</span>${miniArrow(v)}<span>${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}${i === 0 ? ' <em>(strongest)</em>' : i === rows.length - 1 ? ' <em>(weakest)</em>' : ''}</span>`; }).join('')}</div>` : '';

  const pMap = map?.countries?.length ? `<div class="bx plain"><div class="mapc">${mapSketch(map, ccy, ranking)}${strongWeak(ranking, ccy)}</div></div>` : '';

  // upcoming events: high-impact releases ahead (the day named when it is not today)
  const today = date, evs = (base.events ?? []).filter(e => e.impact === 'high').slice(0, 5);
  const pEv = evs.length ? `<div class="ev">${calendar(74)}<ul class="ck">${evs.map(e => `<li>${tick}<span><b class="tm">${ukDay(e.ms) === today ? '' : esc(dayOf(e.ms)) + ' '}${esc(hhmm(e.ms))}</b> ${esc(e.country ?? '')} ${esc(short(e.event, 30))}</span></li>`).join('')}</ul></div>` : '';

  // the desk's view: the largest live cards
  const live = Object.entries(b.instruments ?? {}).filter(([, c]) => DIR[c.rating] && c.size > 0), wt = c => c.size * (CONV[c.conviction] ?? 0.8) * Math.abs(DIR[c.rating]);
  const top = live.sort((x, y) => wt(y[1]) - wt(x[1])).slice(0, 4);
  const pView = top.length ? `<ul class="ck vw">${top.map(([n, c]) => { const d = DIR[c.rating] > 0, gr = grade(c), inv = c.plan?.invalidation ?? c.invalidation; return `<li>${tick}<span><b class="${d ? 'up' : 'dn'}">${d ? 'Long' : 'Short'} ${esc(instName(n))}</b>${gr ? ` (${gr} conviction)` : ''}${inv ? ` <span class="mut">· wrong ${esc(short(String(inv).replace(/^\s*(?:a\s+)?(?:daily\s+|hourly\s+)?close\s+/i, ''), 22))}</span>` : ''}</span></li>`; }).join('')}</ul>` : '';

  // the bottom line: the opening's first sentence, else the ruling's summary
  const bottom = short(nl?.standfirst ?? g.summary ?? '', 170);
  const pBot = bottom ? `<div class="bl"><span>${esc(bottom)}</span>${svg('0 0 200 14', '62%', `<path d="M4 9 Q50 2 100 8 T196 6" fill="none" stroke="${K.ink}" stroke-width="3.2" stroke-linecap="round" filter="url(#pen)"/>`)}</div>` : '';

  const cells = [box(liveFrom ? `Moves since ${dayName(liveFrom)}'s close` : 'Market moves', pMoves), pHero, box('Key signals', pSig), box('The big picture', pBig), box('Currencies', pCcy), pMap || box('The desk\'s ruling', g.summary ? `<p style="font-size:18px;margin:0">${esc(short(g.summary, 200))}</p>` : ''), box('Upcoming events', pEv), box('The desk\'s view', pView), box('Bottom line', pBot, 'note', '<i class="tapebit"></i>')].filter(Boolean);
  const foot = `<div class="foot">Not financial advice: a private research summary; trading leveraged products can lose more than you deposit · The Chain · desk brief pictograph · ${esc(date)} · every figure from the desk run and Atlas data, none drawn by a model</div>`;
  const subject = `${date} Desk brief pictograph: ${short(b.headline ?? 'the desk book', 80)}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title><style>${CSS}</style></head><body>${FILTERS}<div class="sheet"><div class="ttl"><h1>THE CHAIN – DESK BRIEF</h1><div class="dt"><i></i><span>${esc(long)}</span><i></i></div></div><div class="grid">${cells.join('')}</div>${foot}</div></body></html>`;
  const text = [`THE CHAIN – DESK BRIEF · ${long}`, `${tone.toUpperCase()}${headline ? ': ' + headline : ''}`, yLine ? `Yesterday: ${yLine.text}${yLine.source === 'evening' && yLine.numbers ? ` (${yLine.numbers})` : ''}` : '', moves.length ? `${liveFrom ? `Moves since ${dayName(liveFrom)}'s close` : 'Moves'} (× a normal day): ` + moves.map(m => { const x = rowText(m); return `${m.label} ${m.night ? `${x.night.replace(/ since .*$/, '')}${x.day ? `, ${x.day}` : ''}` : x.day}`; }).join('; ') : '', drivers.length ? 'Big picture: ' + drivers.join('; ') : '', rows.length ? 'Currencies: ' + rows.map(c => `${c} ${ccy[c].bias > 0 ? '+' : ''}${ccy[c].bias}`).join(', ') : '', top.length ? 'Desk view: ' + top.map(([n, c]) => `${DIR[c.rating] > 0 ? 'long' : 'short'} ${instName(n)}`).join(', ') : '', bottom ? 'Bottom line: ' + bottom : ''].filter(Boolean).join('\n');
  return { subject, html, text };
}

/** "YYYY-MM-DD <name>" as the page title, which browsers use as the default file name when saving to PDF. */
export function withTitle(html, title, esc) {
  const t = `<title>${esc(title)}</title>`;
  return /<title>[\s\S]*?<\/title>/i.test(html) ? html.replace(/<title>[\s\S]*?<\/title>/i, () => t) : html.replace(/<head([^>]*)>/i, (m, a) => `<head${a}>${t}`);
}
