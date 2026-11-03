/**
 * The desk edition's pages for The Chain: the analyst pipeline's day, drawn with the magazine's own components.
 *
 * Owner, 2026-11-03: the desk edition must read as a professional issue, with charts, not a text summary. So it is
 * not a second newsletter: it is the regular V3 issue (every page kept) with the desk's pages inserted after "Today
 * by level", and the desk writer's headline and opening on the cover. These pages use the same parts as the rest of
 * the issue: dark bar figures (barFigure), flat tables, the three-box guide, tiles, evidence badges.
 *
 * Every number is the run's own (the rulings, the cards, the exposure cap, the forecast lines in price). Every view
 * is labelled as the desk's untested reading.
 *
 * Pure. Called by js/newsletter.js only when the issue is built with a desk run (`n.desk`); the regular issue is
 * byte-identical without it. Tested in js/newsletterDesk.test.mjs. Design: plans/DESK_ANALYST_PIPELINE.md §9h.
 */
import { barFigure, flatTable, guide, tileRow, evBadge } from './newsletterMag.js';
import { DESK_UNIVERSE } from './deskPack.js';

const T = { bg: '#0b1220', grid: '#1c2a40', zero: '#5b7090', txt: '#8aa0bd', hi: '#e6eefb', up: '#19d3a0', down: '#ff5d73', amber: '#ffb020', cyan: '#4cc9f0' };
const VIEW = { STRONG_LONG: ['Strong long', 1.5], LONG: ['Long', 1], FLAT: ['Flat', 0], SHORT: ['Short', -1], STRONG_SHORT: ['Strong short', -1.5], REVIEW: ['Review', 0] };
const NAME = { GOLD: 'Gold', SILVER: 'Silver', COPPER: 'Copper', PLATINUM: 'Platinum', PALLADIUM: 'Palladium', WTI: 'WTI crude', BRENT: 'Brent crude', NATGAS: 'Natural gas',
  SOYBEAN: 'Soybeans', WHEAT: 'Wheat', CORN: 'Corn', SUGAR: 'Sugar', NQ: 'Nasdaq', SPX500: 'S&P 500', US30: 'Dow', US2000: 'Russell 2000', DE30: 'DAX', UK100: 'FTSE 100', BTCUSD: 'Bitcoin' };
export const instName = k => NAME[k] ?? (/^[A-Z]{6}$/.test(k) ? `${k.slice(0, 3)}/${k.slice(3)}` : k);
const TONE = { risk_on: 'risk-on', risk_off: 'risk-off', mixed: 'mixed' };
const chip = v => `<b style="font-family:var(--mono,monospace);font-size:11px;padding:1px 6px;border-radius:3px;white-space:nowrap;${(VIEW[v]?.[1] ?? 0) > 0 ? 'background:#e6f7f0;color:#0b7a55' : (VIEW[v]?.[1] ?? 0) < 0 ? 'background:#fde9eb;color:#b4232f' : 'background:#eef2f8;color:#5b6b82'}">${VIEW[v]?.[0] ?? v}</b>`;
const sizeBar = (s, was) => { const w = Math.round(Math.max(0, Math.min(1.5, s ?? 0)) / 1.5 * 70); return `<span style="display:inline-block;width:72px;height:7px;background:#e6ecf5;border-radius:4px;vertical-align:middle;position:relative"><i style="position:absolute;left:0;top:0;bottom:0;width:${w}px;background:#2f6bff;border-radius:4px"></i></span> <b style="font-size:11.5px">${s ?? '–'}</b>${was != null ? `<small style="color:#5b6b82"> was ${was}</small>` : ''}`; };
/**
 * Model prose made fit to print: the source tags the analysts are told to cite ("(credit_funding: liquidity-gate/live)",
 * "(global ruling)", "(rates_cb: fomc/latest, fed-path)") are for the desk, not the reader, so they come out; then the
 * text is cut at a sentence boundary, never mid-word.
 */
const PLAIN = { global_market: 'the global analyst', credit_funding: 'the credit analyst', events_news: 'the events analyst', rates_cb: 'the rates analyst', yields_curve: 'the yields analyst',
  macro_economy: 'the macro analyst', cot_positioning: 'the positioning analyst', vol_iv: 'the volatility analyst', options_oi: 'the options analyst', levels_structure: 'the levels analyst',
  evidence_memory: 'the evidence clerk', risk_aggressive: 'the aggressive risk voice', risk_conservative: 'the conservative risk voice', risk_neutral: 'the neutral risk voice' };
export function prose(text, { sentences = 3, chars = 600 } = {}) {
  let t = String(text ?? '').replace(/\s*\(([^()]*)\)/g, (m, inner) => (/\b[a-z]+_[a-z_]+\b|\b[a-z0-9-]+\/[a-z0-9/-]+|\b(global|currency) ruling\b|\bTESTED[- ]NULL\b|\bREOPENED\b/.test(inner) ? '' : m))
    .replace(/\b(global_market|credit_funding|events_news|rates_cb|yields_curve|macro_economy|cot_positioning|vol_iv|options_oi|levels_structure|evidence_memory|risk_aggressive|risk_conservative|risk_neutral)\b(?:'s)?/g, m => PLAIN[m.replace(/'s$/, '')] + (m.endsWith("'s") ? "'s" : ''))
    .replace(/\bTESTED[- ]NULL\b/g, 'tested and found no edge').replace(/\bREOPENED\b/g, 'under review')
    .replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
  const parts = t.split(/(?<=[.!?])\s+(?=[A-Z"'(\u2018\u201C])/).map(x => x + ' ');   // a full stop, a space, then a capital: never inside 19.4 or 0.93
  let out = '';
  for (const p of parts.slice(0, sentences)) { if ((out + p).length > chars && out) break; out += p; }
  out = out.trim();
  if (out.length > chars) out = out.slice(0, chars).replace(/\s+\S*$/, '') + '…';
  return out;
}
const fmtP = (v, open) => { if (!Number.isFinite(v)) return '·'; const d = open >= 1000 ? 1 : open >= 100 ? 2 : open >= 10 ? 3 : open >= 2 ? 4 : 5; return v.toFixed(d); };

/**
 * Today's forecast lines for one instrument as a dark ladder: the open in the middle, the p50/p75/p90 lines either
 * side, and the desk's lean shaded on the side it points to. The lines are the forecast's own, in price.
 */
export function ladderSvg(name, card, H) {
  const L = card?.levels; if (!L?.up || !L?.down || !Number.isFinite(L.open)) return '';
  const lo = L.down.p90 ?? L.down.p75, hi = L.up.p90 ?? L.up.p75; if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return '';
  const W = 320, Ht = 112, padL = 30, padR = 30, X = v => padL + (v - lo) / (hi - lo) * (W - padL - padR), dir = VIEW[card.rating]?.[1] ?? 0;
  const ticks = [['p90', L.down.p90], ['p75', L.down.p75], ['p50', L.down.p50], ['open', L.open], ['p50', L.up.p50], ['p75', L.up.p75], ['p90', L.up.p90]].filter(t => Number.isFinite(t[1]));
  const shade = dir < 0 ? `<rect x="${padL}" y="40" width="${(X(L.open) - padL).toFixed(1)}" height="26" fill="${T.down}" fill-opacity=".16"/>` : dir > 0 ? `<rect x="${X(L.open).toFixed(1)}" y="40" width="${(W - padR - X(L.open)).toFixed(1)}" height="26" fill="${T.up}" fill-opacity=".16"/>` : '';
  const col = dir > 0 ? T.up : dir < 0 ? T.down : T.txt;
  return `<svg viewBox="0 0 ${W} ${Ht}" class="fsvg" role="img" aria-label="${H.esc(instName(name))} forecast lines" font-family="Consolas,'SF Mono',Menlo,monospace" style="width:100%;height:auto"><rect width="${W}" height="${Ht}" rx="10" fill="${T.bg}"/>`
    + `<text x="12" y="18" font-size="11" font-weight="700" fill="${T.hi}" letter-spacing="1">${H.esc(instName(name).toUpperCase())}</text><text x="${W - 12}" y="18" text-anchor="end" font-size="10.5" font-weight="700" fill="${col}">${H.esc((VIEW[card.rating]?.[0] ?? '').toUpperCase())}${Number.isFinite(card.size) ? ` · SIZE ${card.size}` : ''}</text>`
    + shade + `<line x1="${padL}" y1="53" x2="${W - padR}" y2="53" stroke="${T.grid}" stroke-width="2"/>`
    + ticks.map(([k, v], i) => { const x = X(v).toFixed(1), isO = k === 'open', anc = i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle', nx = i === 0 ? +x - 4 : i === ticks.length - 1 ? +x + 4 : x;
        return `<line x1="${x}" y1="${isO ? 36 : 43}" x2="${x}" y2="${isO ? 70 : 63}" stroke="${isO ? T.hi : T.cyan}" stroke-width="${isO ? 2 : 1.4}"/><text x="${nx}" y="34" text-anchor="${anc}" font-size="9" fill="${isO ? T.hi : T.txt}">${k}</text><text x="${nx}" y="${i % 2 ? 98 : 84}" text-anchor="${anc}" font-size="9.5" fill="${isO ? T.hi : T.txt}">${fmtP(v, L.open)}</text>`; }).join('')
    + `</svg>`;
}

/** The desk's pages: [{ section, html }] for composeMagazine to wrap in its masthead. Empty when there is no usable run. */
export function deskPages(run, H, { flag = () => '' } = {}) {
  const b = run?.head?.ok ? run.head.book : null; if (!b) return [];
  const { esc } = H, d = run.debate ?? {}, g = d.global?.view, cv = d.currency?.view, nl = run.newsletter?.ok ? run.newsletter.issue : null;
  const cards = b.instruments ?? {}, exp = b.exposure;
  const note = t => `<span style="font:11px var(--sans,system-ui);color:#5b6b82">${t}</span>`;
  const pages = [];

  // ── D1: the global ruling and the case for and against ──
  const caseCol = (who, st) => { const c = st?.view?.cases?.GLOBAL; return c ? `<div class="box"><h4>${esc(who)} · ${esc(c.strength)} strength</h4><p>${esc(prose(c.argument, { sentences: 2, chars: 380 }))}</p>${st.view.rebuttal ? `<p><b>Against the other side.</b> ${esc(prose(st.view.rebuttal, { sentences: 1, chars: 260 }))}</p>` : ''}</div>` : ''; };
  const reading = (nl?.sections ?? []).filter(s => !/could not see|break the day|global backdrop/i.test(s.title)).slice(0, 2)
    .map(s => `<h3 class="ss" style="margin:12px 0 4px">${esc(s.title)}</h3><p class="evl">${evBadge(Object.entries({ observed: 'Observed data', model: 'Model output', tested: 'Tested association', context: 'Context, not a signal', hyp: 'Hypothesis', untested: 'Untested interpretation' }).find(([, v]) => v === s.label)?.[0] ?? 'untested')}</p><p>${esc(prose(s.body, { sentences: 5, chars: 800 }))}</p>`).join('');
  pages.push({ section: "The desk's view", html: `<div class="kick">Desk exhibit D1 · the global ruling</div><h2 class="sh">The desk rules ${esc(TONE[g?.tone ?? b.global?.tone] ?? 'mixed')}${g?.conviction ? `, ${esc(g.conviction)} conviction` : ''}</h2>
<p class="evl">${evBadge('model')}${evBadge('untested')}${note("The analyst pipeline's reading: eleven analysts, a risk-on against risk-off debate, then a ruling. Not a tested signal.")}</p>
<p class="lead" style="font-size:16px;line-height:1.6">${esc(prose(g?.summary ?? b.global?.summary ?? '', { sentences: 3, chars: 560 }))}</p>
${guide({ looking: 'Two advocates argued the day from the same analyst reports, one for risk-on and one for risk-off, then answered each other. A manager ruled on which case was stronger.', matters: 'The global ruling is the frame for everything below it: each currency is read inside it, and each market from its currencies.', tells: (g?.drivers ?? []).slice(0, 3).map(x => prose(x, { sentences: 1, chars: 160 })).join(' · ') || 'See the ruling above.', unsure: (g?.flip ?? []).length ? `The ruling flips if: ${(g.flip ?? []).slice(0, 3).map(x => prose(x, { sentences: 1, chars: 140 }).replace(/\.$/, '')).join('; ')}.` : '' }, H)}
<h3 class="ss" style="margin:14px 0 6px">The case for and against</h3><div class="two">${caseCol('The risk-on case', d.global?.debate?.risk_on)}${caseCol('The risk-off case', d.global?.debate?.risk_off)}</div>
${reading ? `<div class="kick" style="margin-top:14px">The desk's reading</div>${reading}` : ''}` });

  // ── D2: the currencies, ranked ──
  if (cv) {
    const order = cv.ranking?.length === 8 ? cv.ranking : Object.keys(cv.currencies);
    const fig = barFigure('Desk bias by currency, −2 to +2', order.map(c => ({ label: c, v: cv.currencies[c]?.bias ?? 0, note: cv.currencies[c]?.conviction ? `${cv.currencies[c].conviction}` : '' })), H, { unit: '', note: 'The Currency Manager\'s ruling after the strengthen and weaken advocates argued each currency. Green: the desk leans stronger; red: weaker.' });
    const arg = (who, c) => esc(prose(d.currency?.debate?.[who]?.view?.cases?.[c]?.argument ?? '', { sentences: 1, chars: 170 }));
    const rows = order.map(c => { const v = cv.currencies[c] ?? {}; return [`${flag(c)} <b>${esc(c)}</b>`, `<b class="${v.bias > 0 ? 'up' : v.bias < 0 ? 'dn' : ''}">${v.bias > 0 ? '+' : ''}${v.bias ?? '·'}</b>`, `${esc(prose(v.why ?? '', { sentences: 1, chars: 340 }))}<small style="display:block;color:#5b6b82;margin-top:3px"><b style="color:#0b7a55">For:</b> ${arg('ccy_strengthen', c)} <b style="color:#b4232f">Against:</b> ${arg('ccy_weaken', c)}</small>`]; });
    pages.push({ section: 'The currencies, ranked', html: `<div class="kick">Desk exhibit D2 · each currency inside the global ruling</div><h2 class="sh">Strongest to weakest: ${order.map(esc).join(' › ')}</h2>
<p class="evl">${evBadge('untested')}${note('A strengthen and a weaken advocate argued every currency; the manager ruled on each. A bias is the desk\'s lean, not a forecast.')}</p>
${fig}${flatTable(['Currency', 'Bias', 'The ruling, and the strongest case each way'], rows, ['l', 'l', 'l'])}` });
  }

  // ── D3: where the desk leans ──
  const all = Object.entries(cards), live = all.filter(([, c]) => (VIEW[c.rating]?.[1] ?? 0) !== 0);
  const count = r => all.filter(([, c]) => c.rating === r).length;
  const tiles = tileRow([
    { name: 'Long or strong long', value: String(count('LONG') + count('STRONG_LONG')), sub: `of ${all.length} markets`, tone: 'up' },
    { name: 'Short or strong short', value: String(count('SHORT') + count('STRONG_SHORT')), sub: `of ${all.length} markets`, tone: 'dn' },
    { name: 'Flat or under review', value: String(count('FLAT') + count('REVIEW')), sub: 'no lean, or no readable rating', tone: '' },
  ], H);
  const expFig = exp ? barFigure(`Net exposure by currency after the cap of ${exp.cap}`, Object.keys(exp.after).map(c => ({ label: c, v: exp.after[c], note: exp.before[c] !== exp.after[c] ? `was ${exp.before[c]}` : '' })), H, { unit: '', note: 'Each card\'s size, signed, added to the currencies it touches: a pair is long its base and short its quote, commodities and crypto count against the dollar, indices are left out. Over the cap, the cards building it were scaled down.' }) : '';
  const ideas = (nl?.ideas?.length ? nl.ideas.map(i => [i.instrument, { ...cards[i.instrument], rating: i.view, size: i.size ?? cards[i.instrument]?.size, plan: { zone: i.level, invalidation: i.invalidation }, why: i.why }]) : [])
    .concat(live.sort((x, y) => Math.abs((VIEW[y[1].rating]?.[1] ?? 0) * (y[1].size ?? 1)) - Math.abs((VIEW[x[1].rating]?.[1] ?? 0) * (x[1].size ?? 1))))
    .filter((x, i, arr) => arr.findIndex(y => y[0] === x[0]) === i).slice(0, 8);
  const ideaRows = ideas.map(([n, c]) => [`<b>${esc(instName(n))}</b>`, chip(c.rating), sizeBar(c.size, cards[n]?.sizeBeforeCap), esc(prose(c.plan?.zone ?? '', { sentences: 1, chars: 120 })), esc(prose(c.plan?.invalidation ?? c.invalidation ?? '', { sentences: 1, chars: 110 }))]);
  const ladders = ideas.slice(0, 4).map(([n, c]) => ladderSvg(n, { ...cards[n], rating: c.rating, size: c.size }, H)).filter(Boolean);
  pages.push({ section: 'Where the desk leans', html: `<div class="kick">Desk exhibit D3 · the book</div><h2 class="sh">Where the desk leans today</h2>
<p class="evl">${evBadge('untested')}${note('The Head of Desk\'s book after the asset desks and the risk desk; sizes after the per-currency cap. 1 is a normal position, 0 stands aside.')}</p>
${tiles}${expFig}
<h3 class="ss" style="margin:12px 0 6px">The clearest ideas</h3>${ideaRows.length ? flatTable(['Market', 'View', 'Size', 'Where', 'Wrong if'], ideaRows, ['l', 'l', 'l', 'l', 'l']) : '<p>The desk is flat everywhere today.</p>'}
${ladders.length ? `<figure class="lad"><div class="ldg">${ladders.map(x => `<div>${x}</div>`).join('')}</div><figcaption>${evBadge('model')}<b>Today's forecast lines in price.</b> The open in white; the p50, p75 and p90 lines either side are the desk's own volatility forecast, the size of a typical day and of one in four and one in ten days. The shaded side is the way the desk leans. A line is a size, not a target.</figcaption></figure>` : ''}` });

  // ── D4: the risk desk and what the desk could not see ──
  const voice = (who, v) => (v?.view ? `<div class="box"><h4>${esc(who)}</h4><p>${esc(prose(v.view.headline, { sentences: 2, chars: 300 }))}</p>${v.view.adjustments.slice(0, 5).map(a => `<p style="margin:2px 0"><b>${esc(a.target === 'ALL' ? 'Whole book' : instName(a.target))}</b> size ${a.size}${a.veto ? ' · <b style="color:#b4232f">veto</b>' : ''} · ${esc(prose(a.reason, { sentences: 1, chars: 140 }))}</p>`).join('')}</div>` : '');
  const r = d.risk ?? {};
  pages.push({ section: 'The risk desk', html: `<div class="kick">Desk exhibit D4 · sizing the book</div><h2 class="sh">Three voices on how much to risk</h2>
<p class="evl">${evBadge('untested')}${note('An aggressive, a conservative and a neutral risk voice sized the whole book; the Head of Desk weighed them.')}</p>
<div class="two">${voice('Aggressive', r.risk_aggressive)}${voice('Conservative', r.risk_conservative)}</div>${voice('Neutral', r.risk_neutral)}
${(b.risks ?? []).length ? `<h3 class="ss" style="margin:12px 0 6px">What could break the day</h3><ul class="lst">${b.risks.slice(0, 6).map(x => `<li>${esc(prose(x, { sentences: 2, chars: 260 }))}</li>`).join('')}</ul>` : ''}
${(b.gaps ?? []).length ? `<div class="box warn"><h4>What the desk could not see</h4><ul class="lst" style="margin:0">${b.gaps.slice(0, 6).map(x => `<li>${esc(prose(x, { sentences: 2, chars: 240 }))}</li>`).join('')}</ul></div>` : ''}
<p class="small3">The desk edition adds the analyst pipeline's untested reading to the regular issue. It is context, not a tested signal, and it is not scored until its pre-registration is in place. Built from ${run.calls ?? '?'} model calls; ${run.packHealth?.ok ?? '?'} of ${run.packHealth?.total ?? '?'} data feeds read.</p>` });
  return pages;
}

/** The cover for the desk edition: the writer's headline and opening in place of the brief's, with a desk kicker. */
export function deskCover(today, run, mode = null) {
  const nl = run?.newsletter?.ok ? run.newsletter.issue : null;
  if (!today || !nl) return today;
  return { ...today, kicker: `${mode === 'brief' ? 'Desk brief' : mode === 'magazine' ? 'Desk magazine' : 'Desk edition'} · ${today.kicker ?? ''}`.replace(/ · $/, ''), headline: nl.subject, lede: prose(nl.standfirst, { sentences: 8, chars: 1100 }), note: mode ? 'Headline and opening written by the desk pipeline from this morning\'s desk book.' : 'Headline and opening written by the desk pipeline from this morning\'s desk book; the desk\'s pages follow Today by level.' };
}

// ── The two desk-only formats (owner, 2026-11-03: "do both under 2 buttons") ─────────────────────────────────────
// The magazine: a full issue built around the desk, top-down (global ruling, the backdrop, the currencies, every asset
// group with its cards and price ladders, the book, the risk desk), without the regular pages that would contradict
// it. The brief: the cover and one tight read of the desk's view and its clearest ideas.

const GROUPS = [
  ['FX majors', ['fx_majors']], ['FX crosses', ['fx_crosses']], ['Stock indices', ['indices']],
  ['Metals and energy', ['metals', 'energy']], ['Agriculture and crypto', ['ags', 'crypto']],
];

/** One page per asset group: the asset desk's reading, every card (view, size, why, plan, wrong if), and a ladder per live card. */
export function groupPages(run, H) {
  const b = run?.head?.ok ? run.head.book : null; if (!b) return [];
  const { esc } = H, cards = b.instruments ?? {}, assets = run.debate?.assets ?? {};
  return GROUPS.map(([label, keys]) => {
    const names = keys.flatMap(k => DESK_UNIVERSE[k] ?? []).filter(n => cards[n]);
    if (!names.length) return null;
    const reads = keys.map(k => assets[k]?.view?.summary).filter(Boolean).map(t => `<p>${esc(prose(t, { sentences: 3, chars: 520 }))}</p>`).join('');
    const rows = names.map(n => { const c = cards[n], pl = c.plan ?? {};
      return [`<b>${esc(instName(n))}</b>`, `${chip(c.rating)}<small style="display:block;color:#5b6b82;margin-top:2px">${esc(c.conviction ?? '')}</small>`, sizeBar(c.size, c.sizeBeforeCap),
        `${esc(prose(c.why ?? '', { sentences: 2, chars: 300 }))}${pl.zone ? `<small style="display:block;color:#3a4756;margin-top:3px"><b>Plan:</b> ${esc(prose(pl.zone, { sentences: 1, chars: 140 }))}${pl.timing ? ` · ${esc(prose(pl.timing, { sentences: 1, chars: 60 }))}` : ''}</small>` : ''}`,
        esc(prose(pl.invalidation ?? c.invalidation ?? '', { sentences: 1, chars: 130 }))]; });
    const live = names.filter(n => (VIEW[cards[n].rating]?.[1] ?? 0) !== 0 && cards[n].levels);
    const ladders = live.map(n => ladderSvg(n, cards[n], H)).filter(Boolean);
    const longs = names.filter(n => (VIEW[cards[n].rating]?.[1] ?? 0) > 0).length, shorts = names.filter(n => (VIEW[cards[n].rating]?.[1] ?? 0) < 0).length;
    return { section: label, html: `<div class="kick">The asset desks · ${esc(label.toLowerCase())}</div><h2 class="sh">${esc(label)}: ${shorts} short, ${longs} long, ${names.length - shorts - longs} flat</h2>
<p class="evl">${evBadge('untested')}<span style="font:11px var(--sans,system-ui);color:#5b6b82">The asset desk rated each market from its currency legs, today's session and its own data; the Head of Desk set the final view and size, after the per-currency cap.</span></p>
${reads}${flatTable(['Market', 'View', 'Size', 'Why, and the plan', 'Wrong if'], rows, ['l', 'l', 'l', 'l', 'l'])}
${ladders.length ? `<figure class="lad"><div class="ldg">${ladders.map(x => `<div>${x}</div>`).join('')}</div><figcaption>${evBadge('model')}<b>Today's forecast lines in price.</b> The open in white; the p50, p75 and p90 lines either side are the volatility forecast. The shaded side is the way the desk leans. A line is a size, not a target.</figcaption></figure>` : ''}` };
  }).filter(Boolean);
}

/** The desk brief: one tight read after the cover. The global ruling, the currencies, the clearest ideas with their ladders, what could break the day. */
export function deskBrief(run, H, { flag = () => '' } = {}) {
  const b = run?.head?.ok ? run.head.book : null; if (!b) return '';
  const { esc } = H, d = run.debate ?? {}, g = d.global?.view, cv = d.currency?.view, nl = run.newsletter?.ok ? run.newsletter.issue : null, cards = b.instruments ?? {};
  const order = cv ? (cv.ranking?.length === 8 ? cv.ranking : Object.keys(cv.currencies)) : [];
  const live = Object.entries(cards).filter(([, c]) => (VIEW[c.rating]?.[1] ?? 0) !== 0);
  const ideas = (nl?.ideas ?? []).map(i => [i.instrument, { ...cards[i.instrument], rating: i.view, size: i.size ?? cards[i.instrument]?.size, plan: { zone: i.level, invalidation: i.invalidation } }])
    .concat(live.sort((x, y) => Math.abs((VIEW[y[1].rating]?.[1] ?? 0) * (y[1].size ?? 1)) - Math.abs((VIEW[x[1].rating]?.[1] ?? 0) * (x[1].size ?? 1))))
    .filter((x, i, arr) => cards[x[0]] && arr.findIndex(y => y[0] === x[0]) === i).slice(0, 6);
  const tiles = tileRow([
    { name: 'Global tone', value: TONE[g?.tone ?? b.global?.tone] ?? 'mixed', sub: g?.conviction ? `${g.conviction} conviction` : '', tone: /off/.test(g?.tone ?? b.global?.tone ?? '') ? 'dn' : /on/.test(g?.tone ?? '') ? 'up' : '' },
    { name: 'Strongest currency', value: order[0] ?? '·', sub: order[0] ? `bias ${cv.currencies[order[0]]?.bias > 0 ? '+' : ''}${cv.currencies[order[0]]?.bias}` : '', tone: 'up' },
    { name: 'Weakest currency', value: order.at(-1) ?? '·', sub: order.length ? `bias ${cv.currencies[order.at(-1)]?.bias}` : '', tone: 'dn' },
  ], H);
  const fig = cv ? barFigure('The currencies, strongest to weakest', order.map(c => ({ label: c, v: cv.currencies[c]?.bias ?? 0, note: cv.currencies[c]?.conviction ?? '' })), H, { unit: '', note: 'The desk\'s bias on each currency, −2 to +2, after a strengthen and a weaken advocate argued it.' }) : '';
  const rows = ideas.map(([n, c]) => [`<b>${esc(instName(n))}</b>`, chip(c.rating), sizeBar(c.size, cards[n]?.sizeBeforeCap), esc(prose(c.plan?.zone ?? '', { sentences: 1, chars: 110 })), esc(prose(c.plan?.invalidation ?? c.invalidation ?? '', { sentences: 1, chars: 100 }))]);
  const ladders = ideas.slice(0, 4).map(([n, c]) => ladderSvg(n, { ...cards[n], rating: c.rating, size: c.size }, H)).filter(Boolean);
  const ccyLine = order.map(c => `${flag(c)}<b>${esc(c)}</b> ${esc(prose(cv.currencies[c]?.why ?? '', { sentences: 1, chars: 150 }))}`);
  return `<div class="kick">The desk brief · the day in one read</div><h2 class="sh">${esc(prose(String(b.headline ?? nl?.subject ?? '').split(/:\s/)[0], { sentences: 1, chars: 120 }))}</h2>
<p class="evl">${evBadge('model')}${evBadge('untested')}<span style="font:11px var(--sans,system-ui);color:#5b6b82">Eleven analysts, a debate at each level, an asset desk per group and a risk desk. Context, not a tested signal.</span></p>
${tiles}
<h3 class="ss">The global ruling</h3><p>${esc(prose(g?.summary ?? b.global?.summary ?? '', { sentences: 3, chars: 520 }))}</p>
${(g?.flip ?? []).length ? `<p class="small3"><b>It flips if:</b> ${esc((g.flip ?? []).slice(0, 2).map(x => prose(x, { sentences: 1, chars: 130 }).replace(/\.$/, '')).join('; '))}.</p>` : ''}
${fig}${ccyLine.length ? `<div class="small3" style="columns:2;column-gap:18px;margin:4px 0 10px">${ccyLine.map(x => `<p style="margin:0 0 5px;font-size:11.5px;break-inside:avoid">${x}</p>`).join('')}</div>` : ''}
<h3 class="ss">The clearest ideas</h3>${rows.length ? flatTable(['Market', 'View', 'Size', 'Where', 'Wrong if'], rows, ['l', 'l', 'l', 'l', 'l']) : '<p>The desk is flat everywhere today.</p>'}
${ladders.length ? `<figure class="lad"><div class="ldg">${ladders.map(x => `<div>${x}</div>`).join('')}</div><figcaption>${evBadge('model')}<b>Forecast lines in price.</b> Open in white, p50/p75/p90 either side; shaded the way the desk leans. A line is a size, not a target.</figcaption></figure>` : ''}
${(b.risks ?? []).length ? `<h3 class="ss">What could break the day</h3><ul class="lst">${b.risks.slice(0, 4).map(x => `<li>${esc(prose(x, { sentences: 1, chars: 220 }))}</li>`).join('')}</ul>` : ''}
${(b.gaps ?? []).length ? `<div class="box warn"><h4>What the desk could not see</h4><ul class="lst" style="margin:0">${b.gaps.slice(0, 3).map(x => `<li>${esc(prose(x, { sentences: 1, chars: 200 }))}</li>`).join('')}</ul></div>` : ''}
<p class="small3">Built from ${run.calls ?? '?'} model calls on ${run.packHealth?.ok ?? '?'} of ${run.packHealth?.total ?? '?'} data feeds. Not scored until its pre-registration is in place. Not financial advice.</p>`;
}

// ── Phase 4 in the issue: "Yesterday, reviewed" (owner, 2026-11-03) ─────────────────────────────────────────────────
// Last night's score and the evening review on a page of the morning issue: what the book said, what the day did,
// what the desk takes from it. Read from /api/desk-score and /api/desk-score/record; the running record is interim.

const sgn2 = x => (Number.isFinite(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(2)}` : '–');
/** review: { score, reflection, movers, record } (the API's shapes). Returns { section, html } or null. */
export function reviewPage(review, H, { title = 'Yesterday, reviewed' } = {}) {
  const sc = review?.score; if (!sc || sc.S == null && !sc.scored) return null;
  const { esc } = H, ref = review.reflection, mv = review.movers, rec = review.record;
  const day = new Date(sc.date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const beat = sc.S != null && sc.placebo?.p95 != null ? (sc.S > sc.placebo.p95 ? 'above the shuffled book\'s 95th percentile' : sc.S > (sc.placebo.mean ?? 0) ? 'above the shuffled book\'s average, inside its range' : 'below the shuffled book\'s average') : '';
  const tiles = tileRow([
    { name: 'Day score, size-weighted', value: `${sgn2(sc.S)} u`, sub: beat || `${sc.scored} of ${sc.live} cards scored`, tone: sc.S > 0 ? 'up' : sc.S < 0 ? 'dn' : '' },
    { name: 'Single analyst, same data', value: sc.control?.unweighted != null ? `${sgn2(sc.control.unweighted)} u` : 'not run', sub: sc.unweighted != null ? `the desk, unweighted: ${sgn2(sc.unweighted)} u` : '', tone: '' },
    { name: 'Lean-side line first', value: sc.race?.resolved ? `${sc.race.leanFirst} of ${sc.race.resolved}` : '–', sub: 'cards that reached a p50 line', tone: '' },
  ], H);
  const cards = Object.entries(sc.cards ?? {}).filter(([, c]) => !c.missing && c.size > 0).map(([n, c]) => ({ n, w: c.size * c.R, R: c.R, dir: c.dir }))
    .sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, 12).sort((a, b) => b.w - a.w);
  const fig = cards.length ? barFigure('The cards that moved the day, size × score', cards.map(c => ({ label: instName(c.n), v: +c.w.toFixed(2), note: `${c.dir > 0 ? 'long' : 'short'} · ${sgn2(c.R)} u` })), H,
    { unit: '', note: 'Each bar is a card\'s size times its score: the move from 08:00 to 21:00 London in the day\'s own forecast unit (u, the p50 distance), signed by the card\'s view. Green helped the book; red hurt it.' }) : '';
  const lessons = (ref?.lessons ?? []).map(l => `<li><b>${esc(l.scope)}${l.about ? ` · ${esc(l.about)}` : ''}.</b> ${esc(prose(l.lesson, { sentences: 2, chars: 300 }))}</li>`).join('');
  const recLine = rec?.eligibleDays ? `Running record, interim and not judged: ${rec.eligibleDays} counted day${rec.eligibleDays === 1 ? '' : 's'}, mean ${sgn2(rec.S?.mean)} u${rec.S?.ci ? ` [${sgn2(rec.S.ci.lo)}, ${sgn2(rec.S.ci.hi)}]` : ''}; vs the single analyst ${sgn2(rec.vsControl?.mean)} u. Judged at 120+ counted days.` : 'The pre-registered record starts counting with books written before 08:00 London.';
  return { section: title, html: `<div class="kick">${esc(title)} · ${esc(day)}</div><h2 class="sh">${esc(ref?.headline ? prose(ref.headline, { sentences: 1, chars: 160 }) : `The book scored ${sgn2(sc.S)} u`)}</h2>
<p class="evl">${evBadge('observed')}${evBadge('model')}<span style="font:11px var(--sans,system-ui);color:#5b6b82">The morning book scored against the day (forge/DESK_ANALYST_PIPELINE_PREREG.md), then the desk's evening review. ${sc.eligible ? 'This day counts in the test.' : 'This day does not count in the test: the book was written after 08:00 London.'}</span></p>
${tiles}${fig}
${mv && (mv.best?.length || mv.worst?.length) ? `<p class="small3"><b>Made the day:</b> ${mv.best.map(m => `${esc(instName(m.inst))} ${sgn2(m.R)} u`).join(', ') || '–'} · <b>Lost it:</b> ${mv.worst.map(m => `${esc(instName(m.inst))} ${sgn2(m.R)} u`).join(', ') || '–'}</p>` : ''}
${(ref?.worked?.length || ref?.failed?.length) ? `<div class="two">${ref.worked?.length ? `<div class="box"><h4>What the book got right</h4><ul class="lst" style="margin:0">${ref.worked.slice(0, 4).map(x => `<li>${esc(prose(x, { sentences: 1, chars: 220 }))}</li>`).join('')}</ul></div>` : ''}${ref.failed?.length ? `<div class="box warn"><h4>What it got wrong</h4><ul class="lst" style="margin:0">${ref.failed.slice(0, 4).map(x => `<li>${esc(prose(x, { sentences: 1, chars: 220 }))}</li>`).join('')}</ul></div>` : ''}</div>` : ''}
${lessons ? `<h3 class="ss">What the desk takes from it</h3><ul class="lst">${lessons}</ul><p class="small3">${evBadge('untested')} One day is an anecdote: these are things to check today, not findings.</p>` : ''}
${ref?.watch?.length ? `<h3 class="ss">Carried into today</h3><ul class="lst">${ref.watch.slice(0, 4).map(x => `<li>${esc(prose(x, { sentences: 1, chars: 200 }))}</li>`).join('')}</ul>` : ''}
<p class="small3">${esc(recLine)}</p>` };
}

// ── Phases 6 and 15 in the issue: "The releases ahead" (for readers: the economist's briefs and the playbooks) ────────
const ukTime = iso => new Date(iso).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const sgnU = (x, u) => (Number.isFinite(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x)}${u}` : '–');
/** One page: per release, the economist's brief and the history table (size, speed, after hot, after cold). */
export function economistPage(run, H) {
  const e = run?.economist; if (!e?.ok || !e.view?.briefs?.length) return null;
  const { esc } = H;
  const blocks = e.view.briefs.map((b, i) => {
    const r = e.releases?.[i], p = r?.playbook, rows = p ? Object.values(p.markets).slice(0, 6).map(m => [`<b>${esc(m.label)}</b>`, `${m.abs30}${m.unit}`, `${m.abs240}${m.unit}`, `${m.peakMin} min · ${Math.round((m.kept ?? 0) * 100)}% kept`,
      m.hot ? `${sgnU(m.hot.m30, m.unit)} <small style="color:#5b6b82">n ${m.hot.n}</small>` : '–', m.cold ? `${sgnU(m.cold.m30, m.unit)} <small style="color:#5b6b82">n ${m.cold.n}</small>` : '–']) : [];
    return `<div class="box" style="margin:10px 0"><h4>${esc(r ? ukTime(r.at) : '')} · ${esc(b.event)}${r?.estimate ? ` <span style="font-weight:400">· consensus ${esc(r.estimate)}${r.prev ? `, previous ${esc(r.prev)}` : ''}</span>` : ''}</h4>
${b.priced ? `<p><b>What is priced.</b> ${esc(prose(b.priced, { sentences: 2, chars: 300 }))}</p>` : ''}<p><b>Size and speed.</b> ${esc(prose(b.sizeAndSpeed, { sentences: 3, chars: 420 }))}</p>
${b.ifHot || b.ifCold ? `<div class="two"><p><b style="color:#b4232f">If hot.</b> ${esc(prose(b.ifHot, { sentences: 2, chars: 300 }))}</p><p><b style="color:#0b7a55">If cold.</b> ${esc(prose(b.ifCold, { sentences: 2, chars: 300 }))}</p></div>` : ''}
${b.bookAtRisk ? `<p><b>The book.</b> ${esc(prose(b.bookAtRisk, { sentences: 2, chars: 300 }))}</p>` : ''}
${rows.length ? flatTable(['Market', 'Typical, 30 min', 'Typical, 4 h', 'Peak and kept', 'After hot, 30 min', 'After cold, 30 min'], rows, ['l', 'l', 'l', 'l', 'l', 'l']) + `<p class="small3">${evBadge('observed')} From the desk's record of ${p.n} past releases, ${esc(p.from)} to ${esc(p.to)}; the surprise was recorded for ${p.surprises.known} (${p.surprises.hot} hot, ${p.surprises.cold} cold). History, not a forecast of the next surprise.</p>` : ''}</div>`;
  }).join('');
  return { section: 'The releases ahead', html: `<div class="kick">The economist · the next day and a half</div><h2 class="sh">${esc(prose(e.view.headline, { sentences: 1, chars: 140 }))}</h2>
<p class="evl">${evBadge('observed')}${evBadge('untested')}<span style="font:11px var(--sans,system-ui);color:#5b6b82">The size and speed of past moves are measured; the reading of them is the economist's. Nobody can tell in advance which way a surprise will go.</span></p>${blocks}` };
}
