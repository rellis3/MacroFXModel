/**
 * Desk Terminal, Macro tab: the Rates & policy board (HTML). Drawn with the terminal's own classes (.sec .card .grid
 * .lbl .mono .n .chip .muted .up .dn), beside the term-premium and Fed-path boards it reads alongside. The numbers come
 * from js/terminal/ratesBoardCore.js; this file only lays them out.
 *
 * Direction colours follow the neighbouring Fed-path card: cuts green, hikes red. Yield and slope changes carry a sign
 * and no colour (a rising yield is neither good nor bad). Everything is dated; a print more than four days old is
 * dimmed and says so.
 */
import { fedPathRows, reconcile, gapStrip } from './ratesBoardCore.js';
import { chipFor } from './corrEvidence.js';

const defEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const defSgn = (x, d = 0) => (x == null || !Number.isFinite(+x) ? '–' : `${x > 0 ? '+' : ''}${(+x).toFixed(d)}`);

const STALE_DAYS = 4;   // a long weekend plus a day: past this a daily print is late, not just between prints

/** The curve now against a week and a month ago, as an inline SVG on one shared yield scale. */
export function curveSvg(curve, esc = defEsc) {
  const lines = [['now', curve?.now, 'var(--tx)', '', 2.2], ['a week ago', curve?.w1, 'var(--pur2)', '5 3', 1.6], ['a month ago', curve?.m1, 'var(--tx3)', '2 3', 1.4]].filter(l => l[1]?.pts?.length);
  if (!lines.length || !curve?.now) return '';
  const ks = curve.now.pts.map(p => p.k), W = 460, H = 180, L = 34, R = 14, T = 12, B = 26;
  const vals = lines.flatMap(l => l[1].pts.map(p => p.v));
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = Math.max(0.05, (hi - lo) * 0.18); lo -= pad; hi += pad;
  const x = k => L + (ks.indexOf(k) / Math.max(1, ks.length - 1)) * (W - L - R), y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [0, 1, 2, 3].map(i => lo + (hi - lo) * (i / 3));
  const grid = ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 5}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${v.toFixed(2)}</text>`).join('');
  const xl = ks.map(k => `<text x="${x(k).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--tx3)" font-family="var(--mono)">${esc(k.toUpperCase())}</text>`).join('');
  const paths = [...lines].reverse().map(([n, c, col, dash, w]) => {
    const pts = c.pts.filter(p => ks.includes(p.k));
    return `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.k).toFixed(1)},${y(p.v).toFixed(1)}`).join('')}" fill="none" stroke="${col}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}><title>${esc(n)} (${esc(c.date)})</title></path>`;
  }).join('');
  const dots = curve.now.pts.map(p => `<circle cx="${x(p.k).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.2" fill="var(--tx)"><title>${esc(p.k.toUpperCase())} ${p.v.toFixed(2)}% (${esc(p.asOf)})</title></circle>`).join('');
  const leg = lines.map(([n, c, col, dash]) => `<span style="display:inline-flex;align-items:center;gap:6px"><svg width="22" height="8" aria-hidden="true"><line x1="0" x2="22" y1="4" y2="4" stroke="${col}" stroke-width="2"${dash ? ` stroke-dasharray="${dash}"` : ''}/></svg>${esc(n)} <span class="muted mono">${esc(String(c.date).slice(5))}</span></span>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="US Treasury curve now, a week ago and a month ago">${grid}${xl}${paths}${dots}</svg><div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--tx2);margin-top:4px">${leg}</div>`;
}

const ageChip = (asOf, age) => (age != null && age > STALE_DAYS ? ` <span class="chip gold" title="last print ${defEsc(asOf)}">${age}d old</span>` : '');
const dim = age => (age != null && age > STALE_DAYS ? ' style="opacity:.55"' : '');

/**
 * The whole board. rb = /api/rates-board, fp = the terminal's E['fed-path'], gy = E['global-yields'].
 * h = { esc, spk, sgn } from the page; defaults make it testable on its own.
 */
export function boardHtml(rb, fp, gy, h = {}) {
  if (!rb?.ok) return '';
  const esc = h.esc ?? defEsc, sgn = h.sgn ?? defSgn, spk = h.spk ?? (() => '');
  const bp = v => (v == null ? '–' : `${v > 0 ? '+' : ''}${Math.round(v)}bp`);
  const pct = (p, n) => (p == null ? '–' : `${p}<span class="muted" style="font-size:10px"> n${n}</span>`);
  const zq = fp?.ok ? fp.zq : null;
  const path = zq?.meetings?.length ? fedPathRows(zq, rb) : null;
  const rec = reconcile(rb, path);
  const gaps = gapStrip(gy?.rows);

  const tenorCells = rb.tenors.map(t => `<div${dim(t.ageDays)}><span class="lbl">${esc(t.k.toUpperCase())}</span><div class="mono" style="font-size:20px">${t.level.toFixed(2)}%</div><div class="muted mono" style="font-size:11.5px">1d ${bp(t.chg1d)} · 5d ${bp(t.chg5d)} · 20d ${bp(t.chg20d)}</div></div>`).join('');
  const curveCard = `<div class="card"><div class="ch"><span class="lbl">US Treasury curve</span><span class="r muted">${esc(rb.asOf)}${ageChip(rb.asOf, rb.tenors[0]?.ageDays)}</span></div>
<div class="grid g4">${tenorCells}</div>
<div style="margin-top:10px">${curveSvg(rb.curve, esc)}</div>
<p class="muted" style="font-size:12px">Constant-maturity yields, daily (FRED H.15), so the last print is the prior close.</p></div>`;

  const slopeRows = rb.slopes.map(s => `<tr${dim(s.ageDays)}><td><b>${esc(s.k)}</b> <span class="muted">${esc(s.label)}</span>${s.inverted ? ' <span class="chip dn">inverted</span>' : ''}</td><td class="n mono">${bp(s.bp)}</td><td class="n mono">${bp(s.chg1d)}</td><td class="n mono">${bp(s.chg5d)}</td><td class="n mono">${bp(s.chg20d)}</td><td class="n mono">${pct(s.pct1y, s.n1y)}</td><td class="n mono">${pct(s.pct5y, s.n5y)}</td><td>${spk(s.spark, 90, 22)}</td></tr>`).join('');
  const slopeCard = `<div class="card"><div class="ch"><span class="lbl">Slopes · where each sits in its own history</span><span class="r muted">${esc(rb.slopes[0]?.asOf ?? '')}${ageChip(rb.slopes[0]?.asOf, rb.slopes[0]?.ageDays)}</span></div>
<div class="scroll"><table><thead><tr><th>Slope</th><th class="n">Now</th><th class="n">1d</th><th class="n">5d</th><th class="n">20d</th><th class="n">1y pct</th><th class="n">5y pct</th><th>60 prints</th></tr></thead><tbody>${slopeRows}</tbody></table></div>
<p class="muted" style="font-size:12px">Slope = the longer yield minus the shorter, in basis points: a positive 5-day change is a steepening, a negative one a flattening. Percentiles are the share of daily prints in the ${esc(rb.window?.pct1y ?? 'trailing 1 year')} and the ${esc(rb.window?.pct5y ?? 'trailing 5 years')} (n = prints used) that sat at or below today's value.</p></div>`;

  const ev = [chipFor('stir-wide-scan', 'The Fed-path slope led EURUSD, DAX, silver and AUD by 15 minutes to 2 hours in discovery; on untouched data it was below one spread.'), chipFor('cog-rate-futures-other-tests', 'The meeting-month strip carried nothing forward for Nasdaq.')].filter(Boolean).join('').replace(/<span class="chip/g, '<span style="white-space:normal;font-size:9.5px" class="chip');
  const stamp = `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:12px;padding-top:10px;border-top:1px dashed var(--line)"><span class="lbl">Evidence Book</span>${ev}<span class="muted" style="font-size:11.5px">Context, not a signal. The 15-minute lead is a banked null and nothing here tests a daily repricing.</span></div>`;

  let pathCard = '';
  if (path?.rows?.length) {
    const r = path.rows, hz = path.horizons;
    const wk = path.week;
    const rowsHtml = r.map(m => `<tr><td class="mono">${esc(m.meeting)}${m.thin ? ' <span class="chip gold" title="that contract traded almost nothing; the price is stale">thin</span>' : ''}</td><td class="n mono ${m.moveBp < 0 ? 'up' : m.moveBp > 0 ? 'dn' : ''}">${sgn(m.moveBp, 0)}bp</td><td class="n mono">${m.probPct ?? '–'}% ${esc(m.direction ?? '')}</td><td class="n mono">${sgn(m.cumBp, 0)}bp</td><td class="n mono muted">${m.weekAgoMoveBp != null ? `${sgn(m.weekAgoMoveBp, 0)}bp` : '–'}</td><td class="n mono ${m.dMoveBp > 0 ? 'dn' : m.dMoveBp < 0 ? 'up' : ''}">${m.dMoveBp != null ? `${sgn(m.dMoveBp, 1)}bp` : '–'}</td></tr>`).join('');
    const hzHtml = hz.map(x => `<tr><td><b>Priced ${esc(x.label)}</b> <span class="muted mono">${esc(x.meeting)}</span>${x.thin ? ' <span class="chip gold" title="a contract on the way to this meeting traded almost nothing">thin</span>' : ''}</td><td class="n mono">${sgn(x.steps, 1)} steps</td><td class="n mono muted">${x.weekAgoSteps != null ? `${sgn(x.weekAgoSteps, 1)} a week ago` : '–'}</td><td class="n mono">${x.dSteps != null ? `${sgn(x.dSteps, 1)} on the week` : '–'}</td></tr>`).join('');
    pathCard = `<div class="card"><div class="ch"><span class="lbl">Policy path beside the curve · fed funds futures</span><span class="r muted">${esc(String(path.asOf ?? '').slice(0, 10))}</span></div>
<div class="scroll"><table><thead><tr><th>Meeting</th><th class="n">Move</th><th class="n">Odds</th><th class="n">Cumulative</th><th class="n">A week ago</th><th class="n">Change</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
${hz.length ? `<div class="scroll" style="margin-top:8px"><table><tbody>${hzHtml}</tbody></table></div>` : ''}
<div class="grid g4" style="margin-top:10px"><div><span class="lbl">2Y, 5 days</span><div class="mono" style="font-size:18px">${bp(wk.y2)}</div></div><div><span class="lbl">10Y, 5 days</span><div class="mono" style="font-size:18px">${bp(wk.y10)}</div></div><div><span class="lbl">2s10s, 5 days</span><div class="mono" style="font-size:18px">${bp(wk.s2s10)}</div></div><div><span class="lbl">Path vs a week ago</span><div class="mono" style="font-size:18px">${hz[0]?.dSteps != null ? `${sgn(hz[0].dSteps, 1)} steps` : '–'}</div></div></div>
<p class="muted" style="font-size:12px">A step is 25bp. Cuts green, hikes red, as on the Fed-path card. This sets the repricing of the policy path and the week's move in the 2Y, 10Y and 2s10s side by side: it does not say one caused the other, and only one week of per-meeting history is served, so there is no correlation to show. Odds above 100% mean more than one step is priced. The back half of the strip trades thinly and is flagged.</p>${stamp}</div>`;
  } else {
    pathCard = `<div class="card"><div class="ch"><span class="lbl">Policy path beside the curve · fed funds futures</span></div><p class="muted">The per-meeting fed funds futures strip is not loaded (it is pulled nightly from the laptop). The curve and slopes above stand on their own.</p>${stamp}</div>`;
  }

  const recCard = rb.policy ? `<div class="card"><div class="ch"><span class="lbl">Two measures of "policy priced in"</span><span class="r muted">${esc(rb.policy.twoYearAsOf)}</span></div>
<div class="grid g4"><div><span class="lbl">2Y proxy</span><div class="mono" style="font-size:20px">${sgn(rec.proxy, 1)} steps</div><div class="muted" style="font-size:11.5px">2Y ${rb.policy.twoYear.toFixed(2)}% vs fed funds ${rb.policy.effr.toFixed(2)}% = ${bp(rb.policy.gapBp)} · ${esc(rb.policy.direction)}</div></div>
<div><span class="lbl">Futures strip</span><div class="mono" style="font-size:20px">${rec.strip != null ? `${sgn(rec.strip, 1)} steps` : '–'}</div><div class="muted" style="font-size:11.5px">${rec.stripLabel ? esc(rec.stripLabel) : 'not loaded'}${path?.thinAny ? ' · later meetings thin' : ''}</div></div>
<div><span class="lbl">Difference</span><div class="mono" style="font-size:20px">${rec.diff != null ? `${sgn(rec.diff, 1)} steps` : '–'}</div></div></div>
<p class="muted" style="font-size:12px">They measure different things and are not meant to match. The 2-year proxy is an average over two years and carries term premium; the futures strip is a decision-by-decision path about a year out and is only reliable for the first few meetings. A gap between them says where the market's two-year view differs from the nearer path, not that either is wrong.</p></div>` : '';

  const gapCard = gaps.length ? `<div class="card"><div class="ch"><span class="lbl">10-year gap to Treasuries</span><span class="r muted">from the global yields board above</span></div><div class="scroll"><table><thead><tr><th>Country</th><th class="n">Gap</th><th class="n">20d change</th></tr></thead><tbody>${gaps.map(g => `<tr title="${esc(g.note ?? '')}"><td><b>${esc(g.short)}</b> <span class="muted">${esc(g.ccy)}</span></td><td class="n mono">${bp(g.gapBp)}</td><td class="n mono ${g.chg20d > 0 ? 'up' : g.chg20d < 0 ? 'dn' : ''}">${bp(g.chg20d)}</td></tr>`).join('')}</tbody></table></div><p class="muted" style="font-size:12px">The country's 10-year yield minus the US 10-year. A widening gap in a currency's favour is green. Descriptive: tested here as a same-window link only, with no forward lead (see the chain).</p></div>` : '';

  return `<div class="sec"><h2>Rates &amp; policy</h2><span class="lbl">the Treasury curve, its slopes against their own history, and the priced Fed path beside them · context, not a signal</span></div>
<div class="grid g2">${curveCard}${slopeCard}</div>
<div style="margin-top:14px">${pathCard}</div>
<div class="grid g2" style="margin-top:14px">${recCard}${gapCard}</div>`;
}
