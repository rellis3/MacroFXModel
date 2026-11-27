/**
 * Desk Terminal, Macro tab: the boards from the paper-ideas pass (2026-11-14), HTML only. Numbers come from js/paperBoardsCore.js through
 * /api/policy-extra, /api/rates-extra and /api/markets-extra; drawings reuse js/terminal/boardViz.js plus the few marks only these boards need
 * (a spillover network, a coverage rail, wall-distance rails, an FOMC clock). Every colour is a theme token; motion is CSS (.bv-*, .pb-*) and is
 * off under prefers-reduced-motion. Each card sits in its own data-surface so the admin panel switches it.
 *
 * Wording is fixed by the Evidence Book: these boards describe. Where a view touches a banked null or an underpowered result the chip says so;
 * where nothing in the book tests the thing on screen the chip says UNTESTED. Nothing here is a lean, a signal or a trade.
 */
import { ordinal } from './ordinal.js';
import { arcGauge, glowLine, pctRails, esc, fin, uid, clamp, smoothPath } from './boardViz.js';
import { chipFor, untestedChip } from './corrEvidence.js';
import { ownerLink } from './links.js';

const sg = (v, d = 1) => (!fin(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(+v).toFixed(d)}`);
const f1 = v => (Math.round(v * 10) / 10).toString();
const wrap = (_surface, title, sub, body, foot = '') => `<div class="sec"><h2>${esc(title)}</h2><span class="lbl">${esc(sub)}</span></div>${body}${foot ? `<div class="bv-stamp"><span class="lbl">Evidence Book</span>${foot}</div>` : ''}`;   // the page wraps each card in its own surface wrapper (desk-terminal.html, mxSection), which is what the admin panel switches
const missing = (_surface, title, why) => `<div class="sec"><h2>${esc(title)}</h2></div><div class="card"><p class="muted">${esc(why)}</p></div>`;
const ageNote = (asOf, label = 'as of') => (asOf ? `<span class="r muted">${esc(label)} ${esc(String(asOf).slice(0, 10))}</span>` : '');

// ── FOMC event strip ─────────────────────────────────────────────────────────────────────────────────────────────
function fomcClock(m) {
  const w = 520, h = 96, L = 14, R = 14, x = (mins) => L + ((mins - (13 * 60 + 30)) / (16 * 60 - (13 * 60 + 30))) * (w - L - R);   // ET 13:30 .. 16:00
  const id = uid('pbf'), s = x(14 * 60), p = x(14 * 60 + 30), e = x(15 * 60 + 30);
  const tick = [[13 * 60 + 30, '13:30'], [14 * 60, '14:00'], [14 * 60 + 30, '14:30'], [15 * 60, '15:00'], [15 * 60 + 30, '15:30'], [16 * 60, '16:00']].map(([t, l]) => `<line x1="${f1(x(t))}" x2="${f1(x(t))}" y1="62" y2="68" stroke="var(--tx3)"/><text x="${f1(x(t))}" y="82" text-anchor="middle" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${l}</text>`).join('');
  return `<svg class="bv-svg" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="FOMC day clock: statement 14:00 ET, press conference 14:30 ET"><defs><filter id="${id}" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="4"/></filter></defs>
<line x1="${L}" x2="${w - R}" y1="62" y2="62" stroke="var(--line2)"/>
<rect x="${f1(s)}" y="30" width="${f1(p - s)}" height="32" rx="4" fill="var(--gold)" fill-opacity=".26" class="bv-fade"/><rect x="${f1(p)}" y="30" width="${f1(e - p)}" height="32" rx="4" fill="var(--pur)" fill-opacity=".24" class="bv-fade" style="--d:.15s"/>
<text x="${f1((s + p) / 2)}" y="50" text-anchor="middle" font-size="10" fill="var(--tx)">statement</text><text x="${f1((p + e) / 2)}" y="50" text-anchor="middle" font-size="10" fill="var(--tx)">press conference</text>
<g filter="url(#${id})"><circle cx="${f1(s)}" cy="62" r="5" fill="var(--gold)"/><circle cx="${f1(p)}" cy="62" r="5" fill="var(--pur2)"/></g><circle cx="${f1(s)}" cy="62" r="4.5" fill="var(--gold)" stroke="var(--bg1)" stroke-width="1.5"/><circle cx="${f1(p)}" cy="62" r="4.5" fill="var(--pur2)" stroke="var(--bg1)" stroke-width="1.5"/>
<text x="${f1(s)}" y="22" text-anchor="middle" font-size="11" fill="var(--gold2)" font-family="var(--mono)">${esc(m.statementLondon)} London</text><text x="${f1(p)}" y="22" text-anchor="middle" font-size="11" fill="var(--pur2)" font-family="var(--mono)">${esc(m.pressLondon)} London</text>${tick}</svg>`;
}
const dateWord = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export function fomcCard(px) {
  const f = px?.fomc;
  if (!f?.ok || !f.next) return missing('panel.macro.fomcstrip', 'FOMC day: the two windows', f?.error ?? 'The meeting schedule is not loaded yet.');
  const m = f.next, rows = (f.rows ?? []).map(r => `<tr class="${r.done ? 'bv-done' : ''}"><td class="mono">${esc(dateWord(r.date))}${r.sep ? ' <span class="chip" title="Summary of Economic Projections meeting (the dot plot)">SEP</span>' : ''}</td><td class="mono">${esc(r.statementLondon)}</td><td class="mono">${esc(r.pressLondon)}</td><td>${r.done ? '<span class="chip">out</span>' : ''}</td></tr>`).join('');
  const rs = f.rangeShare;
  const share = rs?.available ? `<p class="bv-note">Share of the day's range in each window: statement ${esc(String(rs.statement))}%, press conference ${esc(String(rs.press))}% (${esc(rs.verdict ?? '')}).</p>` : `<p class="muted bv-note">How much of the day's range falls in each window is being measured; no number is shown until the result is banked in the Evidence Book. The strip marks the two windows only.</p>`;
  return wrap('panel.macro.fomcstrip', 'FOMC day: the two windows', 'the statement and the press conference are two separate events inside one afternoon',
    `<div class="grid g2"><div class="card"><div class="ch"><span class="lbl">Next meeting · ${esc(dateWord(m.date))}${m.sep ? ' · with projections' : ''}</span><span class="r muted">times shown in London; the strip is ET</span></div>${fomcClock(m)}${share}</div>
<div class="card"><div class="ch"><span class="lbl">Schedule</span><span class="r muted">London times</span></div><div class="scroll"><table><thead><tr><th>Meeting</th><th>Statement</th><th>Press conf.</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><p class="muted bv-note">${esc(f.note ?? '')}</p></div></div>`,
    untestedChip('The Evidence Book has the dollar drifting after FOMC meetings over days, but nothing on how the day\'s range splits between the statement and the press conference.'));
}

// ── Path differential ────────────────────────────────────────────────────────────────────────────────────────────
export function pathDiffCard(px) {
  const pd = px?.pathDiff;
  if (!pd?.rows?.length) return missing('panel.macro.pathdiff', 'The priced policy path, pair by pair', px?.errors?.cb ?? 'Central-bank expectations are not loaded yet.');
  const w = 560, rowH = 26, L = 70, H = pd.rows.length * rowH + 40, max = Math.max(10, ...pd.rows.flatMap(r => [r.m3, r.m6, r.m12].filter(fin).map(Math.abs))), cx = L + (w - L - 10) / 2, half = (w - L - 10) / 2 - 8, bx = v => (v / max) * half, id = uid('pbp');
  const bars = pd.rows.map((r, i) => {
    const y = 30 + i * rowH, one = (v, k, dy, cls) => (fin(v) ? `<rect x="${f1(v >= 0 ? cx : cx + bx(v))}" y="${y + dy}" width="${f1(Math.abs(bx(v)))}" height="5" rx="2.5" fill="${v >= 0 ? 'var(--gold)' : 'var(--pur2)'}" fill-opacity="${k}" class="bv-fade" style="--d:${(i * 0.04).toFixed(2)}s"><title>${esc(r.pair)} ${cls}: ${sg(v, 0)}bp</title></rect>` : '');
    return `<text x="0" y="${y + 9}" font-size="11.5" fill="var(--tx2)" font-family="var(--mono)">${esc(r.base)}/${esc(r.quote)}</text>${one(r.m3, 0.95, 0, '3 months')}${one(r.m6, 0.65, 7, '6 months')}${one(r.m12, 0.4, 14, '12 months')}<text x="${w}" y="${y + 9}" text-anchor="end" font-size="10" fill="var(--tx3)" font-family="var(--mono)">${fin(r.m12) ? '12m' : fin(r.m6) ? '6m' : '3m'} ${sg(r.m12 ?? r.m6 ?? r.m3, 0)}bp</text>`;
  }).join('');
  const ageWarn = fin(pd.ageH) && pd.ageH > 72 ? `<span class="chip gold" title="the laptop pull has not run since">${Math.round(pd.ageH / 24)} days old</span>` : '';
  return wrap('panel.macro.pathdiff', 'The priced policy path, pair by pair', 'base currency minus quote currency, from the futures-implied path (bp of priced change)',
    `<div class="card"><div class="ch"><span class="lbl">Priced move over 3, 6 and 12 months</span><span class="r">${ageWarn} <span class="muted">${esc(String(pd.asOf ?? '').slice(0, 10))}</span></span></div>
<svg class="bv-svg" viewBox="0 0 ${w} ${H}" width="100%" role="img" aria-label="Priced policy path difference by pair"><defs><filter id="${id}"><feGaussianBlur stdDeviation="2"/></filter></defs>
<line x1="${f1(cx)}" x2="${f1(cx)}" y1="14" y2="${H - 10}" stroke="var(--line2)" stroke-dasharray="3 3"/>
<text x="${f1(cx + half)}" y="10" text-anchor="end" font-size="9.5" fill="var(--tx3)">base priced higher →</text><text x="${f1(cx - half)}" y="10" font-size="9.5" fill="var(--tx3)">← quote priced higher</text>${bars}</svg>
<div class="bv-legend"><span><i class="bv-dot" style="background:var(--gold)"></i>3 months (top bar, brightest)</span><span><i class="bv-dot" style="background:var(--gold);opacity:.65"></i>6 months</span><span><i class="bv-dot" style="background:var(--gold);opacity:.4"></i>12 months (bottom bar)</span><span class="muted">the figure on the right is the 12-month gap</span></div>
<p class="muted bv-note">Each bar is how far the base currency's own priced path sits above (gold) or below (purple) the quote currency's, in basis points of priced change against today's policy rate. It is the gap between two markets' pricing, not a view on the pair. Fed funds futures give the USD leg; the other legs are each bank's own short-rate futures (3-month rates for EUR, CHF, CAD and JPY).</p></div>`,
    `${chipFor('stir-wide-scan', 'Short-rate futures as a lead on 18 markets: nothing survived.')}${chipFor('rate-surprise-eurusd', 'A rate-market surprise in the release window and EURUSD: underpowered.')}<span class="muted">The path gap is context. No finding in the Evidence Book shows it leading a pair.</span>`);
}

// ── JGB shock ────────────────────────────────────────────────────────────────────────────────────────────────────
const light = (on, label, big, small) => `<div class="pb-lightbox"><i class="pb-light ${on ? 'on' : ''}" aria-hidden="true"></i><div><b>${esc(label)}</b> <span class="chip ${on ? 'gold' : ''}">${on ? 'on' : 'off'}</span><div class="mono">${big}</div><div class="muted" style="font-size:11px">${small}</div></div></div>`;
export function jgbCard(rx) {
  const j = rx?.jgb?.shock;
  if (!j) return missing('panel.macro.jgb', 'Japan: the JGB shock card', rx?.errors?.jgb ?? 'JGB curve not loaded yet.');
  const L = j.lights, tenors = Object.entries(j.levels).map(([k, v]) => `<span class="chip mono">${esc(k)} ${v.toFixed(2)}%</span>`).join('');
  const typeTxt = { 'front end': 'front end moving (policy or funding)', 'long end': 'long end moving (duration or term premium)', parallel: 'the whole curve moving together', quiet: 'quiet: under 3bp' }[L.type.value];
  const slope = j.slope2s30s;
  const body = `<div class="grid g2"><div class="card"><div class="ch"><span class="lbl">Three lights · last ${j.window} sessions</span>${ageNote(j.asOf)}</div>
<div class="pb-lights">${light(L.short.on, 'Short-end shock', `${sg(L.short.bp, 1)}bp on the 2y`, `${fin(L.short.z) ? `${sg(L.short.z, 1)} standard deviations of its own 5-day moves` : ''}; on past 2 deviations and 3bp`)}
${light(L.vol.on, 'High-vol state', `${ordinal(L.vol.pct ?? '–')} percentile`, `20-day realised vol of the 10y, ${fin(L.vol.realisedBp) ? L.vol.realisedBp.toFixed(1) : '–'}bp a day; on from the 80th`)}
<div class="pb-lightbox"><i class="pb-light type" aria-hidden="true"></i><div><b>Where on the curve</b><div class="mono">${esc(typeTxt)}</div><div class="muted" style="font-size:11px">2y ${sg(j.changesBp['2Y'], 1)}bp · 10y ${sg(j.changesBp['10Y'], 1)}bp · 30y ${sg(j.changesBp['30Y'], 1)}bp over ${j.window} sessions</div></div></div></div>
<div class="bv-chips" style="margin-top:8px">${tenors}</div></div>
<div class="card"><div class="ch"><span class="lbl">The 10y over the last year</span><span class="r muted">2s30s ${sg(slope.bp, 0)}bp${fin(slope.pct5y) ? ` · ${ordinal(Math.round(slope.pct5y))} percentile` : ''}</span></div>${glowLine(j.spark10y, { w: 360, h: 120, tone: 'var(--gold)', label: 'JGB 10-year yield over the last year' })}
<p class="muted bv-note">The lights state conditions; they are not a view on the yen. A short-end shock in a high-vol state is the case the research links to spillover into yen crosses, and that link has not been tested on the ranges this desk measures.${rx.jgb.fileTenors && !rx.jgb.fileTenors.includes('40Y') ? ' The source file carries no 40-year column.' : ''}</p></div></div>`;
  return wrap('panel.macro.jgb', 'Japan: the JGB shock card', '2, 10, 20, 30 and 40 year yields from the Ministry of Finance file · conditions only, never a direction', body, untestedChip('Nothing in the Evidence Book tests a JGB shock against yen-cross ranges.'));
}

// ── Inflation: 5y5y + core PCE ───────────────────────────────────────────────────────────────────────────────────
export function inflationCard(rx) {
  const I = rx?.inflation; if (!I || (!I.fwd5y5y && !I.corePce)) return missing('panel.macro.inflation', '5y5y and core PCE', rx?.errors?.chapters ?? 'Inflation series not loaded yet.');
  const f = I.fwd5y5y, p = I.corePce;
  const big = (label, v, sub, spark, tone) => `<div class="card"><div class="ch"><span class="lbl">${esc(label)}</span></div><div class="pb-big mono">${v}</div><div class="muted" style="font-size:11.5px">${sub}</div>${spark ? glowLine(spark, { w: 300, h: 70, tone, label }) : ''}</div>`;
  const cards = [
    f ? big('5y5y forward breakeven', `${f.value.toFixed(2)}%`, `${fin(f.pct5y) ? `${ordinal(Math.round(f.pct5y))} percentile of five years · ` : ''}${sg(f.chg20, 2)} over 20 days, ${sg(f.chg60, 2)} over 60 · as of ${esc(f.asOf)}`, f.spark, 'var(--pur2)') : '',
    p ? big('Core PCE inflation, year on year', `${p.yoy.toFixed(2)}%`, `3-month annualised ${p.ann3m.toFixed(2)}% · a year ago ${fin(p.yoy12ago) ? p.yoy12ago.toFixed(2) + '%' : '–'} · as of ${esc(p.asOf)}`, p.spark, 'var(--gold)') : '',
  ].join('');
  return wrap('panel.macro.inflation', '5y5y and core PCE', 'market-implied long-run inflation beside the Fed\'s preferred realised gauge',
    `<div class="grid g2">${cards}</div><p class="muted bv-note">The 5y5y is the inflation the market expects for five years starting five years out, the part least tied to what has already printed. Core PCE is the index's change over twelve months, and over the latest three months annualised; the gap between the two says whether the recent run is faster or slower than the year.</p>`,
    untestedChip('Shown as context. The Evidence Book does not test 5y5y or core PCE against price.'));
}

// ── Fiscal events + Treasury auctions ───────────────────────────────────────────────────────────────────────────
const KIND = { budget: 'Budget', refunding: 'Refunding', spring: 'Spring', autumn: 'Autumn statement' };
export function fiscalAuctionCard(rx) {
  if (!rx) return '';
  const fe = (rx.fiscal ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map(e => `<tr><td class="mono" style="white-space:nowrap">${esc(e.date)}</td><td><b>${esc(e.country)}</b> ${esc(e.title)}${e.status ? ` <span class="chip">${esc(e.status)}</span>` : ''}${e.headline ? `<div class="muted" style="font-size:11.5px">${esc(String(e.headline).slice(0, 170))}</div>` : ''}</td><td class="muted" style="font-size:11.5px">${(e.rows ?? []).slice(0, 2).map(r => `${esc(r.label)}: <b class="mono">${esc(r.value)}</b>${r.change ? ` (${esc(r.change)})` : ''}`).join('<br>')}</td></tr>`).join('');
  const up = (rx.upcoming ?? []).map(r => `<tr><td class="mono">${esc(r.date)}</td><td>${esc(r.term)} ${esc(r.type)}${r.reopening ? ' <span class="chip">reopening</span>' : ''}</td><td class="n mono">${fin(r.amountB) ? '$' + r.amountB + 'bn' : '–'}</td></tr>`).join('');
  const res = rx.auctionResults;
  const maxBtc = Math.max(3, ...(res ?? []).map(r => r.bidToCover ?? 0));
  const resRows = (res ?? []).map(r => `<tr><td class="mono" style="white-space:nowrap">${esc(r.date)}</td><td>${esc(r.term)} ${esc(r.type)}</td><td class="n mono">${fin(r.highYield) ? r.highYield.toFixed(3) + '%' : '–'}${fin(r.dYieldBp) ? ` <span class="muted" style="font-size:11px">${sg(r.dYieldBp, 1)}bp</span>` : ''}</td>
<td><div class="pb-bar" title="bid-to-cover ${r.bidToCover ?? '–'}"><i style="width:${clamp((r.bidToCover ?? 0) / maxBtc * 100, 0, 100).toFixed(0)}%"></i></div><span class="mono" style="font-size:11px">${fin(r.bidToCover) ? r.bidToCover.toFixed(2) : '–'}${fin(r.dBidToCover) ? ` <span class="muted">${sg(r.dBidToCover, 2)}</span>` : ''}</span></td>
<td class="n mono" style="font-size:11.5px">${fin(r.indirectPct) ? r.indirectPct.toFixed(0) : '–'} / ${fin(r.directPct) ? r.directPct.toFixed(0) : '–'} / ${fin(r.dealerPct) ? r.dealerPct.toFixed(0) : '–'}</td></tr>`).join('');
  return wrap('panel.macro.fiscalauct', 'Fiscal events and Treasury auctions', 'budgets and refundings read, the next auctions, and how recent auctions went',
    `<div class="grid g2"><div class="card"><div class="ch"><span class="lbl">Budgets and refundings</span><span class="r muted">read from the documents</span></div>${fe ? `<div class="scroll"><table><thead><tr><th>Date</th><th>Event</th><th>Key lines</th></tr></thead><tbody>${fe}</tbody></table></div>` : '<p class="muted">No fiscal events in the store.</p>'}
<p class="muted bv-note">${ownerLink('fiscal-events.html', 'Fiscal Events page (the full read)')}</p></div>
<div class="card"><div class="ch"><span class="lbl">Next Treasury auctions</span><span class="r muted">notes and bonds</span></div>${up ? `<div class="scroll"><table><thead><tr><th>Bidding close</th><th>Security</th><th class="n">Size</th></tr></thead><tbody>${up}</tbody></table></div>` : '<p class="muted">No coupon auctions announced yet.</p>'}</div></div>
<div class="card" style="margin-top:14px"><div class="ch"><span class="lbl">How recent auctions went</span><span class="r muted">change is against the previous auction of the same term</span></div>${resRows ? `<div class="scroll"><table><thead><tr><th>Date</th><th>Security</th><th class="n">High yield</th><th>Bid-to-cover</th><th class="n" title="share of competitive awards: indirect / direct / primary dealers">Indirect / direct / dealers %</th></tr></thead><tbody>${resRows}</tbody></table></div>` : `<p class="muted">${esc(rx.errors?.auctions ?? 'Auction results not loaded yet.')}</p>`}
<p class="muted bv-note">A tail needs the when-issued yield at the bid deadline, which TreasuryDirect does not publish, so no tail is shown: the high yield's change against the last auction of the same term, the bid-to-cover and who took the issue are the readable parts. A weak auction is a description of that auction, not a forecast.</p></div>`,
    untestedChip('The Evidence Book does not test auction results against yields. Shown as context.'));
}

// ── Range-line coverage by state ─────────────────────────────────────────────────────────────────────────────────
function coverageRails(per) {
  const rows = per.filter(p => p.last.hl75.n); if (!rows.length) return '';
  const w = 540, L = 70, R = 12, rowH = 28, H = rows.length * rowH + 40, x = v => L + (clamp(v, 40, 100) - 40) / 60 * (w - L - R), id = uid('pbc');
  const dot = (v, col, r, op = 1) => (fin(v) ? `<circle cx="${f1(x(v))}" cy="0" r="${r}" fill="${col}" fill-opacity="${op}" stroke="var(--bg1)" stroke-width="1.2"/>` : '');
  const body = rows.map((p, i) => {
    const y = 28 + i * rowH, se = 100 * Math.sqrt(0.75 * 0.25 / p.last.hl75.n);
    return `<g transform="translate(0 ${y})" class="bv-fade" style="--d:${(i * 0.04).toFixed(2)}s"><text x="0" y="4" font-size="11" fill="var(--tx2)" font-family="var(--mono)">${esc(p.name)}</text>
<rect x="${f1(x(75 - 1.96 * se))}" y="-6" width="${f1(x(75 + 1.96 * se) - x(75 - 1.96 * se))}" height="12" rx="6" fill="var(--bg3)"/>
<g transform="translate(0 0)">${dot(p.calm.hl75.cov, 'var(--tx3)', 3.2, 0.9)}${dot(p.stressed.hl75.n >= 8 ? p.stressed.hl75.cov : null, 'var(--pur2)', 4.6)}${dot(p.last.hl75.cov, 'var(--gold)', 5.6)}</g>
<title>${esc(p.name)}: last ${p.last.hl75.n} sessions ${p.last.hl75.cov}% (n=${p.last.hl75.n}, z ${p.last.hl75.z}); after a stress day ${p.stressed.hl75.n ? p.stressed.hl75.cov + '% (n=' + p.stressed.hl75.n + ')' : 'too few'}; calm ${p.calm.hl75.cov ?? '–'}%</title></g>`;
  }).join('');
  const ticks = [50, 60, 70, 75, 80, 90, 100].map(t => `<line x1="${f1(x(t))}" x2="${f1(x(t))}" y1="14" y2="${H - 18}" stroke="${t === 75 ? 'var(--tx3)' : 'var(--line)'}" stroke-dasharray="${t === 75 ? '0' : '2 4'}"/><text x="${f1(x(t))}" y="${H - 5}" text-anchor="middle" font-size="9.5" fill="${t === 75 ? 'var(--tx2)' : 'var(--tx3)'}" font-family="var(--mono)">${t}%</text>`).join('');
  return `<svg class="bv-svg" viewBox="0 0 ${w} ${H}" width="100%" role="img" aria-label="Share of sessions the 75th-percentile range line held, by market"><defs><filter id="${id}"><feGaussianBlur stdDeviation="2"/></filter></defs>${ticks}${body}<text x="${f1(x(75))}" y="9" text-anchor="middle" font-size="9.5" fill="var(--tx2)">promised 75%</text></svg>`;
}
export function coverageCard(mx) {
  const c = mx?.coverage; if (!c) return missing('panel.macro.rangecoverage', 'Did the range lines hold?', mx?.errors?.coverage ?? 'Coverage not computed yet.');
  const p = c.pooled, h = (s, nominal) => (s?.n ? `<b class="mono">${s.cov}%</b> <span class="muted">of ${s.n} (promised ${nominal}%, ${sg(s.z, 1)} standard errors)</span>` : '<span class="muted">too few sessions</span>');
  return wrap('panel.macro.rangecoverage', 'Did the range lines hold?', `the forecast range lines as a record: how often each day stayed inside them · ${c.sessions} sessions, ten markets`,
    `<div class="grid g2"><div class="card bv-say"><div class="ch"><span class="lbl">All ten markets pooled</span>${ageNote(c.asOf)}</div>
<p>The 75th-percentile line held on ${h(p.last.hl75, 75)} of the last ${c.sessions} sessions, and the 50th line on ${h(p.last.hl50, 50)}.</p>
<p>After a stress day (${esc(c.stressRule)}) the 75th line held on ${h(p.stressed.hl75, 75)}; on calm days ${h(p.calm.hl75, 75)}. (Stress split uses the last ${c.longSessions} sessions so there are enough stress days to count.)</p>
<p class="muted bv-note">The pooled figure treats ten markets as ten independent samples, but they move together, so its standard-error figure is too small: read the by-market dots for the honest picture. This is a record of the ruler, not a claim about tomorrow. A line promising 75% will miss on one session in four by design; the standard-error figure says whether a gap is bigger than that noise.</p></div>
<div class="card"><div class="ch"><span class="lbl">By market · the 75th line, last ${c.sessions} sessions</span></div>${coverageRails(c.per)}
<div class="bv-legend"><span><i class="bv-dot" style="background:var(--gold)"></i>last ${c.sessions} sessions</span><span><i class="bv-dot" style="background:var(--pur2)"></i>after a stress day (8+ days)</span><span><i class="bv-dot" style="background:var(--tx3)"></i>calm days</span></div>
<p class="muted bv-note">The grey pill is the range of results that would be ordinary noise for a true 75% line over this many sessions.</p></div></div>`,
    `${chipFor('vol-curve-front', 'The range ruler passes its tests; what it says about direction is nothing.')}<span class="muted">The lines are the production forecaster's own (the same maths the Vol Forecast page draws).</span>`);
}

// ── Connectedness ────────────────────────────────────────────────────────────────────────────────────────────────
function network(c) {
  const N = c.nodes.length, w = 420, h = 360, cx = w / 2, cy = h / 2 + 4, R = 138, id = uid('pbn');
  const pos = i => { const t = -Math.PI / 2 + (i / N) * 2 * Math.PI; return [cx + R * Math.cos(t), cy + R * Math.sin(t)]; };
  const idx = Object.fromEntries(c.nodes.map((n, i) => [n.name, i])), top = c.links.slice(0, 26), maxW = Math.max(...top.map(l => l.w), 1);
  const links = top.map((l, k) => {
    const [x0, y0] = pos(idx[l.from]), [x1, y1] = pos(idx[l.to]), mx = (x0 + x1) / 2 + (cx - (x0 + x1) / 2) * 0.55, my = (y0 + y1) / 2 + (cy - (y0 + y1) / 2) * 0.55;
    return `<path d="M${f1(x0)},${f1(y0)}Q${f1(mx)},${f1(my)} ${f1(x1)},${f1(y1)}" fill="none" stroke="${c.nodes[idx[l.from]].net >= 0 ? 'var(--gold)' : 'var(--pur2)'}" stroke-width="${(0.6 + 3.2 * l.w / maxW).toFixed(2)}" stroke-opacity="${(0.18 + 0.6 * l.w / maxW).toFixed(2)}" stroke-linecap="round" class="pb-flow" style="--d:${(k * 0.03).toFixed(2)}s"><title>${esc(l.from)} → ${esc(l.to)}: ${l.w}% of ${esc(l.to)}'s variance</title></path>`;
  }).join('');
  const maxTo = Math.max(...c.nodes.map(n => n.to), 1);
  const nodes = c.nodes.map((n, i) => { const [x, y] = pos(i), r = 6 + 9 * n.to / maxTo, col = n.net >= 0 ? 'var(--gold)' : 'var(--pur2)', [lx, ly] = [cx + (R + 24) * Math.cos(-Math.PI / 2 + (i / N) * 2 * Math.PI), cy + (R + 24) * Math.sin(-Math.PI / 2 + (i / N) * 2 * Math.PI)];
    return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r.toFixed(1)}" fill="${col}" opacity=".3" filter="url(#${id})"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${(r * 0.62).toFixed(1)}" fill="${col}" stroke="var(--bg1)" stroke-width="1.5" class="bv-fade"><title>${esc(n.name)}: sends ${n.to}, receives ${n.from}, net ${sg(n.net, 1)}</title></circle><text x="${f1(lx)}" y="${f1(ly + 3)}" text-anchor="${Math.abs(lx - cx) < 10 ? 'middle' : lx > cx ? 'start' : 'end'}" font-size="10.5" fill="var(--tx2)" font-family="var(--mono)">${esc(n.name)}</text>`; }).join('');
  return `<svg class="bv-svg" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px" role="img" aria-label="Which markets move which: spillover network"><defs><filter id="${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4"/></filter></defs>${links}${nodes}</svg>`;
}
export function connectedCard(mx) {
  const c = mx?.connected; if (!c) return missing('panel.macro.connected', 'How tightly the markets are moving together', mx?.errors?.connected ?? 'Connectedness not computed yet.');
  const hist = c.history.map(h => h.total), lo = Math.min(...hist), hi = Math.max(...hist), mid = (lo + hi) / 2;
  const gauge = arcGauge({ value: c.total, min: Math.floor(lo / 5) * 5 - 5, max: Math.ceil(hi / 5) * 5 + 5, label: 'total connectedness', sub: `${c.pct != null ? Math.round(c.pct) + 'th percentile of its own recent history' : ''}`, w: 260,
    zones: [{ from: Math.floor(lo / 5) * 5 - 5, to: mid, tone: 'flat' }, { from: mid, to: Math.ceil(hi / 5) * 5 + 5, tone: 'gold' }], ticks: [{ v: Math.round(lo), label: Math.round(lo) }, { v: Math.round(hi), label: Math.round(hi) }] });
  const sorted = c.nodes.slice().sort((a, b) => b.net - a.net), tx = sorted.slice(0, 3), rx = sorted.slice(-3).reverse();
  const chips = (a, cls) => a.map(n => `<span class="chip ${cls}" title="sends ${n.to}, receives ${n.from}">${esc(n.name)} ${sg(n.net, 0)}</span>`).join('');
  return wrap('panel.macro.connected', 'How tightly the markets are moving together', `spillover across ${c.names.length} markets on daily moves · ${c.window}-day window · describes, does not forecast`,
    `<div class="grid g2"><div class="card"><div class="ch"><span class="lbl">Who is moving whom</span>${ageNote(c.asOf)}</div>${network(c)}
<p class="muted bv-note" style="margin-top:0">Each line runs from the market that passes a move on to the one that receives it; thicker is more. Bright gold nodes pass on more than they take in; purple nodes take in more than they pass on. Bigger nodes send more.</p></div>
<div class="card"><div class="ch"><span class="lbl">The dial and its history</span></div><div class="bv-two" style="grid-template-columns:minmax(220px,260px) minmax(0,1fr);align-items:start"><div>${gauge}</div><div>${glowLine(hist, { w: 300, h: 100, tone: 'var(--gold)', label: 'total connectedness over time' })}<p class="muted bv-note">${c.history.length} windows, ${esc(c.history[0].date)} to ${esc(c.history.at(-1).date)}.</p></div></div>
<div style="margin-top:8px"><span class="lbl">Net senders</span> <span class="bv-chips">${chips(tx, 'gold')}</span></div><div style="margin-top:6px"><span class="lbl">Net receivers</span> <span class="bv-chips">${chips(rx, 'pur')}</span></div>
<p class="muted bv-note">Total connectedness is the share of each market's next-10-day variance that comes from the other markets, averaged: high means the markets are tightly bound and one shock moves many. ${esc(c.method)}. The window is short, so read the level against its own history, not as an absolute.</p></div></div>`,
    untestedChip('The Evidence Book does not test whether connectedness predicts a range or a return. This is a description.'));
}

// ── Commodity-currency coupling + uncertainty ────────────────────────────────────────────────────────────────────
export function couplingCard(mx) {
  const rings = (mx?.coupling ?? []).filter(r => r.ok); if (!rings.length) return missing('panel.macro.coupling', 'Commodity currencies and their commodity', mx?.errors?.coupling ?? 'Coupling not computed yet.');
  const dials = rings.map(r => `<div class="card" style="text-align:center">${arcGauge({ value: r.corr, min: -1, max: 1, label: `${r.ccy} with ${r.comLabel}`, sub: `usual ${sg(r.median, 2)} · ${ordinal(Math.round(r.pct))} percentile · ${r.window}-day`, w: 240,
    zones: [{ from: -1, to: r.lo, tone: 'gold' }, { from: r.lo, to: r.hi, tone: 'flat' }, { from: r.hi, to: 1, tone: 'gold' }], ticks: [{ v: r.median, label: 'usual' }] })}${glowLine(r.spark, { w: 240, h: 44, tone: 'var(--pur2)', label: `${r.ccy} coupling over the last year` })}</div>`).join('');
  const st = mx.stress, g = mx.gpr, line = [st?.overall ? `world stress: <b>${esc(st.overall)}</b>` : '', g?.level != null ? `geopolitical risk ${esc(String(g.level))} (${g.z != null ? sg(g.z, 1) + ' z, ' : ''}${esc(g.trend ?? '')})` : ''].filter(Boolean).join(' · ');
  return wrap('panel.macro.coupling', 'Commodity currencies and their commodity', 'how closely the Aussie, Kiwi and Canadian dollar have moved with copper and oil lately, against their own usual',
    `<div class="grid g3">${dials}</div>${line ? `<p class="bv-note" style="margin-top:8px">${line}</p>` : ''}<p class="muted bv-note">Each dial is the 60-day correlation of daily moves between the currency and its commodity (the Canadian dollar is read as the opposite of USD/CAD; the Kiwi uses copper as a stand-in). The shaded middle band is the 10th to 90th percentile of that correlation over the last five years; outside it, the link is unusually tight or loose. A looser link means the currency is trading on something other than the commodity.</p>`,
    untestedChip('Nothing in the Evidence Book tests this coupling against a range or return. Description only.'));
}
// days since a YYYY-MM(-DD) date: an input months old is labelled as such on the card
const ageDaysOf = d => { const t = Date.parse(String(d ?? '').length === 7 ? `${d}-01` : String(d ?? '').slice(0, 10)); return Number.isFinite(t) ? (Date.now() - t) / 864e5 : 0; };
export function uncertaintyCard(mx) {
  const rows = (mx?.uncertainty ?? []).filter(r => r.ok); if (!rows.length) return missing('panel.macro.uncertainty', 'Policy uncertainty', 'Policy-uncertainty series not loaded yet.');
  const daily = rows.find(r => r.freq === 'daily');
  return wrap('panel.macro.uncertainty', 'Policy uncertainty', 'how much newspapers and forecasters are writing about policy uncertainty, against its own five years',
    `<div class="grid g2"><div class="card"><div class="ch"><span class="lbl">Where each index sits in its own history</span></div>${pctRails(rows.map(r => ({ label: `${({ USEPUINDXD: 'US daily', USEPUINDXM: 'US monthly', GEPUCURRENT: 'Global', EPUTRADE: 'Trade policy' })[r.id] ?? r.id} · ${String(r.asOf ?? '').slice(0, r.freq === 'daily' ? 10 : 7)}${ageDaysOf(r.asOf) > (r.freq === 'daily' ? 10 : 75) ? ' (old)' : ''}`, value: String(r.value), pct: r.pct5y })), { w: 520, marks: [25, 50, 75], rightW: 90 })}
<p class="muted bv-note">${rows.map(r => `${esc(r.label)}: ${esc(r.asOf)}, ${sg(r.chg1, 0)} on the ${r.freq === 'daily' ? 'month' : 'prior reading'}`).join(' · ')}.</p></div>
<div class="card"><div class="ch"><span class="lbl">${daily ? esc(daily.label) : ''}</span></div>${daily ? glowLine(daily.spark, { w: 360, h: 120, tone: 'var(--gold)', label: 'US policy uncertainty over the last year' }) : ''}
<p class="muted bv-note">The Baker, Bloom and Davis indices count newspaper articles that mention policy and uncertainty together; the trade-policy index counts those about trade. High means more talk, not a particular outcome.</p></div></div>`,
    untestedChip('Policy-uncertainty indices are not in the Evidence Book. Context only.'));
}

// ── SKEW history with the 2022 break ─────────────────────────────────────────────────────────────────────────────
export function skewHistCard(mx) {
  const s = mx?.skew; if (!s) return missing('panel.macro.skewhist', 'The SKEW index and the 2022 break', 'SKEW history not loaded yet.');
  const w = 560, h = 160, L = 34, R = 8, T = 12, B = 22, vals = s.series.map(p => p[1]), lo = Math.min(...vals) - 2, hi = Math.max(...vals) + 2;
  const t0 = Date.parse(s.series[0][0]), t1 = Date.parse(s.series.at(-1)[0]), tx = d => L + ((Date.parse(d) - t0) / (t1 - t0)) * (w - L - R), y = v => T + (1 - (v - lo) / (hi - lo)) * (h - T - B), id = uid('pbs');
  const pts = s.series.map(p => [tx(p[0]), y(p[1])]), line = smoothPath(pts), bx = tx(s.brk.date), yr = [2021, 2022, 2023, 2024, 2025, 2026].filter(v => Date.parse(`${v}-01-01`) > t0);
  const seg = (a, b, m) => (m != null ? `<line x1="${f1(a)}" x2="${f1(b)}" y1="${f1(y(m))}" y2="${f1(y(m))}" stroke="var(--tx3)" stroke-dasharray="4 3"/><text x="${f1(b - 4)}" y="${h - B - 5}" text-anchor="end" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">avg ${m}</text>` : '');
  const svg = `<svg class="bv-svg" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Cboe SKEW index since ${esc(s.firstDate)} with the May 2022 break marked"><defs><filter id="${id}" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="2.6"/></filter></defs>
<rect x="${f1(bx)}" y="${T}" width="${f1(w - R - bx)}" height="${h - T - B}" fill="var(--pur)" fill-opacity=".08"/>
${[lo, (lo + hi) / 2, hi].map(v => `<text x="${L - 4}" y="${f1(y(v) + 3)}" text-anchor="end" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${Math.round(v)}</text>`).join('')}
${seg(L, bx, s.preMean)}${seg(bx, w - R, s.postMean)}
<path d="${line}" fill="none" stroke="var(--gold)" stroke-width="3.4" opacity=".4" filter="url(#${id})" class="bv-sweep" pathLength="1"/><path d="${line}" fill="none" stroke="var(--gold)" stroke-width="1.5" class="bv-sweep" pathLength="1"/>
<line x1="${f1(bx)}" x2="${f1(bx)}" y1="${T}" y2="${h - B}" stroke="var(--pur2)" stroke-width="1.5" stroke-dasharray="5 3"/><text x="${f1(bx + 6)}" y="${T + 10}" font-size="10" fill="var(--pur2)">${esc(s.brk.label)}</text>
${yr.map(v => `<text x="${f1(tx(`${v}-01-01`))}" y="${h - 6}" text-anchor="middle" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${v}</text>`).join('')}</svg>`;
  return wrap('panel.macro.skewhist', 'The SKEW index and the 2022 break', 'Cboe SKEW (S&P tail pricing) since 2020 with the date SPX options began expiring every weekday',
    `<div class="card"><div class="ch"><span class="lbl">SKEW · now ${s.value}</span>${ageNote(s.asOf)}</div>${svg}
<p class="muted bv-note">Before the break the index averaged ${s.preMean ?? '–'} (${s.preN} sessions); after it ${s.postMean ?? '–'} (${s.postN}); today sits at the ${s.pctPost != null ? Math.round(s.pctPost) + 'th' : '–'} percentile of the post-break period. Daily expiries changed how S&P option demand is spread across maturities, so a level before and after the break is not like for like: read today's value against the shaded period, not against the whole line, and do not read the shift as a change in sentiment.</p></div>`,
    `${chipFor('skew-fade', 'Fading an options-skew extreme at the range lines: tested, null.')}<span class="muted">The break date is the completion of daily SPX expiries (Cboe, 11 May 2022); it is taken from the research and not from a test here.</span>`);
}

// ── Trend basket ─────────────────────────────────────────────────────────────────────────────────────────────────
export function trendCard(mx) {
  const t = mx?.trend; if (!t) return missing('panel.macro.trendbasket', 'The trend basket', 'Trend basket not loaded yet.');
  const eq = t.equity.map(p => p[1]), cur = (t.current ?? []).map(c => `<span class="chip ${c.trend > 0 ? 'up' : 'dn'}">${esc(c.ccy)} ${c.trend > 0 ? 'rising' : 'falling'}</span>`).join('');
  const m = (label, s) => (s ? `<tr><td>${esc(label)}</td><td class="n mono">${fin(s.sharpe) ? s.sharpe.toFixed(2) : '–'}</td><td class="n mono">${fin(s.cagr) ? s.cagr.toFixed(1) + '%' : '–'}</td><td class="n mono">${fin(s.maxDD) ? s.maxDD.toFixed(0) + '%' : '–'}</td><td class="n mono">${s.days ?? '–'}</td></tr>` : '');
  return wrap('panel.macro.trendbasket', 'The trend basket', 'a plain 12-month trend rule across seven currencies, risk-scaled; the record, not a recommendation',
    `<div class="grid g2"><div class="card"><div class="ch"><span class="lbl">Equity curve since 2005</span><span class="r muted">to ${esc(String(t.asOf ?? '').slice(0, 10))}</span></div>${glowLine(eq, { w: 420, h: 130, tone: 'var(--gold)', label: 'trend basket equity curve' })}
<div class="bv-chips" style="margin-top:6px">${cur}</div><p class="muted bv-note">The chips are each currency's trend sign now: its rate <b>against the US dollar</b> above or below where it was 252 trading days ago, to ${esc(String(t.asOf ?? '').slice(0, 10))}. The fair-value and commodity cards measure a currency against a trade-weighted basket or its exports, so a currency can be falling here and rising there. A state, not an order.</p></div>
<div class="card"><div class="ch"><span class="lbl">The record</span></div><div class="scroll"><table><thead><tr><th></th><th class="n">Sharpe</th><th class="n">Per year</th><th class="n">Worst drop</th><th class="n">Days</th></tr></thead><tbody>${m('Out of sample', t.oos)}${m('Whole history', t.all)}${m('Benchmark (the same basket, no rule)', t.benchmark)}</tbody></table></div>
<p class="muted bv-note">Out of sample means the part of the history the rule's settings were not fitted on. Trend rules that work across many asset classes have not been shown to work on these seven currencies: the out-of-sample Sharpe here is small and its range includes zero.</p></div></div>`,
    `${chipFor('trend-following-fx', 'Trend following on G10 FX: null.')}<span class="muted">Shown because the question comes up, with its verdict beside it.</span>`);
}

// ── OI walls in expected moves ───────────────────────────────────────────────────────────────────────────────────
export function wallsCard(mx) {
  const rows = (mx?.walls ?? []).filter(r => r.callWallD != null || r.putWallD != null || r.flipD != null); if (!rows.length) return missing('panel.macro.walls', 'Option walls in expected moves', 'Option-wall data not loaded yet.');
  const w = 560, L = 88, R = 14, rowH = 30, SPAN = 6, H = rows.length * rowH + 40, x = v => L + (clamp(v, -SPAN, SPAN) + SPAN) / (2 * SPAN) * (w - L - R), id = uid('pbw');
  const marks = rows.map((r, i) => {
    const y = 30 + i * rowH, m = (v, shape, col, t) => (v == null ? '' : shape === 'call' ? `<rect x="${f1(x(v) - 4)}" y="${y - 7}" width="8" height="14" rx="2" fill="${col}" fill-opacity="${Math.abs(v) > SPAN ? 0.35 : 1}"><title>${esc(r.name)} ${t}: ${sg(v, 1)} daily moves</title></rect>` : shape === 'put' ? `<rect x="${f1(x(v) - 4)}" y="${y - 7}" width="8" height="14" rx="2" fill="${col}" fill-opacity="${Math.abs(v) > SPAN ? 0.35 : 1}"><title>${esc(r.name)} ${t}: ${sg(v, 1)} daily moves</title></rect>` : `<path d="M${f1(x(v))},${y - 8}l6,8l-6,8l-6,-8z" fill="${col}" fill-opacity="${Math.abs(v) > SPAN ? 0.3 : 0.9}"><title>${esc(r.name)} ${t}: ${sg(v, 1)} daily moves</title></path>`);
    return `<g class="bv-fade" style="--d:${(i * 0.04).toFixed(2)}s"><text x="0" y="${y + 4}" font-size="11" fill="var(--tx2)" font-family="var(--mono)">${esc(r.name.replace('_USD', '').replace('/', ''))}</text>
<line x1="${L}" x2="${w - R}" y1="${y}" y2="${y}" stroke="var(--line)"/><line x1="${f1(x(0))}" x2="${f1(x(0))}" y1="${y - 9}" y2="${y + 9}" stroke="var(--tx2)" stroke-width="2"/>
${m(r.putWallD, 'put', 'var(--pur2)', 'put wall')}${m(r.callWallD, 'call', 'var(--gold)', 'call wall')}${m(r.flipD, 'flip', 'var(--tx3)', 'gamma flip')}</g>`;
  }).join('');
  const ticks = [-6, -4, -2, 0, 2, 4, 6].map(t => `<text x="${f1(x(t))}" y="${H - 6}" text-anchor="middle" font-size="9.5" fill="var(--tx3)" font-family="var(--mono)">${t === 0 ? 'price' : sg(t, 0)}</text>`).join('');
  const stale = rows.some(r => r.oiAsOf) ? `<span class="r muted">open interest as of ${esc(String(rows.map(r => r.oiAsOf).filter(Boolean).sort().at(-1)).slice(0, 10))}</span>` : '';
  return wrap('panel.macro.walls', 'Option walls in expected moves', 'how far the biggest call and put walls sit from the futures price, in the market\'s own expected daily move',
    `<div class="card"><div class="ch"><span class="lbl">Distance to the walls</span>${stale}</div>
<svg class="bv-svg" viewBox="0 0 ${w} ${H}" width="100%" role="img" aria-label="Distance from price to the call wall, put wall and gamma flip in expected daily moves"><defs><filter id="${id}"><feGaussianBlur stdDeviation="2"/></filter></defs>${marks}${ticks}</svg>
<div class="bv-legend"><span><i class="bv-dot" style="background:var(--gold)"></i>call wall</span><span><i class="bv-dot" style="background:var(--pur2)"></i>put wall</span><span><i class="bv-dot" style="background:var(--tx3)"></i>gamma flip</span></div>
<p class="muted bv-note">One unit is the market's expected move for one day, from option pricing. A wall four units away is a long way off; one half a unit away is inside an ordinary day. Walls are as stored from the capture (the futures strikes against the futures price), so a basis gap between futures and the cash price is not corrected here. The OI capture is published mid the next day, so these are the previous session's books.</p></div>`,
    `${chipFor('wall-placebo', 'A touch of the biggest OI wall rejects no more often than a touch of any other level.')}<span class="muted">The distance says how close price is to a wall, not that the wall will hold.</span>`);
}

// ── assembly ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const POLICY_BOARDS = { 'panel.macro.fomcstrip': fomcCard, 'panel.macro.pathdiff': pathDiffCard };
export const RATES_BOARDS = { 'panel.macro.jgb': jgbCard, 'panel.macro.inflation': inflationCard, 'panel.macro.fiscalauct': fiscalAuctionCard };
export const MARKETS_BOARDS = { 'panel.macro.rangecoverage': coverageCard, 'panel.macro.connected': connectedCard, 'panel.macro.coupling': couplingCard, 'panel.macro.uncertainty': uncertaintyCard, 'panel.macro.skewhist': skewHistCard, 'panel.macro.trendbasket': trendCard, 'panel.macro.walls': wallsCard };
export const BOARD_FEED = { 'policy-extra': POLICY_BOARDS, 'rates-extra': RATES_BOARDS, 'markets-extra': MARKETS_BOARDS };

/** One board by its surface id, drawn from its feed payload ('' while the feed has not landed or if the drawer throws). */
export function boardById(surface, E) {
  for (const [feed, boards] of Object.entries(BOARD_FEED)) {
    const draw = boards[surface]; if (!draw) continue;
    if (!E || E[feed] === undefined) return '';
    try { return draw(E[feed]); } catch (e) { console.warn('board', surface, e); return ''; }
  }
  return '';
}
export const feedOf = surface => Object.entries(BOARD_FEED).find(([, b]) => surface in b)?.[0] ?? null;
