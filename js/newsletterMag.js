/**
 * The magazine edition (V2). The same research as the current issue, laid out as an editorial publication: a feature article that carries the story across
 * the opening pages, the chain of impact as the signature spread, the competing explanations argued rather than listed, an accountability page for the
 * last issue's forecast, and then the Data Desk, which holds every reference table behind the story.
 *
 * Nothing here changes a threshold or a calculation. Every figure is drawn from data the current issue already carries (yield moves, chain links, the
 * hypothesis checks, the stored forecast audit). Where a sentence is generated it states a measured fact; where a claim is a reading it is attributed to
 * "the desk's reading" and set beside its counter-argument.
 *
 * Pure: strings in, string out. Helpers (escaping, colours, small SVG builders) come from the caller so this file has no import cycle with newsletter.js.
 * Tested in js/newsletter.test.mjs and by rendering the pages (see plans/NEWSLETTER_MAGAZINE.md).
 */

export const MAG_CSS = `
.mgw{max-width:860px;padding:0 0 40px}
.pg{background:#fff;margin:0 0 18px;padding:26px 28px 28px;border-radius:4px;box-shadow:0 1px 0 rgba(0,0,0,.04),0 8px 24px rgba(11,18,32,.07);font-family:Georgia,'Times New Roman',serif;color:#14202e}
.pg *{box-sizing:border-box}
.pg .mh{display:flex;justify-content:space-between;align-items:baseline;gap:10px;border-bottom:3px double #14202e;padding-bottom:7px;margin-bottom:16px;font-family:'Segoe UI',system-ui,sans-serif;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#14202e}
.pg .mh b{font-family:Georgia,serif;font-size:17px;letter-spacing:.06em}
.pg .kick{font-family:'Segoe UI',system-ui,sans-serif;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#d98a00;font-weight:700;margin:0 0 6px}
.pg h1.hd{font-size:41px;line-height:1.05;letter-spacing:-.015em;margin:0 0 12px;font-weight:700}
.pg .sf{font-size:19px;line-height:1.42;font-style:italic;color:#3a4756;margin:0 0 10px}
.pg .by{font-family:'Segoe UI',system-ui,sans-serif;font-size:11px;color:#5b6b82;letter-spacing:.04em;margin:0 0 16px;padding-bottom:12px;border-bottom:1px solid #d8e0ec}
.pg h2.sh{font-size:25px;line-height:1.15;margin:4px 0 10px;letter-spacing:-.01em}
.pg h3.ss{font-family:'Segoe UI',system-ui,sans-serif;font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:#14202e;margin:14px 0 4px}
.pg p{font-size:15.5px;line-height:1.55;margin:0 0 10px}
.pg .cols p.lead::first-letter{float:left;font-size:58px;line-height:.82;padding:5px 7px 0 0;font-weight:700;color:#d98a00}
.pg .cols{column-gap:30px;column-rule:1px solid #e6ecf5}
@media (min-width:640px){.pg .cols{column-count:2}.pg .split{display:grid;grid-template-columns:1fr 210px;gap:26px}.pg .two{display:grid;grid-template-columns:1fr 1fr;gap:22px}.pg .fig2{display:grid;grid-template-columns:1fr 1fr;gap:16px}}
.pg .split>.cols{min-width:0}
.pg .cols .pq{column-span:all}
.pg .pq{font-size:25px;line-height:1.22;font-style:italic;font-weight:600;color:#14202e;border-top:3px solid #d98a00;border-bottom:1px solid #d8e0ec;padding:12px 2px;margin:12px 0 14px;break-inside:avoid}
.pg .pq small{display:block;font-family:'Segoe UI',system-ui,sans-serif;font-style:normal;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#5b6b82;margin-top:6px;font-weight:400}
.pg aside.side{font-family:'Segoe UI',system-ui,sans-serif;font-size:12px;line-height:1.45;background:#f3f6fb;border-top:3px solid #14202e;padding:12px 13px;align-self:start}
.pg aside.side h4{margin:0 0 6px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase}
.pg aside.side .big{font-family:Georgia,serif;font-size:32px;line-height:1;font-weight:700;display:block;margin-top:8px}
.pg aside.side .big small{font:11px 'Segoe UI',sans-serif;color:#5b6b82;display:block;margin-top:2px}
.pg aside.side p{font-size:12px;line-height:1.45;margin:6px 0 0}
.pg figure{margin:6px 0 14px;break-inside:avoid}
.pg figure>svg,.pg figure .fsvg{display:block;width:100%;height:auto}
.pg figcaption{font-family:'Segoe UI',system-ui,sans-serif;font-size:11.5px;line-height:1.4;color:#5b6b82;margin-top:5px;border-top:1px solid #e1e8f2;padding-top:5px}
.pg figcaption b{color:#14202e}
.pg .chain-fig svg{background:#fff!important;border:0!important;border-radius:0!important}
.pg .notes{display:grid;gap:8px;margin-top:8px}
@media (min-width:640px){.pg .notes{grid-template-columns:1fr 1fr}}
.pg .note4{display:grid;grid-template-columns:26px 1fr;gap:9px;font-family:'Segoe UI',system-ui,sans-serif;font-size:12.5px;line-height:1.45;border-top:1px solid #e1e8f2;padding-top:7px;break-inside:avoid}
.pg .note4 .no{width:24px;height:24px;border-radius:50%;background:#d98a00;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:13px}
.pg .note4 b{display:block;font-size:13px}
.pg .tx{width:100%;border-collapse:collapse;font-family:'Segoe UI',system-ui,sans-serif;font-size:12px}
.pg .tx th{font-size:10px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:2px solid #14202e;padding:3px 6px 3px 0;color:#14202e}
.pg .tx td{border-bottom:1px solid #e6ecf5;padding:5px 6px 5px 0;vertical-align:top;line-height:1.35}
.pg .em{width:100%;border-collapse:collapse;font-family:'Segoe UI',system-ui,sans-serif;font-size:12px;margin:6px 0 4px}
.pg .em th{font-size:10.5px;text-align:center;padding:4px 4px;vertical-align:bottom;border-bottom:2px solid #14202e;line-height:1.25}
.pg .em th:first-child{text-align:left}
.pg .em td{border-bottom:1px solid #e6ecf5;padding:2px 4px;text-align:center;line-height:1.25}
.pg .em td:first-child{text-align:left}
.pg .em .y{color:#0f9f6e;font-weight:700}.pg .em .x{color:#d98a00;font-weight:700}.pg .em .n{color:#9aa8bb}
.pg .em .lb{display:block;font-weight:400;color:#5b6b82;font-size:10px;margin-top:2px}
.pg .wkd,.pg .ev2,.pg .ev2 *,.pg section,.pg section p{font-family:'Segoe UI',system-ui,sans-serif}.pg section p{font-size:13px;line-height:1.5}.pg .th2{break-inside:avoid;margin:0 0 10px}.pg .th2 h3{text-transform:none;letter-spacing:0;font-family:Georgia,serif;color:#14202e}.pg .th2 .chipx{display:block;width:max-content;margin:3px 0 4px}
.pg .th2 h3{font-size:17px;margin:0 0 3px}
.pg .th2 p{font-size:13.5px;line-height:1.42;margin:0 0 4px}
.pg .th2 .lim{color:#5b6b82;font-style:italic}
.pg .chipx{font-family:'Segoe UI',system-ui,sans-serif;font-size:10.5px;letter-spacing:.04em;background:#eef2f8;border-radius:999px;padding:2px 9px;font-weight:600;color:#14202e}
.pg .sfl{display:block;font-family:'Segoe UI',system-ui,sans-serif;font-style:normal;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#5b6b82;margin-bottom:3px}
.pg .keep{break-inside:avoid}.pg aside.side .lb2{display:block;font-size:12.5px;margin:2px 0 3px}
.acctn .num{font-family:Georgia,serif;font-size:40px;line-height:1;font-weight:700}.acctn .num small{display:block;font:11px/1.35 'Segoe UI',sans-serif;color:#5b6b82;margin-top:4px;font-weight:400}
.pg .box{background:#f3f6fb;border-left:4px solid #2f6bff;padding:11px 14px;margin:6px 0 14px;break-inside:avoid;font-family:'Segoe UI',system-ui,sans-serif;font-size:13px;line-height:1.5}
.pg .box h4{margin:0 0 4px;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#2f6bff}
.pg .box p{font-size:13px;line-height:1.5;margin:0 0 6px}
.pg .lst{margin:0;padding-left:18px;font-family:'Segoe UI',system-ui,sans-serif;font-size:12.5px;line-height:1.45}
.pg .lst li{margin-bottom:5px}
.pg .lst small{display:block;color:#5b6b82}
.pg .deskhd{background:#14202e;color:#fff;margin:-26px -28px 18px;padding:18px 28px 14px}
.pg .deskhd .kick{color:#f2b64d}
.pg .deskhd h2{font-size:30px;margin:0;color:#fff;letter-spacing:-.01em}
.pg .deskhd p{color:#c4d0e2;font-size:13.5px;margin:6px 0 0;font-family:'Segoe UI',system-ui,sans-serif}
.pg.desk,.pg.desk p,.pg.desk li,.pg.desk td{font-family:'Segoe UI',system-ui,sans-serif}.pg.desk p{font-size:13.5px;line-height:1.5}.pg.desk .small,.pg.desk small{font-size:12px}
.pg.desk section{box-shadow:none;border:1px solid #e1e8f2;border-radius:10px;margin:0 0 14px}
.pg.desk .pcg,.pg.desk .ccg2{display:block;column-count:1;column-gap:12px}.pg.desk .pcg>.pc,.pg.desk .ccg2>.cc2{break-inside:avoid;margin:0 0 12px;display:block}
@media (min-width:640px){.pg.desk .pcg,.pg.desk .ccg2{column-count:2}}
.acct{display:grid;gap:14px}
.acct .num{font-family:Georgia,serif;font-size:44px;line-height:1;font-weight:700}
.acct .num small{display:block;font:11px 'Segoe UI',sans-serif;color:#5b6b82;margin-top:3px;letter-spacing:.03em}
.acctn{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;border-top:3px solid #14202e;border-bottom:1px solid #d8e0ec;padding:10px 0}
.pg .al{display:grid;gap:8px}
.pg .al>div{background:#fff;border:1px solid #d8e0ec;border-top:3px solid #14202e;padding:9px 11px;font-family:'Segoe UI',system-ui,sans-serif;font-size:12.5px;line-height:1.45}
.pg .al>div.w{border-top-color:#d98a00}
.pg .al b.n2{font-family:Georgia,serif;font-size:26px;display:block;line-height:1}
@media (max-width:560px){.pg figure{overflow-x:auto}.pg .fw{min-width:540px}.pg .chain-fig svg{min-width:720px}.pg .mh span:nth-child(2){display:none}.pg .mh{font-size:9px}.pg .mh b{font-size:15px}.pg{padding:18px 15px 20px;border-radius:0}.pg h1.hd{font-size:31px}.pg .deskhd{margin:-18px -15px 14px;padding:14px 15px 12px}.pg aside.side{margin-top:6px}.acctn{grid-template-columns:1fr}}
@page land{size:A4 landscape;margin:10mm}
@media print{
  html,body{background:#fff!important}
  .mgw{max-width:none;padding:0;margin:0}
  .pg{box-shadow:none;border-radius:0;margin:0;padding:0;break-after:page;page-break-after:always}
  .pg:last-of-type{break-after:auto}
  .pg.land{page:land}
  .pg .cols{column-count:2}.pg .split{display:grid;grid-template-columns:1fr 200px;gap:22px}.pg .two{display:grid;grid-template-columns:1fr 1fr;gap:20px}.pg .fig2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .pg .notes{grid-template-columns:1fr 1fr 1fr 1fr}
  .pg .deskhd{margin:0 0 14px;padding:14px 20px 12px}
  .pg h1.hd{font-size:38px}
  .pg .acctn .num{font-size:30pt}.pg p{font-size:11.5pt}.pg .th2 p{font-size:9pt;line-height:1.35;margin:0 0 3px}.pg .th2 h3{font-size:13.5pt}.pg .th2{margin:0 0 7px}.pg .em{font-size:10px}.pg .em td{padding:1px 4px}.pg .qnote{display:none}.pg .sf{font-size:13.5pt}.pg .box{margin:4px 0 8px;padding:8px 12px}.pg .box p{font-size:9pt;line-height:1.4}.pg .p5 figcaption{font-size:8.5pt}
  .pg .pgbreak{break-before:page}.pg.desk table{break-inside:avoid}.pg .refs{padding:7px 12px;margin:8px 0;font-size:9.5px}.pg .refs .rf{padding:0}.pg .foot{margin-top:8px}.pg .foot p{font-size:8.6pt;margin:0 0 4px}.pg.desk p,.pg.desk li{font-size:9.4pt;line-height:1.4}.pg.desk .cc2,.pg.desk .pc{padding:9px 11px}.pg section table td,.pg section table th{padding-top:3px;padding-bottom:3px}.pg .wkd{padding:5px 0}.pg .refs,.pg .foot,.pg .box{break-inside:avoid}.pg section>h2{break-inside:avoid}  .pg.desk .pcg,.pg.desk .ccg2{column-count:2}.pg.desk section{break-inside:auto}.pg.desk section>h2,.pg.desk section>h3{break-after:avoid-page;page-break-after:avoid}.pg.desk section>h2+*{break-before:avoid-page}.pg.desk .pcg>.pc:first-child,.pg.desk .ccg2>.cc2:first-child{break-before:avoid-page}.pg.desk .pc,.pg.desk .cc2,.pg.desk .rw2,.pg.desk tr{break-inside:avoid}
}
`;

const N = x => (Number.isFinite(x) ? x : null);
const asList = v => (Array.isArray(v) ? v : v ? [v] : []);

/** The three yield moves as lines in basis points since the window began: the 10-year, its real part, and its inflation part. Annotated at the ends. */
export function yieldDecompChart(S, H) {
  const nom = S?.us10y, real = S?.real, bei = S?.bei;
  if (!nom || !real || !bei || nom.length < 5) return '';
  const L = Math.min(nom.length, real.length, bei.length, 26), cut = s => s.slice(-L).map(v => v - s.slice(-L)[0]);
  const A = cut(nom), R = cut(real), B = cut(bei), W = 660, Ht = 250, left = 44, right = 150, top = 16, bot = 30;
  const all = [...A, ...R, ...B], lo = Math.min(0, ...all), hi = Math.max(0, ...all), span = Math.max(8, hi - lo), y0 = lo - span * 0.12, y1 = hi + span * 0.12;
  const X = i => left + i * (W - left - right) / (L - 1), Y = v => top + (1 - (v - y0) / (y1 - y0)) * (Ht - top - bot);
  const step = span > 60 ? 20 : span > 30 ? 10 : 5, ticks = []; for (let t = Math.ceil(y0 / step) * step; t <= y1; t += step) ticks.push(t);
  const P = s => s.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const ends = [['10-year yield', A, H.COLORS.ink, 2.8], ['Real yield', R, H.COLORS.blue, 2.4], ['Expected inflation', B, '#d98a00', 2.4]];
  const lab = ends.map(([name, s, c]) => ({ name, v: s[L - 1], c, y: Y(s[L - 1]) })).sort((p, q) => p.y - q.y);
  for (let i = 1; i < lab.length; i++) if (lab[i].y - lab[i - 1].y < 30) lab[i].y = lab[i - 1].y + 30;
  const sgn = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}bp`;
  const shareReal = A[L - 1] !== 0 ? Math.round(100 * R[L - 1] / A[L - 1]) : null;
  return `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="The ten-year yield move split into the real yield and expected inflation over the last 20 days" class="fsvg fw" font-family="Segoe UI,system-ui,sans-serif">`
    + ticks.map(t => `<line x1="${left}" y1="${Y(t).toFixed(1)}" x2="${W - right}" y2="${Y(t).toFixed(1)}" stroke="${t === 0 ? '#14202e' : '#e1e8f2'}" stroke-width="${t === 0 ? 1.2 : 1}"/><text x="${left - 6}" y="${(Y(t) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="#5b6b82">${t > 0 ? '+' : t < 0 ? '−' : ''}${Math.abs(t)}</text>`).join('')
    + `<text x="${left}" y="${Ht - 8}" font-size="10" fill="#5b6b82">20 days ago</text><text x="${W - right}" y="${Ht - 8}" text-anchor="end" font-size="10" fill="#5b6b82">latest</text><text x="${left - 6}" y="10" text-anchor="end" font-size="9.5" fill="#5b6b82">bp</text>`
    + ends.map(([, s, c, w]) => `<path d="${P(s)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(L - 1).toFixed(1)}" cy="${Y(s[L - 1]).toFixed(1)}" r="4" fill="${c}"/>`).join('')
    + lab.map(l => `<text x="${W - right + 12}" y="${(l.y + 4).toFixed(1)}" font-size="12" font-weight="700" fill="${l.c}">${l.name} ${sgn(l.v)}</text>`).join('')
    + (shareReal != null && Math.abs(A[L - 1]) >= 5 ? `<text x="${left + 10}" y="${top + 12}" font-size="12.5" font-style="italic" font-weight="600" fill="${H.COLORS.blue}">${shareReal}% of the ${Math.abs(Math.round(A[L - 1]))}bp fall is the real yield</text>` : '')
    + `</svg>`;
}

/** One broken relationship as a large annotated pair of lines, each in units of that market's own usual wobble so a yield and an index can share an axis. */
export function relationChart(l, S, H) {
  const sa = S?.[l.a.key], sb = S?.[l.b.key]; if (!sa || !sb || sa.length < 5 || sb.length < 5) return '';
  const L = Math.min(sa.length, sb.length, 26), floor = k => H.CHAIN_NODES[k]?.floor ?? 1, cut = s => s.slice(-L), nrm = (s, k) => cut(s).map(v => (v - cut(s)[0]) / floor(k));
  const A = nrm(sa, l.a.key), B = nrm(sb, l.b.key), W = 330, Ht = 205, left = 8, right = 96, top = 14, bot = 22, m = Math.max(1.5, ...A.map(Math.abs), ...B.map(Math.abs)) * 1.12;
  const X = i => left + i * (W - left - right) / (L - 1), Y = v => top + (1 - (v + m) / (2 * m)) * (Ht - top - bot);
  const P = s => s.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const la = { y: Y(A[L - 1]), t: l.a.label, mv: l.a.text, c: H.COLORS.blue }, lb = { y: Y(B[L - 1]), t: l.b.label, mv: l.b.text, c: '#d98a00' };
  const arr = [la, lb].sort((p, q) => p.y - q.y); if (arr[1].y - arr[0].y < 34) arr[1].y = arr[0].y + 34;
  const short = t => String(t).replace(/\s*\(.*\)/, '');
  return `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="${H.esc(l.a.label)} and ${H.esc(l.b.label)} over 20 days" class="fsvg" font-family="Segoe UI,system-ui,sans-serif">`
    + `<line x1="${left}" y1="${Y(0)}" x2="${W - right}" y2="${Y(0)}" stroke="#14202e" stroke-width="1"/>`
    + `<line x1="${left}" y1="${Y(1).toFixed(1)}" x2="${W - right}" y2="${Y(1).toFixed(1)}" stroke="#e1e8f2" stroke-dasharray="3 3"/><line x1="${left}" y1="${Y(-1).toFixed(1)}" x2="${W - right}" y2="${Y(-1).toFixed(1)}" stroke="#e1e8f2" stroke-dasharray="3 3"/>`
    + `<text x="${left + 2}" y="${(Y(1) - 3).toFixed(1)}" font-size="9" fill="#9aa8bb">one usual wobble</text>`
    + `<path d="${P(A)}" fill="none" stroke="${la.c}" stroke-width="2.4" stroke-linejoin="round"/><path d="${P(B)}" fill="none" stroke="${lb.c}" stroke-width="2.4" stroke-linejoin="round"/>`
    + `<circle cx="${X(L - 1)}" cy="${Y(A[L - 1]).toFixed(1)}" r="3.8" fill="${la.c}"/><circle cx="${X(L - 1)}" cy="${Y(B[L - 1]).toFixed(1)}" r="3.8" fill="${lb.c}"/>`
    + arr.map(e => `<text x="${W - right + 10}" y="${(e.y - 2).toFixed(1)}" font-size="10.5" font-weight="700" fill="${e.c}">${H.esc(short(e.t))}</text><text x="${W - right + 10}" y="${(e.y + 11).toFixed(1)}" font-size="10.5" fill="${e.c}">${H.esc(e.mv)}</text>`).join('')
    + `<text x="${left}" y="${Ht - 6}" font-size="9.5" fill="#5b6b82">20 days ago</text><text x="${W - right}" y="${Ht - 6}" text-anchor="end" font-size="9.5" fill="#5b6b82">latest</text></svg>`;
}

/** The evidence matrix: every distinct check as a row, every explanation as a column. A mark is a fact about the day's moves, not a weight. */
export function evidenceMatrix(theories, H) {
  const rows = []; for (const t of theories) for (const c of t.checks) if (!rows.includes(c.text)) rows.push(c.text);
  const cell = (t, text) => { const c = t.checks.find(x => x.text === text); return !c ? '<td class="n">·</td>' : c.ok === true ? '<td class="y">✓</td>' : c.ok === false ? '<td class="x">✗</td>' : '<td class="n">–</td>'; };
  return `<table class="em"><tr><th>What the day's moves show</th>${theories.map(t => `<th>${H.esc(t.name)}<span class="lb">${t.measurable ? `${t.agree} of ${t.measurable} agree` : 'not tested'}</span></th>`).join('')}</tr>${rows.map(r => `<tr><td>${H.esc(r)}</td>${theories.map(t => cell(t, r)).join('')}</tr>`).join('')}</table>`;
}

const NAME = { GOLD: 'Gold', NQ: 'Nasdaq', SPX500: 'S&P 500', US30: 'Dow', US2000: 'Russell 2000', DE30: 'DAX', UK100: 'FTSE 100', BTCUSD: 'Bitcoin', EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY', AUDUSD: 'AUD/USD', USDCAD: 'USD/CAD', USDCHF: 'USD/CHF', NZDUSD: 'NZD/USD' };

/** Last issue's forecast audit: each market's real day against the size the issue expected, with the half-to-one-and-a-half band shaded. */
export function auditChart(rows, H) {
  const R = (rows ?? []).filter(r => N(r.ratio) != null).sort((a, b) => b.ratio - a.ratio); if (R.length < 3) return '';
  const W = 640, row = 16, top = 22, left = 92, right = 40, Ht = top + R.length * row + 26, mx = Math.max(2, ...R.map(r => r.ratio)) * 1.05, X = v => left + v / mx * (W - left - right);
  return `<svg viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Each market's realised day as a multiple of the expected size" class="fsvg fw" font-family="Segoe UI,system-ui,sans-serif">`
    + `<rect x="${X(0.5)}" y="${top - 6}" width="${X(1.5) - X(0.5)}" height="${R.length * row + 8}" fill="#e8f6ef"/>`
    + [0, 0.5, 1, 1.5, 2].filter(t => t <= mx).map(t => `<line x1="${X(t)}" y1="${top - 6}" x2="${X(t)}" y2="${top + R.length * row + 2}" stroke="${t === 1 ? '#14202e' : '#d8e0ec'}" stroke-width="${t === 1 ? 1.4 : 1}"/><text x="${X(t)}" y="${top - 10}" text-anchor="middle" font-size="10" fill="#5b6b82">${t}×</text>`).join('')
    + R.map((r, i) => { const y = top + i * row, out = r.ratio < 0.5 || r.ratio > 1.5; return `<text x="${left - 8}" y="${y + 11}" text-anchor="end" font-size="11.5" fill="#14202e">${H.esc(NAME[r.key] ?? r.key)}</text><rect x="${X(0)}" y="${y + 2}" width="${Math.max(2, X(r.ratio) - X(0))}" height="12" rx="2" fill="${out ? '#d98a00' : H.COLORS.blue}"/><text x="${X(r.ratio) + 5}" y="${y + 12}" font-size="10.5" fill="#14202e">${r.ratio.toFixed(2)}×</text>`; }).join('')
    + `<text x="${X(1)}" y="${Ht - 6}" text-anchor="middle" font-size="10" fill="#5b6b82">1× means the day was exactly the size the issue expected; the green band is half to one-and-a-half times</text></svg>`;
}

/** The recurring accountability feature. record = { line, score, date, history }; eod = { hook, right, wrong } (the stored review of the last call). */
export function accountabilityPage(record, eod, H) {
  const s = record?.score, wk = record?.week; if (!s && !wk && !eod?.hook) return '';
  const rows = s?.rows ?? [], out = rows.filter(r => r.ratio < 0.5 || r.ratio > 1.5), inBand = rows.length - out.length;
  const wide = out.filter(r => r.ratio > 1.5).map(r => `${NAME[r.key] ?? r.key} ${r.ratio.toFixed(1)}×`), quiet = out.filter(r => r.ratio < 0.5).map(r => `${NAME[r.key] ?? r.key} ${r.ratio.toFixed(1)}×`);
  const hist = (record?.history ?? []).slice(0, 6);
  const tested = "What the forecast tests: the issue prints how big each market's day should be, its usual high-to-low range from a forecast calibrated on past days. It makes no call on direction, so there is no direction to mark here. After the close the stored audit gives the real range, and the ratio of the two is scored.";
  const calib = s ? `The median market came in at ${s.median}× the expected size and ${s.pastShare}% ran past it. A calibrated forecast has the median near 1× and about half running past, so a single issue cannot show a bias; the running record below can.` : '';
  const right = [wk ? `${wk.withinShare}% of the ${wk.n} market-days this week landed inside half to one-and-a-half times the expected size.` : '', s ? `${inBand} of ${rows.length} markets landed inside half to one-and-a-half times the expected size, so for most of the board the size forecast was a fair ruler.` : '', ...asList(eod?.right).map(t => (wk && !s ? "Yesterday's call: " : '') + t)].filter(Boolean);
  const wrong = [out.length ? `${wide.length ? `Wider than expected: ${wide.join(', ')}. ` : ''}${quiet.length ? `Much quieter than expected: ${quiet.join(', ')}. ` : ''}A miss either way is the size forecast being off for that market that day.` : (s ? 'No market landed outside the band.' : wk ? `${100 - wk.withinShare}% of market-days landed outside the band, and the median was ${wk.median}× the expected size with ${wk.pastShare}% running past it.` : ''), ...asList(eod?.wrong).map(t => (wk && !s ? "Yesterday's call: " : '') + t)].filter(Boolean);
  const stat = (v, l) => `<div class="num">${v}<small>${H.esc(l)}</small></div>`;
  return `<div class="pg"><div class="mh"><b>Desk Atlas</b><span>The accountability page</span><span>${H.esc(record?.date ? 'Issue of ' + record.date : '')}</span></div>
<div class="kick">How we did</div><h2 class="sh" style="font-size:30px">${wk && !s ? "This week's calls, marked" : "Last issue's call, marked"}</h2>
<p class="sf" style="font-size:14.5px">${H.esc(tested)}</p>
${wk && !s ? `<div class="acctn">${stat(`${wk.withinShare}%`, `of ${wk.n} market-days inside the expected band`)}${stat(`${wk.median}×`, 'median against the expected size')}${stat(`${wk.pastShare}%`, 'ran past the expected size (about half is calibrated)')}</div>` : ''}${s ? `<div class="acctn">${stat(`${inBand} of ${rows.length}`, 'markets inside the expected band')}${stat(`${s.median}×`, 'median against the expected size')}${stat(`${s.pastShare}%`, 'ran past the expected size (about half is calibrated)')}</div>
<figure>${auditChart(rows, H)}<figcaption><b>Figure.</b> Each bar is one market: the real range divided by the range the issue expected. Orange bars landed outside half to one-and-a-half times. ${H.esc(calib)}</figcaption></figure>` : ''}
<div class="two"><div><h3 class="ss" style="color:#0f9f6e">What was right</h3>${right.map(x => `<p style="font-size:13.5px">${H.esc(x)}</p>`).join('')}</div>
<div><h3 class="ss" style="color:#d98a00">What was wrong</h3>${wrong.map(x => `<p style="font-size:13.5px">${H.esc(x)}</p>`).join('')}</div></div>
${hist.length > 1 ? `<h3 class="ss">The running record</h3><table class="tx"><tr><th>Issue</th><th>Median vs expected</th><th>Ran past it</th><th>Inside the band</th></tr>${hist.map(h => `<tr><td>${H.esc(h.date)}</td><td>${h.median}×</td><td>${h.pastShare}%</td><td>${h.withinShare}%</td></tr>`).join('')}</table>` : ''}
</div>`;
}

/** Compose the whole magazine page. All inputs are strings or plain data prepared by buildNewsletter. */
export function composeMagazine(c, H) {
  const { esc } = H, M = c.meta;
  const mh = (sec) => `<div class="mh"><b>Desk Atlas</b><span>${esc(sec)}</span><span>${esc(M.edition)}${M.tag ? ' · ' + esc(M.tag) : ''} · ${esc(M.date)}</span></div>`;
  const paras = (arr, lead = true) => (arr ?? []).filter(Boolean).map((p, i) => `<p${i === 0 && lead ? ' class="lead"' : ''}>${p.head ? `<b>${esc(p.head)}</b> ` : ''}${esc(typeof p === 'string' ? p : p.text)}</p>`).join('');
  const feature = c.feature;
  // page 1: the opening of the feature
  const p1 = `<div class="pg">${mh('The story')}
<div class="kick">${esc(M.regime)} regime · the investigation</div><h1 class="hd">${esc(feature.headline)}</h1>${feature.standfirst ? `<p class="sf"><span class="sfl">The desk's reading</span>${esc(feature.standfirst)}</p>` : ''}
<p class="by">By the Desk Atlas research desk · ${esc(M.date)} · every figure from the desk's own measured data</p>
<div class="split"><div class="cols">${paras(feature.opening)}${feature.pull ? `<div class="pq">“${esc(feature.pull)}”<small>The desk's reading, set against its counter-arguments in Exhibit 4</small></div>` : ''}${paras(feature.continued, false)}</div>
<aside class="side"><h4>At a glance</h4><span class="big">${esc(c.glance.broken)}<small>chain links broken of ${esc(c.glance.testable)} testable</small></span><span class="big">${esc(c.glance.stress)}<small>broad stress warnings on</small></span>${c.glance.next ? `<p><b>Next:</b> ${esc(c.glance.next)}</p>` : ''}<h4 style="margin-top:14px">Two kinds of alarm</h4>${c.alarms}</aside></div></div>`;
  // page 2: the yield decomposition, the first piece of evidence
  const p2 = c.yieldFig ? `<div class="pg">${mh('The evidence')}
<div class="kick">Exhibit 1</div><h2 class="sh">What the fall in yields is made of</h2>
<figure>${c.yieldFig}<figcaption><b>Figure 1.</b> The 10-year Treasury yield split into the real yield (what lenders want above inflation) and expected inflation, as moves in basis points over the last 20 days. ${esc(c.yieldCaption)}</figcaption></figure>
${(feature.evidence ?? []).length ? `<div class="cols">${paras(feature.evidence, false)}</div>` : ''}
${c.textbook ? `<div class="keep"><h3 class="ss">Textbook against today</h3>${c.textbook}</div>` : ''}</div>` : '';
  // page 3: the signature spread, landscape in print
  const p3 = c.chainFig ? `<div class="pg land">${mh('The chain of impact')}
<div class="kick">Exhibit 2 · the signature view</div><h2 class="sh">Where the textbook is not working</h2>
<p class="sf" style="font-size:15px">${esc(c.chainLead)}</p>
<figure class="chain-fig">${c.chainFig}<figcaption><b>Figure 2.</b> Each box is a market; each arrow a textbook link from cause to effect, judged on the last 20 days at both ends. Green flows the textbook way, grey has an end inside its noise floor, and orange did not hold. The numbered markers are the broken links; each is drawn and explained on the next page, in the context of the story.</figcaption></figure></div>` : '';
  // page 4: the broken relationships, drawn
  const p4 = c.relationFigs ? `<div class="pg">${mh('The evidence')}
<div class="kick">Exhibit 3</div><h2 class="sh">Four relationships that did not hold</h2>
<p class="sf" style="font-size:15px">${esc(c.relationLead)}</p>
<div class="fig2">${c.relationFigs}</div>${c.relationFoot}</div>` : '';
  // page 5: competing explanations
  const p5 = c.theories ? `<div class="pg p5">${mh('Competing explanations')}
<div class="kick">Exhibit 4 · hypotheses, not conclusions</div><h2 class="sh">Four ways to read the same move</h2>
<p class="sf" style="font-size:14.5px">${esc(c.theoryLead)}</p>
<figure>${c.matrix}<figcaption><b>Figure 3.</b> ✓ the day's moves agree with the check, ✗ they do not, · the check does not apply to that story. Counts are agreeing checks, not probabilities or independent proof.</figcaption></figure>
<div class="cols">${c.theories}</div></div>` : '';
  // page 6: what to watch
  const p6 = (c.watch || c.theoryCaution) ? `<div class="pg">${mh('What to watch')}
${c.theoryCaution ? `<div class="box" style="margin-top:0"><h4>How to hold the four readings</h4><p>${esc(c.theoryCaution)}</p></div>` : ''}
${c.watch ? `<div class="kick" style="margin-top:14px">The next test</div><h2 class="sh">What would change the story</h2><div class="two">${c.watch}</div>` : ''}${c.lessonBox ? `<div class="box"><h4>Today's lesson</h4>${c.lessonBox}</div>` : ''}${M.edition === 'Weekly' ? '' : c.aheadHtml}</div>` : '';
  const pAhead = M.edition === 'Weekly' && (c.aheadHtml || c.weekRanges) ? `<div class="pg">${mh('The week ahead')}${c.aheadHtml}${c.weekRanges ?? ''}</div>` : '';
  const p7 = c.accountability;
  // data desk
  const desk = `<div class="pg desk"><div class="deskhd"><div class="kick">The Data Desk</div><h2>Market monitor and reference</h2><p>Everything behind the story: the signals, the currencies, every market, and the detail tables. Read it when you want the depth.</p></div>${c.desk}</div>`;
  const back = (c.qod || c.refs) ? `<div class="pg">${mh('Back page')}${c.qod ?? ''}${c.refs ?? ''}</div>` : '';
  return `<div class="mg">${p1}${p2}${p3}${p4}${p5}${p6}${pAhead}${p7}${desk}${back}</div>`;
}
