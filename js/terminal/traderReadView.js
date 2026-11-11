/**
 * Desk Terminal: the Trader's Read tab. How a discretionary macro trader would read today (the eight questions and
 * the named patterns of education/podcast_transcripts/HOW_THEY_THINK.md), drawn from the desk's own measurements by
 * js/traderRead.js. Loaded on demand by js/terminal/terminalTabs.js (RENDER.read) like the Correlations tab.
 *
 * Layout: the story on each window (pick one; the rest of the tab follows it), the chain path with each move against
 * its noise band, the eight questions as three cards (view / timing / trade), four checks with a chart each, and the
 * scenarios with the line that would end the story. Nothing here forecasts: every check is labelled untested.
 */
import * as CB from './chainBoard.js';
import * as TR from '../traderRead.js';

const h = CB.esc;
const S = { win: (() => { try { const r = localStorage.getItem('deskTerminalReadWin'); return r === 'live' ? 'live' : [1, 5, 20].includes(Number(r)) ? Number(r) : 1; } catch { return 1; } })(),
  inputs: null, live: null, cot: null, rr: null, ev: [], loading: null, timer: null, root: null, deps: null };
const WINS = ['live', 1, 5, 20];
const STATE = { ok: ['holds', 'var(--pur2)'], watch: ['watch', 'var(--gold)'], broken: ['broken', 'var(--gold)'], none: ['no data', 'var(--tx3)'], info: ['', 'var(--tx3)'] };
const PAT = { followed: ['followed', 'pur'], partial: ['half followed', 'gold'], contained: ['no follow-through', 'gold'], quiet: ['nothing to test', ''], none: ['no data', ''] };

const CSS = `
.tr-strip{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));margin:6px 0 14px}
.tr-tile{cursor:pointer;text-align:left;background:var(--bg3);border:1px solid var(--line);border-radius:10px;padding:9px 12px;color:var(--tx);font:inherit;transition:border-color .15s,background .15s}
.tr-tile:hover,.tr-tile:focus-visible{border-color:var(--pur);outline:none}
.tr-tile[aria-pressed="true"]{border-color:var(--pur);background:var(--purbg);box-shadow:0 0 0 1px rgba(139,124,246,.35)}
.tr-tile .w{display:flex;gap:6px;align-items:center;font:600 10px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--tx3)}
.tr-tile .s{font-size:12.5px;margin-top:4px;color:var(--tx2);line-height:1.35}
.tr-tag{font:600 9.5px var(--mono);letter-spacing:.08em;text-transform:uppercase;padding:1px 6px;border-radius:99px;border:1px solid var(--line2);color:var(--tx3)}
.tr-tag.broke{color:var(--gold);border-color:rgba(232,184,90,.5)}.tr-tag.hold{color:var(--pur2);border-color:rgba(139,124,246,.5)}
.tr-headline{margin:2px 0 4px;font:700 21px var(--sans);letter-spacing:.005em;line-height:1.3}
@media (max-width:600px){.tr-headline{font-size:17px}}
.tr-path{overflow-x:auto;margin:10px 0 6px;border-radius:12px;background:radial-gradient(700px 300px at 50% 0%,rgba(139,124,246,.10),transparent 70%),#080c1d;border:1px solid var(--line)}
.tr-path svg{display:block;width:100%;min-width:620px;height:auto}
.tr-q0{font-size:12.5px;color:var(--tx3);margin-top:6px}
.tr-qs{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr))}
.tr-q{display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:4px 10px;align-items:start;padding:9px 6px;border-bottom:1px solid var(--line);cursor:pointer;border-radius:6px}
.tr-q:last-child{border-bottom:0}
.tr-q:hover,.tr-q:focus-visible{background:rgba(139,124,246,.06);outline:none}
.tr-q b{font-size:13.5px;font-weight:600}
.tr-q p{grid-column:2/4;margin:0;font-size:12.5px;color:var(--tx2);line-height:1.45}
.tr-q .n{font:600 10px var(--mono);color:var(--tx3);margin-right:4px}
.tr-pats{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,560px),1fr))}
.tr-pat p.l{font-size:13px;margin:4px 0 8px;color:var(--tx2);line-height:1.45}
.tr-pat svg{display:block;width:100%;height:auto}
.tr-pat .ax{font:9.5px var(--mono);fill:var(--tx3)}
.tr-pat .lab{font:11px var(--sans);fill:var(--tx2)}
.tr-pat .val{font:600 10.5px var(--mono);fill:var(--tx)}
.tr-scn{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr))}
.tr-scn div{background:var(--bg3);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13px}
.tr-scn b{display:block;font:600 10.5px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--pur2);margin-bottom:4px}
.tr-why{font-size:12px;color:var(--tx3);margin-top:6px}
`;
function injectCss() { if (document.getElementById('tr-css')) return; const s = document.createElement('style'); s.id = 'tr-css'; s.textContent = CSS; document.head.appendChild(s); }

// ── data ──
async function load(getJson) {
  if (S.loading) return S.loading;
  const syms = Object.entries(CB.CHAIN_OHLC), ok = r => (r && r.ok !== false && !r.error ? r : null);
  S.loading = Promise.all([getJson(`/api/fredhistory?keys=${CB.CHAIN_FRED_KEYS}`), getJson('/api/intl-yields'), getJson('/api/chain-extra'), getJson('/api/crack'),
    getJson('/api/chain-live'), getJson('/api/cot-state'), getJson('/api/release-reactions'), getJson('/api/events'), ...syms.map(([, s]) => getJson(`/api/ohlc?symbol=${s}`))])
    .then(([fred, iy, cx, cr, live, cot, rr, ev, ...oh]) => {
      S.inputs = { fred: ok(fred) ?? {}, intl: iy?.series ?? {}, extra: cx?.series ?? {}, crack: Array.isArray(cr?.series) ? cr.series : null, ohlc: Object.fromEntries(syms.map(([k], i) => [k, CB.ohlcAscending(oh[i])])) };
      S.live = live?.ok ? live : null; S.cot = ok(cot); S.rr = ok(rr);
      S.ev = (Array.isArray(ev) ? ev : ev?.events ?? []).map(e => ({ ...e, ms: Number.isFinite(e.ms) ? e.ms : Date.parse(e.time ?? e.date ?? '') }));
    });
  return S.loading;
}
function computeAll() {
  const inputs = { ...S.inputs, live: S.live }, wins = WINS.filter(w => w !== 'live' || S.live);
  const vals = {}, links = {};
  for (const w of wins) { try { vals[w] = CB.chainVals(inputs, w); links[w] = CB.chainLinks(inputs, w); } catch (e) { console.warn('trader read window', w, e); } }
  // the idea's positioning line reads crowding as { sym, state: 'crowded long' | 'crowded short' } (/api/cot-state crowd is +1 / -1 in the instrument's own terms)
  const crowding = S.cot ? Object.entries(S.cot.instruments ?? {}).map(([k, v]) => ({ sym: k, state: v.crowd > 0 ? 'crowded long' : v.crowd < 0 ? 'crowded short' : 'mid-range', pct: v.pct })) : null;
  const nowMs = Date.now(), ctx = { events: S.ev, nowMs, crowding, cotDate: S.cot?.reportDate ?? null };
  const stories = TR.storyByWindow(links, ctx);
  const win = stories.byWin[S.win] ? S.win : stories.byWin[1] ? 1 : Number(Object.keys(stories.byWin)[0] ?? 20);
  const short = win === 20 ? 5 : win, idea = stories.byWin[win];
  const ft = TR.followThrough(vals[short] ?? {}, short);
  const clocks = TR.twoClocks(vals[short] ?? {}, short, vals[20] ?? {}, 20);
  const crowd = TR.crowdedExposed(S.cot, vals[short] ?? {}, short);
  const news = TR.newsVsPrice(S.rr?.recent ?? [], { nowMs });
  const checks = TR.checklist({ idea, links: links[win] ?? [], ft, clocks, crowd, news, events: S.ev, nowMs });
  return { win, short, vals, links, stories, idea, ft, clocks, crowd, news, checks };
}

// ── drawing ──
const sgn = (v, d = 1) => (v == null || !Number.isFinite(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`);
const firstSentence = t => { const m = String(t ?? '').match(/^.*?[.!?](\s|$)/); return (m ? m[0] : String(t ?? '')).trim(); };
const winWord = w => (w === 'live' ? 'since the close' : w === 1 ? 'today' : `over ${w} days`);

function stripHtml(st, win) {
  return `<div class="tr-strip" role="group" aria-label="window">${WINS.map(w => {
    const i = st.byWin[w];
    const tag = i ? `<span class="tr-tag ${i.broken ? 'broke' : 'hold'}">${i.broken ? 'broken' : 'holding'}</span>` : '<span class="tr-tag">no story</span>';
    return `<button class="tr-tile" data-w="${w}" aria-pressed="${w === win}" ${i ? '' : 'disabled'}><span class="w">${h(TR.WIN_LABEL[w])} ${tag}</span><div class="s">${i ? h(i.headline) : w === 'live' ? 'Live feed not available' : 'Nothing past its noise band'}</div></button>`;
  }).join('')}</div>`;
}

function pathSvg(idea, vals, win) {
  const steps = idea.steps ?? [], n = steps.length, GAP = 70, BW = Math.max(196, Math.floor((1100 - 40 - (n - 1) * GAP) / Math.max(n, 1))), W = n * BW + (n - 1) * GAP + 40, H = 150;
  const x0 = i => 20 + i * (BW + GAP);
  const zMax = 4;
  const box = (s, i) => {
    const z = TR.zOf(vals, s.key, win), az = z == null ? 0 : Math.min(Math.abs(z), zMax), x = x0(i);
    const meterW = BW - 28, fill = (az / zMax) * meterW, noise = (1 / zMax) * meterW;
    return `<g><rect x="${x}" y="22" width="${BW}" height="96" rx="12" fill="#111833" stroke="${i === 0 ? 'rgba(232,184,90,.6)' : 'rgba(139,124,246,.35)'}"/>
<text x="${x + 14}" y="44" style="font:600 10px var(--mono);letter-spacing:.12em;fill:var(--tx3)">${i === 0 ? 'CAUSE' : i === n - 1 ? 'EFFECT' : 'THEN'}</text>
<text x="${x + 14}" y="64" style="font:600 13px var(--sans);fill:var(--tx)">${h(CB.CHAIN_NODES[s.key] ? CB.shortLabel(CB.CHAIN_NODES[s.key]) : s.label)}</text>
<text x="${x + 14}" y="88" style="font:700 18px var(--mono);fill:${z == null ? 'var(--tx3)' : 'var(--tx)'}">${h(s.text ?? '–')}</text>
<rect x="${x + 14}" y="99" width="${meterW}" height="5" rx="3" fill="#18203f"/>
<rect x="${x + 14}" y="99" width="${fill.toFixed(1)}" height="5" rx="3" fill="${az >= 1 ? 'var(--pur)' : 'var(--line2)'}"/>
<line x1="${(x + 14 + noise).toFixed(1)}" x2="${(x + 14 + noise).toFixed(1)}" y1="95" y2="108" stroke="var(--tx3)" stroke-width="1"/>
<text x="${x + BW - 14}" y="88" text-anchor="end" style="font:10px var(--mono);fill:var(--tx3)">${z == null ? '' : `${Math.abs(z).toFixed(1)}× band`}</text></g>`;
  };
  const arrow = i => {
    const via = steps[i + 1]?.via, broke = via === 'broken', xa = x0(i) + BW + 6, xb = x0(i + 1) - 8, y = 70;
    return `<g><line x1="${xa}" x2="${xb}" y1="${y}" y2="${y}" stroke="${broke ? 'var(--gold)' : 'var(--pur2)'}" stroke-width="2" ${broke ? 'stroke-dasharray="3 5"' : 'stroke-dasharray="7 6" class="tr-flow"'}/>
<path d="M${xb - 7},${y - 5} L${xb},${y} L${xb - 7},${y + 5}" fill="none" stroke="${broke ? 'var(--gold)' : 'var(--pur2)'}" stroke-width="2"/>
<text x="${(xa + xb) / 2}" y="${y - 10}" text-anchor="middle" style="font:600 9.5px var(--mono);letter-spacing:.1em;fill:${broke ? 'var(--gold)' : 'var(--pur2)'}">${broke ? 'BROKEN' : 'HOLDS'}</text></g>`;
  };
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="the story as a chain"><style>.tr-flow{animation:trflow 1.1s linear infinite}@keyframes trflow{to{stroke-dashoffset:-13}}@media (prefers-reduced-motion:reduce){.tr-flow{animation:none}}</style>
${steps.map(box).join('')}${steps.slice(0, -1).map((_, i) => arrow(i)).join('')}
<text x="20" y="${H - 12}" style="font:10px var(--mono);fill:var(--tx3)">bar = the move against its noise band for ${h(winWord(win))} · tick = 1× band (moved)</text></svg>`;
}

function stateIcon(state) {
  const [, col] = STATE[state] ?? STATE.info;
  if (state === 'ok') return `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="${col}"/></svg>`;
  if (state === 'watch') return `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="${col}" stroke-width="1.6"/><path d="M7 2a5 5 0 0 1 0 10z" fill="${col}"/></svg>`;
  if (state === 'broken') return `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="${col}" stroke-width="1.6"/><path d="M4.5 4.5l5 5M9.5 4.5l-5 5" stroke="${col}" stroke-width="1.6"/></svg>`;
  return `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="${col}" stroke-width="1.4"/></svg>`;
}
function questionsHtml(checks) {
  const G = [['view', 'The view', 'what the story is and what holds it up'], ['timing', 'The timing', 'what is believed, how price reacts, what forces it'], ['trade', 'The trade', 'the horizon and what ends it']];
  return `<div class="tr-qs">${G.map(([g, t, s]) => `<div class="card"><div class="ch"><span class="lbl">${h(t)}</span><span class="r muted">${h(s)}</span></div>
${checks.filter(q => q.g === g).map(q => `<div class="tr-q" tabindex="0" role="button" data-q="${q.n}">${stateIcon(q.state)}<b><span class="n">${q.n}</span>${h(q.t)}</b><span class="tr-tag ${q.state === 'ok' ? 'hold' : q.state === 'watch' || q.state === 'broken' ? 'broke' : ''}">${h(q.tag ?? '')}</span><p>${h(firstSentence(q.body))}</p></div>`).join('')}</div>`).join('')}</div>`;
}

// chart: horizontal bars from zero in noise-band units, the ±1 band shaded
function barsSvg(rows, { leadKey = null } = {}) {
  const W = 460, rowH = 22, top = 16, L = 150, R = 52, Z = 4, H = top + rows.length * rowH + 22;
  const x = z => L + ((Math.max(-Z, Math.min(Z, z)) + Z) / (2 * Z)) * (W - L - R), x0 = x(0);
  let g = '', lastGroup = null, y = top;
  const out = [];
  for (const r of rows) {
    const yy = y + rowH / 2;
    if (r.group !== lastGroup) { out.push(`<line x1="8" x2="${W - 8}" y1="${y}" y2="${y}" stroke="var(--line)"/>`); lastGroup = r.group; }
    const moved = Math.abs(r.z) >= 1, col = r.key === leadKey ? 'var(--gold)' : moved ? 'var(--pur)' : 'var(--line2)';
    out.push(`<text class="lab" x="10" y="${yy + 4}">${h(CB.CHAIN_NODES[r.key] ? CB.shortLabel(CB.CHAIN_NODES[r.key]) : r.label)}</text>
<rect x="${Math.min(x0, x(r.z)).toFixed(1)}" y="${yy - 6}" width="${Math.abs(x(r.z) - x0).toFixed(1)}" height="12" rx="3" fill="${col}"><title>${h(r.label)}: ${h(r.text)} (${sgn(r.z)}× its band)</title></rect>
<text class="val" x="${W - 8}" y="${yy + 4}" text-anchor="end">${h(r.text)}</text>`);
    y += rowH;
  }
  g = `<rect x="${x(-1)}" y="${top}" width="${x(1) - x(-1)}" height="${rows.length * rowH}" fill="rgba(139,124,246,.07)"/><line x1="${x0}" x2="${x0}" y1="${top - 4}" y2="${top + rows.length * rowH}" stroke="var(--tx3)" stroke-width="1"/>`;
  const ticks = [-4, -2, -1, 0, 1, 2, 4].map(t => `<text class="ax" x="${x(t)}" y="${H - 6}" text-anchor="middle">${t === 0 ? '0' : `${t > 0 ? '+' : '−'}${Math.abs(t)}`}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="moves in noise-band units">${g}${out.join('')}${ticks}<text class="ax" x="${L}" y="10">× noise band · shaded = inside the band</text></svg>`;
}
// chart: two clocks, a dumbbell per market (hollow = the month, solid = the short window)
function clocksSvg(rows, shortWin) {
  const show = rows.slice(0, 8), W = 460, rowH = 24, top = 18, L = 150, R = 16, Z = 5, H = top + show.length * rowH + 24;
  const x = z => L + ((Math.max(-Z, Math.min(Z, z)) + Z) / (2 * Z)) * (W - L - R);
  const body = show.map((r, i) => {
    const y = top + i * rowH + rowH / 2, col = r.state === 'opposed' ? 'var(--gold)' : r.state === 'aligned' ? 'var(--pur2)' : 'var(--tx3)';
    return `<text class="lab" x="10" y="${y + 4}" ${r.state === 'opposed' ? 'style="fill:var(--gold)"' : ''}>${h(CB.shortLabel(CB.CHAIN_NODES[r.key]))}</text>
<line x1="${x(r.zl)}" x2="${x(r.zs)}" y1="${y}" y2="${y}" stroke="${col}" stroke-width="2" opacity=".7"/>
<circle cx="${x(r.zl)}" cy="${y}" r="5" fill="#0c1124" stroke="${col}" stroke-width="1.6"><title>${h(r.label)} over 20 days: ${h(r.long)}</title></circle>
<circle cx="${x(r.zs)}" cy="${y}" r="5" fill="${col}"><title>${h(r.label)} ${h(winWord(shortWin))}: ${h(r.short)}</title></circle>`;
  }).join('');
  const band = `<rect x="${x(-1)}" y="${top}" width="${x(1) - x(-1)}" height="${show.length * rowH}" fill="rgba(139,124,246,.07)"/><line x1="${x(0)}" x2="${x(0)}" y1="${top - 4}" y2="${top + show.length * rowH}" stroke="var(--tx3)"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="short window against the month">${band}${body}<text class="ax" x="${L}" y="11">● ${h(winWord(shortWin))} · ○ 20 days · in × noise band</text>${[-4, -1, 0, 1, 4].map(t => `<text class="ax" x="${x(t)}" y="${H - 6}" text-anchor="middle">${t}</text>`).join('')}</svg>`;
}
// chart: crowding gauge per market with the short-window move
function crowdSvg(rows) {
  const show = rows.slice(0, 8), W = 460, rowH = 26, top = 18, L = 86, G = 200, H = top + show.length * rowH + 10;
  const body = show.map((r, i) => {
    const y = top + i * rowH + rowH / 2, px = r.pct == null ? null : L + (r.pct / 100) * G, col = r.crowd !== 0 ? 'var(--gold)' : 'var(--tx3)';
    const mv = r.move == null ? '' : `<text class="val" x="${L + G + 18}" y="${y + 4}" ${r.against ? 'style="fill:var(--gold)"' : ''}>${h(r.move)}${r.against ? '  against the crowd' : r.withIt ? '  with the crowd' : ''}</text>`;
    return `<text class="lab" x="10" y="${y + 4}">${h(r.key)}</text>
<rect x="${L}" y="${y - 3}" width="${G}" height="6" rx="3" fill="#18203f"/><rect x="${L}" y="${y - 3}" width="${G * 0.2}" height="6" rx="3" fill="rgba(232,184,90,.18)"/><rect x="${L + G * 0.8}" y="${y - 3}" width="${G * 0.2}" height="6" rx="3" fill="rgba(232,184,90,.18)"/>
${px == null ? '' : `<circle cx="${px.toFixed(1)}" cy="${y}" r="5.5" fill="${col}"><title>${h(r.key)}: speculators at the ${r.pct}th percentile of their own history. ${h(r.label)}</title></circle>`}${mv}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="crowding and today's move"><text class="ax" x="${L}" y="11">short ← speculators' position, own history → long</text>${body}</svg>`;
}
// chart: expected 30-minute move (history) against the actual one, per market per clear surprise
function newsSvg(pts) {
  const W = 460, H = 250, P = 34, m = Math.max(0.05, ...pts.flatMap(p => [Math.abs(p.exp), Math.abs(p.act)])) * 1.15;
  const x = v => P + ((v + m) / (2 * m)) * (W - 2 * P), y = v => H - P - ((v + m) / (2 * m)) * (H - 2 * P);
  const q = `<rect x="${x(0)}" y="${y(m)}" width="${x(m) - x(0)}" height="${y(0) - y(m)}" fill="rgba(139,124,246,.07)"/><rect x="${x(-m)}" y="${y(0)}" width="${x(0) - x(-m)}" height="${y(-m) - y(0)}" fill="rgba(139,124,246,.07)"/>
<rect x="${x(-m)}" y="${y(m)}" width="${x(0) - x(-m)}" height="${y(0) - y(m)}" fill="rgba(232,184,90,.06)"/><rect x="${x(0)}" y="${y(0)}" width="${x(m) - x(0)}" height="${y(-m) - y(0)}" fill="rgba(232,184,90,.06)"/>
<line x1="${x(-m)}" x2="${x(m)}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line2)"/><line x1="${x(0)}" x2="${x(0)}" y1="${y(m)}" y2="${y(-m)}" stroke="var(--line2)"/>
<line x1="${x(-m)}" x2="${x(m)}" y1="${y(-m)}" y2="${y(m)}" stroke="var(--tx3)" stroke-dasharray="3 5"/>`;
  const dots = pts.map(p => `<circle cx="${x(p.exp).toFixed(1)}" cy="${y(p.act).toFixed(1)}" r="5" fill="${p.cls === 'against' ? 'var(--gold)' : p.cls === 'with' ? 'var(--pur)' : 'var(--tx3)'}" fill-opacity=".85" stroke="#070a17"><title>${h(p.release)} · ${h(p.label ?? p.id)}: history said ${sgn(p.exp, 2)}%, it moved ${sgn(p.act, 2)}% in 30 min</title></circle>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="expected against actual 30-minute moves">${q}${dots}
<text class="ax" x="${W - P}" y="${y(0) - 6}" text-anchor="end">what history says (30 min) →</text><text class="ax" x="${x(0) + 6}" y="${P - 10}">actual ↑</text>
<text class="ax" x="${x(-m) + 6}" y="${y(m) + 14}" style="fill:var(--gold)">price fought the news</text><text class="ax" x="${x(m) - 6}" y="${y(m) + 14}" text-anchor="end" style="fill:var(--pur2)">went with it</text></svg>`;
}
function patCard(title, sub, verdict, line, chart, why) {
  const [vt, vc] = verdict ?? ['', ''];
  return `<div class="card tr-pat"><div class="ch"><h3>${h(title)}</h3><span class="r">${vt ? `<span class="chip ${vc}">${h(vt)}</span>` : ''}<span class="chip" title="A heuristic from the podcast decodes, not tested on this desk">untested</span></span></div>
<span class="lbl" style="text-transform:none;letter-spacing:.02em;font-family:var(--sans);font-size:12px">${h(sub)}</span><p class="l">${h(line)}</p>${chart}<div class="tr-why">${why}</div></div>`;
}

function draw() {
  const root = S.root; if (!root || !S.inputs) return;
  const A = computeAll(), { idea, win } = A;
  if (!idea) { root.innerHTML = `<div class="card"><p class="muted">No chain link moved past its noise band on any window, so there is no story to read. That is itself a read: a quiet market.</p></div>`; return; }
  const q8 = A.checks.find(q => q.n === 8);
  const shift = A.stories.shifted ? `<span class="chip gold" title="The story on the shortest window differs from the 20-day story">today's story differs from the month's</span>` : '';
  root.innerHTML = `<div class="card glow">
<div class="tt-head"><span class="lbl">Trader's read · the way a macro trader would read it, from the desk's own measurements</span><span class="r" style="margin-left:auto">${shift}</span></div>
${stripHtml(A.stories, win)}
<h2 class="tr-headline">${h(idea.headline)}</h2>
<div class="muted">${h(idea.pattern ? idea.pattern + '.' : 'The cause and its effect moved the textbook way.')} Strength ${idea.strength}× the noise band, ${h(winWord(win))}.</div>
<div class="tr-path">${pathSvg(idea, A.vals[win] ?? {}, win)}</div>
<div class="tr-q0"><b style="color:var(--tx2)">Does it matter on your timeframe?</b> ${h(idea.q0?.body ?? '')}</div></div>
<div class="sec tt-sec"><h2>The eight questions</h2><span class="lbl">tap a question for the full answer · ● holds · ◐ watch · ✕ broken · ○ no data</span></div>
${questionsHtml(A.checks)}
<div class="sec tt-sec"><h2>Their checks</h2><span class="lbl">the tests the hosts run before believing a move · ${h(winWord(A.short))}${A.short !== win ? ' (the month is compared with this week)' : ''}</span></div>
<div class="tr-pats">
${patCard('Follow-through', 'Did FX and rates move with the biggest stock move?', PAT[A.ft.verdict], A.ft.line, A.ft.rows.length ? barsSvg(A.ft.rows, { leadKey: A.ft.lead?.key }) : '', "E05, Pattern V: a big stock move nothing else confirms is a liquidation, not a macro story. Size only; the backlog test R13 would check whether it means a smaller range afterwards.")}
${patCard('Two clocks', 'Markets pushed one way now and the other way over the month', A.clocks.opposed ? [`${A.clocks.opposed} pulling apart`, 'gold'] : ['clocks agree', 'pur'], A.clocks.line, A.clocks.rows.length ? clocksSvg(A.clocks.rows, A.short) : '', 'E05, Pattern W: two drivers on different time frames cancel, so there is no edge until one wins.')}
${patCard('Crowded and exposed', `Who has to act if the move continues · CFTC report ${A.crowd.reportDate ?? 'n/a'}`, A.crowd.pressed ? [`${A.crowd.pressed} under pressure`, 'gold'] : A.crowd.crowded ? [`${A.crowd.crowded} crowded`, ''] : ['nothing crowded', 'pur'], A.crowd.line, A.crowd.rows.length ? crowdSvg(A.crowd.rows) : '', 'E05, Pattern W: a shock moves the crowded positions; with nothing crowded, expect little follow-through. Tested here: crowding does not say which way (cot-positioning-factor, null).')}
${patCard('News against price', 'Clear surprises: what history says the first 30 minutes do, against what they did', A.news.fought ? [`${A.news.fought} fought the news`, 'gold'] : A.news.releases.length ? ['price following news', 'pur'] : ['no clear surprise', ''], A.news.line, A.news.pts.length ? newsSvg(A.news.pts) : '', 'E01 Pattern A and E05 Pattern X: when everyone sees the news and price will not follow, it is priced. From the Release Reaction study (expected = history per unit of surprise).')}
</div>
<div class="sec tt-sec"><h2>Scenarios</h2><span class="lbl">conditions to watch, never probabilities: direction is not forecastable on this desk's tests</span></div>
<div class="tr-scn">${(idea.scenarios ?? []).map(s => `<div><b>${h(s.name)}</b>${h(s.what)}</div>`).join('')}</div>
${q8 ? `<div class="synth" style="margin-top:12px"><span class="lbl" style="color:var(--gold)">What would prove it wrong</span><div style="margin-top:4px">${h(q8.body)}</div></div>` : ''}
<p class="tt-note">The story and the questions are the newsletter's idea of the day (js/macroIdea.js), here on every window. The four checks are the reasoning the podcast hosts use (education/podcast_transcripts/HOW_THEY_THINK.md, on the How Traders Think page); none is tested on this desk, and nothing here is a trade. Moves are in noise-band units: 1 means the move just cleared the chain's floor for that window.</p>`;
  root.querySelectorAll('.tr-tile[data-w]').forEach(b => b.onclick = () => { const w = b.dataset.w; S.win = w === 'live' ? 'live' : Number(w); try { localStorage.setItem('deskTerminalReadWin', String(S.win)); } catch { /* private window */ } draw(); });
  const open = n => { const q = A.checks.find(x => String(x.n) === String(n)); if (!q) return; S.deps.openModal(`<div class="ch"><span class="lbl">Question ${q.n} · ${h(q.g)}</span><button class="x" aria-label="close" onclick="closeModal()">✕</button></div><h3 style="margin:2px 0 8px">${h(q.t)}</h3><p>${h(q.body)}</p>${q.n === 8 ? `<div class="tr-scn" style="margin-top:10px">${(idea.scenarios ?? []).map(s => `<div><b>${h(s.name)}</b>${h(s.what)}</div>`).join('')}</div>` : ''}<p class="tt-note">State: ${h((STATE[q.state] ?? STATE.info)[0] || 'a fact')} (${h(q.tag ?? '')}). Built from the measured chain ${h(winWord(win))}; a reading, not a trade.</p>`); };
  root.querySelectorAll('.tr-q').forEach(r => { r.onclick = () => open(r.dataset.q); r.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r.dataset.q); } }; });
}

export async function render(root, deps) {
  if (!root) return;
  injectCss(); S.root = root; S.deps = deps;
  if (!S.inputs) root.innerHTML = `<div class="card glow"><div class="tt-load">Reading the chain on every window…</div></div>`;
  try { await load(deps.getJson); draw(); }
  catch (e) { root.innerHTML = `<div class="card"><p class="muted">The Trader's Read did not load: ${h(e.message)}</p></div>`; return; }
  // the live window refreshes every two minutes while the tab is open
  clearInterval(S.timer);
  S.timer = setInterval(async () => {
    if (root.hidden || document.hidden) return;
    const live = await deps.getJson('/api/chain-live'); if (live?.ok) { S.live = live; draw(); }
  }, 120_000);
}
