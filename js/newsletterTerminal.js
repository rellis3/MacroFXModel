/**
 * The Chain, Terminal edition (owner, 2026-11-03: a "futuristic" newsletter in the Desk Terminal's style, beside the
 * desk magazine and the desk brief, never instead of them). The same desk run and review, drawn the way
 * desk-terminal.html draws them: deep navy, purple for structure, gold for theses, green and red only for direction,
 * mono labels, glowing graphics.
 *
 * Self-contained like every issue: no scripts, no fonts or images fetched, every graphic inline SVG, so it reads the
 * same opened, forwarded or printed (print keeps the dark background). The world map's paths are computed on Atlas at
 * build time (worldPaths, with d3 and the world atlas) and passed in; without them the map page is left out.
 *
 * Pure. Tested in js/newsletterTerminal.test.mjs.
 */
import { DISCLAIMER } from './newsletter.js';
import { instName, prose, cardMove } from './newsletterDesk.js';
import { DESK_UNIVERSE } from './deskPack.js';

const CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'NZD', 'CAD', 'CHF'];
const BANK = { USD: 'Fed', EUR: 'ECB', GBP: 'BoE', JPY: 'BoJ', AUD: 'RBA', NZD: 'RBNZ', CAD: 'BoC', CHF: 'SNB' };
const CB_GEO = { USD: [-77.04, 38.9], EUR: [8.68, 50.11], GBP: [-0.09, 51.51], JPY: [139.77, 35.68], AUD: [151.21, -33.87], NZD: [174.78, -41.29], CAD: [-75.7, 45.42], CHF: [8.54, 47.37] };
const ZONE = { 840: 'USD', 124: 'CAD', 826: 'GBP', 392: 'JPY', 36: 'AUD', 554: 'NZD', 756: 'CHF' };
for (const id of [40, 56, 191, 196, 233, 246, 250, 276, 300, 372, 380, 428, 440, 442, 470, 528, 620, 703, 705, 724]) ZONE[id] = 'EUR';
const DIR = { STRONG_LONG: 2, LONG: 1, FLAT: 0, NEUTRAL: 0, SHORT: -1, STRONG_SHORT: -2 };
const CONV = { low: 0.6, medium: 0.8, high: 1 };
const GROUP = { fx_majors: 'FX majors', fx_crosses: 'FX crosses', indices: 'Indices', metals: 'Metals', energy: 'Energy', ags: 'Agriculture', crypto: 'Crypto' };
const C = { bg: '#070a17', bg1: '#0c1124', bg2: '#111833', bg3: '#18203f', line: '#232c55', tx: '#eef0fb', tx2: '#a9b0d0', tx3: '#6d7599', pur: '#8b7cf6', pur2: '#b4a9ff', gold: '#e8b85a', up: '#2fd39a', dn: '#ff5d78', flat: '#8a93b8' };
const MONO = "Consolas,'SF Mono',Menlo,'DejaVu Sans Mono',monospace";

export const assetScore = c => +(5 + 2.5 * (DIR[c?.rating] ?? 0) * (CONV[c?.conviction] ?? 0.8)).toFixed(1);
export const ccyScore = b => +(5 + 2.5 * (Number(b) || 0)).toFixed(1);
export const grade = c => { const d = Math.abs(DIR[c?.rating] ?? 0); if (!d || !(c.size > 0)) return null; return d === 2 && c.conviction === 'high' ? 'A+' : c.conviction === 'high' ? 'A' : c.conviction === 'medium' ? (d === 2 ? 'A-' : 'B+') : 'B'; };
const sgnCol = v => (v > 0 ? C.up : v < 0 ? C.dn : C.flat);
// the analysts' internal ids (rates_cb, options_oi…) never reach a reader
export const clean = t => String(t ?? '').replace(/\s*\([^()]*\b[a-z]+_[a-z_]+\b[^()]*\)/g, '').replace(/,?\s*\b[a-z]+_[a-z]+(?:_[a-z]+)*\b/g, '').replace(/\s+([,.;])/g, '$1');
const first = (t, n = 200) => { t = clean(t); const m = String(t ?? '').match(/^.{20,240}?[.;](\s|$)/); const x = (m ? m[0] : String(t ?? '')).trim(); return x.length > n ? x.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : x; };

/** World map paths for the issue, computed where d3 and the world atlas are loaded (Atlas, at build time). */
export function worldPaths(d3, topojson, topo, { W = 720, H = 360 } = {}) {
  const geo = topojson.feature(topo, topo.objects.countries); geo.features = geo.features.filter(f => f.id !== '010');
  const proj = d3.geoNaturalEarth1().fitExtent([[4, 4], [W - 4, H - 4]], geo), path = d3.geoPath(proj);
  return { W, H, sphere: path({ type: 'Sphere' }), grat: path(d3.geoGraticule10()), countries: geo.features.map(f => ({ id: Number(f.id), d: path(f) })).filter(c => c.d),
    banks: Object.fromEntries(CCYS.map(c => [c, proj(CB_GEO[c]).map(v => +v.toFixed(1))])),
    arc: (a, b) => path({ type: 'LineString', coordinates: [CB_GEO[a], CB_GEO[b]] }) };
}

// ── graphics (inline SVG strings) ───────────────────────────────────────────────────────────────────────────────
export function ring(score, size = 64) {
  const r = size / 2 - 6, L = 2 * Math.PI * r, col = score > 5.2 ? C.up : score < 4.8 ? C.dn : C.flat;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="score ${score} of 10"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${C.bg3}" stroke-width="6" fill="none"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${col}" stroke-width="6" fill="none" stroke-linecap="round" stroke-dasharray="${(L * score / 10).toFixed(1)} ${L.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" fill="${C.tx}" font-family="${MONO}" font-weight="700" font-size="${(size * 0.26).toFixed(0)}">${score.toFixed(1)}</text></svg>`;
}
export function dial(tone, conviction) {
  const v = (/on/.test(tone ?? '') ? 1 : /off/.test(tone ?? '') ? -1 : 0) * ({ low: 0.35, medium: 0.65, high: 0.92 }[conviction] ?? 0.6);
  const cx = 120, cy = 118, R = 96, a = Math.PI / 2 - v * Math.PI / 2, nx = cx + (R - 20) * Math.cos(a), ny = cy - (R - 20) * Math.sin(a);
  return `<svg viewBox="0 0 240 140" width="240" role="img" aria-label="regime dial"><defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="${C.dn}"/><stop offset=".5" stop-color="#3a4170"/><stop offset="1" stop-color="${C.up}"/></linearGradient></defs><path d="M${cx - R},${cy} A${R},${R} 0 0 1 ${cx + R},${cy}" stroke="url(#rg)" stroke-width="13" fill="none" stroke-linecap="round"/><line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="${C.tx}" stroke-width="3.2" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="6.5" fill="${C.tx}"/><text x="14" y="137" fill="${C.dn}" font-family="${MONO}" font-size="10" letter-spacing="1">RISK-OFF</text><text x="226" y="137" text-anchor="end" fill="${C.up}" font-family="${MONO}" font-size="10" letter-spacing="1">RISK-ON</text></svg>`;
}
function ladder(c) {
  const L = c?.levels; if (!L?.up?.p90 || !L?.down?.p90) return '';
  const lo = L.down.p90, hi = L.up.p90, W = 300, X = v => ((v - lo) / (hi - lo)) * (W - 8) + 4;
  const nums = (String(c.plan?.zone ?? '').match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter(v => v > lo * 0.97 && v < hi * 1.03);
  const z = nums.length >= 2 ? [Math.min(...nums), Math.max(...nums)] : null;
  const ticks = ['p90', 'p75', 'p50'].flatMap(q => [L.down[q], L.up[q]]).map(v => `<line x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="9" y2="23" stroke="${C.line}"/>`).join('');
  return `<svg viewBox="0 0 ${W} 40" width="100%" role="img" aria-label="today's forecast ladder"><rect x="4" y="14" width="${W - 8}" height="4" rx="2" fill="${C.bg3}"/>${ticks}${z ? `<rect x="${X(Math.max(lo, z[0])).toFixed(1)}" y="10" width="${Math.max(2, X(Math.min(hi, z[1])) - X(Math.max(lo, z[0]))).toFixed(1)}" height="12" rx="3" fill="rgba(139,124,246,.28)" stroke="${C.pur}"/>` : ''}<line x1="${X(L.open).toFixed(1)}" x2="${X(L.open).toFixed(1)}" y1="6" y2="26" stroke="${C.tx}" stroke-width="2"/><text x="4" y="38" fill="${C.tx3}" font-family="${MONO}" font-size="9">${lo}</text><text x="${(W / 2).toFixed(0)}" y="38" text-anchor="middle" fill="${C.tx3}" font-family="${MONO}" font-size="9">open ${L.open}</text><text x="${W - 4}" y="38" text-anchor="end" fill="${C.tx3}" font-family="${MONO}" font-size="9">${hi}</text></svg>`;
}
function hbars(rows, { title, unit = '', W = 660 } = {}) {
  const R = rows.filter(r => Number.isFinite(r.v)); if (!R.length) return '';
  const row = 20, top = 26, H = top + R.length * row + 8, left = 130, right = 70, mx = Math.max(...R.map(r => Math.abs(r.v)), 0.001), zero = left + (W - left - right) / 2, half = (W - left - right) / 2;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${title ?? ''}">${title ? `<text x="0" y="13" fill="${C.tx3}" font-family="${MONO}" font-size="10" letter-spacing="1.5">${title.toUpperCase()}</text>` : ''}<line x1="${zero}" x2="${zero}" y1="${top - 4}" y2="${H - 4}" stroke="${C.line}"/>`
    + R.map((r, i) => { const y = top + i * row, w = Math.max(1.5, Math.abs(r.v) / mx * half), x = r.v >= 0 ? zero : zero - w; return `<text x="0" y="${y + 13}" fill="${C.tx}" font-family="${MONO}" font-size="11">${r.label}</text><rect x="${x.toFixed(1)}" y="${y + 3}" width="${w.toFixed(1)}" height="12" rx="4" fill="${sgnCol(r.v)}" opacity=".9"/>${r.note ? `<text x="${r.v >= 0 ? zero - 6 : zero + 6}" y="${y + 13}" text-anchor="${r.v >= 0 ? 'end' : 'start'}" fill="${C.tx3}" font-family="${MONO}" font-size="9">${r.note}</text>` : ''}<text x="${W}" y="${y + 13}" text-anchor="end" fill="${sgnCol(r.v)}" font-family="${MONO}" font-size="11" font-weight="700">${r.v > 0 ? '+' : r.v < 0 ? '−' : ''}${Math.abs(r.v).toFixed(2)}${unit}</text>`; }).join('') + '</svg>';
}
function mapSvg(map, ccy, ranking, rates) {
  if (!map?.countries?.length) return '';
  const fill = c => { const b = ccy[c]?.bias ?? 0; return b > 0 ? `rgba(47,211,154,${0.25 + 0.22 * Math.min(2, b)})` : b < 0 ? `rgba(255,93,120,${0.25 + 0.22 * Math.min(2, -b)})` : 'rgba(138,147,184,.3)'; };
  const OFF = { USD: [-14, 18], CAD: [-14, -14], GBP: [-30, -24], EUR: [26, -26], CHF: [26, 22], JPY: [12, -8], AUD: [-12, -6], NZD: [-14, 16] };
  const banks = CCYS.map(c => { const [x, y] = map.banks[c], b = ccy[c]?.bias ?? 0, col = b > 0 ? C.up : b < 0 ? C.dn : C.pur2, [lx, ly] = OFF[c], left = lx < 0;
    return `<g transform="translate(${x},${y})"><circle r="9" fill="${col}" opacity=".22"/><circle r="4.5" fill="${col}"/><circle r="1.6" fill="#fff"/>${Math.abs(lx) > 18 || Math.abs(ly) > 16 ? `<line x1="0" y1="0" x2="${lx * 0.8}" y2="${ly * 0.8}" stroke="rgba(238,240,251,.35)"/>` : ''}<text x="${lx}" y="${ly}" text-anchor="${left ? 'end' : 'start'}" fill="${C.tx}" font-family="${MONO}" font-size="10" font-weight="700" paint-order="stroke" stroke="${C.bg}" stroke-width="3">${BANK[c]} ${rates?.[c] != null ? rates[c] + '%' : ''}</text><text x="${lx}" y="${ly + 11}" text-anchor="${left ? 'end' : 'start'}" fill="${col}" font-family="${MONO}" font-size="9" paint-order="stroke" stroke="${C.bg}" stroke-width="3">${c} ${b > 0 ? '▲' : b < 0 ? '▼' : '●'} ${ccyScore(b).toFixed(1)}</text></g>`; }).join('');
  const arc = ranking?.length >= 2 && map.arc ? `<path d="${map.arc}" fill="none" stroke="${C.gold}" stroke-width="1.6" stroke-dasharray="4 5"/>` : '';
  return `<svg viewBox="0 0 ${map.W} ${map.H}" width="100%" role="img" aria-label="the desk's currency bias by country"><defs><radialGradient id="oc" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#121a3c"/><stop offset="1" stop-color="${C.bg}"/></radialGradient></defs><path d="${map.sphere}" fill="url(#oc)" stroke="rgba(139,124,246,.25)"/><path d="${map.grat}" fill="none" stroke="rgba(139,124,246,.08)"/>${map.countries.map(f => `<path d="${f.d}" fill="${ZONE[f.id] ? fill(ZONE[f.id]) : '#141b38'}" stroke="#232c55" stroke-width=".4"/>`).join('')}${arc}${banks}</svg>`;
}

// ── the issue ─────────────────────────────────────────────────────────────────────────────────────────────────
const CSS = `
*{box-sizing:border-box}html,body{margin:0;background:${C.bg};color:${C.tx};-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font:14px/1.55 -apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:18px}
.pg{background:radial-gradient(900px 420px at 85% -10%,rgba(139,124,246,.14),transparent 60%),linear-gradient(180deg,${C.bg1},${C.bg});border:1px solid ${C.line};border-radius:16px;padding:22px 24px;margin:0 0 16px;page-break-after:always;break-after:page}
.pg:last-of-type{page-break-after:auto}
.mh{display:flex;align-items:center;gap:12px;font:700 11px ${MONO};letter-spacing:.2em;color:${C.tx2};border-bottom:1px solid ${C.line};padding-bottom:10px;margin-bottom:16px}
.mh b{color:${C.tx}}.mh b i{font-style:normal;color:${C.gold}}.mh .r{margin-left:auto;color:${C.tx3}}.dot{width:9px;height:9px;border-radius:50%;background:${C.pur};box-shadow:0 0 10px ${C.pur};display:inline-block}
.lbl{font:700 10px ${MONO};letter-spacing:.16em;text-transform:uppercase;color:${C.tx3}}
h1{font:800 34px/1.12 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;margin:6px 0 10px;letter-spacing:-.01em}
h2{font:700 20px/1.25 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;margin:4px 0 10px}
.thesis{border-left:3px solid ${C.gold};background:rgba(232,184,90,.08);padding:10px 14px;border-radius:0 10px 10px 0;color:#f3e3bf;font-style:italic;margin:10px 0}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0}
.tile{background:${C.bg2};border:1px solid ${C.line};border-radius:12px;padding:10px 12px}.tile b{display:block;font:700 22px ${MONO};margin:3px 0}.tile i{font-style:normal;font-size:11.5px;color:${C.tx3}}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.card{background:${C.bg2};border:1px solid ${C.line};border-radius:12px;padding:12px 14px;break-inside:avoid}
.chip{display:inline-block;font:700 9.5px ${MONO};letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:999px;border:1px solid ${C.line};color:${C.tx2}}
.chip.up{color:${C.up};border-color:rgba(47,211,154,.45);background:rgba(47,211,154,.1)}.chip.dn{color:${C.dn};border-color:rgba(255,93,120,.45);background:rgba(255,93,120,.1)}.chip.gold{color:${C.gold};border-color:rgba(232,184,90,.5);background:rgba(232,184,90,.1)}
.pb{display:grid;grid-template-columns:72px 1fr;gap:8px;padding:5px 9px;border-radius:7px;background:${C.bg3};border-left:3px solid ${C.line};margin-top:5px;font-size:12px}
.pb b{font:700 9.5px ${MONO};letter-spacing:.12em;color:${C.tx3};padding-top:2px}.en{border-left-color:${C.up}}.tg{border-left-color:${C.gold}}.iv{border-left-color:${C.dn}}
.mut{color:${C.tx3};font-size:12px}.up{color:${C.up}}.dn{color:${C.dn}}
.at{border-radius:9px;padding:7px 8px;border:1px solid ${C.line};font:11px ${MONO}}.at b{display:block;font-size:11.5px;color:${C.tx}}
.foot{border:1px solid ${C.line};border-radius:14px;padding:14px 18px;color:${C.tx2};font-size:11.5px}.foot h4{margin:0 0 6px;font:700 11px ${MONO};letter-spacing:.14em;color:${C.tx}}
@media (max-width:640px){.grid2,.grid3{grid-template-columns:1fr}.grid4{grid-template-columns:repeat(2,1fr)}.tiles{grid-template-columns:1fr 1fr}h1{font-size:26px}.pg{padding:16px}}
@media print{.wrap{max-width:none;padding:0}.pg{border-radius:0;margin:0;min-height:100vh;padding:18px 20px}.pg .card{padding:9px 11px}.pb{padding:3px 8px;margin-top:4px}@page{size:A4;margin:0}}`;

/**
 * The whole issue. in: { run (the desk run), review ({ score, reflection, movers } for yesterday, optional),
 * rates ({ CCY: policy rate }), cb ({ CCY: { regime, score } }), map (worldPaths output, optional), news ([{ title, read }], optional) }.
 */
export function composeTerminal({ run, review = null, rates = {}, cb = {}, map = null, news = [] } = {}, H) {
  const { esc } = H, b = run?.head?.book; if (!b) return null;
  const date = run.date, long = new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const g = run.debate?.global?.view ?? b.global ?? {}, cv = run.debate?.currency?.view, ccy = cv?.currencies ?? b.currencies ?? {}, ranking = cv?.ranking ?? CCYS;
  const cards = b.instruments ?? {}, live = Object.entries(cards).filter(([, c]) => DIR[c.rating] && c.size > 0);
  const longs = live.filter(([, c]) => DIR[c.rating] > 0).length, shorts = live.length - longs;
  const weight = c => c.size * (CONV[c.conviction] ?? 0.8) * Math.abs(DIR[c.rating]);
  const top = [...live].sort((a, c) => weight(c[1]) - weight(a[1])).slice(0, 6);
  const mh = sec => `<div class="mh"><span class="dot"></span><b>THE CHAIN <i>// TERMINAL</i></b><span>${esc(sec)}</span><span class="r">${esc(date)}</span></div>`;
  const tone = String(g.tone ?? '').replace('_', '-').toUpperCase();

  // 1 · cover
  const p1 = `<div class="pg">${mh('Morning brief')}<div class="lbl">Terminal edition · ${esc(long)}</div><h1>${esc(prose(b.headline ?? 'The desk\'s book', { sentences: 1, chars: 120 }))}</h1>
<div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><div>${dial(g.tone, g.conviction)}</div><div style="flex:1;min-width:220px"><div class="lbl">Market regime</div><div style="font:800 30px ${MONO};letter-spacing:.06em;color:${/OFF/.test(tone) ? C.dn : /ON/.test(tone) ? C.up : C.flat}">${esc(tone || '–')}</div><div class="mut">conviction ${esc(g.conviction ?? '–')} · the Global Manager's ruling over the risk-on and risk-off cases</div></div></div>
${g.summary ? `<div class="thesis">${esc(prose(clean(g.summary), { sentences: 2, chars: 380 }))}</div>` : ''}
<div class="tiles"><div class="tile"><span class="lbl">Live cards</span><b>${live.length}</b><i>${longs} long · ${shorts} short</i></div><div class="tile"><span class="lbl">Strongest</span><b class="up">${esc(ranking[0] ?? '–')}</b><i>${esc(BANK[ranking[0]] ?? '')} · ${ccyScore(ccy[ranking[0]]?.bias).toFixed(1)}/10</i></div><div class="tile"><span class="lbl">Weakest</span><b class="dn">${esc(ranking.at(-1) ?? '–')}</b><i>${esc(BANK[ranking.at(-1)] ?? '')} · ${ccyScore(ccy[ranking.at(-1)]?.bias).toFixed(1)}/10</i></div></div>
${(g.drivers ?? []).length ? `<div class="lbl" style="margin-top:6px">Drivers</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${g.drivers.slice(0, 5).map(d => `<span class="chip">${esc(clean(d).slice(0, 70))}</span>`).join('')}</div>` : ''}
${news.length ? `<div class="lbl" style="margin-top:14px">On the wire</div>${news.slice(0, 4).map(h => `<div style="padding:6px 0;border-bottom:1px solid ${C.line};font-size:12.5px">${esc(h.title)}${Object.keys(h.read?.impact ?? {}).length ? ` ${Object.entries(h.read.impact).map(([k, v]) => `<span class="chip ${v > 0 ? 'up' : 'dn'}">${esc(k)} ${v > 0 ? '▲' : '▼'}</span>`).join(' ')}` : ''}</div>`).join('')}` : ''}</div>`;

  // 2 · the world and the currencies
  const rings = ranking.map(c => `<div class="card" style="text-align:center;padding:8px"><div style="font:700 13px ${MONO}">${esc(c)}</div>${ring(ccyScore(ccy[c]?.bias), 58)}<div class="mut">${esc(BANK[c])}${rates[c] != null ? ` · ${rates[c]}%` : ''}${cb[c]?.regime ? `<br>${esc(String(cb[c].regime).toLowerCase())}` : ''}</div></div>`).join('');
  const p2 = `<div class="pg">${mh('The world')}<div class="lbl">The desk's world</div><h2>${esc(ranking[0] ?? '')} strongest, ${esc(ranking.at(-1) ?? '')} weakest</h2>
${mapSvg(map, ccy, ranking, rates)}${map ? `<p class="mut">Shaded by the desk's bias (green bullish, red bearish); dots are the central banks with their policy rate; the gold line runs from the strongest currency to the weakest.</p>` : ''}
<div class="lbl" style="margin:10px 0 6px">Currency strength, strongest to weakest (the Currency Manager's bias on /10)</div><div class="grid4">${rings}</div>
<div class="grid2" style="margin-top:12px">${[ranking[0], ranking.at(-1)].filter(Boolean).map(c => `<div class="card"><span class="chip ${ccy[c]?.bias > 0 ? 'up' : 'dn'}">${esc(c)} · ${ccy[c]?.bias > 0 ? 'bullish' : 'bearish'}</span><div class="thesis" style="font-size:12.5px">${esc(prose(clean(ccy[c]?.why ?? ''), { sentences: 2, chars: 320 }))}</div></div>`).join('')}</div></div>`;

  // 3 · playbooks
  const pb = top.map(([n, c]) => { const d = Math.sign(DIR[c.rating]), L = c.levels, tgt = L ? (d > 0 ? `p50 ${L.up?.p50} · p75 ${L.up?.p75}` : `p50 ${L.down?.p50} · p75 ${L.down?.p75}`) : null, gr = grade(c);
    return `<div class="card"><div style="display:flex;align-items:center;gap:8px"><b style="font-size:15px">${esc(instName(n))}</b><span class="chip ${d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'} ${esc(c.rating.replace('_', ' '))}</span>${gr ? `<span style="margin-left:auto;font:800 13px ${MONO};color:${C.gold};border:1px solid rgba(232,184,90,.5);border-radius:7px;padding:1px 7px">${gr}</span>` : ''}</div>
<div style="display:flex;gap:10px;align-items:center;margin-top:6px"><div style="flex:none">${ring(assetScore(c), 46)}</div><div class="mut" style="font-style:italic;color:#f3e3bf;font-size:11.5px">“${esc(first(c.why, 130))}”</div></div>${ladder(c)}
${c.plan?.zone ? `<div class="pb en"><b>ENTRY</b><span>${esc(c.plan.zone)}</span></div>` : ''}${tgt ? `<div class="pb tg"><b>TARGET</b><span style="font-family:${MONO}">${esc(tgt)}</span></div>` : ''}<div class="pb iv"><b>INVALID</b><span>${esc(c.plan?.invalidation ?? c.invalidation ?? '–')}</span></div>
<div class="mut" style="margin-top:5px">size ${c.size}${c.plan?.timing ? ` · ${esc(c.plan.timing)}` : ''}</div></div>`; }).join('');
  const p3 = `<div class="pg">${mh('Playbooks')}<div class="lbl">The six largest cards</div><h2>Today's playbooks</h2><div class="grid2">${pb}</div><p class="mut">Grades are the book's conviction, not a hit rate. The ladder is today's forecast range (p50, p75, p90 each side of the open); the purple band is the entry zone.</p></div>`;

  // 4 · every market
  const tiles = Object.entries(DESK_UNIVERSE).map(([grp, names]) => { const xs = names.filter(n => cards[n]); if (!xs.length) return '';
    return `<div class="lbl" style="margin:10px 0 5px">${esc(GROUP[grp])}</div><div class="grid4">${xs.map(n => { const c = cards[n], d = DIR[c.rating] ?? 0, s = assetScore(c), bg = d > 0 ? `rgba(47,211,154,${0.08 + 0.12 * Math.abs(d)})` : d < 0 ? `rgba(255,93,120,${0.08 + 0.12 * Math.abs(d)})` : C.bg2;
      return `<div class="at" style="background:${bg}"><b>${esc(instName(n))}</b><span style="color:${sgnCol(d)}">${d > 0 ? '▲' : d < 0 ? '▼' : '●'} ${esc(c.rating.replace('_', ' ').toLowerCase())}</span><br><span style="color:${C.tx3}">score ${s.toFixed(1)}${c.size > 0 ? ` · size ${c.size}` : ''}</span></div>`; }).join('')}</div>`; }).join('');
  const p4 = `<div class="pg">${mh('Every market')}<div class="lbl">The whole book</div><h2>Every market, one glance</h2>${tiles}<p class="mut">Each tile: the desk's view, its score on /10 (5 = no view) and its size after the exposure cap.</p></div>`;

  // 5 · releases and risks
  const rel = run.economist?.ok ? (run.economist.releases ?? []) : [], briefs = run.economist?.view?.briefs ?? [];
  const fans = rel.slice(0, 3).map((r, i) => { const ms = Object.values(r.playbook?.markets ?? {}).slice(0, 6), mx = Math.max(...ms.map(m => (m.abs240 ?? 0) / (m.unit === 'bp' ? 10 : 1)), 0.01), sc = (v, u) => (Math.abs(v ?? 0) / (u === 'bp' ? 10 : 1)) / mx * 120;
    return `<div class="card" style="margin-bottom:10px"><div style="display:flex;gap:8px;align-items:center"><span class="chip gold">${esc(r.family)}</span><b>${esc(r.event)}</b><span class="mut" style="margin-left:auto;font-family:${MONO}">${esc(new Date(r.at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }))}</span></div>${briefs[i]?.sizeAndSpeed ? `<p class="mut">${esc(prose(briefs[i].sizeAndSpeed, { sentences: 2, chars: 260 }))}</p>` : ''}
<svg viewBox="0 0 560 ${ms.length * 24 + 6}" width="100%" role="img" aria-label="release reactions">${ms.map((m, k) => { const y = 14 + k * 24; return `<text x="0" y="${y + 4}" fill="${C.tx2}" font-family="${MONO}" font-size="10">${esc(m.label)}</text><rect x="${300 - sc(m.abs240, m.unit)}" y="${y - 7}" width="${sc(m.abs240, m.unit) * 2}" height="14" rx="7" fill="rgba(139,124,246,.2)"/><rect x="${300 - sc(m.abs30, m.unit)}" y="${y - 4}" width="${sc(m.abs30, m.unit) * 2}" height="8" rx="4" fill="rgba(139,124,246,.6)"/>${m.hot ? `<circle cx="${300 + Math.sign(m.hot.m30) * sc(m.hot.m30, m.unit)}" cy="${y}" r="4.5" fill="${C.dn}"/>` : ''}${m.cold ? `<circle cx="${300 + Math.sign(m.cold.m30) * sc(m.cold.m30, m.unit)}" cy="${y}" r="4.5" fill="#4fb3ff"/>` : ''}<text x="560" y="${y + 4}" text-anchor="end" fill="${C.tx3}" font-family="${MONO}" font-size="9">${m.abs30}${m.unit} · ${m.abs240}${m.unit}</text>`; }).join('')}</svg></div>`; }).join('');
  const risks = (b.risks ?? []).slice(0, 5).map(r => `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid ${C.line};font-size:12.5px"><span style="color:${C.gold}">▸</span><span>${esc(prose(clean(r), { sentences: 1, chars: 220 }))}</span></div>`).join('');
  const p5 = (fans || risks) ? `<div class="pg">${mh('Releases and risks')}${fans ? `<div class="lbl">Releases ahead</div><h2>How markets moved after past releases like these</h2>${fans}<p class="mut">Inner band: the typical move either way at 30 minutes; outer: at 4 hours. Red dot: after hot prints; blue: after cold. History, not a forecast.</p>` : ''}${risks ? `<div class="lbl" style="margin-top:12px">Risk desk warnings</div>${risks}` : ''}</div>` : '';

  // 6 · yesterday, reviewed (compact)
  const sc = review?.score;
  const p6 = sc?.S != null ? (() => { const cs = Object.entries(sc.cards ?? {}).filter(([, c]) => !c.missing && c.size > 0).map(([n, c]) => ({ label: instName(n), v: +(c.size * c.R).toFixed(2), note: `${c.dir > 0 ? 'long' : 'short'} ${c.R > 0 ? '+' : ''}${c.R.toFixed(2)}u${cardMove(n, c) ? ` · mkt ${cardMove(n, c)}` : ''}` })).sort((a, c) => Math.abs(c.v) - Math.abs(a.v)).slice(0, 10).sort((a, c) => c.v - a.v);
    const inside = sc.placebo?.p95 != null ? (sc.S > sc.placebo.p95 ? 'better than 95% of random books' : 'inside the range a random book scores') : '';
    return `<div class="pg">${mh('Yesterday')}<div class="lbl">Yesterday, reviewed · ${esc(sc.date)}</div><h2>The book ${sc.S >= 0 ? 'made' : 'lost'} ${Math.abs(sc.S).toFixed(2)} u${inside ? `: ${inside}` : ''}</h2>
<div class="tiles"><div class="tile"><span class="lbl">Day score</span><b style="color:${sgnCol(sc.S)}">${sc.S > 0 ? '+' : ''}${sc.S.toFixed(2)} u</b><i>${sc.eligible ? 'counts in the test' : 'not counted in the test'}</i></div><div class="tile"><span class="lbl">Cards scored</span><b>${sc.scored}/${sc.live}</b><i>08:00-21:00 London</i></div><div class="tile"><span class="lbl">Lean side first</span><b>${sc.race?.resolved ? `${sc.race.leanFirst}/${sc.race.resolved}` : '–'}</b><i>reached the p50 line first</i></div></div>
${hbars(cs, { title: 'The cards that moved the day (size × move in u)' })}<p class="mut">Each bar is a card's size times its move from 08:00 to 21:00 London in u (1 u = a typical half-day move), signed by its view: green helped the book, red hurt it.</p></div>`; })() : '';

  const foot = `<div class="foot"><h4>NOT FINANCIAL ADVICE</h4>${DISCLAIMER.map(d => `<p>${esc(d.replace(/^NOT FINANCIAL ADVICE\.\s*/, ''))}</p>`).join('')}<div class="mut">The Chain · Terminal edition · ${esc(date)}</div></div>`;
  const subject = `Terminal: ${prose(b.headline ?? 'the desk book', { sentences: 1, chars: 100 })}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title><style>${CSS}</style></head><body><div class="wrap">${p1}${p2}${p3}${p4}${p5}${p6}${foot}</div></body></html>`;
  const text = [subject, '', `Regime: ${tone} (${g.conviction ?? '–'})`, g.summary ?? '', '', `Strongest ${ranking[0]}, weakest ${ranking.at(-1)}. Ranking: ${ranking.join(' > ')}`, '',
    'PLAYBOOKS', ...top.map(([n, c]) => `${instName(n)} ${c.rating} (${c.conviction}, size ${c.size}): ${first(c.why)}${c.plan?.zone ? ` Entry ${c.plan.zone}.` : ''}${c.plan?.invalidation ? ` Invalid ${c.plan.invalidation}.` : ''}`), '', '---', ...DISCLAIMER].join('\n');
  return { subject: subject.slice(0, 120), html, text };
}
