/**
 * NEWSLETTER — the daily issue, built from the rows Desk Atlas already shows.
 *
 *   buildNewsletter(input) → { subject, preheader, html, text }
 *
 * The html is ONE self-contained file: inline CSS, inline SVG graphics, no scripts, no external requests, so it can be
 * downloaded, attached, printed to PDF or forwarded and look the same everywhere. The graphics are drawn from the day's own
 * numbers (sparklines, the plumbing diagram, range bars, strength bars, probability bars) under one fixed, stored banner. No model call draws anything.
 *
 * What it will not do: forecast direction. This desk's own tests say direction claims do not survive, so every
 * "what to expect" line is a size, a schedule, a calibrated probability, or a trigger. The footer says "not financial advice"
 * in plain words and cannot be switched off — there is no option that removes it.
 *
 * Pure: no DOM, no fetch. Atlas assembles the input; tests feed it fixtures.
 */

export const DISCLAIMER = [
  'NOT FINANCIAL ADVICE. This is a private, informational and educational summary of market data and analysis from a personal research tool. It is not investment advice, a recommendation, or an offer or solicitation to buy or sell any instrument, and it takes no account of anyone\'s objectives, finances or needs.',
  'Trading leveraged products (FX, CFDs, indices, commodities, crypto) carries a high risk of losing money quickly, including more than you deposited. Past performance, backtests and statistical base rates do not guarantee future results. This issue makes no direction forecasts, because direction claims have not survived testing here.',
  'Parts of this issue are written by AI language models from the data shown and can contain errors, omissions or confident-sounding mistakes. Figures come from third-party feeds that can be delayed, revised or wrong. Check anything that matters at the source, do your own research, and take independent professional advice before acting. Private use only; please do not forward.',
];

// What a release family has been measured to do to the day's range, on the pairs where it was measured. Kept in step with
// EVENT_RANGE_EFFECT in today.html (pre-registered 2026-09-17, MARKET_SENSE_TESTS.md S7): size, never direction.
export const RANGE_EFFECT = {
  'rate decision': { EURUSD: '+0.38 ATR on the day (+0.51 on big surprises)', USDJPY: '+0.24 on the day', GBPUSD: '+0.38 the session after', AUDUSD: '+0.13 on the day' },
  employment: { EURUSD: '+0.17 on the day (big surprises)', USDJPY: '+0.16 the session after', AUDUSD: '+0.12 on the day', USDCAD: '+0.12 on the day' },
  cpi: { EURUSD: '+0.16 the session after', GBPUSD: '+0.17 on the day', AUDUSD: '+0.14 on the day (big surprises)', USDCAD: '+0.14 the session after' },
  gdp: { EURUSD: '+0.14 on the day', USDCAD: '+0.26 on the day (big surprises)' },
  pmi: { USDJPY: '+0.21 on the day (big surprises)' },
  'retail sales': { GBPUSD: '+0.11 on the day', AUDUSD: '+0.12 on the day' },
};
const FAMILY_RE = [['cpi', /\bcpi\b|consumer price|inflation rate/i], ['employment', /non-farm|nonfarm|payroll|unemployment|jobless|claims|employment change/i], ['gdp', /\bgdp\b/i], ['rate decision', /rate decision|cash rate|official bank rate|federal funds|interest rate|policy rate|refinancing/i], ['pmi', /\bpmi\b|ism /i], ['retail sales', /retail sales/i]];
export const familyOf = event => FAMILY_RE.find(([, re]) => re.test(event ?? ''))?.[0] ?? null;

/**
 * What a scheduled release is measured to do. `book` is js/eventImpactMap.js's eventImpactFor() result (or null);
 * `instrumentKeys` are the instruments the page carries, to say which ones the currency touches.
 */
export function eventNote(e, book, instrumentKeys = []) {
  const family = familyOf(e.event), pairs = e.ccy ? instrumentKeys.filter(k => /^[A-Z]{6}$/.test(k) && k.includes(e.ccy)) : [];
  let bookText = null;
  if (book?.instruments) {
    const top = Object.entries(book.instruments).filter(([, v]) => v?.spike >= 1.5).sort((a, b) => b[1].spike - a[1].spike).slice(0, 2);
    if (top.length) bookText = top.map(([k, v]) => `${k.replace(/^(.{3})(.{3})$/, '$1/$2')} moved ${v.spike}× an ordinary half-hour in the first 30 minutes (next day ${v.next}×, n=${v.n})`).join('; ');
  }
  const eff = family ? Object.entries(RANGE_EFFECT[family] ?? {}).filter(([k]) => !pairs.length || pairs.includes(k)).slice(0, 2).map(([k, v]) => `${k.replace(/^(.{3})(.{3})$/, '$1/$2')} range ${v}`).join('; ') : '';
  return { family, book: bookText, range: eff || null, pairs: pairs.slice(0, 6), measured: !!(bookText || eff) };
}

/* ── helpers ── */
const esc = s => (s ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sg = (v, d = 2) => (v == null || !Number.isFinite(v) ? '·' : (v >= 0 ? '+' : '') + v.toFixed(d));
const ord = n => { n = Math.round(n); const m = n % 100; return n + (m >= 11 && m <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')); };
/** Cut at the last full sentence that fits, so a long model line never ends mid-thought. */
const clipS = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const cut = s.slice(0, n), i = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; ')); return i > n * 0.4 ? cut.slice(0, i + 1) : clip(s, n); };
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
const ukTime = ms => new Date(ms).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

/** Small drawn flags (simplified) so every currency has a flag on any machine. */
const _fl = (w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20" width="${w}" height="${h}" role="img" style="border-radius:3px;flex:none;box-shadow:0 0 0 1px rgba(0,0,0,.18)">${inner}</svg>`;
export function flagSvg(ccy, w = 36, h = 24) {
  const R = '#c8102e', B = '#012169', W = '#fff';
  const star = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${W}"/>`;
  const F = {
    USD: `<rect width="30" height="20" fill="${W}"/>${[0, 2, 4, 6, 8, 10, 12].map(i => `<rect y="${(i * 20 / 13).toFixed(2)}" width="30" height="${(20 / 13).toFixed(2)}" fill="${R}"/>`).join('')}<rect width="13" height="10.8" fill="#3c3b6e"/>${[2, 5, 8, 11].flatMap(x => [2, 5, 8].map(y => `<circle cx="${x}" cy="${y}" r=".6" fill="${W}"/>`)).join('')}`,
    EUR: `<rect width="30" height="20" fill="#003399"/>${Array.from({ length: 12 }, (_, i) => `<circle cx="${15 + 6 * Math.cos(i * Math.PI / 6)}" cy="${10 + 6 * Math.sin(i * Math.PI / 6)}" r="1" fill="#ffcc00"/>`).join('')}`,
    GBP: `<rect width="30" height="20" fill="${B}"/><path d="M0 0L30 20M30 0L0 20" stroke="${W}" stroke-width="4"/><path d="M0 0L30 20M30 0L0 20" stroke="${R}" stroke-width="1.5"/><path d="M15 0V20M0 10H30" stroke="${W}" stroke-width="6"/><path d="M15 0V20M0 10H30" stroke="${R}" stroke-width="3.4"/>`,
    JPY: `<rect width="30" height="20" fill="${W}"/><circle cx="15" cy="10" r="5.6" fill="#bc002d"/>`,
    AUD: `<rect width="30" height="20" fill="#00008b"/><rect width="15" height="10" fill="${B}"/><path d="M0 0L15 10M15 0L0 10" stroke="${W}" stroke-width="2"/><path d="M7.5 0V10M0 5H15" stroke="${W}" stroke-width="3"/><path d="M7.5 0V10M0 5H15" stroke="${R}" stroke-width="1.6"/>${star(7.5, 15, 1.7)}${star(22, 5, 1.2)}${star(25, 9, 1.2)}${star(22, 15, 1.2)}${star(19, 9.5, 1.2)}`,
    NZD: `<rect width="30" height="20" fill="#00247d"/><rect width="15" height="10" fill="${B}"/><path d="M0 0L15 10M15 0L0 10" stroke="${W}" stroke-width="2"/><path d="M7.5 0V10M0 5H15" stroke="${W}" stroke-width="3"/><path d="M7.5 0V10M0 5H15" stroke="${R}" stroke-width="1.6"/>${[[22, 5], [25, 9], [22, 15], [19, 10]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="${R}" stroke="${W}" stroke-width=".5"/>`).join('')}`,
    CAD: `<rect width="30" height="20" fill="${W}"/><rect width="7.5" height="20" fill="#d52b1e"/><rect x="22.5" width="7.5" height="20" fill="#d52b1e"/><path d="M15 4.5L16.6 8.2L19 7.4L17.6 11.2H12.4L11 7.4L13.4 8.2Z" fill="#d52b1e"/><rect x="14.6" y="11" width=".8" height="3" fill="#d52b1e"/>`,
    CHF: `<rect width="30" height="20" fill="#d52b1e"/><rect x="13" y="4.5" width="4" height="11" fill="${W}"/><rect x="9.5" y="8" width="11" height="4" fill="${W}"/>`,
  };
  return F[ccy] ? _fl(w, h, F[ccy]) : `<span class="ccytag">${esc(ccy)}</span>`;
}
/** An icon per market: two flags for an FX pair, bars for an index, a bar of gold, a coin for Bitcoin. */
export function assetIcon(key, label) {
  const k = String(key ?? '').toUpperCase(), m = /^([A-Z]{3})\/([A-Z]{3})$/.exec(label ?? '');
  const tile = inner => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 28" width="40" height="30" aria-hidden="true" style="flex:none"><rect width="36" height="28" rx="7" fill="#eef2fb"/>${inner}</svg>`;
  if (m) return `<span class="pairflags">${flagSvg(m[1], 28, 19)}${flagSvg(m[2], 28, 19)}</span>`;
  if (k === 'GOLD' || k === 'XAUUSD') return tile(`<path d="M8 19l3-8h14l3 8z" fill="#e0a800"/><path d="M11 11h14l-1.5 3H12.5z" fill="#ffd34d"/>`);
  if (k === 'BTCUSD') return tile(`<circle cx="18" cy="14" r="8.5" fill="#f7931a"/><text x="18" y="18.4" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="Segoe UI,Arial,sans-serif">B</text>`);
  return tile(`<rect x="8" y="16" width="4" height="6" rx="1" fill="#7a5cff"/><rect x="14" y="12" width="4" height="10" rx="1" fill="#2f6bff"/><rect x="20" y="8" width="4" height="14" rx="1" fill="#2f6bff"/><polyline points="8,13 15,9 21,11 28,5" fill="none" stroke="#0f9f6e" stroke-width="1.8" stroke-linecap="round"/>`);
}
const CCY_NAME = { USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', JPY: 'Japanese Yen', AUD: 'Australian Dollar', NZD: 'New Zealand Dollar', CAD: 'Canadian Dollar', CHF: 'Swiss Franc' };
const CCY_BANK = { USD: 'Fed', EUR: 'ECB', GBP: 'Bank of England', JPY: 'Bank of Japan', AUD: 'RBA', NZD: 'RBNZ', CAD: 'Bank of Canada', CHF: 'SNB' };

const COLORS = { ink: '#0b1220', text: '#1b2a41', muted: '#5b6b82', line: '#d8e0ec', paper: '#eef2f8', card: '#ffffff', blue: '#2f6bff', violet: '#7a5cff', green: '#0f9f6e', orange: '#e8710a', amber: '#b7791f' };
const FLAG = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', AUD: '🇦🇺', NZD: '🇳🇿', CAD: '🇨🇦', CHF: '🇨🇭' };

const PALETTE = { 'RISK-ON': ['#04231f', '#0f9f6e', '#2f6bff'], 'RISK-OFF': ['#27100a', '#e8710a', '#c2410c'], MIXED: ['#0a1233', '#7a5cff', '#2f6bff'], TRANSITION: ['#101a33', '#b7791f', '#7a5cff'] };

/** The stored banner: drawn once, identical every day. Three tiers of the page as a picture: the globe (global), linked
 *  country nodes (country), and a small price line (pair). No data, no model call. */
export const BANNER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 160" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" aria-hidden="true"><defs><linearGradient id="nb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a1233"/><stop offset="1" stop-color="#14306b"/></linearGradient><radialGradient id="ng" cx=".78" cy=".45" r=".6"><stop offset="0" stop-color="#2f6bff" stop-opacity=".5"/><stop offset="1" stop-color="#2f6bff" stop-opacity="0"/></radialGradient></defs><rect width="680" height="160" fill="url(#nb)"/><rect width="680" height="160" fill="url(#ng)"/><g fill="none" stroke="#fff" stroke-opacity=".07"><line x1="0" y1="40" x2="680" y2="40"/><line x1="0" y1="80" x2="680" y2="80"/><line x1="0" y1="120" x2="680" y2="120"/></g><g fill="none" stroke="#7fb0ff" stroke-opacity=".55" stroke-width="1.4"><circle cx="470" cy="80" r="62"/><ellipse cx="470" cy="80" rx="24" ry="62"/><ellipse cx="470" cy="80" rx="46" ry="62"/><line x1="408" y1="80" x2="532" y2="80"/><path d="M416 52 Q470 64 524 52"/><path d="M416 108 Q470 96 524 108"/></g><g stroke="#9ad0ff" stroke-opacity=".6" stroke-width="1.2" fill="none"><polyline points="440,56 478,70 506,50 520,86 492,108 452,100 440,56"/><line x1="478" y1="70" x2="492" y2="108"/></g><g fill="#fff"><circle cx="440" cy="56" r="3.4"/><circle cx="478" cy="70" r="4.4"/><circle cx="506" cy="50" r="3.4"/><circle cx="520" cy="86" r="3.4"/><circle cx="492" cy="108" r="3.4"/><circle cx="452" cy="100" r="3.4"/></g><g fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="560,118 578,104 594,112 612,86 628,94 646,66 664,72" stroke="#3ddc97" stroke-width="2.6"/><polyline points="560,128 580,120 598,124 616,108 634,112 650,92 664,96" stroke="#fff" stroke-opacity=".3" stroke-width="1.6"/></g><circle cx="664" cy="72" r="4" fill="#3ddc97"/></svg>`;
export const sparkSvg = (arr, col, w = 92, h = 28) => {
  const a = (arr ?? []).filter(Number.isFinite); if (a.length < 3) return '';
  const mn = Math.min(...a), mx = Math.max(...a), d = (mx - mn) || 1, pts = a.map((v, i) => `${(i * (w - 4) / (a.length - 1) + 2).toFixed(1)},${(h - 4 - ((v - mn) / d) * (h - 8)).toFixed(1)}`);
  const last = pts[pts.length - 1].split(',');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="${col}"/></svg>`;
};
function dialSvg(active, total) {
  const cx = 70, cy = 66, r = 50, pol = (rr, deg) => { const a = (deg - 90) * Math.PI / 180; return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; };
  const arc = (a0, a1, col) => { const p0 = pol(r, a0), p1 = pol(r, a1); return `<path d="M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${r} ${r} 0 0 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}" stroke="${col}" stroke-width="10" fill="none" stroke-linecap="round"/>`; };
  const np = pol(r - 12, -90 + (total ? active / total : 0) * 180);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 84" width="140" height="84" role="img" aria-label="${active} of ${total} risk flags active">${arc(-90, -32, COLORS.green)}${arc(-26, 26, COLORS.amber)}${arc(32, 90, COLORS.orange)}<line x1="${cx}" y1="${cy}" x2="${np[0].toFixed(1)}" y2="${np[1].toFixed(1)}" stroke="${COLORS.ink}" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="5" fill="${COLORS.ink}"/><text x="${cx}" y="${cy - 18}" text-anchor="middle" font-size="18" font-weight="700" fill="${COLORS.ink}" font-family="Segoe UI,system-ui,sans-serif">${active}/${total}</text></svg>`;
}
/** Signed horizontal bars as HTML/CSS (robust in print and in any viewer). */
function bars(rows, { max = 1, fmt = v => sg(v) } = {}) {
  return rows.map(r => { const v = r.v, w = v == null ? 0 : Math.min(50, Math.abs(v) / max * 50), col = v == null ? COLORS.line : v >= 0 ? COLORS.green : COLORS.orange;
    return `<div class="br"><span class="bl">${esc(r.label)}</span><span class="bt"><i class="mid"></i><i class="fill" style="${v >= 0 ? 'left:50%' : 'right:50%'};width:${w}%;background:${col}"></i></span><span class="bv">${v == null ? 'no data' : esc(r.text ?? fmt(v))}</span></div>`; }).join('');
}
const pctBars = rows => rows.map(r => `<div class="br p"><span class="bl">${esc(r.label)}</span><span class="bt"><i class="fill" style="left:0;width:${Math.max(0, Math.min(100, r.p))}%;background:${r.color ?? COLORS.blue}"></i></span><span class="bv">${esc(r.text ?? r.p + '%')}</span></div>`).join('');
const sec = (title, kicker, body) => (body ? `<section><h2><small>${esc(kicker)}</small>${esc(title)}</h2>${body}</section>` : '');
const pill = (t, cls = '') => `<span class="pill ${cls}">${esc(t)}</span>`;
const para = arr => (arr ?? []).filter(Boolean).map(l => `<p>${esc(l)}</p>`).join('');

/** The plumbing diagram: four stages joined by pipes, drawn as SVG. */
function plumbingSvg(stages) {
  if (!stages?.length) return '';
  const W = 680, bw = 150, gap = (W - bw * 4) / 3, H = 128, icons = ['▥', '≋', '⌁', '◖'];
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Bonds, credit, FX and equities as a plumbing system">`;
  stages.slice(0, 4).forEach((s, i) => { const x = i * (bw + gap);
    if (i < 3) o += `<rect x="${x + bw}" y="${H / 2 - 5}" width="${gap}" height="10" rx="5" fill="${COLORS.line}"/><rect x="${x + bw + 3}" y="${H / 2 - 2}" width="${gap - 6}" height="4" rx="2" fill="${COLORS.blue}" fill-opacity=".55"/>`;
    o += `<rect x="${x}" y="2" width="${bw}" height="${H - 4}" rx="12" fill="#fff" stroke="${COLORS.line}"/><text x="${x + 12}" y="26" font-size="14" font-weight="700" fill="${COLORS.ink}" font-family="Segoe UI,system-ui,sans-serif">${icons[i]} ${esc(s.n)}</text><text x="${x + 12}" y="41" font-size="10" fill="${COLORS.muted}" font-family="Segoe UI,system-ui,sans-serif">${esc(s.m)}</text>`;
    (s.rows ?? []).slice(0, 3).forEach((r, k) => { const col = r[3] === 'up' ? COLORS.green : r[3] === 'dn' ? COLORS.orange : COLORS.text;
      o += `<text x="${x + 12}" y="${64 + k * 20}" font-size="10.5" fill="${COLORS.muted}" font-family="Segoe UI,system-ui,sans-serif">${esc(clip(r[0], 14))}</text><text x="${x + bw - 12}" y="${64 + k * 20}" text-anchor="end" font-size="11.5" font-weight="600" fill="${col}" font-family="ui-monospace,Menlo,Consolas,monospace">${esc(r[1])}${r[2] ? ' ' + esc(r[2]) : ''}</text>`; });
  });
  return o + '</svg>';
}

const CSS = `
.ccg2,.pcg{display:grid;grid-template-columns:repeat(auto-fill,minmax(285px,1fr));gap:10px}.cc2,.pc{border:1px solid ${COLORS.line};border-radius:14px;padding:12px 14px;background:${COLORS.card}}.cc2 .h,.pc .h{display:flex;align-items:center;gap:10px;margin-bottom:8px}.cc2 .t,.pc .t{flex:1;min-width:0}.cc2 .t b,.pc .t b{display:block;font-size:17px;line-height:1.1}.cc2 .t small,.pc .t small{display:block;color:${COLORS.muted};font-size:11.5px;margin-top:2px}.cc2 p,.pc p{margin:6px 0 0;font-size:13.5px;line-height:1.5}.pc .rb{margin:6px 0 3px}.chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.chips span{font-size:11.5px;padding:3px 8px;border-radius:999px;background:${COLORS.paper};border:1px solid ${COLORS.line};color:${COLORS.text}}.pairflags{display:flex;flex:none}.pairflags svg+svg{margin-left:-8px}.ccytag{font-weight:700}
.chain{display:grid;gap:4px;margin-top:6px}.cl{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:6px 8px;border-radius:10px;background:${COLORS.paper}}.cl.quiet{opacity:.7}.cl .nd{font-weight:600;font-size:13px}.cl .nd small{display:block;font-weight:400;color:${COLORS.muted};font-size:11.5px}.cl .ar{text-align:center;font-size:15px;line-height:1}.cl .ar em{display:block;font-style:normal;font-size:10.5px;font-weight:600;letter-spacing:.02em;margin-top:2px}.chr{margin:-2px 0 4px 10px}
.ccg{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}.cc{border:1px solid ${COLORS.line};border-radius:12px;padding:9px 11px;background:${COLORS.card}}.cc .h{display:flex;justify-content:space-between;gap:8px;font-size:13px}.cc ul{margin:6px 0 0;padding-left:16px;font-size:12.5px;color:${COLORS.text}}.cc li{margin-bottom:2px}.pairs td{vertical-align:top}.pairs small{display:block;color:${COLORS.muted};font-size:11.5px}
*{box-sizing:border-box}body{margin:0;background:${COLORS.paper};color:${COLORS.text};font:15px/1.6 "Segoe UI",system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%}
.wrap{max-width:700px;margin:0 auto;padding:16px 14px 40px}
a{color:${COLORS.blue}}
.mast{position:relative;border-radius:18px;overflow:hidden;color:#fff;min-height:190px;background:${COLORS.ink}}
.mast .art{position:absolute;inset:0}.mast .scrim{position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,10,25,.78),rgba(5,10,25,.18))}
.mast .in{position:relative;padding:22px 22px 24px}.mast .brand{font:700 12px/1 "Segoe UI",sans-serif;letter-spacing:.18em;text-transform:uppercase;opacity:.9}
.mast .date{font:12px ui-monospace,Menlo,Consolas,monospace;opacity:.75;margin-top:6px}
.mast h1{font:700 clamp(22px,4.6vw,30px)/1.18 "Segoe UI",system-ui,sans-serif;margin:16px 0 0;max-width:30ch;letter-spacing:-.01em}
.mast .tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px}
.pill{display:inline-block;border-radius:999px;padding:2px 10px;font:600 11px/1.6 "Segoe UI",sans-serif;background:rgba(120,140,170,.16);color:${COLORS.muted};white-space:nowrap}
.mast .pill{background:rgba(255,255,255,.16);color:#fff}
.pill.g{background:rgba(15,159,110,.14);color:${COLORS.green}}.pill.o{background:rgba(232,113,10,.14);color:${COLORS.orange}}.pill.a{background:rgba(183,121,31,.15);color:${COLORS.amber}}.pill.b{background:rgba(47,107,255,.12);color:${COLORS.blue}}.pill.v{background:rgba(122,92,255,.13);color:${COLORS.violet}}
section{background:${COLORS.card};border:1px solid ${COLORS.line};border-radius:16px;padding:16px 18px;margin-top:14px}
section h2{margin:0 0 10px;font:700 19px/1.25 "Segoe UI",system-ui,sans-serif;color:${COLORS.ink};letter-spacing:-.01em}section h2 small{display:block;font:700 10.5px/1.4 "Segoe UI",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:${COLORS.violet};margin-bottom:3px}
h3{margin:16px 0 6px;font:700 11px/1.4 "Segoe UI",sans-serif;letter-spacing:.1em;text-transform:uppercase;color:${COLORS.muted}}
p{margin:0 0 9px}.muted{color:${COLORS.muted}}.small{font-size:12.5px}
.tense{display:grid;gap:10px}.tense>div{border-radius:12px;padding:10px 12px;background:${COLORS.paper};border-left:4px solid ${COLORS.line}}.tense .b{border-left-color:${COLORS.violet}}.tense .n{border-left-color:${COLORS.blue}}.tense .a{border-left-color:${COLORS.amber}}
.tense b{display:block;font:700 10.5px "Segoe UI",sans-serif;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px;color:${COLORS.muted}}.tense p{margin:0 0 6px;font-size:14px}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.tile{background:${COLORS.paper};border-radius:12px;padding:9px 11px}.tile .k{font:700 10px "Segoe UI",sans-serif;letter-spacing:.1em;text-transform:uppercase;color:${COLORS.muted}}.tile .v{font:700 20px/1.2 "Segoe UI",sans-serif;color:${COLORS.ink}}.tile .d{font:11px ui-monospace,Menlo,Consolas,monospace}
.up{color:${COLORS.green}}.dn{color:${COLORS.orange}}
.strip{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:10px}
.links{display:grid;gap:6px;margin-top:8px}.lk{display:grid;grid-template-columns:auto 1fr;gap:9px;align-items:start;font-size:13px;padding:7px 9px;border-radius:10px;background:${COLORS.paper}}.lk small{display:block;color:${COLORS.muted};font-size:11.5px}
table{width:100%;border-collapse:collapse;font-size:13px}th{font:700 10px "Segoe UI",sans-serif;letter-spacing:.1em;text-transform:uppercase;color:${COLORS.muted};text-align:left;padding:4px 6px;border-bottom:1px solid ${COLORS.line}}td{padding:7px 6px;border-bottom:1px solid #eaeff6;vertical-align:top}td.n{font-family:ui-monospace,Menlo,Consolas,monospace;white-space:nowrap}
.ev td:first-child{white-space:nowrap;font:12px ui-monospace,Menlo,Consolas,monospace;color:${COLORS.muted}}.ev small{display:block;color:${COLORS.muted};font-size:11.5px;line-height:1.45;margin-top:2px}
.rb{position:relative;height:9px;border-radius:5px;background:#e6ecf5;min-width:90px}.rb i{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:linear-gradient(90deg,${COLORS.blue},${COLORS.violet})}.rb u{position:absolute;top:-3px;bottom:-3px;width:2px;background:${COLORS.ink};left:66.7%;text-decoration:none}
.br{display:grid;grid-template-columns:96px 1fr 128px;gap:8px;align-items:center;font-size:12.5px;margin:5px 0}.br.p{grid-template-columns:150px 1fr 56px}.bl{color:${COLORS.muted}}.bt{position:relative;height:9px;border-radius:5px;background:#e6ecf5}.bt .fill{position:absolute;top:0;bottom:0;border-radius:5px}.bt .mid{position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:${COLORS.muted};opacity:.5}.br.p .bt .mid{display:none}.bv{font:12px ui-monospace,Menlo,Consolas,monospace;text-align:right}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.card2{background:${COLORS.paper};border-radius:12px;padding:10px 12px}.card2 b{display:block;margin-bottom:3px}
.lesson{background:linear-gradient(135deg,rgba(47,107,255,.10),rgba(122,92,255,.10));border:1px solid rgba(47,107,255,.35);border-radius:14px;padding:13px 15px}.lesson b{color:${COLORS.blue}}
ul.t{margin:0;padding-left:18px}ul.t li{margin:0 0 7px}
.foot{margin-top:18px;border:2px solid ${COLORS.ink};border-radius:14px;padding:14px 16px;background:#fff;font-size:12px;line-height:1.55;color:${COLORS.text}}.foot h4{margin:0 0 6px;font:800 13px "Segoe UI",sans-serif;letter-spacing:.06em;color:${COLORS.ink}}.foot p{margin:0 0 7px}.foot .meta{color:${COLORS.muted};font:11px ui-monospace,Menlo,Consolas,monospace;margin-top:10px}
@media (max-width:560px){.tiles{grid-template-columns:repeat(2,1fr)}.two{grid-template-columns:1fr}.br{grid-template-columns:70px 1fr 104px}.br.p{grid-template-columns:96px 1fr 50px}}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{size:A4;margin:12mm}@media print{body{background:#fff}.foot,.mast,.cc,.card2,.lk,tr,.tile{break-inside:avoid}h2,h3{break-after:avoid}.wrap{padding:0}}
`;

/**
 * input: see the header comment of newsletter.test.mjs for a full example. Everything is optional except `date`; a missing
 * section is left out rather than filled with placeholder text.
 */
export function buildNewsletter(n) {
  const a = n.brief ?? {}, letter = a.letter ?? {}, headline = n.headline ?? a.headline ?? 'Desk Atlas Daily';
  const subject = clip(letter.subject || headline, 78), regimeWord = String(n.regimeWord ?? a.regime ?? 'MIXED').toUpperCase();
  const opening = letter.opening || a.driver?.[0]?.explain || a.driver?.[0]?.what || '';
  const preheader = clip(opening || headline, 140);
  const art = `<div class="art">${BANNER_SVG}</div>`;
  const llm = n.llm?.provider ? `${n.llm.label ?? n.llm.provider} (${n.llm.model ?? ''})` : null;

  const mast = `<div class="mast">${art}<div class="scrim"></div><div class="in"><div class="brand">Desk Atlas · Daily</div><div class="date">${esc(n.date)}</div><h1>${esc(headline)}</h1><div class="tags">${pill(regimeWord)}${n.riskFlags ? pill(`${n.riskFlags.active}/${n.riskFlags.total} stress warnings`) : ''}${n.generatedAt ? pill('written ' + new Date(n.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) + ' UK') : ''}</div></div></div>`;

  const letterSec = (opening || n.position) ? `<section><div style="font-size:16.5px;line-height:1.65;color:${COLORS.ink}">${opening ? `<p>${esc(opening)}</p>` : ''}</div>${n.position ? `<div class="tense"><div class="b"><b>Yesterday and before</b>${para((n.position.behind ?? []).slice(0, 2))}</div><div class="n"><b>Today</b>${para((n.position.right ?? []).slice(0, 2))}</div><div class="a"><b>Coming up</b>${para((n.position.ahead ?? []).slice(0, 2))}</div></div>` : ''}${letter.signoff ? `<p class="muted small" style="margin-top:10px">${esc(letter.signoff)}</p>` : ''}</section>` : '';

  const tiles = n.tiles?.length ? sec('The numbers', 'Part 1 · The world', `<div class="tiles">${n.tiles.map(t => `<div class="tile"><div class="k">${esc(t.name)}</div><div class="v">${esc(t.value)}</div><div class="d ${t.tone ?? ''}">${esc(t.sub)}</div>${sparkSvg(t.spark, t.tone === 'dn' ? COLORS.orange : t.tone === 'up' ? COLORS.green : COLORS.blue)}</div>`).join('')}</div>${n.riskFlags ? `<div class="strip">${dialSvg(n.riskFlags.active, n.riskFlags.total)}<div class="small muted" style="max-width:46ch">${n.riskFlags.active === 0 ? 'No stress warnings are on: markets are calm and borrowing costs are not jumping.' : `${n.riskFlags.active} of ${n.riskFlags.total} stress warnings are on.`} Stress tends to mean bigger daily swings, not a particular direction.</div></div>` : ''}`) : '';

  const drivers = (a.driver ?? []).slice(0, 2).map(d => `<div class="card2" style="margin-bottom:8px"><b>${esc(d.what)}</b><p class="small muted" style="margin:0 0 4px">${esc(d.evidence)}</p>${d.explain ? `<p class="small" style="margin:0">${esc(d.explain)}</p>` : ''}</div>`).join('');
  // The chain of impact: the textbook links in causal order, each one coloured by whether the market is behaving as the textbook says.
  const chainRows = (n.links ?? []).filter(l => l.verdict !== 'unmeasured').slice(0, 9);
  const VCOL = { holding: COLORS.green, broken: COLORS.orange, quiet: COLORS.muted };
  const chain = chainRows.length ? `<h3>The chain of impact</h3><div class="chain">${chainRows.map(l => { const c = VCOL[l.verdict] ?? COLORS.muted, word = l.verdict === 'holding' ? 'working as expected' : l.verdict === 'broken' ? 'not behaving' : 'too small to judge'; return `<div class="cl ${l.verdict}"><span class="nd">${esc(l.a.label)}<small>${esc(l.a.text)}</small></span><span class="ar" style="color:${c}">&#9654;<em>${word}</em></span><span class="nd">${esc(l.b.label)}<small>${esc(l.b.text)}</small></span></div>${l.verdict === 'broken' && l.read ? `<p class="small muted chr">${esc(clip(l.read, 150))}</p>` : ''}`; }).join('')}</div><p class="small muted">Read it top to bottom: each row is "if this moves, that should follow". Green means the market is doing what the textbook says. Orange means both moved the wrong way round, and the mismatch is the story.</p>` : '';
  const driving = (drivers || chain || n.stages) ? sec('What is moving markets', 'Part 1 · The world', `${drivers}${n.stages ? `<h3>Where the money is flowing</h3>${plumbingSvg(n.stages)}` : ''}${chain}`) : '';

  const evAll = n.events ?? [];
  const evShow = evAll.filter(e => e.impact === 'high' || e.impact === 'medium').slice(0, 6);
  const evRows = evShow.map(e => { const note = e.note ?? {}; return `<tr><td>${esc(ukTime(e.ms))}</td><td><b>${e.ccy ? (FLAG[e.ccy] ?? '') + ' ' : ''}${esc(e.event)}</b> ${pill(e.impact === 'high' ? 'big one' : 'medium', e.impact === 'high' ? 'a' : '')}<small>${e.estimate ? 'forecast ' + esc(e.estimate) : 'no forecast listed'}${e.prev ? ', last time ' + esc(e.prev) : ''}</small>${note.measured ? `<small><b style="color:${COLORS.ink}">History:</b> ${esc([note.book, note.range].filter(Boolean).join(' · '))}.</small>` : ''}</td></tr>`; }).join('');
  const ahead = evRows ? sec('The big releases coming up', 'Part 1 · The world', `<table class="ev">${evRows}</table><p class="small muted">UK time. "History" means we found this release moves that market by more than a normal day. Where it is blank, nothing unusual has been found. Nobody can tell in advance which way a surprise will push the price, so we do not try.</p>`) : '';

  // Part 2: each currency, as a card
  const strMap = Object.fromEntries((n.strengths ?? []).map(s => [s.ccy, s.score]));
  const cbMap = Object.fromEntries((n.cb ?? []).map(c => [c.ccy ?? c.bank, c])), surMap = Object.fromEntries((n.surprise ?? []).map(x => [x.ccy, x.score])), crMap = Object.fromEntries((n.crowding ?? []).map(c => [c.sym, c]));
  const nextFor = ccy => evAll.find(e => e.ccy === ccy && (e.impact === 'high' || e.impact === 'medium'));
  const moveWord = v => (v == null ? '' : Math.abs(v) < 0.1 ? 'flat today' : v > 0 ? 'firmer today' : 'softer today');
  const CROWD = { 'crowded long': 'traders are heavily long', 'crowded short': 'traders are heavily short', 'smallest long in years': 'hardly anyone is long', 'smallest short in years': 'hardly anyone is short' };
  const ccyCards = (n.strengths ?? []).map(s0 => {
    const ccy = s0.ccy, c = cbMap[ccy], su = surMap[ccy], cr = crMap[ccy], ev = nextFor(ccy), bank = CCY_BANK[ccy] ?? c?.bank;
    const stance = c ? (c.latest >= 0.3 ? 'Hawkish' : c.latest <= -0.3 ? 'Dovish' : 'Neutral') : null, drift = c ? (c.trend === 'more hawkish' ? 'and getting more hawkish' : c.trend === 'more dovish' ? 'and getting more dovish' : 'and steady') : '';
    const sent = [`The ${esc(CCY_NAME[ccy] ?? ccy)} is ${moveWord(s0.score)} (${sg(s0.score)}% against the others).`, c ? `The ${esc(bank)} sounds ${stance.toLowerCase()} ${drift}: a hawkish bank is one leaning towards higher rates.` : '', su != null && Math.abs(su) >= 0.15 ? `Economic data has been ${su > 0 ? 'beating' : 'missing'} forecasts.` : ''].filter(Boolean).join(' ');
    const chips = [cr && cr.state !== 'mid-range' ? CROWD[cr.state] : null, ev ? `next: ${ev.event}, ${ukTime(ev.ms)}` : null].filter(Boolean);
    const drives = (n.ranges ?? []).filter(r => (r.label ?? '').split('/').includes(ccy)).map(r => `${esc(r.label)}${r.used != null ? ' <span class="muted">' + Math.round(r.used * 100) + '%</span>' : ''}`);
    return `<div class="cc2"><div class="h">${flagSvg(ccy, 40, 27)}<div class="t"><b>${esc(ccy)}</b><small>${esc(CCY_NAME[ccy] ?? ccy)} — ${esc(CCY_BANK[ccy] ?? '')}</small></div>${stance ? `<span class="pill ${stance === 'Hawkish' ? 'a' : ''}">${stance}</span>` : ''}</div><p>${sent}</p>${chips.length ? `<div class="chips">${chips.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}${drives.length ? `<p class="small muted" style="margin:8px 0 0">Pairs it drives (share of a normal day used): ${drives.join(' · ')}</p>` : ''}</div>`;
  }).join('');
  const people = ccyCards ? sec('The currencies', 'Part 2 · Country by country', `<div class="ccg2">${ccyCards}</div><p class="small muted">Stance = the tone of the last central-bank meetings, not a forecast of what the bank will do. Heavy positioning shows who gets hurt if they are wrong, not which way price goes.</p>`) : '';

  // Part 3: each market, as a small card
  const trans = a.transmission ?? [];
  const pairCards = (n.assets ?? n.ranges ?? []).map(r => {
    const m = /^([A-Z]{3})\/([A-Z]{3})$/.exec(r.label ?? ''), key = r.key ?? (m ? m[1] + m[2] : ({ Gold: 'GOLD', Bitcoin: 'BTCUSD' })[r.label] ?? null);
    let story = '';
    const t = trans.find(x => new RegExp('(^|[^a-z])' + String(r.label).replace(/[^A-Za-z0-9]+/g, '.?') + '([^a-z]|$)', 'i').test(x.asset ?? '') || (key && new RegExp(String(key).replace(/(...)(...)/, '$1.?$2'), 'i').test(x.asset ?? '')));
    if (t) story = clipS(t.is, 170);
    else if (r.why) story = r.why;
    else if (m && strMap[m[1]] != null && strMap[m[2]] != null) { const d = strMap[m[1]] - strMap[m[2]]; story = Math.abs(d) < 0.15 ? `${m[1]} and ${m[2]} moved about the same today.` : `${d > 0 ? m[1] : m[2]} stronger than ${d > 0 ? m[2] : m[1]} today.`; }
    const ev = key ? evAll.find(e => (e.impact === 'high' || e.impact === 'medium') && (e.note?.pairs ?? []).includes(key)) : null;
    const stretch = r.used == null ? '' : r.used >= 1 ? 'already stretched' : r.used >= 0.6 ? 'getting stretched' : r.used < 0.25 ? 'quiet so far' : 'room left';
    const chips = [...(r.chips ?? []), ev ? `next: ${ev.event}, ${ukTime(ev.ms)}` : null].filter(Boolean).slice(0, 3);
    return `<div class="pc"><div class="h">${assetIcon(key, r.label)}<div class="t"><b>${esc(r.label)}</b><small>${esc(r.groupLabel ?? (m ? 'FX' : ''))}${r.price ? ' · ' + esc(r.price) : ''}</small></div></div>${r.used != null ? `<div class="rb"><i style="width:${Math.min(100, r.used * 100 / 1.5)}%"></i><u></u></div><small class="muted">${Math.round(r.used * 100)}% of a normal day's range · ${stretch}</small>` : ''}${story ? `<p>${esc(story)}</p>` : ''}${chips.length ? `<div class="chips">${chips.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}</div>`;
  }).join('');
  const ranges = pairCards ? sec('Each market at a glance', 'Part 3 · Pair by pair', `<div class="pcg">${pairCards}</div><p class="small muted">The bar shows how much of a typical day's travel has been used; the black tick is a full normal day. It says how stretched the day is, not which way it goes.</p>`) : '';

  // the rest, kept short
  const reg = n.regimeCard && typeof n.regimeCard === 'object' ? n.regimeCard : null, fp = n.fedPath;
  const big = [reg ? `<p><b>Backdrop:</b> ${esc(reg.label)} conditions, month ${reg.months}${reg.previous ? `, after ${reg.previous.months} months of ${esc(reg.previous.regime)}` : ''}. <span class="muted">Textbook: ${esc(reg.usual)}.</span></p>` : '', fp ? `<p><b>The Fed:</b> markets put the odds of a higher rate by ${esc(fp.ref)} at ${fp.hike}%${fp.current ? ` (rates now ${esc(fp.current)})` : ''}.</p>` : '', n.eod?.hook ? `<p><b>Yesterday:</b> ${esc(n.eod.hook)}</p>` : ''].filter(Boolean).join('');
  const behind = big ? sec('The bigger picture', 'Context', big) : '';

  const li = arr => (arr ?? []).slice(0, 3).map(c => `<li>${esc(c.check)} <span class="muted">— ${esc(c.level)}</span></li>`).join('');
  const trig = ((a.confirm ?? []).length || (a.invalidate ?? []).length) ? sec('What would change the story', 'Watch for', `<div class="two"><div><h3 style="margin-top:0;color:${COLORS.green}">Backs it up</h3><ul class="t">${li(a.confirm)}</ul></div><div><h3 style="margin-top:0;color:${COLORS.orange}">Breaks it</h3><ul class="t">${li(a.invalidate)}</ul></div></div>${a.sizing ? `<p class="small muted" style="margin-top:8px"><b>Sizing:</b> ${esc(clipS(a.sizing, 260))}</p>` : ''}`) : '';
  const lesson = a.lesson?.concept ? `<div class="lesson" style="margin-top:14px"><b>Today's lesson: ${esc(a.lesson.concept)}</b><p style="margin:6px 0 0">${esc(a.lesson.today)}</p></div>` : '';
  const noEdge = (a.noEdge ?? []).length ? sec('What we cannot tell you', 'Honesty box', `<ul class="t small">${a.noEdge.slice(0, 3).map(x => `<li>${esc(clipS(x, 230))}</li>`).join('')}</ul>`) : '';

  const foot = `<div class="foot"><h4>NOT FINANCIAL ADVICE</h4>${DISCLAIMER.map(d => `<p>${esc(d.replace(/^NOT FINANCIAL ADVICE\.\s*/, ''))}</p>`).join('')}<div class="meta">Desk Atlas · issue ${esc(n.date)}${llm ? ' · narrative written by ' + esc(llm) : ''}</div></div>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title><style>${CSS}</style></head><body><div class="wrap">${mast}${letterSec}${tiles}${driving}${ahead}${people}${ranges}${behind}${trig}${lesson}${noEdge}${foot}</div></body></html>`;

  const T = [];
  T.push(`DESK ATLAS · DAILY · ${n.date}`, '', headline, '');
  if (opening) T.push(opening, '');
  if (n.position) { T.push('YESTERDAY AND BEFORE', ...(n.position.behind ?? []), '', 'TODAY', ...(n.position.right ?? []), '', 'COMING UP', ...(n.position.ahead ?? []), ''); }
  if (n.events?.length) { T.push('NEXT RELEASES (UK time)'); for (const e of n.events) T.push(`- ${ukTime(e.ms)} ${e.ccy ?? ''} ${e.event} (${e.impact})${e.estimate ? ', expected ' + e.estimate : ''}${e.note?.measured ? ' | measured size effect: ' + [e.note.book, e.note.range].filter(Boolean).join(' · ') : ''}`); T.push(''); }
  if (n.strengths?.length) { T.push('CURRENCIES (move today)'); for (const c of n.strengths) T.push(`- ${c.ccy}: ${sg(c.score)}% ${moveWord(c.score)}`); T.push(''); }
  if (n.ranges?.length) { T.push('PAIRS (share of a normal day range used)'); for (const r of n.ranges) T.push(`- ${r.label} ${r.price ?? ''}${r.used != null ? ': ' + Math.round(r.used * 100) + '%' : ''}`); T.push(''); }
  if (a.confirm?.length) { T.push('BACKS IT UP'); for (const c of a.confirm) T.push(`- ${c.check}: ${c.level} (${c.when})`); T.push(''); }
  if (a.invalidate?.length) { T.push('BREAKS IT'); for (const c of a.invalidate) T.push(`- ${c.check}: ${c.level} (${c.when})`); T.push(''); }
  if (a.lesson?.concept) T.push(`TODAY'S LESSON: ${a.lesson.concept}`, a.lesson.today, '');
  T.push('---', 'NOT FINANCIAL ADVICE.', ...DISCLAIMER.map(d => d.replace(/^NOT FINANCIAL ADVICE\.\s*/, '')));
  return { subject, preheader, html, text: T.join('\n') };
}
