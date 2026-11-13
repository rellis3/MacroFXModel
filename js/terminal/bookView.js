/**
 * The book as decision support (Desk Terminal, Charts and Overview tabs): what the book is really betting on, where
 * cards pile onto one currency leg, and where a card goes against its currency's ruling.
 *
 * NOTHING HERE SCORES OR PREDICTS. Every number is arithmetic on outputs the morning run already has:
 *   - net and gross exposure per currency: js/deskExposure.js netExposure, the same arithmetic as the Head's exposure
 *     cap (an FX pair is long its base and short its quote; a USD-priced commodity or crypto counts against USD;
 *     STRONG ratings weigh 1.5). Equity indices are not a currency position there, so they get their own EQUITY line;
 *   - the construction view: which cards use each currency, each card's size split evenly across its legs (the view
 *     the terminal always drew);
 *   - concentration: three or more cards on the same side of one currency leg, with their effective number of
 *     independent bets, (Σ|w|)² / w'Cw over just those cards, from the correlations /api/desk-risk (js/deskRisk.js)
 *     already returns. Descriptive, on that endpoint's recent sessions;
 *   - "against the currency view": an FX card whose direction is the opposite of what its two currencies' biases
 *     (the Currency Manager's, run.debate.currency) imply for the pair. A plain comparison, not a judgement.
 *
 * Pure. Tested in js/terminal/bookView.test.mjs.
 */
import { exposureLegs, netExposure, EXPOSURE_CCYS } from '../deskExposure.js';
import { groupOf, instrumentLegs } from '../deskPack.js';

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const DIRN = { STRONG_LONG: 1, LONG: 1, SHORT: -1, STRONG_SHORT: -1 };
const W = { STRONG_LONG: 1.5, LONG: 1, SHORT: -1, STRONG_SHORT: -1.5 };   // as js/deskExposure.js
const r2 = x => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const FX = new Set(['fx_majors', 'fx_crosses']);
export const EQUITY = 'EQUITY';
export const LINE_LABEL = { EQUITY: 'Equity indices' };
const isFx = n => FX.has(groupOf(n));

/** The live cards (a direction and a size above 0), largest first. */
export function liveCards(cards) {
  return Object.entries(cards ?? {}).filter(([, c]) => DIRN[c?.rating] && Number(c.size) > 0)
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));
}

/** Signed size in the exposure engine's units (one LONG at size 1 = +1; STRONG = 1.5). */
export const signedUnits = c => (W[c?.rating] ?? 0) * (Number.isFinite(+c?.size) ? +c.size : 1);

/**
 * Net and gross exposure per currency (and an EQUITY line for indices), from netExposure. Rows sorted by |net|.
 * Each row: { key, net, gross, long, short, cards: [{ name, contrib, rating, size }] }.
 */
export function exposureRows(cards) {
  const live = Object.fromEntries(liveCards(cards));
  const { by } = netExposure(live);
  const rows = EXPOSURE_CCYS.map(k => ({ key: k, cards: by[k].map(x => ({ name: x.name, contrib: r2(x.contrib), rating: live[x.name].rating, size: live[x.name].size })) }));
  const eq = Object.entries(live).filter(([n]) => groupOf(n) === 'indices').map(([n, c]) => ({ name: n, contrib: r2(signedUnits(c)), rating: c.rating, size: c.size }));
  if (eq.length) rows.push({ key: EQUITY, cards: eq });
  for (const r of rows) {
    r.long = r2(r.cards.filter(x => x.contrib > 0).reduce((s, x) => s + x.contrib, 0));
    r.short = r2(r.cards.filter(x => x.contrib < 0).reduce((s, x) => s + x.contrib, 0));
    r.net = r2(r.long + r.short); r.gross = r2(r.long - r.short);
    r.cards.sort((a, b) => b.contrib - a.contrib || a.name.localeCompare(b.name));
  }
  return rows.filter(r => r.cards.length).sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || b.gross - a.gross || a.key.localeCompare(b.key));
}

/**
 * The legs a card is drawn on in each flow view, with the side it takes on each (+1 long that currency, −1 short,
 * 0 neither) and the ribbon weight.
 *   construction: the card's size split evenly across its legs (instrumentLegs: an index sits on its home currency);
 *   gross:        the card's full engine units on every leg it has exposure on (exposureLegs; indices on EQUITY).
 */
export function flowLegs(name, card, view = 'construction') {
  const d = DIRN[card?.rating] ?? 0;
  if (!d || !(card.size > 0)) return [];
  if (view === 'gross') {
    const u = Math.abs(signedUnits(card)), legs = exposureLegs(name);
    if (!legs.length) return groupOf(name) === 'indices' ? [{ leg: EQUITY, side: d, w: u }] : [];
    return legs.map(([leg, sign]) => ({ leg, side: d * sign, w: u }));
  }
  const legs = instrumentLegs(name) ?? ['USD'];
  return legs.map((leg, i) => ({ leg, side: isFx(name) ? (i === 0 ? d : -d) : groupOf(name) === 'indices' ? 0 : -d, w: card.size / legs.length }));
}

/** What the currencies' biases imply for a pair: +1 long, −1 short, 0 no view (equal biases, or no ruling on either leg). */
export function impliedByBiases(name, ccyView) {
  if (!isFx(name)) return null;
  const [b, q] = instrumentLegs(name), num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const bb = num(ccyView?.[b]?.bias), bq = num(ccyView?.[q]?.bias);
  if (bb == null && bq == null) return 0;
  return Math.sign((bb ?? 0) - (bq ?? 0));
}

/**
 * Each live card against its currencies' rulings: 'agrees', 'against' or 'no view' (FX only; other cards are 'n/a',
 * since the Currency Manager rules on currencies, not on gold or the Nasdaq). With the two biases for the reason.
 */
export function viewCheck(cards, ccyView) {
  const out = {};
  for (const [n, c] of liveCards(cards)) {
    const imp = impliedByBiases(n, ccyView), d = DIRN[c.rating];
    if (imp == null) { out[n] = { status: 'n/a' }; continue; }
    const [b, q] = instrumentLegs(n);
    out[n] = { status: imp === 0 ? 'no view' : imp === d ? 'agrees' : 'against', implied: imp, base: b, quote: q, baseBias: ccyView?.[b]?.bias ?? null, quoteBias: ccyView?.[q]?.bias ?? null };
  }
  return out;
}
/** "x of y FX cards agree with their currency bias" (y counts only cards whose two biases imply a direction). */
export function viewTally(check) {
  const v = Object.entries(check ?? {}), judged = v.filter(([, x]) => x.status === 'agrees' || x.status === 'against');
  return { judged: judged.length, agree: judged.filter(([, x]) => x.status === 'agrees').length, against: judged.filter(([, x]) => x.status === 'against').map(([n]) => n),
    noView: v.filter(([, x]) => x.status === 'no view').map(([n]) => n), notFx: v.filter(([, x]) => x.status === 'n/a').length };
}

/**
 * Effective independent bets over a subset of cards, (Σ|w|)² / w'Cw, from /api/desk-risk's corr block ({ names,
 * weights, m: direction × correlation }). The same formula as js/deskRisk.js effectiveBets. null when fewer than two
 * of the cards have history.
 */
export function subsetBets(corr, names) {
  if (!corr?.names?.length) return null;
  const idx = names.map(n => corr.names.indexOf(n)).filter(i => i >= 0);
  if (idx.length < 2) return null;
  const a = idx.map(i => Math.abs(corr.weights[i])), g = a.reduce((s, x) => s + x, 0);
  let v = 0; idx.forEach((i, p) => idx.forEach((j, q) => { v += a[p] * a[q] * (i === j ? 1 : (corr.m[i]?.[j] ?? 0)); }));
  return v > 0 ? { bets: r2((g * g) / v), of: idx.length } : null;
}

/**
 * Concentration flags: three or more cards on the same side of one currency leg (the exposure engine's legs, so a
 * short commodity counts as long USD). Sorted by the same-side units. Each: { ccy, side, cards, units, bets, cluster }.
 * cluster: the /api/desk-risk "bet" (cards that move together) that holds most of them, where there is one.
 */
export function concentration(cards, risk = null, { min = 3 } = {}) {
  const out = [];
  for (const r of exposureRows(cards)) {
    for (const side of [1, -1]) {
      const xs = r.cards.filter(x => Math.sign(x.contrib) === side);
      if (xs.length < min) continue;
      const names = xs.map(x => x.name), cl = (risk?.bets ?? []).map(b => ({ lead: b.lead, cards: b.cards.filter(n => names.includes(n)) })).sort((a, b) => b.cards.length - a.cards.length)[0];
      out.push({ ccy: r.key, side, cards: names, units: r2(Math.abs(xs.reduce((s, x) => s + x.contrib, 0))), bets: subsetBets(risk?.corr, names), cluster: cl && cl.cards.length >= 2 ? cl : null });
    }
  }
  return out.sort((a, b) => b.units - a.units || b.cards.length - a.cards.length);
}
const sideWord = (s, k) => { const w = globalThis.deskIsViewer?.() ? (s > 0 ? 'bullish' : 'bearish') : (s > 0 ? 'long' : 'short'); return k === EQUITY ? `${w} equities` : `${w} ${k}`; };   // the desk login reads a lean, not a position
/** One plain sentence for a flag. */
export function flagText(f, { days = null } = {}) {
  const b = f.bets ? `, ~${f.bets.bets} independent bet${f.bets.bets === 1 ? '' : 's'}${f.bets.of < f.cards.length ? ` among the ${f.bets.of} with price history` : ''}${days ? ` on the last ${days} sessions' correlations` : ''}` : '';
  return `${f.cards.length} cards ${sideWord(f.side, f.ccy)} (${f.units} units)${b}: ${f.cards.join(', ')}.`;
}

/**
 * The currency panel: who builds this currency's exposure, the Currency Manager's bias and its reason, and which
 * cards add to the net and which offset it. ccy may be EQUITY.
 */
export function currencyDetail(ccy, cards, ccyView, check = null) {
  const row = exposureRows(cards).find(r => r.key === ccy) ?? { key: ccy, net: 0, gross: 0, long: 0, short: 0, cards: [] };
  const v = ccyView?.[ccy] ?? null, bias = v?.bias == null || !Number.isFinite(Number(v.bias)) ? null : Number(v.bias);
  const ck = check ?? viewCheck(cards, ccyView);
  const rows = row.cards.map(x => ({ ...x, side: Math.sign(x.contrib), role: !row.net ? 'balanced' : Math.sign(x.contrib) === Math.sign(row.net) ? 'adds' : 'offsets',
    withBias: bias == null || bias === 0 ? null : Math.sign(x.contrib) === Math.sign(bias), view: ck[x.name]?.status ?? 'n/a' }));
  return { ccy, net: row.net, gross: row.gross, long: rows.filter(x => x.side > 0), short: rows.filter(x => x.side < 0), bias, conviction: v?.conviction ?? null, why: v?.why ?? null, flip: v?.flip ?? null };
}

// ─────────────────────────────── drawing (strings only; the page wires the clicks) ───────────────────────────────
const UP = 'var(--up)', DN = 'var(--dn)', FL = 'var(--flat)', TX = 'var(--tx)', TX3 = 'var(--tx3)', GOLD = 'var(--gold)';
const ribbon = (x1, y1, h1, x2, y2, h2, col, op, title, cls = '') => `<path class="bf-rb ${cls}" d="M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2} L${x2},${y2 + h2} C${(x1 + x2) / 2},${y2 + h2} ${(x1 + x2) / 2},${y1 + h1} ${x1},${y1 + h1} Z" fill="${col}" opacity="${op}"><title>${esc(title)}</title></path>`;
const f1 = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(+v || 0).toFixed(Math.abs(v) < 10 ? 2 : 1).replace(/\.?0+$/, '');

/**
 * The flow (construction or gross view) as an SVG string: the global ruling → each currency → every live card.
 * opts: { tone, ranking, ccyView, sel (a currency to isolate), check (viewCheck), narrow (a phone: the currencies and the
 * cards only, the ruling as a heading) }. Every card is drawn (no top-N).
 */
export function flowSvg(cards, view, { tone = '', ranking = [], ccyView = {}, sel = null, check = {}, narrow = false } = {}) {
  const live = liveCards(cards);
  if (!live.length) return '<p class="muted">No live card in today\'s book.</p>';
  const legsOf = Object.fromEntries(live.map(([n, c]) => [n, flowLegs(n, c, view)]));
  const ccyW = {};
  for (const [n] of live) for (const l of legsOf[n]) ccyW[l.leg] = (ccyW[l.leg] ?? 0) + l.w;
  const rk = k => { const i = ranking.indexOf(k); return i < 0 ? (k === EQUITY ? 99 : 50) : i; };
  const ccys = Object.keys(ccyW).sort((a, b) => rk(a) - rk(b) || a.localeCompare(b));
  const cardW = Object.fromEntries(live.map(([n]) => [n, legsOf[n].reduce((s, l) => s + l.w, 0)]));
  const Wd = narrow ? 470 : 1100, top = 34, colX = narrow ? [null, 76, 262] : [40, 470, 880], bw = narrow ? 12 : 14, gapC = 8, gapK = 4, minK = narrow ? 14 : 11;
  const total = Object.values(ccyW).reduce((a, b) => a + b, 0);
  const availC = Math.max(460, live.length * 17) - gapC * (ccys.length - 1);
  const scale = availC / total;
  const kH = n => Math.max(minK, cardW[n] * scale);
  const H = Math.max(top + availC + gapC * (ccys.length - 1), top + live.reduce((s, [n]) => s + kH(n) + gapK, 0)) + 20;
  let y = top; const cy = {}; for (const c of ccys) { const h = ccyW[c] * scale; cy[c] = { y, h, used: 0 }; y += h + gapC; }
  y = top; const ky = {}; for (const [n] of live) { const h = kH(n); ky[n] = { y, h, used: 0 }; y += h + gapK; }
  const toneCol = /off/i.test(tone) ? DN : /on/i.test(tone) ? UP : FL;
  let tUsed = 0;
  const dim = k => (sel && k !== sel ? ' bf-dim' : '');
  const touches = n => !sel || legsOf[n].some(l => l.leg === sel);
  const left = narrow ? '' : ccys.map(c => { const h = cy[c].h, r = ribbon(colX[0] + bw, top + tUsed, h, colX[1], cy[c].y, h, toneCol, 0.16, `${tone || 'ruling'} → ${c}`, dim(c)); tUsed += h; return r; }).join('');
  const right = live.map(([n, c]) => legsOf[n].map(l => {
    const h = l.w * scale, src = cy[l.leg], dst = ky[n];
    const col = l.side > 0 ? UP : l.side < 0 ? DN : FL;
    const r = ribbon(colX[1] + bw, src.y + src.used, h, colX[2], dst.y + dst.used, Math.min(h, dst.h), col, 0.34, `${n}: ${l.side > 0 ? (globalThis.deskIsViewer?.() ? 'bullish' : 'long') : l.side < 0 ? (globalThis.deskIsViewer?.() ? 'bearish' : 'short') : 'uses'} ${l.leg} · ${r2(l.w)}`, dim(l.leg));
    src.used += h; dst.used += Math.min(h, dst.h); return r;
  }).join('')).join('');
  const bias = c => { const b = Number(ccyView?.[c]?.bias); return Number.isFinite(b) ? b : null; };
  const net = Object.fromEntries(exposureRows(cards).map(r => [r.key, r]));
  const ccyNodes = ccys.map(c => { const b = bias(c), fill = b > 0 ? UP : b < 0 ? DN : FL, lab = `${c === EQUITY ? 'EQUITY' : c} ${b == null ? '' : `${b > 0 ? '+' : ''}${b}`}`;
    const sub = view === 'gross' ? (narrow ? `net ${f1(net[c]?.net ?? 0)}` : `gross ${r2(ccyW[c])} · net ${f1(net[c]?.net ?? 0)}`) : narrow ? `${r2(ccyW[c])}` : `${r2(ccyW[c])} of size`;
    return `<g class="bf-node${dim(c)}${sel === c ? ' bf-sel' : ''}" data-bfccy="${esc(c)}" tabindex="0" role="button" aria-label="${esc(`${c}: show its cards`)}" style="cursor:pointer"><rect x="${colX[1] - 4}" y="${cy[c].y - 2}" width="${bw + 8}" height="${cy[c].h + 4}" fill="transparent"/><rect x="${colX[1]}" y="${cy[c].y}" width="${bw}" height="${Math.max(2, cy[c].h)}" rx="3" fill="${fill}"/>
<text x="${colX[1] - 8}" y="${cy[c].y + cy[c].h / 2 + 1}" text-anchor="end" fill="${TX}" font-family="JetBrains Mono" font-size="13" font-weight="600">${esc(lab)}</text><text x="${colX[1] - 8}" y="${cy[c].y + cy[c].h / 2 + 14}" text-anchor="end" fill="${TX3}" font-family="JetBrains Mono" font-size="10">${esc(sub)}</text></g>`; }).join('');
  const cardNodes = live.map(([n, c]) => { const d = DIRN[c.rating], ag = check?.[n]?.status === 'against';
    return `<g class="bf-card${touches(n) ? '' : ' bf-dim'}" data-inst="${esc(n)}" tabindex="0" role="button" aria-label="${esc(`${n}: open the card`)}" style="cursor:pointer"><rect x="${colX[2]}" y="${ky[n].y}" width="${bw}" height="${ky[n].h}" rx="3" fill="${d > 0 ? UP : DN}"/><text x="${colX[2] + bw + 8}" y="${ky[n].y + ky[n].h / 2 + 4}" fill="${TX}" font-family="JetBrains Mono" font-size="11.5">${esc(n)} <tspan fill="${TX3}">${d > 0 ? '▲' : '▼'} ${esc(c.size)}</tspan>${ag ? `<tspan fill="${GOLD}"> · ${narrow ? 'vs view' : 'against view'}</tspan>` : ''}</text></g>`; }).join('');
  return `<svg class="bf-svg" viewBox="0 0 ${Wd} ${Math.ceil(H)}" width="100%" role="img" aria-label="how the book was built: ${esc(view)} view">${left}${right}
${narrow ? `<text x="4" y="${top - 14}" fill="${toneCol}" font-family="JetBrains Mono" font-size="12" font-weight="700">${esc(String(tone || 'no ruling').replace('_', '-').toUpperCase())} → CURRENCIES → CARDS</text>` : `<rect x="${colX[0]}" y="${top}" width="${bw}" height="${total * scale}" rx="4" fill="${toneCol}"/><text x="${colX[0]}" y="${top - 12}" fill="${TX}" font-family="JetBrains Mono" font-size="12" font-weight="700">${esc(String(tone || 'no ruling').replace('_', '-').toUpperCase())}</text>`}
${ccyNodes}${cardNodes}</svg>`;
}

/**
 * The net view: one diverging row per currency (and EQUITY), each card a segment (long to the right of zero, short to
 * the left), the net as a marker, the cap as dashed lines. HTML string.
 */
export function netBarsHtml(cards, { cap = null, ccyView = {}, sel = null } = {}) {
  const rows = exposureRows(cards);
  if (!rows.length) return '<p class="muted">No live card in today\'s book.</p>';
  const m = Math.max(cap ?? 0, ...rows.map(r => Math.max(r.long, -r.short)), 0.5) * 1.06;   // a little room past the cap line
  const pc = v => (Math.abs(v) / m) * 50;
  return `<div class="bf-net">${rows.map(r => {
    let acc = 0; const segL = r.cards.filter(x => x.contrib > 0).map(x => { const s = `<i class="bf-seg up" style="left:${50 + pc(acc)}%;width:${pc(x.contrib)}%" title="${esc(`${x.name} +${x.contrib}`)}"></i>`; acc += x.contrib; return s; }).join('');
    acc = 0; const segS = r.cards.filter(x => x.contrib < 0).map(x => { const s = `<i class="bf-seg dn" style="right:${50 + pc(acc)}%;width:${pc(x.contrib)}%" title="${esc(`${x.name} ${x.contrib}`)}"></i>`; acc += -x.contrib; return s; }).join('');
    const b = Number(ccyView?.[r.key]?.bias), bt = Number.isFinite(b) ? `${b > 0 ? '+' : ''}${b}` : '–';
    return `<div class="bf-nrow${sel && sel !== r.key ? ' bf-dim' : ''}${sel === r.key ? ' bf-sel' : ''}" data-bfccy="${esc(r.key)}" tabindex="0" role="button" aria-label="${esc(`${r.key}: show its cards`)}">
<b class="mono">${esc(r.key === EQUITY ? 'EQUITY' : r.key)}</b><span class="mono bf-bias ${b > 0 ? 'up' : b < 0 ? 'dn' : ''}" title="the Currency Manager's bias">${esc(r.key === EQUITY ? '' : bt)}</span>
<div class="bf-track"><i class="bf-zero"></i>${cap ? [-1, 1].map(s => `<i class="bf-cap" style="left:${50 + s * pc(cap)}%"></i>`).join('') : ''}${segL}${segS}<i class="bf-mark ${r.net >= 0 ? 'up' : 'dn'}" style="left:calc(${50 + Math.sign(r.net) * pc(r.net)}% - 5px)" title="net ${f1(r.net)}"></i></div>
<span class="mono bf-v ${r.net > 0 ? 'up' : r.net < 0 ? 'dn' : ''}">${f1(r.net)}</span><span class="mono muted bf-g">${r.cards.length} card${r.cards.length === 1 ? '' : 's'} · gross ${r.gross}</span></div>`; }).join('')}</div>`;
}

/** The currency panel's HTML (currencyDetail). */
export function currencyPanelHtml(x, { flags = [], days = null } = {}) {
  const lab = x.ccy === EQUITY ? 'Equity indices' : x.ccy;
  const roleChip = r => `<span class="chip ${r.role === 'adds' ? 'gold' : ''}" title="${r.role === 'adds' ? 'same side as the net: adds to it' : r.role === 'offsets' ? 'the other side: offsets the net' : ''}">${r.role}</span>`;
  const viewChip = r => (r.view === 'against' ? '<span class="chip gold" title="the card\'s direction is the opposite of what its two currencies\' biases imply">against view</span>' : r.view === 'agrees' ? '<span class="chip" title="the card\'s direction is what its two currencies\' biases imply">fits view</span>' : '');
  const list = (rows, word) => (rows.length ? `<table class="bf-tbl"><thead><tr><th>${word}</th><th class="n">units</th><th></th><th></th></tr></thead><tbody>${rows.map(r => `<tr class="tt-click" data-inst="${esc(r.name)}" tabindex="0"><td class="mono"><b>${esc(r.name)}</b> <span class="muted">${esc(String(r.rating).replace('_', ' ').toLowerCase())} ${esc(r.size)}</span></td><td class="n mono ${r.contrib > 0 ? 'up' : 'dn'}">${f1(r.contrib)}</td><td>${roleChip(r)}</td><td>${viewChip(r)}</td></tr>`).join('')}</tbody></table>` : `<p class="muted">No card is ${word.replace(/^[A-Z]/, c => c.toLowerCase())}.</p>`);
  const biasTxt = x.ccy === EQUITY ? 'The Currency Manager does not rule on equities.' : x.bias == null ? 'No ruling on this currency (traded, not debated).' : `${x.bias > 0 ? '+' : ''}${x.bias} (${x.bias >= 2 ? 'strongly bullish' : x.bias > 0 ? 'bullish' : x.bias <= -2 ? 'strongly bearish' : x.bias < 0 ? 'bearish' : 'neutral'})${x.conviction ? `, ${esc(x.conviction)} conviction` : ''}`;
  const myFlags = flags.filter(f => f.ccy === x.ccy);
  return `<div class="bf-panel"><div class="ch"><span class="lbl">${esc(lab)} in today's book</span><span class="r muted">net ${f1(x.net)} · gross ${x.gross} units</span><button class="btn bf-clear" type="button">Show all</button></div>
<div class="tt-kv"><b>Bias</b><span>${biasTxt}</span>${x.why ? `<b>Reason</b><span>${esc(x.why)}</span>` : ''}</div>
${myFlags.map(f => `<div class="bf-flag"><span class="chip gold">concentration</span> ${esc(flagText(f, { days }))}</div>`).join('')}
<div class="tt-grid2" style="margin-top:8px"><div>${list(x.long, `Long ${lab}`)}</div><div>${list(x.short, `Short ${lab}`)}</div></div>
<p class="tt-note">Units: one LONG card at size 1 = +1 (STRONG = 1.5), as the exposure cap counts them. "Adds" = on the same side as the net, "offsets" = the other side. Tap a card for its analysis.${x.ccy !== EQUITY ? ' <a href="#" class="bf-ccy-more" data-ccymodal="' + esc(x.ccy) + '">The full currency page →</a>' : ''}</p></div>`;
}
