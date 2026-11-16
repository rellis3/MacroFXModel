// js/terminal/economiesView.js: the World economies board (Insight tab): one tile per economy (USD EUR GBP JPY AUD CAD CHF NZD) with growth, prices, jobs and spending, each with an
// arrow AND a word, and the month it describes. Numbers come from js/worldEconomies.js (which only lays the server's raw prints side by side; it does not score or forecast).
// The arrows compare a reading with its own anchor (zero for growth and spending, the bank's target for prices, prices for pay): they are LEVELS, not trends, and the board says so.
// A gap is shown as "no feed". Pure builder + a mount. Theme tokens only (insight.css).
import { worldEconomies, monthOf, quarterOf } from '../worldEconomies.js';
import { esc } from './boardViz.js';

const MINUS = '-';
const sg = (v, d = 1, u = '') => (v == null || !Number.isFinite(v) ? 'n/a' : `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(d)}${u}`);
const pl = (v, d = 1, u = '') => (v == null || !Number.isFinite(v) ? 'n/a' : `${v.toFixed(d)}${u}`);
const arrow = k => ({ up: '▲', down: '▼', flat: '●' }[k]);
const NEAR = 0.3;   // percentage points either side of a target that count as "near"

/** The four readings of one economy as { key, label, arrow: 'up'|'down'|'flat'|null, word, value, date } rows. null arrow = no feed. */
export function readings(r, isoDate) {
  const mo = d => (d ? monthOf(d, isoDate) : ''), q = d => (d ? quarterOf(d, isoDate) : '');
  const g = r.growth ? { arrow: r.growth.v >= 0 ? 'up' : 'down', word: r.growth.v >= 0 ? 'growing' : 'shrinking', value: `${sg(r.growth.v, 2, '%')} in the quarter${r.growth.recession ? ' (recession flag on)' : ''}`, date: q(r.growth.date) } : null;
  let p = null;
  if (r.inflation && r.inflation.head != null) {
    const t = r.inflation.target, d = t != null ? r.inflation.head - t : null;
    p = { arrow: d == null ? 'flat' : Math.abs(d) <= NEAR ? 'flat' : d > 0 ? 'up' : 'down', word: d == null ? 'no target on file' : Math.abs(d) <= NEAR ? 'near target' : d > 0 ? 'above target' : 'below target',
      value: `${pl(r.inflation.head, 1, '%')} a year${r.inflation.core != null ? `, core ${pl(r.inflation.core, 1, '%')}` : ''}${t != null ? `, target ${pl(t, 1, '%')}` : ''}`, date: mo(r.inflation.date) };
  }
  let j = null;
  if (r.jobs && (r.jobs.unemp != null || r.jobs.wage != null)) {
    const ahead = r.jobs.wage != null && r.inflation?.head != null ? r.jobs.wage >= r.inflation.head : null;
    j = { arrow: ahead == null ? 'flat' : ahead ? 'up' : 'down', word: ahead == null ? 'pay against prices not known' : ahead ? 'pay ahead of prices' : 'pay behind prices',
      value: `${r.jobs.unemp != null ? `${pl(r.jobs.unemp, 1, '%')} out of work` : ''}${r.jobs.unemp != null && r.jobs.wage != null ? ', ' : ''}${r.jobs.wage != null ? `wages ${sg(r.jobs.wage, 1, '%')}` : ''}`, date: mo(r.jobs.unempDate ?? r.jobs.wageDate) };
  }
  const s = r.spending ? { arrow: r.spending.v >= 0 ? 'up' : 'down', word: r.spending.v >= 0 ? 'spending up' : 'spending down', value: `${sg(r.spending.v, 1, '%')} on a year ago`, date: mo(r.spending.date) } : null;
  return [{ key: 'growth', label: 'Growth', ...(g ?? { arrow: null }) }, { key: 'prices', label: 'Prices', ...(p ?? { arrow: null }) }, { key: 'jobs', label: 'Jobs', ...(j ?? { arrow: null }) }, { key: 'spend', label: 'Spending', ...(s ?? { arrow: null }) }];
}

function tileHtml(r, isoDate) {
  const rows = readings(r, isoDate).map(x => x.arrow
    ? `<li class="in-rd"><span class="in-ar ${x.arrow}" aria-hidden="true">${arrow(x.arrow)}</span><span class="in-rl">${esc(x.label)}</span><span class="in-rw"><b>${esc(x.word)}</b> <span class="muted">${esc(x.value)}${x.date ? ` · ${esc(x.date)}` : ''}</span></span></li>`
    : `<li class="in-rd na"><span class="in-ar" aria-hidden="true"></span><span class="in-rl">${esc(x.label)}</span><span class="in-rw muted">no feed</span></li>`).join('');
  const bank = r.bank ? `<span class="in-chip" title="${esc(`central bank stance from its latest statement${r.bank.date ? ` (${r.bank.date})` : ''}`)}">bank: ${esc(r.bank.regime)}</span>` : '';
  const inv = r.curve && r.curve.v < 0 ? '<span class="in-chip" title="the long yield is below the short one">curve inverted</span>' : '';
  return `<div class="in-gcard"><div class="in-gh"><span class="in-gv">${esc(r.ccy)}</span><span class="in-chips">${bank}${inv}</span></div><ul class="in-rds">${rows}</ul></div>`;
}

/** The whole board from the server payloads. Pure. */
export function economiesHtml(world, isoDate) {
  if (!world?.rows?.length) return '<div class="in-empty">No economy data came back.</div>';
  const lines = world.lines?.length ? `<p class="in-chance quiet">${world.lines.map(esc).join(' ')}</p>` : '';
  return `${lines}<div class="in-ggrid in-tiles">${world.rows.map(r => tileHtml(r, isoDate)).join('')}</div>
<p class="in-foot muted">The arrows compare each reading with its own anchor (zero for growth and spending, the bank's target for prices, prices for pay). They say where a reading sits, not whether it is getting better or worse. The month is the one the number describes; a different year is shown with it. Prints are as the server holds them; nothing here is scored or forecast.</p>`;
}

export function mountEconomies(host, ctx) {
  let alive = true;
  host.innerHTML = '<div class="in-empty">Reading the economy prints…</div>';
  const J = p => ctx.fetchJson(`/api/${p}`).catch(() => null);
  Promise.all(['gdp', 'cpi', 'labor-market', 'retail-sales', 'consumer-confidence', 'trade-balance', 'real-yield', 'yield-curve', 'macro-scorecard'].map(J)).then(([gdp, cpi, labor, retail, conf, trade, real, curve, scorecard]) => {
    if (!alive) return;
    host.innerHTML = economiesHtml(worldEconomies({ gdp, cpi, labor, retail, conf, trade, real, curve, scorecard }), new Date().toISOString().slice(0, 10));
  });
  return { destroy() { alive = false; } };
}
