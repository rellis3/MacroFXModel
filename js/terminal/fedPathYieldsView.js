/**
 * Desk Terminal, Macro tab: "The Fed path against the yields" (HTML). The numbers come from js/fedPathYieldsCore.js; this file
 * only lays them out, with the terminal's own classes (.sec .card .grid .lbl .mono .n .chip .muted .up .dn) and tokens only
 * (js/terminal/themeTokens.test.mjs forbids a hard-coded colour).
 *
 * Direction colours follow the neighbouring Fed-path and Rates cards: a priced hike is red, a priced cut green. Yield changes carry
 * a sign and no colour (a rising yield is neither good nor bad). Wording is "priced", never "forecast"; the board says what it is
 * not (a signal) and why (the 15-minute lead is a banked null, no daily test exists).
 */
import { fedPathYields, atlantaWindows } from '../fedPathYieldsCore.js';
import { chipFor } from './corrEvidence.js';
import { ownerLink, ownerOnly } from './links.js';

const defEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bp = v => (v == null || !Number.isFinite(+v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))}bp`);
const pc = v => (v == null || !Number.isFinite(+v) ? '–' : `${Math.round(v * 100)}%`);

/** The matrix: rows = what moved, columns = the three chain windows. */
function matrix(res, esc) {
  const W = res.windows;
  const rows = [
    { l: '2Y yield', always: true, fn: w => bp(w.y2) },
    { l: '2s10s slope', always: true, fn: w => bp(w.s2s10) },
    { l: '10Y yield', always: true, fn: w => bp(w.y10) },
    ...['by December', 'by June'].map((lab, i) => ({ l: `Priced fed funds ${lab.replace('by ', 'after ')}`, fn: w => { const x = w.horizons?.[i] ?? null; return x ? `${x.agoRateAfter != null ? bp(x.dBp) : '–'}${x.thin ? ' <span class="chip gold" title="a contract on the way to this meeting traded almost nothing">thin</span>' : ''}` : '–'; }, cls: w => { const x = w.horizons?.[i]; return x?.dBp > 0 ? 'dn' : x?.dBp < 0 ? 'up' : ''; } })),
    { l: 'Futures path accounts for (of the 2Y)', fn: w => `${bp(w.path)}${w.share != null ? ` <span class="muted">${pc(w.share)}</span>` : ''}` },
    { l: 'The rest: term premium / inflation compensation', fn: w => bp(w.remainder) },
  ];
  const body = rows.map(r => `<tr><td>${esc(r.l)}</td>${W.map(w => (w.available || r.always
    ? `<td class="n mono ${typeof r.cls === 'function' ? r.cls(w) : ''}">${r.fn(w)}</td>`
    : `<td class="n muted" title="${esc(w.reason ?? '')}">n/a</td>`)).join('')}</tr>`).join('');
  const heads = W.map(w => `<th class="n">${esc(w.label)}${w.available ? `<div class="muted" style="font-weight:400;font-size:10px">vs ${esc(w.agoAsOf.slice(5))}</div>` : ''}</th>`).join('');
  return `<div class="scroll"><table><thead><tr><th>Change over the window</th>${heads}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/** The Atlanta Fed window odds. A 3-month AVERAGE over a forward WINDOW; never relabelled as a meeting. */
function atlantaCard(a, esc) {
  if (!a?.rows?.length) return '';
  const dl = v => (v == null ? '–' : `<span class="${v > 0 ? 'dn' : v < 0 ? 'up' : ''}">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}pp</span>`);
  const rows = a.rows.map(r => `<tr><td class="mono">${esc(r.ref)}</td>
<td class="n mono" style="min-width:150px"><span style="display:inline-block;height:8px;width:${Math.max(2, Math.min(100, r.hike ?? 0)) * 0.9}px;background:var(--dn);opacity:.55;border-radius:2px;vertical-align:middle;margin-right:6px"></span>${r.hike != null ? `${r.hike.toFixed(1)}%` : '–'}</td>
<td class="n mono">${dl(r.d1)}</td><td class="n mono">${dl(r.w1)}</td><td class="n mono">${dl(r.m1)}</td><td class="n mono muted">${r.cut != null ? `${r.cut.toFixed(1)}%` : '–'}</td></tr>`).join('');
  return `<div class="card"><div class="ch"><span class="lbl">Atlanta Fed window odds · rate above the current range</span><span class="r muted">${esc(a.asOf ?? '')}${a.ageDays != null && a.ageDays > 4 ? ` <span class="chip gold">${a.ageDays}d old</span>` : ''}</span></div>
<div class="scroll"><table><thead><tr><th>Window starts</th><th class="n">Above now</th><th class="n">1 day</th><th class="n">1 week</th><th class="n">1 month</th><th class="n">Below now</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="muted" style="font-size:12px">The probability that the 3-month <b>average</b> rate over each forward <b>window</b> ends above the current target range${a.currentRange ? ` (${esc(a.currentRange)})` : ''}, from CME three-month SOFR options. These are windows, not FOMC meetings: the per-meeting numbers above come from fed funds futures and will differ by a few points. Changes are percentage points.</p></div>`;
}

/**
 * The whole board. fp = /api/fed-path, rb = /api/rates-board, tp = /api/term-premium (optional).
 * h = { esc } from the page; the default makes it testable on its own.
 */
export function boardHtml(fp, rb, tp, h = {}, now = Date.now()) {
  const esc = h.esc ?? defEsc;
  const res = fedPathYields({ fp, board: rb, tp, now });
  const head = `<div class="sec"><h2>The Fed path against the yields</h2><span class="lbl">does the priced policy path move the 2Y, the curve and the 10Y? · same dates for both · context, not a signal</span></div>`;
  if (!res.ok) return `${head}<div class="card"><p class="muted">${esc(res.error ?? 'not loaded')}. The curve and policy board above stand on their own.</p></div>`;
  const avail = res.windows.filter(w => w.available);
  const sentences = avail.map(w => `<div style="margin:4px 0;display:flex;gap:8px;align-items:baseline"><span class="chip" style="min-width:34px;text-align:center;flex:none">${esc(w.label)}</span><span>${esc(w.sentence ?? '')}</span></div>`).join('');
  const missing = res.windows.filter(w => !w.available).map(w => `${esc(w.label)}: ${esc(w.reason)}`).join(' · ');
  const ev = [chipFor('stir-wide-scan', 'The Fed-path slope led EURUSD, DAX, silver and AUD by 15 minutes to 2 hours in discovery; on untouched data it was below one spread.')].filter(Boolean).join('').replace(/<span class="chip/g, '<span style="white-space:normal;font-size:9.5px" class="chip');
  const stamp = `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:12px;padding-top:10px;border-top:1px dashed var(--line)"><span class="lbl">Evidence Book</span>${ev}<span class="muted" style="font-size:11.5px">Context, not a signal. The 15-minute lead is a banked null and no daily repricing is tested; this lays the priced path beside the yields and says nothing about what comes next.</span></div>`;
  const link = ownerOnly(` ${ownerLink('fed-path.html', 'Fed path page')}.`);
  const p = res.proxy;
  const proxyLine = p.proxy != null && p.strip != null
    ? `<div class="muted" style="font-size:12px;margin-top:8px"><b>Two measures of policy priced in:</b> the 2Y less fed funds says ${p.proxy >= 0 ? '+' : '−'}${Math.abs(p.proxy).toFixed(1)} steps; the futures strip says ${p.strip >= 0 ? '+' : '−'}${Math.abs(p.strip).toFixed(1)} (${esc(p.stripLabel ?? '')}): ${p.diverges ? '<span class="chip gold">diverge</span> ' : ''}${esc(p.note)}.</div>` : '';
  const notes = res.notes.length ? `<div class="muted" style="font-size:12px;margin-top:6px">${res.notes.map(n => esc(n[0].toUpperCase() + n.slice(1))).join('. ')}.</div>` : '';
  const term = res.term?.chg20d != null ? ` The Kim-Wright 10-year term premium is ${res.term.value}% (${bp(res.term.chg20d)} in 20 days).` : '';
  const card = `<div class="card"><div class="ch"><span class="lbl">Priced path and yields, same dates</span><span class="r muted">strip ${esc(res.asOf)}${res.stale ? ` <span class="chip gold">${res.ageDays}d old</span>` : ''}</span></div>
${avail.length ? `<div style="font-size:13.5px;line-height:1.5;margin-bottom:10px">${sentences}</div>` : ''}
${matrix(res, esc)}
${missing ? `<div class="muted" style="font-size:12px;margin-top:6px">Not shown: ${missing}.</div>` : ''}
${proxyLine}${notes}
<p class="muted" style="font-size:12px;margin-top:8px">1D, 5D and 20D are the chain's windows (1, 5 and 20 trading days: 1, 7 and 28 calendar days here, for both the strip and the yields). "The futures path accounts for" is the change in the average policy rate priced over the next two years (the 2Y's horizon), taking the strip as far as its liquid contracts and holding the last liquid rate flat; it is an approximation, not a decomposition. The rest is everything else in the 2Y, mainly term premium and inflation compensation. Yields are daily prints (the prior close). A priced hike is red, a priced cut green; yields carry no colour.${esc(term)}${link}</p>${stamp}</div>`;
  return `<div class="sfc" data-surface="panel.macro.fedyields">${head}<div class="grid g2">${card}${atlantaCard(atlantaWindows(fp), esc)}</div></div>`;
}
