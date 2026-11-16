// js/terminal/goldView.js: the Gold board (Insight tab), from js/terminal/goldCore.js. Four glowing lines (gold, the 10-year real yield, the dollar index, gold implied vol), the
// implied-against-realised vol line, how much of gold's recent move the dollar and real yields usually account for, speculative positioning (CFTC) and the ETF holdings.
// Each card says how old its data is and how far to trust it; a feed that is empty or failed says so in words. Descriptive: not a forecast and not a trade.
// Presentation only; theme tokens only (insight.css); motion off under prefers-reduced-motion.
import { goldBoard } from './goldCore.js';
import { glowLine, esc } from './boardViz.js';

const nth = p => { const n = Math.round(p * 100); return `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th')}`; };
const sgn = (v, d = 1, u = '%') => (v == null || !Number.isFinite(v) ? 'n/a' : `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v).toFixed(d)}${u}`);
const usd = v => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}bn` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)}m` : `$${Math.round(v)}`);

function cardHtml(c) {
  const mv = [1, 5, 20].map(k => c.moves[k] ? `<span class="in-chip ${c.moves[k].chg > 0 ? 'u' : c.moves[k].chg < 0 ? 'd' : ''}" title="${k} session move, bigger than ${Math.round(c.moves[k].pct * 100)}% of its own such moves">${k}s ${esc(c.moves[k].text)}</span>` : '').join('');
  const lv = c.level ? `<p class="in-cap">${nth(c.level.pct)} percentile of its own ${(c.n / 252).toFixed(1)} years${c.stale ? ` (last value ${esc(c.stale)})` : ''}</p>` : (c.stale ? `<p class="in-cap">last value ${esc(c.stale)}</p>` : '');
  return `<div class="in-gcard"><div class="in-gh"><span class="in-gl">${esc(c.label)}</span><b class="in-gv">${esc(c.last)}</b></div><div class="in-chips">${mv}</div>${glowLine(c.spark, { w: 300, h: 76, tone: c.tone, label: `${c.label}, last ${CHART_LABEL} sessions` })}${lv}</div>`;
}
const CHART_LABEL = 120;

function volHtml(b) {
  if (!b.vol) return '';
  const r = b.vol.ratio, w = r < 0.9 ? 'well below' : r < 0.98 ? 'a little below' : r <= 1.02 ? 'about level with' : r <= 1.1 ? 'a little above' : 'well above';
  return `<p class="in-chance quiet">Gold implied vol is <b>${b.vol.implied.toFixed(1)}</b>, ${w} the <b>${b.vol.realised.toFixed(1)}</b> gold has actually realised over the last 20 sessions (${r.toFixed(2)} times). Implied above realised is the market charging for more movement than has happened lately.</p>`;
}
function fitHtml(b) {
  const f = b.fit; if (!f) return '<div class="in-gcard wide"><div class="in-gh"><span class="in-gl">Dollar and real yields against gold</span></div><p class="in-cap">Not enough overlapping history to fit.</p></div>';
  const q = f.fit, tOk = q.t.map(Math.abs).every(t => t >= 2);
  return `<div class="in-gcard wide"><div class="in-gh"><span class="in-gl">How much the dollar and real yields explain</span><b class="in-gv">${Math.round(q.r2 * 100)}%</b></div>
<p>Over the last ${f.window} sessions gold moved <b>${sgn(f.actualPct)}</b>. At the dollar's and the real yield's moves over that stretch, and gold's usual sensitivity to them, about <b>${sgn(f.fittedPct)}</b> would normally have come with it. The other <b>${sgn(f.unexplainedPct)}</b> is not accounted for by those two.</p>
<p class="in-cap">Usual sensitivity (fitted on the ${q.n} sessions before that stretch): a 1% move in the dollar goes with ${sgn(f.perDollarPct, 1)} on gold; a 10bp move in the real yield with ${sgn(f.perTenBp, 2)}. ${tOk ? 'Both are well above noise (t above 2).' : 'At least one is not clearly above noise.'} The two together explain ${Math.round(q.r2 * 100)}% of gold's day-to-day variation, so this is a rough guide. A fit to the past: it describes, it does not forecast.</p></div>`;
}
function positioningHtml(b) {
  const p = b.positioning; if (!p) return '<div class="in-gcard"><div class="in-gh"><span class="in-gl">Positioning (CFTC)</span></div><p class="in-cap">Not available.</p></div>';
  return `<div class="in-gcard"><div class="in-gh"><span class="in-gl">Speculative positioning (CFTC)</span><b class="in-gv">${esc(p.label)}</b></div>
<div class="in-rail" role="img" aria-label="Positioning at the ${nth(p.pct / 100)} percentile of its own history"><i class="in-rm" style="left:${Math.max(0, Math.min(100, p.pct))}%"></i><u style="left:10%"></u><u style="left:50%"></u><u style="left:90%"></u></div>
<p class="in-cap">${nth(p.pct / 100)} percentile of its own history (0 = the least net long it has been, 100 = the most). ${esc(p.line)}</p>
<p class="in-cap">Report of ${esc(p.reportDate)}${p.ageDays != null ? `, ${p.ageDays} days ago${p.stale ? '. That is a week behind the latest the CFTC would have published, so it may be out of date' : ''}` : ''}. Context only: the desk's study found no measured effect on direction for this state.</p></div>`;
}
const t1 = v => (Number.isFinite(v) ? v.toLocaleString('en-GB', { maximumFractionDigits: 1 }) : 'n/a');
const dt = (v, d) => (v == null ? 'n/a' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`);
function tonnesHtml(t) {
  if (!t) return '';
  const g = t.deltas?.gld ?? {}, w = t.total ? ` · both ${t1(t.total.total)} t` : '';
  return `<div class="in-scrollx"><table class="in-tbl in-mini"><thead><tr><th>Tonnes of gold held</th><th>Now</th><th>1 day</th><th>5 days</th><th>20 days</th></tr></thead><tbody><tr><th scope="row">GLD${t.gld ? ` (${esc(t.gld.date)})` : ''}</th><td>${t.gld ? t1(t.gld.tonnes) : 'n/a'}</td><td>${dt(g[1], 1)}</td><td>${dt(g[5], 1)}</td><td>${dt(g[20], 1)}</td></tr>${t.iau ? `<tr><th scope="row">IAU (${esc(t.iau.date)})</th><td>${t1(t.iau.tonnes)}</td><td colspan="3">read daily from the iShares page, history building</td></tr>` : ''}</tbody></table></div>
<p class="in-cap">Tonnes in the trusts${w}. A flow is the change in tonnes: the dollar value also moves with the gold price. GLD's history is SPDR's own daily archive; the change is shown for GLD alone until IAU has its own history.</p>`;
}
function etfHtml(b) {
  const e = b.etf, tn = tonnesHtml(e.tonnes);
  if (e.state !== 'ok') return `<div class="in-gcard"><div class="in-gh"><span class="in-gl">Gold ETF holdings (GLD + IAU)</span><b class="in-gv">${e.state === 'one' ? usd(e.last) : 'none yet'}</b></div>${tn}<p class="in-cap">${esc(e.note)}</p></div>`;
  const rows = Object.entries(e.deltas).map(([k, d]) => `<tr><th scope="row">${k} day${k === '1' ? '' : 's'}</th><td>${sgn(d.raw, 2)}</td><td>${d.flow == null ? 'n/a' : sgn(d.flow, 2)}</td></tr>`).join('');
  return `<div class="in-gcard"><div class="in-gh"><span class="in-gl">Gold ETF holdings (GLD + IAU)</span><b class="in-gv">${usd(e.last)}</b></div>
${tn}<div class="in-scrollx"><table class="in-tbl in-mini"><thead><tr><th>Change</th><th>Total assets</th><th>Without gold's own move</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="in-cap">${e.days} days held (since ${esc(e.from)}). A fund's assets rise with the gold price as well as with new money, so the last column takes gold's own move over the same dates out: what is left is closer to money coming in or out. Short history: read it as a start, not a trend.</p></div>`;
}

/** The whole board as HTML. Pure. */
export function goldHtml(b) {
  if (!b.haveBundle || !b.cards.length) return '<div class="in-empty">The daily market bundle has no gold series, so the board cannot be drawn.</div>';
  return `<p class="in-asof">As at the close of <b>${esc(b.asOf)}</b>. Prices are completed daily closes. Positioning is the latest CFTC report we hold; ETF holdings are as recorded daily.</p>${volHtml(b)}
<div class="in-ggrid">${b.cards.map(cardHtml).join('')}${fitHtml(b)}${positioningHtml(b)}${etfHtml(b)}</div>
<p class="in-foot muted">Everything here describes what has happened to gold and the things it is read against. None of it is a forecast or a trade: the dollar and real-yield link is a fit to the past, the positioning study found no measured effect on direction, and the ETF history is short.</p>`;
}

export function mountGold(host, ctx) {
  let alive = true;
  host.innerHTML = '<div class="in-empty">Reading gold, real yields, the dollar, positioning and the ETF holdings…</div>';
  Promise.allSettled([ctx.getBundle(), ctx.fetchJson('/api/cot-state'), ctx.fetchJson('/api/gold-etf-flow')]).then(([b, c, e]) => {
    if (!alive) return;
    const bundle = b.status === 'fulfilled' ? b.value : null;
    if (!bundle?.ok) { host.innerHTML = `<div class="in-empty">${esc(bundle?.error || 'The daily market bundle is not available.')}</div>`; return; }
    host.innerHTML = goldHtml(goldBoard(bundle, c.status === 'fulfilled' ? c.value : null, e.status === 'fulfilled' ? e.value : { ok: false, error: 'the gold ETF feed did not answer' }, { now: Date.now() }));
  });
  return { destroy() { alive = false; } };
}
