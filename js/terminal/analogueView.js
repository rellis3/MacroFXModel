// js/terminal/analogueView.js: "Has this happened before?" for the Desk Terminal (panel.macro.analogues, preview). The engine is js/analogue.js (shared with
// market-view.html): take today's configuration over a handful of markets, find every past day that looked like it (de-clustered, recent window excluded),
// and show what followed as a SPREAD, never a mean. The data is /api/drill-series, the same bundle the Insight boards read.
// Honest by construction: when every match sits inside one stretch of history the panel says it is ONE observation, not eight.
import { analogues } from '../analogue.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sg = v => `${v > 0 ? '+' : ''}${(+v).toFixed(1)}%`;

/** The sets of markets a "day like this" can be judged on. Small on purpose: the distance is dominated by markets nobody is talking about otherwise. */
export const SETS = [
  { id: 'rates', label: 'Rates and gold', keys: ['tips', 'bei', 'us2y', 'gold'] },
  { id: 'risk', label: 'Equities and fear', keys: ['vix', 'spx', 'nq', 'hy'] },
  { id: 'credit', label: 'Credit', keys: ['hy', 'ig', 'vix', 'spx'] },
  { id: 'vol', label: 'Volatility curve', keys: ['vix', 'vix3m', 'spx'] },
];

/** The result of analogues() as HTML: the count, the spread of what followed, each episode, and the honesty lines. '' when there is no result. */
export function analogueResultHtml(r) {
  const o = r?.outcomes?.spx;
  if (!r || !o) return '<p class="muted">Not enough history that looked like today on these markets to say anything.</p>';
  const vix = r.outcomes.vix, mixed = o.up > 0 && o.up < o.n;
  const eps = o.each.map(e => `<span class="chip mono ${e.pct > 0 ? 'up' : 'dn'}">${esc(e.date)} ${sg(e.pct)}</span>`).join(' ');
  return `<div style="font-size:13px">The board looked like this on <b>${o.n}</b> other occasions since ${esc(r.episodes[0].date)}, judged on ${esc(r.keys.join(', '))}. Over the ${r.horizon} sessions that followed, the S&amp;P was <b>higher ${o.up} times and lower ${o.n - o.up}</b>, from <b>${sg(o.lo)}</b> to <b>${sg(o.hi)}</b>, median ${sg(o.median)}.${vix ? ` The VIX was higher ${vix.up} of ${vix.n} times.` : ''}</div>
<div style="margin:8px 0;display:flex;flex-wrap:wrap;gap:6px">${eps}</div>
<p class="muted" style="font-size:12px">${r.oneRegime ? `<b>Read that as ONE observation, not ${o.n}.</b> Every match falls between ${esc(r.span.from)} and ${esc(r.span.to)}, a single stretch of history, not ${o.n} independent occasions. ` : ''}${mixed ? `The spread matters more than the median: ${o.n} episodes ranging ${sg(o.lo)} to ${sg(o.hi)} describe a market that could do either.` : `Every episode went the same way, which on ${o.n} is as likely to be an accident of a small count as a pattern.`} History arranged so a claim can be checked; it has not been through this desk's pre-registration, and episodes are only alike on ${r.keys.length} dimensions.</p>`;
}

export function analogueHtml() {
  return `<div class="sec"><h2>Has this happened before?</h2><span class="lbl">past days that looked like today on a few markets, and what followed: every match shown as a spread · description, not a forecast</span></div>
<div class="card" id="ttan" data-analogue="1"><p class="muted">Loading the history…</p></div>`;
}

let BUNDLE = null;
export async function mountAnalogue(root = document) {
  const host = root.querySelector ? root.querySelector('#ttan[data-analogue]') : null;
  if (!host || host.dataset.mounted === '1') return;
  host.dataset.mounted = '1';
  try {
    if (!BUNDLE) { const r = await fetch('/api/drill-series'); BUNDLE = r.ok ? await r.json() : null; }
    if (!BUNDLE?.ok) throw new Error('no series');
  } catch (e) { host.innerHTML = `<p class="muted">The history is not available: ${esc(e.message)}</p>`; return; }
  const avail = SETS.filter(s => s.keys.filter(k => Array.isArray(BUNDLE.series?.[k])).length >= 2);
  if (!avail.length) { host.innerHTML = '<p class="muted">None of the market sets are held in the series bundle.</p>'; return; }
  const paint = id => {
    const s = avail.find(x => x.id === id) ?? avail[0];
    let r = null; try { r = analogues(BUNDLE, s.keys, { outcomes: ['spx', 'vix'] }); } catch (e) { r = null; }
    host.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px"><span class="lbl">Judged on</span>${avail.map(x => `<button class="chip ${x.id === s.id ? 'gold' : ''}" data-set="${x.id}">${esc(x.label)}</button>`).join('')}</div>${analogueResultHtml(r)}`;
    host.querySelectorAll('[data-set]').forEach(b => { b.onclick = () => paint(b.dataset.set); });
  };
  paint(avail[0].id);
}
