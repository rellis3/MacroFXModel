/**
 * Desk Terminal, Macro > Rates & curve: "The Bank of England path" (HTML). The numbers come from js/boePath.js through /api/cb-path/boe; this file only lays them out,
 * with the terminal's own classes (.sec .card .grid .lbl .mono .n .chip .muted .up .dn .scroll) and tokens only (js/terminal/themeTokens.test.mjs forbids a hard-coded
 * colour). Same drawing language as the Fed path ribbon (js/terminal/fedPathYieldsViz.js): a gold glowing line for now, violet marks for earlier readings, a sweep that
 * is off under prefers-reduced-motion.
 *
 * Wording is "priced", never "forecast". Direction colours follow the Fed-path cards: a priced hike is red, a priced cut green. The card says how the numbers are made
 * and that the Bank's curve is smoothed, so one meeting blurs into its neighbours.
 */
import { smooth } from './fedPathYieldsViz.js';
import { ageChip } from './dataAge.js';
import { chipFor } from './corrEvidence.js';

const defEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fin = v => v != null && Number.isFinite(+v);
const f1 = v => (Math.round(v * 10) / 10).toString();
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayWord = iso => `${+String(iso).slice(8, 10)} ${MON[+String(iso).slice(5, 7) - 1] ?? ''}`;
const dayYear = iso => `${dayWord(iso)} ${String(iso).slice(0, 4)}`;
export const bp = v => (!fin(v) ? '–' : `${v > 0.5 ? '+' : v < -0.5 ? '−' : ''}${Math.abs(Math.round(v))}bp`);
const pct2 = v => (fin(v) ? `${(+v).toFixed(2)}%` : '–');
export function stepWords(n) {
  if (n < 0.35) return 'a fraction of a step';
  const h = Math.round(n * 2) / 2;
  return h === 0.5 ? 'about half a step' : h === 1 ? 'about one step' : h === 1.5 ? 'about one and a half steps' : `about ${Number.isInteger(h) ? h : h.toFixed(1)} steps`;
}

/** The rule-built sentences from the numbers (no model, nothing invented). */
export function boeSentences(doc) {
  if (!doc?.ok) return [];
  const m = doc.meetings ?? [], out = [];
  const lc = doc.bankRate?.lastChange;
  const recent = lc && doc.asOf && (Date.parse(doc.asOf) - Date.parse(lc.date)) / 86400000 < 120;
  out.push(`Bank Rate is ${pct2(doc.bankRate.pct)}${recent ? `, ${lc.to > lc.from ? 'raised' : 'cut'} from ${pct2(lc.from)} on ${dayWord(lc.date)}` : ''}.`);
  if (m[0]) {
    const r = m[0];
    const chance = r.dir === 'hold' ? 'nothing priced' : r.multi ? `more than one 25bp step priced (${r.steps} steps)` : `a ${Math.round(r.pMove * 100)}% chance of a 25bp ${r.dir} on the Bank's usual step`;
    out.push(`At the next meeting (${dayWord(r.date)}) the curve prices ${bp(r.stepBp)}: ${chance}.`);
  }
  const later = m.find(r => r.daysAway >= 90) ?? m.at(-1);
  if (later && later !== m[0]) out.push(`By ${dayWord(later.date)} the running total is ${bp(later.cumBp)} (${pct2(later.levelPct)}), ${stepWords(Math.abs(later.cumBp) / 25)}.`);
  const yr = (doc.levels ?? []).find(l => l.months === 12);
  if (yr) out.push(`Twelve months out the curve is at ${pct2(yr.levelPct)}.`);
  return out;
}

/** The priced Bank Rate after each meeting: gold line now, violet ghosts for 1 day, 1 week and 1 month ago (only where every meeting has an earlier level). */
export function ribbonSvg(doc, { idp = 'boe' } = {}) {
  const rows = (doc?.meetings ?? []).filter(r => fin(r.levelPct)).slice(0, 7);
  if (!doc?.ok || rows.length < 2) return '';
  const W = 560, H = 230, L = 44, R = 22, T = 26, B = 38;
  const xs = i => L + (i / rows.length) * (W - L - R);
  const now = [doc.bankRate.pct, ...rows.map(r => r.levelPct)];
  const spec = [['d1', '1 day ago', 'var(--tx3)', '2 4', 1.2], ['w1', '1 week ago', 'var(--pur2)', '5 4', 1.8], ['m1', '1 month ago', 'var(--tx3)', '1 5', 1.2]];
  const ghosts = spec.map(([k, label, color, dash, sw]) => {
    const tk = doc.ticks?.[k]; if (!tk || !fin(tk.bankRate)) return null;
    const lv = rows.map(r => r.ticks?.[k]); if (lv.some(v => !fin(v))) return null;
    return { k, label: `${label} (${dayWord(tk.asOf)})`, color, dash, sw, v: [tk.bankRate, ...lv] };
  }).filter(Boolean);
  const all = [...now, ...ghosts.flatMap(g => g.v)];
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 0.2) { const c = (hi + lo) / 2; lo = c - 0.1; hi = c + 0.1; }
  const pad = (hi - lo) * 0.18; lo -= pad; hi += pad;
  const y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const pts = v => v.map((a, i) => [xs(i), y(a)]);
  const grid = [0, 1, 2].map(k => { const v = lo + (hi - lo) * (k / 2); return `<line x1="${L}" x2="${W - R}" y1="${f1(y(v))}" y2="${f1(y(v))}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${f1(y(v) + 3.5)}" text-anchor="end" font-size="10" fill="var(--tx3)" font-family="var(--mono)">${v.toFixed(2)}</text>`; }).join('');
  const xl = [`<text x="${f1(xs(0))}" y="${H - 14}" text-anchor="middle" font-size="10" fill="var(--tx3)" font-family="var(--mono)">${defEsc(dayWord(doc.asOf))}</text>`, ...rows.map((r, i) => `<text x="${f1(xs(i + 1))}" y="${H - 14}" text-anchor="middle" font-size="10" fill="var(--tx3)" font-family="var(--mono)">${defEsc(dayWord(r.date))}</text>`)].join('');
  const gh = ghosts.map(g => `<path d="${smooth(pts(g.v))}" fill="none" stroke="${g.color}" stroke-width="${g.sw}" stroke-dasharray="${g.dash}" opacity=".9"><title>${defEsc(g.label)}</title></path>`).join('');
  const P = pts(now), d = smooth(P);
  const glow = `<defs><filter id="${idp}-glow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="3.2"/></filter></defs>`;
  const line = `<path class="fpy-glowline fpy-sweep" d="${d}" pathLength="1" fill="none" stroke="var(--gold)" stroke-width="8" stroke-linecap="round" filter="url(#${idp}-glow)" opacity=".45"/><path class="fpy-sweep" d="${d}" pathLength="1" fill="none" stroke="var(--gold)" stroke-width="2.8" stroke-linecap="round"/>`;
  const dots = P.map((p, i) => `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${i === 0 ? 3.4 : 4.2}" fill="${i === 0 ? 'var(--bg)' : 'var(--gold)'}" stroke="var(--gold)" stroke-width="1.6"><title>${i === 0 ? 'Bank Rate now' : `after ${defEsc(dayWord(rows[i - 1].date))}`}: ${now[i].toFixed(2)}%</title></circle><text x="${f1(p[0])}" y="${f1(p[1] - 9)}" text-anchor="middle" font-size="10.5" fill="var(--tx)" font-family="var(--mono)">${now[i].toFixed(2)}</text>`).join('');
  const leg = [['now', 'var(--gold)', ''], ...ghosts.map(g => [g.label, g.color, g.dash])].map(([n, c, dd]) => `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:12px"><svg width="22" height="6" aria-hidden="true"><line x1="0" x2="22" y1="3" y2="3" stroke="${c}" stroke-width="2" ${dd ? `stroke-dasharray="${dd}"` : ''}/></svg>${defEsc(n)}</span>`).join('');
  return `<svg class="fpy-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Bank Rate priced after each of the next MPC meetings, now against earlier readings">${glow}${grid}${xl}${gh}${line}${dots}</svg><div class="fpy-leg">${leg}</div>`;
}

const chipRate = '<span class="chip ct-ev" title="What the market has priced from the Bank of England OIS curve. It is what is priced, not what will happen, and a 25bp step is the Bank&#39;s habit, not a rule.">RATE PATH: PRICED, NOT FORECAST</span>';

/** The table: one row per meeting. */
function table(doc, esc) {
  const rows = (doc.meetings ?? []).map(r => {
    const cls = r.dir === 'hike' ? 'dn' : r.dir === 'cut' ? 'up' : '';
    const w = Math.max(2, Math.min(100, Math.round(r.pMove * 100)));
    const dl = k => (fin(r.ticks?.[k]) ? `${bp((r.levelPct - r.ticks[k]) * 100)}` : '–');
    const word = r.dir === 'hold' ? 'hold' : r.multi ? `${r.steps} steps` : `${r.dir} ${Math.round(r.pMove * 100)}%`;
    return `<tr><td class="mono">${esc(dayWord(r.date))}</td><td class="n mono muted">${r.daysAway}d</td><td class="n mono ${cls}">${bp(r.stepBp)}</td>
<td class="n mono" style="min-width:150px"><span style="display:inline-block;height:8px;width:${w * 0.9}px;background:var(${r.dir === 'cut' ? '--up' : '--dn'});opacity:.55;border-radius:2px;vertical-align:middle;margin-right:6px"></span>${esc(word)}</td>
<td class="n mono">${pct2(r.levelPct)}</td><td class="n mono muted">${dl('d1')}</td><td class="n mono muted">${dl('w1')}</td><td class="n mono muted">${dl('m1')}</td></tr>`;
  }).join('');
  return `<div class="scroll"><table><thead><tr><th>MPC meeting</th><th class="n">In</th><th class="n">Priced move</th><th class="n">Chance of one 25bp step</th><th class="n">Bank Rate after</th><th class="n">1 day</th><th class="n">1 week</th><th class="n">1 month</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/**
 * The whole board. doc = /api/cb-path/boe. h = { esc } from the page. now is for the age chip only.
 * The page wraps it in its surface (sf('panel.macro.boepath', ...) in desk-terminal.html) so the Access page switches it.
 */
export function boePathHtml(doc, h = {}, now = Date.now()) {
  const esc = h.esc ?? defEsc;
  const head = `<div class="sec"><h2>The Bank of England path</h2><span class="lbl">what is priced for Bank Rate at each coming MPC meeting · from the Bank's own OIS curve · priced, not forecast</span></div>`;
  const wrap = body => `${head}${body}`;
  if (doc === undefined) return '';   // the feed has not landed yet: draw nothing, never a spinner
  if (!doc?.ok) {
    const why = doc?.fetch?.reason ?? doc?.error ?? 'not loaded';
    return wrap(`<div class="card"><p class="muted">The Bank of England path is not available: ${esc(why)}. The Fed path and the curve above stand on their own.</p></div>`);
  }
  const sentences = boeSentences(doc).map(s => `<div style="margin:3px 0">${esc(s)}</div>`).join('');
  const chip = ageChip({ asOf: doc.asOf, what: 'curve dated', warnH: 96, badH: 168, now, source: 'Bank of England file, published the next business day' });
  const stale = doc.meetingsInfo?.stale ? `<div class="muted" style="font-size:12px;margin-top:6px"><span class="chip gold">meeting list needs updating</span> Fewer than two MPC dates remain in the list this card uses (${esc(doc.meetingsInfo.source === 'page' ? "read from the Bank's page" : 'the hand-kept list')}, last checked ${esc(doc.meetingsInfo.readAt ? String(doc.meetingsInfo.readAt).slice(0, 10) : doc.meetingsInfo.listVerified ?? '')}).</div>` : '';
  const ticks = [['d1', '1 day'], ['w1', '1 week'], ['m1', '1 month']].filter(([k]) => !doc.ticks?.[k]).map(([, l]) => l);
  const missing = ticks.length ? `<div class="muted" style="font-size:12px;margin-top:6px">No earlier curve held yet for: ${esc(ticks.join(', '))}. Our own daily copies fill these in as days pass (${doc.historyDays ?? 0} held).</div>` : '';
  const ribbon = ribbonSvg(doc);
  const ev = chipFor('stir-wide-scan', 'Short-rate futures as a lead on 18 markets: nothing survived.');
  const stamp = `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:12px;padding-top:10px;border-top:1px dashed var(--line)"><span class="lbl">Evidence Book</span>${chipRate}${ev}<span class="muted" style="font-size:11.5px">Context, not a signal.</span></div>`;
  const lc = doc.bankRate?.lastChange;
  const words = `<div class="card"><div class="ch"><span class="lbl">In words</span><span class="r muted">curve ${esc(doc.asOf)} ${chip}</span></div>
<div style="font-size:13.5px;line-height:1.5">${sentences}</div>${missing}${stale}${stamp}</div>`;
  const draw = ribbon ? `<div class="card"><div class="ch"><span class="lbl">The priced Bank Rate after each meeting</span><span class="r muted">gold now · violet earlier readings</span></div>${ribbon}</div>` : '';
  const grid = draw ? `<div class="grid g2">${draw}${words}</div>` : words;
  const detail = `<div class="card" style="margin-top:14px"><div class="ch"><span class="lbl">Meeting by meeting</span><span class="r muted">${doc.meetings.length} meetings ahead</span></div>
${table(doc, esc)}
<p class="muted" style="font-size:12px;margin-top:8px"><b>How this is made.</b> The Bank publishes the market's expected overnight rate (SONIA swaps) for every future date. For each meeting, the move priced is the average expected rate in the window after it minus the window before it. The Bank's curve is smoothed, so one meeting's size blurs into its neighbours: read the running Bank Rate column before any single meeting's odds. A move of d bp is shown as a d/25 chance of one 25bp step, capped at 100%. Levels are anchored to the official Bank Rate (${pct2(doc.bankRate.pct)}${lc ? `, last changed ${esc(dayYear(lc.date))}` : ''}). The 1 day, 1 week and 1 month columns are how the priced Bank Rate after that meeting has moved.</p></div>`;
  return wrap(`${grid}${detail}`);
}
