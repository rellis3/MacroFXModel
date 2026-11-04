/**
 * The Chain, pictograph (owner, 2026-11-04): the desk brief on one landscape page in a hand-drawn infographic style
 * (cream paper, navy ink, taped section labels, sketched icons), built beside the desk magazine, the desk brief and the
 * terminal edition, never instead of them.
 *
 * Every number and word on it comes from the same desk run and Atlas data as the other editions: nothing is drawn by
 * an image model, so nothing on the page can be invented. Panels with no data are left out of the grid rather than
 * filled with placeholders.
 *
 * Self-contained like every issue: no scripts, no fonts or images fetched (the hand-written look uses the system's own
 * handwriting fonts: Segoe Print on Windows, Chalkboard or Bradley Hand on a Mac, Comic Sans as the fallback), every
 * graphic inline SVG. The world map's paths come from worldPaths (js/newsletterTerminal.js), computed on Atlas.
 *
 * Pure. Tested in js/newsletterPicto.test.mjs.
 */
import { instName, prose } from './newsletterDesk.js';
import { clean, grade } from './newsletterTerminal.js';

const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
const ZONE = { 840: 'USD', 124: 'CAD', 826: 'GBP', 392: 'JPY', 36: 'AUD', 554: 'NZD', 756: 'CHF' };
for (const id of [40, 56, 191, 196, 233, 246, 250, 276, 300, 372, 380, 428, 440, 442, 470, 528, 620, 703, 705, 724]) ZONE[id] = 'EUR';
const DIR = { STRONG_LONG: 2, LONG: 1, FLAT: 0, NEUTRAL: 0, SHORT: -1, STRONG_SHORT: -2 };
const CONV = { low: 0.6, medium: 0.8, high: 1 };
const K = { paper: '#fbf7ec', ink: '#1d2850', ink2: '#4a5478', tape: '#cfe2f3', navy: '#22305e', up: '#2f9e4f', dn: '#d63a2f', amber: '#e3a72f', note: '#f8e7a1', land: '#9fb3d6' };
const HAND = "'Segoe Print','Chalkboard SE','Bradley Hand','Marker Felt','Comic Sans MS','Comic Neue',cursive";
const BODY = "'Segoe Print','Chalkboard SE','Comic Sans MS','Comic Neue',cursive";

/** One short line: the first sentence, cut on a word boundary. */
export const short = (t, n = 70) => {
  const s = prose(clean(t ?? ''), { sentences: 1, chars: 400 }).replace(/\.$/, '').trim();
  return s.length > n ? s.slice(0, n - 1).replace(/[\s,;:]+\S*$/, '') + '…' : s;
};
const fmtPct = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}%`;
const hhmm = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const dayOf = ms => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Europe/London' });
const ukDay = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

// ── sketched icons (inline SVG) ───────────────────────────────────────────────────────────────────────────────
const zigDown = (s = 56) => `<svg viewBox="0 0 60 70" width="${s}" height="${s * 70 / 60}" aria-hidden="true"><path d="M8 6 L26 26 L18 30 L40 50 L34 54 L50 64" fill="none" stroke="${K.dn}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/><path d="M36 64 L52 66 L50 50" fill="none" stroke="${K.dn}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
const arrowUp = (s = 56) => `<svg viewBox="0 0 60 70" width="${s}" height="${s * 70 / 60}" aria-hidden="true"><path d="M14 64 L30 28" fill="none" stroke="${K.up}" stroke-width="9" stroke-linecap="round"/><path d="M14 30 L36 10 L44 40 Z" fill="${K.up}" stroke="${K.up}" stroke-width="3" stroke-linejoin="round"/></svg>`;
const flatArrow = (s = 40) => `<svg viewBox="0 0 60 30" width="${s}" height="${s / 2}" aria-hidden="true"><path d="M6 15 L48 15 M38 6 L52 15 L38 24" fill="none" stroke="${K.ink2}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
function gauge(level, s = 92) {
  const ang = { ok: 35, calm: 35, watch: 90, stress: 150 }[level] ?? 90, r = 34, cx = 46, cy = 44, rad = a => (a * Math.PI) / 180;
  const pt = (a, rr = r) => [(cx + rr * Math.cos(rad(180 - a))).toFixed(1), (cy - rr * Math.sin(rad(180 - a))).toFixed(1)];
  const seg = (a0, a1, col) => { const [x0, y0] = pt(a0), [x1, y1] = pt(a1); return `<path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" fill="none" stroke="${col}" stroke-width="10"/>`; };
  const [nx, ny] = pt(180 - ang, r - 8);
  return `<svg viewBox="0 0 92 54" width="${s}" height="${s * 54 / 92}" aria-hidden="true">${seg(0, 60, K.dn)}${seg(60, 120, K.amber)}${seg(120, 180, K.up)}<path d="M${pt(0, r + 6).join(' ')} A${r + 6} ${r + 6} 0 0 1 ${pt(180, r + 6).join(' ')}" fill="none" stroke="${K.ink}" stroke-width="2"/><line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${K.ink}" stroke-width="4" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="4.5" fill="${K.ink}"/></svg>`;
}
const calendar = (s = 70) => `<svg viewBox="0 0 70 70" width="${s}" height="${s}" aria-hidden="true"><rect x="6" y="12" width="58" height="52" rx="7" fill="#e9eef8" stroke="${K.ink}" stroke-width="3"/><rect x="6" y="12" width="58" height="14" rx="6" fill="${K.navy}"/><path d="M20 6 v12 M50 6 v12" stroke="${K.ink}" stroke-width="4" stroke-linecap="round"/>${[0, 1, 2].map(r => [0, 1, 2].map(c => `<rect x="${15 + c * 15}" y="${32 + r * 10}" width="11" height="7" rx="1.5" fill="${K.land}" stroke="${K.ink}" stroke-width="1.4"/>`).join('')).join('')}</svg>`;
const tick = `<svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true"><path d="M3 11 L8 16 L17 4" fill="none" stroke="${K.up}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
function weather(tone, s = 120) {
  const sun = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#f6c443" stroke="${K.ink}" stroke-width="2.5"/>${Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return `<line x1="${(x + Math.cos(a) * (r + 5)).toFixed(1)}" y1="${(y + Math.sin(a) * (r + 5)).toFixed(1)}" x2="${(x + Math.cos(a) * (r + 13)).toFixed(1)}" y2="${(y + Math.sin(a) * (r + 13)).toFixed(1)}" stroke="#e0a72a" stroke-width="3.5" stroke-linecap="round"/>`; }).join('')}`;
  const cloud = (x, y, col) => `<path d="M${x} ${y} q-22 0 -22 -18 q0 -18 20 -18 q6 -20 30 -18 q22 2 24 22 q18 0 18 16 q0 16 -18 16 Z" fill="${col}" stroke="${K.ink}" stroke-width="2.8" stroke-linejoin="round"/>`;
  const bolt = (x, y) => `<path d="M${x} ${y} l-10 18 h9 l-7 18 l18 -24 h-9 l7 -12 Z" fill="#f6c443" stroke="${K.ink}" stroke-width="2" stroke-linejoin="round"/>`;
  const rain = (x, y) => [0, 1, 2].map(i => `<line x1="${x + i * 16}" y1="${y}" x2="${x + i * 16 - 5}" y2="${y + 12}" stroke="#5b8fd6" stroke-width="3" stroke-linecap="round"/>`).join('');
  const t = String(tone ?? '').toLowerCase();
  const art = /off/.test(t) ? cloud(40, 62, '#c9d1e3') + bolt(66, 64) + rain(30, 68) : /on/.test(t) ? sun(60, 48, 22) : sun(78, 34, 16) + cloud(36, 70, '#e7ecf6');
  return `<svg viewBox="0 0 120 100" width="${s}" height="${s * 100 / 120}" aria-hidden="true">${art}</svg>`;
}

function mapSketch(map, ccy, ranking) {
  if (!map?.countries?.length) return '';
  const fill = c => { const b = ccy[c]?.bias ?? 0; return b > 0 ? `rgba(47,158,79,${0.35 + 0.2 * Math.min(2, b)})` : b < 0 ? `rgba(214,58,47,${0.35 + 0.2 * Math.min(2, -b)})` : '#c7cfdf'; };
  const OFF = { USD: [-10, 22], CAD: [-8, -12], GBP: [-30, -18], EUR: [22, -20], CHF: [24, 24], JPY: [14, -6], AUD: [-10, 24], NZD: [-6, 26] };
  const lab = CCYS.map(c => { const [x, y] = map.banks?.[c] ?? []; if (x == null) return ''; const b = ccy[c]?.bias ?? 0, [lx, ly] = OFF[c];
    return `<circle cx="${x}" cy="${y}" r="5" fill="${b > 0 ? K.up : b < 0 ? K.dn : K.ink2}" stroke="${K.ink}" stroke-width="1.5"/><text x="${x + lx}" y="${y + ly}" text-anchor="${lx < 0 ? 'end' : 'start'}" font-family="${HAND}" font-size="17" font-weight="700" fill="${K.ink}" paint-order="stroke" stroke="${K.paper}" stroke-width="4">${c} ${b > 0 ? '▲' : b < 0 ? '▼' : '•'}</text>`; }).join('');
  const arc = ranking?.length >= 2 && typeof map.arc === 'string' ? `<path d="${map.arc}" fill="none" stroke="${K.amber}" stroke-width="3" stroke-dasharray="7 6" stroke-linecap="round"/>` : '';
  return `<svg viewBox="0 0 ${map.W} ${map.H}" width="100%" role="img" aria-label="the desk's currency bias on the world map">${map.countries.map(f => `<path d="${f.d}" fill="${ZONE[f.id] ? fill(ZONE[f.id]) : K.land}" stroke="${K.ink}" stroke-width=".7" stroke-linejoin="round" opacity="${ZONE[f.id] ? 1 : 0.55}"/>`).join('')}${arc}${lab}</svg>`;
}

const CSS = `
*{box-sizing:border-box}html,body{margin:0;background:${K.paper};color:${K.ink};-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:${BODY}}
@page{size:A4 landscape;margin:0}
.sheet{width:297mm;min-height:210mm;margin:0 auto;padding:7mm 8mm 5mm;background:${K.paper};display:flex;flex-direction:column;gap:3.2mm}
.ttl{text-align:center}
.ttl h1{display:inline-block;margin:0;padding:2px 34px 4px;font:700 34px/1.15 ${HAND};letter-spacing:.04em;color:#fff;background:${K.navy};border-radius:6px 40px 8px 36px/30px 6px 34px 8px;transform:rotate(-.6deg);box-shadow:4px 3px 0 rgba(29,40,80,.25)}
.dt{display:flex;align-items:center;gap:12px;margin-top:3px}.dt::before,.dt::after{content:"";flex:1;border-top:2.5px solid ${K.ink}}.dt span{font:700 20px ${HAND}}
.grid{flex:1;display:grid;grid-template-columns:1fr 1fr 1fr;gap:3.2mm}
.bx{position:relative;border:2.6px solid ${K.ink};border-radius:255px 14px 225px 14px/14px 225px 14px 255px;padding:24px 12px 8px;background:rgba(255,255,255,.35)}
.bx>.tp{position:absolute;top:-14px;left:14px;padding:1px 14px;font:700 17px ${HAND};text-transform:uppercase;letter-spacing:.03em;background:${K.tape};border:2px solid ${K.ink};border-radius:4px 14px 5px 12px/12px 4px 14px 5px;transform:rotate(-1.2deg);white-space:nowrap}
.bx.note{background:${K.note}}.bx.plain{border:none;background:none;padding:0;display:flex;align-items:center;justify-content:center}
ul{margin:0;padding-left:18px}li{margin:2px 0;font-size:13.5px;line-height:1.3}
.mv{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;align-items:center}
.mv b{font:700 17px ${HAND}}.mv .n{font:700 22px ${HAND}}
.up{color:${K.up}}.dn{color:${K.dn}}.mut{color:${K.ink2};font-size:11.5px}
.hero{text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.hero .word{font:700 28px ${HAND};letter-spacing:.05em}
.hero .hl{border:2.6px solid ${K.ink};border-radius:8px 30px 6px 26px/26px 6px 30px 8px;padding:5px 12px;font:700 15px/1.25 ${HAND};background:#fff;box-shadow:3px 3px 0 rgba(29,40,80,.2);max-width:92%}
.sig{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:6px;text-align:center}
.sig>div{border-left:2px solid rgba(29,40,80,.25);padding:0 3px}.sig>div:first-child{border-left:none}
.sig b{display:block;font:700 14px/1.15 ${HAND}}.sig i{display:block;font-style:normal;font-size:11px;line-height:1.2;color:${K.ink2}}
.cc{display:grid;grid-template-columns:44px 22px 1fr;gap:1px 6px;align-items:center;font:700 15px ${HAND}}
.cc .sep{grid-column:1/-1;border-top:2px solid ${K.ink};margin:3px 0}
.ev{display:flex;gap:10px;align-items:flex-start}.ev ul{list-style:none;padding:0;border-left:2px solid ${K.ink};padding-left:10px}
.ck li{list-style:none;display:flex;gap:6px;align-items:flex-start;margin:3px 0}.ck{padding:0}
.bl{font:700 17px/1.35 ${HAND}}.bl::after{content:"";display:block;width:45%;margin:4px 0 0 auto;border-top:3px solid ${K.ink};border-radius:50%}
.foot{font-size:9px;color:${K.ink2};text-align:center;line-height:1.3}
@media screen and (max-width:1100px){.sheet{width:100%;min-height:0}.grid{grid-template-columns:1fr}.ttl h1{font-size:24px}}
@media print{.sheet{page-break-after:avoid}}`;

/**
 * run: today's desk run (the same object the other desk editions use); base: the Atlas newsletter input (assets with
 * d1, events, riskFlags); stress: /api/world-stress; map: worldPaths output. H: { esc }.
 */
export function composePicto({ run, base = {}, stress = null, map = null } = {}, H) {
  const { esc } = H, b = run?.head?.book; if (!b) return null;
  const date = run.date, long = new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const g = run.debate?.global?.view ?? b.global ?? {}, cv = run.debate?.currency?.view, ccy = cv?.currencies ?? b.currencies ?? {}, ranking = cv?.ranking ?? CCYS;
  const nl = run.newsletter?.ok ? run.newsletter.issue : null, tone = String(g.tone ?? 'mixed').replace('_', '-');
  const box = (label, body, cls = '') => (body ? `<div class="bx ${cls}"><span class="tp">${esc(label)}</span>${body}</div>` : '');

  // market moves: the four largest one-day moves Atlas has a close for
  const moves = (base.assets ?? []).filter(a => Number.isFinite(a.d1)).sort((x, y) => Math.abs(y.d1) - Math.abs(x.d1)).slice(0, 4);
  const pMoves = moves.length ? `<div class="mv">${moves.map(m => `<span>${m.d1 > 0.05 ? arrowUp(26) : m.d1 < -0.05 ? zigDown(26) : flatArrow(26)}</span><span><b>${esc(m.label)}</b> <span class="n ${m.d1 > 0 ? 'up' : m.d1 < 0 ? 'dn' : ''}">${fmtPct(m.d1)}</span>${m.price ? ` <span class="mut">(${esc(m.price)})</span>` : ''}</span>`).join('')}</div><div class="mut" style="margin-top:3px">${esc(moves[0].d1Label || 'one day')}</div>` : '';

  // the hero: the ruling, as weather, and the headline
  const headline = short(nl?.subject ?? b.headline ?? '', 110);
  const pHero = `<div class="bx plain"><div class="hero">${weather(tone, 112)}<div class="word ${/off/i.test(tone) ? 'dn' : /on/i.test(tone) ? 'up' : ''}">${esc(tone.toUpperCase())}</div>${g.conviction ? `<div class="mut">${esc(g.conviction)} conviction</div>` : ''}${headline ? `<div class="hl">${esc(headline)}</div>` : ''}</div></div>`;

  // key signals: the world-stress gauges, else the risk flags
  const tiles = stress?.tiles?.length ? stress.tiles.slice(0, 3) : base.riskFlags ? [{ label: 'Risk flags', level: base.riskFlags.active >= 3 ? 'stress' : base.riskFlags.active >= 1 ? 'watch' : 'ok', detail: `${base.riskFlags.active} of ${base.riskFlags.total} on` }] : [];
  const pSig = tiles.length ? `<div class="sig">${tiles.map(t => `<div>${gauge(t.level, 82)}<b>${esc(t.label)}</b><b class="${t.level === 'stress' ? 'dn' : t.level === 'watch' ? '' : 'up'}" style="font-size:13px">${esc(String(t.level).toUpperCase())}</b><i>${esc(short(t.detail ?? '', 46))}</i></div>`).join('')}</div>${stress?.overall ? `<div class="mut" style="text-align:center;margin-top:3px">World stress overall: <b>${esc(stress.overall)}</b></div>` : ''}` : '';

  // the big picture: the drivers of the ruling, one line each
  const drivers = (g.drivers ?? []).slice(0, 4).map(x => short(x, 78)).filter(Boolean);
  const pBig = drivers.length ? `<ul>${drivers.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';

  // currencies: the ranking with each bias, a line where bullish turns bearish
  const rows = ranking.filter(c => ccy[c]); let sepDone = false;
  const pCcy = rows.length ? `<div class="cc">${rows.map((c, i) => { const v = Number(ccy[c]?.bias) || 0; const sep = !sepDone && v <= 0 && i > 0 ? (sepDone = true, '<span class="sep"></span>') : ''; if (v <= 0) sepDone = true;
    return `${sep}<span>${esc(c)}</span><span class="${v > 0 ? 'up' : v < 0 ? 'dn' : ''}">${v > 0 ? '▲' : v < 0 ? '▼' : '•'}</span><span>${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}${i === 0 ? ' <span class="mut">(strongest)</span>' : i === rows.length - 1 ? ' <span class="mut">(weakest)</span>' : ''}</span>`; }).join('')}</div>` : '';

  const pMap = map?.countries?.length ? `<div class="bx plain">${mapSketch(map, ccy, ranking)}</div>` : '';

  // upcoming events: high-impact releases ahead (the day named when it is not today)
  const today = date, evs = (base.events ?? []).filter(e => e.impact === 'high').slice(0, 5);
  const pEv = evs.length ? `<div class="ev">${calendar(58)}<ul class="ck">${evs.map(e => `<li>${tick}<span>${esc(e.country ?? '')} ${esc(short(e.event, 34))} – ${ukDay(e.ms) === today ? '' : esc(dayOf(e.ms)) + ' '}${esc(hhmm(e.ms))}</span></li>`).join('')}</ul></div>` : '';

  // the desk's view: the largest live cards
  const live = Object.entries(b.instruments ?? {}).filter(([, c]) => DIR[c.rating] && c.size > 0), wt = c => c.size * (CONV[c.conviction] ?? 0.8) * Math.abs(DIR[c.rating]);
  const top = live.sort((x, y) => wt(y[1]) - wt(x[1])).slice(0, 5);
  const pView = top.length ? `<ul class="ck">${top.map(([n, c]) => { const d = DIR[c.rating] > 0, gr = grade(c); return `<li>${tick}<span><b class="${d ? 'up' : 'dn'}">${d ? 'Long' : 'Short'} ${esc(instName(n))}</b>${gr ? ` (${gr})` : ''}${c.plan?.invalidation || c.invalidation ? ` <span class="mut">· invalid: ${esc(short(c.plan?.invalidation ?? c.invalidation, 30))}</span>` : ''}</span></li>`; }).join('')}</ul>` : '';

  // the bottom line: the opening's first sentence, else the ruling's summary
  const bottom = short(nl?.standfirst ?? g.summary ?? '', 190);
  const pBot = bottom ? `<div class="bl">${esc(bottom)}</div>` : '';

  const cells = [box('Market moves', pMoves), pHero, box('Key signals', pSig), box('The big picture', pBig), box('Currencies', pCcy), pMap || box('The desk\'s ruling', g.summary ? `<p style="font-size:13.5px;margin:0">${esc(short(g.summary, 220))}</p>` : ''), box('Upcoming events', pEv), box('The desk\'s view', pView), box('Bottom line', pBot, 'note')].filter(Boolean);
  const foot = `<div class="foot">Not financial advice: a private research summary; trading leveraged products can lose more than you deposit · The Chain · desk brief pictograph · ${esc(date)} · every figure from the desk run and Atlas data, none drawn by a model</div>`;
  const subject = `${date} Desk brief pictograph: ${short(b.headline ?? 'the desk book', 80)}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title><style>${CSS}</style></head><body><div class="sheet"><div class="ttl"><h1>THE CHAIN – DESK BRIEF</h1><div class="dt"><span>${esc(long)}</span></div></div><div class="grid">${cells.join('')}</div>${foot}</div></body></html>`;
  const text = [`THE CHAIN – DESK BRIEF · ${long}`, `${tone.toUpperCase()}${headline ? ': ' + headline : ''}`, moves.length ? 'Moves: ' + moves.map(m => `${m.label} ${fmtPct(m.d1)}`).join(', ') : '', drivers.length ? 'Big picture: ' + drivers.join('; ') : '', rows.length ? 'Currencies: ' + rows.map(c => `${c} ${ccy[c].bias > 0 ? '+' : ''}${ccy[c].bias}`).join(', ') : '', top.length ? 'Desk view: ' + top.map(([n, c]) => `${DIR[c.rating] > 0 ? 'long' : 'short'} ${instName(n)}`).join(', ') : '', bottom ? 'Bottom line: ' + bottom : ''].filter(Boolean).join('\n');
  return { subject, html, text };
}

/** "YYYY-MM-DD <name>" as the page title, which browsers use as the default file name when saving to PDF. */
export function withTitle(html, title, esc) {
  const t = `<title>${esc(title)}</title>`;
  return /<title>[\s\S]*?<\/title>/i.test(html) ? html.replace(/<title>[\s\S]*?<\/title>/i, t) : html.replace(/<head([^>]*)>/i, `<head$1>${t}`);
}
