/**
 * The Overview map's layers, in one place (Desk Terminal, desk-terminal.html heroCard / landStyle / landTip).
 *
 * The world map and globe used to carry four layers (desk bias, rate cycle, bank credit, fair value) while the Macro tab drew the rate
 * cycle a second time as its own map. This module is the one set of layers: every per-country measure the terminal already loads is a
 * pill on the same map, each with a legend, a source-and-age chip, a ranking under the map, and a country card on click that reuses
 * the Macro tab's own tile and heatmap renderers (nothing is drawn twice).
 *
 * Pure: no fetch, no DOM, no d3. Every function takes `ctx`, the data the page already holds:
 *   ctx.zone     { numericCountryId: ccy }                    the eight currencies' countries (the euro area's members map to EUR)
 *   ctx.wr       /api/world-rates      BIS policy rates, every central bank: banks{area}, iso{id: area}, summary
 *   ctx.cbx      /api/cb-expectations  .banks[ccy].m3|m6|m12.bp  what the short-rate futures price (the eight banks)
 *   ctx.cbBoard  /api/cb-board         statement tone per bank (js/terminal/cbBoardCore.js)
 *   ctx.gy       /api/global-yields    rows[{ccy, short, y2, y10, slope, gapToUs, ...}]
 *   ctx.me       /api/macro-engines-board  composite[ccy], cells[ccy][family]
 *   ctx.bc       /api/bank-credit      BIS borrowers
 *   ctx.fv       /api/fair-value       BIS real effective rates
 *   ctx.iso2n    { ISO-2: numeric id } for the BIS borrower list
 *   ctx.fvIso    { BIS area: [numeric ids] } for the fair-value layer
 *   ctx.h        { esc, spk, sgn, tile(bank), cell(ccy, family, cell), families }  the page's own renderers
 * A country with no data in a layer gets `null` (the page leaves it plain and the tip says "no feed"): never a zero.
 *
 * Evidence stamps follow the source boards': these are descriptions of where each country stands, not signals. The statement-tone
 * layer inherits the Central banks board's stamp (cb-tone-direction, NULL on 82 meetings); the priced-path layer is what futures price,
 * not a forecast; nothing here carries a direction claim. Colour rules: green/red only where a sign IS the direction of a measure
 * (macro composite, credit growth, fair value); gold = hawkish / tightening / higher; purple = dovish; blue = easing / lower.
 */

const fin = v => v != null && v !== '' && Number.isFinite(+v);
const clamp01 = v => Math.max(0, Math.min(1, v));
const a2 = v => (+v).toFixed(2);
const defEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sgnD = (x, d = 2) => (!fin(x) ? '–' : `${+x > 0 ? '+' : ''}${(+x).toFixed(d)}`);

/** Where a currency's card opens on the map: the bank's home country (numeric ids as in world-atlas). */
export const CCY_HOME = { USD: '840', EUR: '276', GBP: '826', JPY: '392', AUD: '036', NZD: '554', CAD: '124', CHF: '756' };
export const CCY_BANK = { USD: 'Fed', EUR: 'ECB', GBP: 'BoE', JPY: 'BoJ', AUD: 'RBA', NZD: 'RBNZ', CAD: 'BoC', CHF: 'SNB' };

export const GROUPS = [
  { id: 'desk', label: 'Desk' },
  { id: 'policy', label: 'Policy' },
  { id: 'markets', label: 'Markets' },
  { id: 'economy', label: 'Economy' },
  { id: 'credit', label: 'Credit & value' },
];

/**
 * The layers, in pill order. `attr` is the surface-registry attribute for the pill (js/terminal/tabRegistry.js, widget.ovl.*): written out
 * in full because the guard test finds a surface by that literal. `owner` layers are never drawn without the desk book (Desk bias).
 */
export const LAYERS = [
  { id: 'bias',   label: 'Desk bias',     group: 'desk',    owner: false, needsBook: true, attr: 'data-surface="widget.ovl.bias"' },
  { id: 'rates',  label: 'Rate cycle',    group: 'policy',  attr: 'data-surface="widget.ovl.rates"' },
  { id: 'level',  label: 'Policy rate',   group: 'policy',  attr: 'data-surface="widget.ovl.level"' },
  { id: 'priced', label: 'Priced path',   group: 'policy',  attr: 'data-surface="widget.ovl.priced"' },
  { id: 'tone',   label: 'Bank tone',     group: 'policy',  attr: 'data-surface="widget.ovl.tone"' },
  { id: 'y10',    label: '10Y yield',     group: 'markets', attr: 'data-surface="widget.ovl.y10"' },
  { id: 'gap',    label: '2Y gap to US',  group: 'markets', attr: 'data-surface="widget.ovl.gap"' },
  { id: 'macro',  label: 'Macro composite', group: 'economy', attr: 'data-surface="widget.ovl.macro"' },
  { id: 'credit', label: 'Bank credit',   group: 'credit',  attr: 'data-surface="widget.ovl.credit"' },
  { id: 'value',  label: 'Fair value',    group: 'credit',  attr: 'data-surface="widget.ovl.value"' },
];
export const LAYER_IDS = LAYERS.map(l => l.id);
/** The layers this module colours itself (the page keeps its own code for bias, rates, credit and value). */
export const OWN_LAYERS = ['level', 'priced', 'tone', 'y10', 'gap', 'macro'];
export const isOwn = id => OWN_LAYERS.includes(id);
export const surfaceOf = id => { const m = /data-surface="([^"]+)"/.exec(LAYERS.find(l => l.id === id)?.attr ?? ''); return m ? m[1] : null; };

/** The pill row, grouped: a small group label, then its pills. `owner` false drops the owner layers. */
export function pillsHtml(active, { owner = false } = {}) {
  return GROUPS.map(g => {
    const ls = LAYERS.filter(l => l.group === g.id && (owner || !l.needsBook));
    if (!ls.length) return '';
    return `<span class="lgrp"><span class="lgl">${g.label}</span>${ls.map(l => `<button aria-pressed="${active === l.id}" data-layer="${l.id}" ${l.attr}>${l.label}</button>`).join('')}</span>`;
  }).join('');
}

// ── who is who on the map ───────────────────────────────────────────────────────────────────────────────────────────────
/** The numeric ids of every country that carries a currency (the euro area spreads over its members). */
export const idsOfCcy = (zone, ccy) => Object.entries(zone ?? {}).filter(([, c]) => c === ccy).map(([id]) => id);
const bankOf = (id, ctx) => { const a = ctx.wr?.iso?.[id]; const b = a ? ctx.wr?.banks?.[a] : null; return b ? { ...b, area: a } : null; };
const gyRow = (ccy, ctx) => (ctx.gy?.rows ?? []).find(r => r.ccy === ccy) ?? null;
const cbBank = (ccy, ctx) => (ctx.cbBoard?.banks ?? []).find(b => b.ccy === ccy && !String(b.id ?? '').startsWith('beige')) ?? null;
const compositeOf = (ccy, ctx) => { const c = ctx.me?.composite?.[ccy]?.composite; return fin(c) ? +c : null; };
const pricedOf = (ccy, ctx) => { const h = ctx.cbx?.[ccy]?.m6; return h && fin(h.bp) ? +h.bp : null; };
const toneOf = (ccy, ctx) => { const b = cbBank(ccy, ctx); return b?.status === 'read' && fin(b.read?.score) ? +b.read.score : null; };

// ── colours ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const GOLD = '232,184,90', BLUE = '91,157,255', PUR = '139,124,246', UP = '47,211,154', DN = '255,93,120', FLAT = '138,147,184';
const rgba = (c, a) => `rgba(${c},${a2(a)})`;
/** One-sided ramp: 0 → faint, 1 → strong. */
const ramp = (c, t) => rgba(c, 0.16 + 0.66 * clamp01(t));

function maxOf(vals, floor) { const v = vals.filter(fin).map(x => +x); return Math.max(floor, ...v); }
const levelMax = ctx => { const r = Object.values(ctx.wr?.banks ?? {}).filter(b => !b.stale && fin(b.rate)).map(b => +b.rate).sort((a, b) => a - b); return r.length ? Math.max(3, r[Math.floor(r.length * 0.9)] ?? r.at(-1)) : 6; };

/** The fill for a country on one of this module's layers: `fill:...` or null (no data). */
export function layerStyle(layer, id, ctx) {
  const ccy = ctx.zone?.[id] ?? null;
  if (layer === 'level') { const b = bankOf(id, ctx); return b && !b.stale && fin(b.rate) ? `fill:${ramp(GOLD, +b.rate / levelMax(ctx))}` : null; }
  if (layer === 'priced') { const bp = ccy ? pricedOf(ccy, ctx) : null; if (bp == null) return null; const t = Math.abs(bp) / 50; return `fill:${Math.abs(bp) < 2 ? rgba(FLAT, 0.38) : ramp(bp > 0 ? GOLD : BLUE, t)}`; }
  if (layer === 'tone') { const s = ccy ? toneOf(ccy, ctx) : null; if (s == null) return null; return `fill:${Math.abs(s) < 0.05 ? rgba(FLAT, 0.38) : rgba(s > 0 ? GOLD : PUR, 0.3 + 0.55 * clamp01(Math.abs(s)))}`; }
  if (layer === 'y10') { const r = ccy ? gyRow(ccy, ctx) : null; if (!r || !fin(r.y10)) return null; const m = maxOf((ctx.gy?.rows ?? []).map(x => x.y10), 4); return `fill:${ramp(GOLD, +r.y10 / m)}`; }
  if (layer === 'gap') { const r = ccy ? gyRow(ccy, ctx) : null; if (!r || !fin(r.gapToUs)) return null; if (ccy === 'USD') return `fill:${rgba(FLAT, 0.38)}`; const m = maxOf((ctx.gy?.rows ?? []).map(x => fin(x.gapToUs) ? Math.abs(x.gapToUs) : null), 100); return `fill:${ramp(r.gapToUs >= 0 ? GOLD : BLUE, Math.abs(r.gapToUs) / m)}`; }
  if (layer === 'macro') { const c = ccy ? compositeOf(ccy, ctx) : null; if (c == null) return null; const m = maxOf(Object.keys(ctx.me?.composite ?? {}).map(k => { const v = compositeOf(k, ctx); return v == null ? null : Math.abs(v); }), 0.3); return `fill:${Math.abs(c) < 0.02 ? rgba(FLAT, 0.38) : ramp(c > 0 ? UP : DN, Math.abs(c) / m)}`; }
  return null;
}

const noFeed = (esc, nm, what) => `<b>${esc(nm)}</b><br><span class="muted">no feed: ${esc(what)}</span>`;
/** The hover tip for a country on one of this module's layers. */
export function layerTip(layer, id, nm, ctx) {
  const esc = ctx.h?.esc ?? defEsc, sg = ctx.h?.sgn ?? sgnD, ccy = ctx.zone?.[id] ?? null;
  if (layer === 'level') { const b = bankOf(id, ctx); return b ? `<b>${esc(nm)}</b><br>${esc(b.name)} policy rate <b>${b.rate}%</b> (${esc(b.asOf)})${b.stale ? '<br><span class="muted">stale</span>' : ''}<br><span class="muted">${esc(b.cycle)} · 12m ${sg(b.change12m)}pp</span>` : noFeed(esc, nm, 'no BIS policy rate'); }
  if (layer === 'priced') { const x = ccy ? ctx.cbx?.[ccy] : null; if (!x) return noFeed(esc, nm, ccy ? 'no futures pull for this bank' : 'only the eight desk banks have a futures-priced path'); const f = h => (h && fin(h.bp) ? `${sg(h.bp, 0)}bp` : '–'); return `<b>${esc(nm)} · ${ccy}</b><br>futures price <b>${f(x.m6)}</b> by ~6 months<br><span class="muted">~3m ${f(x.m3)} · ~12m ${f(x.m12)} · 25bp = one standard move</span>`; }
  if (layer === 'tone') { const b = ccy ? cbBank(ccy, ctx) : null; if (!ccy) return noFeed(esc, nm, 'statement tone is read for the eight desk banks only'); if (!b) return noFeed(esc, nm, 'no statement board'); if (b.status === 'read') return `<b>${esc(nm)} · ${esc(b.bank)}</b><br>tone <b>${sg(b.read.score)}</b> ${esc(String(b.read.regime ?? '').toLowerCase())}<br><span class="muted">${esc(b.read.date ?? '')}${b.change ? ` · ${sg(b.change.delta)} vs the meeting before` : ''}</span>`; return `<b>${esc(nm)} · ${esc(b.bank)}</b><br><span class="muted">${b.status === 'headline_only' ? esc(b.decision?.title ?? 'headline only') + ': statement blocked, no tone score' : 'no read for the latest meeting'}</span>`; }
  if (layer === 'y10') { const r = ccy ? gyRow(ccy, ctx) : null; return r && fin(r.y10) ? `<b>${esc(nm)}</b><br>10-year yield <b>${(+r.y10).toFixed(2)}%</b>${fin(r.y2) ? ` · 2-year ${(+r.y2).toFixed(2)}%${r.note ? '*' : ''}` : ''}<br><span class="muted">${fin(r.chg10y20d) ? `20d ${sg(r.chg10y20d, 0)}bp` : ''}${r.note ? ` · ${esc(r.note)}` : ''}</span>` : noFeed(esc, nm, 'the terminal tracks government yields for the eight desk currencies and a few more'); }
  if (layer === 'gap') { const r = ccy ? gyRow(ccy, ctx) : null; return r && fin(r.gapToUs) ? `<b>${esc(nm)}</b><br>2-year gap to the US <b>${sg(r.gapToUs, 0)}bp</b>${fin(r.gapChg20d) ? `<br><span class="muted">20d ${sg(r.gapChg20d, 0)}bp</span>` : ''}` : noFeed(esc, nm, 'no 2-year gap series'); }
  if (layer === 'macro') { const c = ccy ? compositeOf(ccy, ctx) : null; if (!ccy) return noFeed(esc, nm, 'the macro engines cover the eight desk currencies'); const cv = ctx.me?.composite?.[ccy]; return c == null ? noFeed(esc, nm, 'no composite') : `<b>${esc(nm)} · ${ccy}</b><br>macro composite <b>${sg(c)}</b><br><span class="muted">${cv?.factorsScored != null ? `${cv.factorsScored} of ${cv.factorsTotal} factors scored · ` : ''}latest releases against their own history</span>`; }
  return null;
}

// ── legends and the source-and-age chip ───────────────────────────────────────────────────────────────────────────────────
const sw = (c, a, t) => `<span><i style="background:${rgba(c, a)}"></i>${t}</span>`;
/** Legend of one of this module's layers: swatches with units. */
export function legendHtml(layer) {
  if (layer === 'level') return `${sw(GOLD, 0.25, 'lower policy rate')}${sw(GOLD, 0.8, 'higher (scaled to the 90th-percentile bank)')}<span>every BIS central bank, per cent</span>`;
  if (layer === 'priced') return `${sw(GOLD, 0.8, 'hikes priced by ~6 months')}${sw(BLUE, 0.8, 'cuts priced')}${sw(FLAT, 0.38, 'flat')}<span>25bp = one standard move · the eight desk banks · futures price, not a forecast</span>`;
  if (layer === 'tone') return `${sw(GOLD, 0.8, 'hawkish statement')}${sw(PUR, 0.8, 'dovish')}<span>latest statement tone, -1 to +1 · banks with a current read only · description, not a signal</span>`;
  if (layer === 'y10') return `${sw(GOLD, 0.25, 'lower')}${sw(GOLD, 0.8, 'higher 10-year yield')}<span>%, daily from each issuer · the desk currencies</span>`;
  if (layer === 'gap') return `${sw(GOLD, 0.8, 'pays more than the US at 2 years')}${sw(BLUE, 0.8, 'pays less')}<span>bp · the UK row uses the 5-year</span>`;
  if (layer === 'macro') return `${sw(UP, 0.7, 'stronger than expected')}${sw(DN, 0.7, 'weaker')}<span>composite of the macro engines, the eight desk currencies · describes the economy, not the currency's direction</span>`;
  return '';
}

const ageH = iso => { const t = Date.parse(iso ?? ''); return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 3600e3)) : null; };
/** The date/age chip for any layer, and an evidence stamp where the source board carries one. */
export function metaHtml(layer, ctx) {
  const esc = ctx.h?.esc ?? defEsc;
  const chip = (t, cls = '') => `<span class="chip${cls ? ' ' + cls : ''}">${esc(t)}</span>`;
  const ctxChip = `<span class="chip gold" title="a description of where each country stands, not a forecast and not a signal">context, not a signal</span>`;
  if (layer === 'rates' || layer === 'level') return ctx.wr?.ok ? `${chip(`BIS, monthly, to ${ctx.wr.asOf}`)}${ctxChip}` : chip('no BIS rates feed', 'dn');
  if (layer === 'priced') { const a = ctx.cbxMeta?.ageH; return ctx.cbx ? `${chip(a != null ? `futures pulled ${a}h ago` : 'futures pull')}${a != null && a > 36 ? chip('old pull', 'dn') : ''}${ctxChip}` : chip('no futures pull yet', 'dn'); }
  if (layer === 'tone') { const c = ctx.cbBoard?.counts; return ctx.cbBoard?.ok ? `${chip(c ? `${c.read} of ${c.total} banks have a current read` : 'statement board')}<span class="chip gold" title="Evidence Book cb-tone-direction: the statement's tone is priced within 30 minutes and does not predict the next-day dollar (NULL, 82 FOMC meetings)">description only</span>` : chip('no statement board', 'dn'); }
  if (layer === 'y10' || layer === 'gap') { const a = ageH(ctx.gy?.fetchedAt); return ctx.gy?.ok ? `${chip(a != null ? `yields checked ${a}h ago` : 'daily yields')}${ctxChip}` : chip('no yields feed', 'dn'); }
  if (layer === 'macro') return ctx.me?.ok ? `${chip(`${ctx.me.scoredReleases ?? 0} scored releases`)}<span class="chip pur" title="the Macro engines board's stamp: surprise size, not direction">size, not direction</span>` : chip('no macro board', 'dn');
  if (layer === 'credit') return ctx.bc?.ok ? chip(`BIS, to ${ctx.bc.latest}`) : chip('no bank-credit feed', 'dn');
  if (layer === 'value') return ctx.fv?.ok ? `${chip(`BIS, to ${ctx.fv.asOf}`)}<span class="chip" title="a slow anchor, not timing">a slow anchor</span>` : chip('no fair-value feed', 'dn');
  return '';
}

// ── the ranking under the map ─────────────────────────────────────────────────────────────────────────────────────────────
const byAbs = (a, b) => Math.abs(b) - Math.abs(a);
const areaIds = (area, ctx) => Object.entries(ctx.wr?.iso ?? {}).filter(([, a]) => a === area).map(([id]) => id);
const home = (ccy, ctx) => idsOfCcy(ctx.zone, ccy).includes(CCY_HOME[ccy]) ? CCY_HOME[ccy] : (idsOfCcy(ctx.zone, ccy)[0] ?? CCY_HOME[ccy]);

/**
 * What to list under the map for a layer: { title, sub, rows:[{id, name, note, value, spark?, cls?}], foot }.
 * `id` is the country the row opens (the page calls openCountry(id)). Empty rows => the page shows nothing.
 */
export function layerRanking(layer, ctx) {
  const sg = ctx.h?.sgn ?? sgnD, rows = [];
  if (layer === 'rates' || layer === 'level') {
    const banks = Object.entries(ctx.wr?.banks ?? {}).filter(([, b]) => !b.stale && fin(b.rate)).map(([area, b]) => ({ area, ...b }));
    const sm = ctx.wr?.summary;
    const names = l => (l ?? []).map(a => ctx.wr?.banks?.[a]?.name).filter(Boolean).join(', ') || 'none';
    if (layer === 'rates') {
      for (const b of banks.filter(x => fin(x.change12m)).sort((a, b) => byAbs(a.change12m, b.change12m)).slice(0, 10)) rows.push({ id: areaIds(b.area, ctx)[0] ?? null, name: `${b.name}`, sub: b.ccy, value: `${b.rate}%`, note: `${sg(b.change12m)}pp · ${b.cycle}`, spark: b.spark, cls: b.change12m > 0 ? 'gold' : '' });
      return { title: 'Biggest moves over 12 months', sub: sm ? `${banks.length} central banks · ${sm.hiking} hiking, ${sm.cutting} cutting, ${sm.onHold} on hold` : '', rows, foot: sm ? `Hiking now: ${names(sm.hikers)}. Cutting now: ${names(sm.cutters)}. Hiking or cutting = a move of 0.2pp or more in the last 3 months. The desk's eight banks use their own daily series elsewhere on this page; this is the wider cycle.` : '' };
    }
    banks.sort((a, b) => b.rate - a.rate);
    for (const b of banks.slice(0, 8)) rows.push({ id: areaIds(b.area, ctx)[0] ?? null, name: b.name, sub: b.ccy, value: `${b.rate}%`, note: b.cycle, spark: b.spark });
    return { title: 'Highest policy rates', sub: `${banks.length} central banks`, rows, foot: banks.length ? `Lowest: ${banks.slice(-3).reverse().map(b => `${b.name} ${b.rate}%`).join(', ')}.` : '' };
  }
  if (layer === 'priced') {
    const r = Object.entries(ctx.cbx ?? {}).map(([c, x]) => ({ c, m6: x?.m6?.bp, m3: x?.m3?.bp, m12: x?.m12?.bp })).filter(x => fin(x.m6)).sort((a, b) => b.m6 - a.m6);
    for (const x of r) rows.push({ id: home(x.c, ctx), name: CCY_BANK[x.c] ?? x.c, sub: x.c, value: `${sg(x.m6, 0)}bp`, note: `~3m ${sg(x.m3, 0)} · ~12m ${sg(x.m12, 0)}`, cls: x.m6 > 0 ? 'gold' : x.m6 < 0 ? 'blue' : '' });
    return { title: 'What the futures price by ~6 months', sub: 'change against today\'s policy rate, the eight desk banks', rows, foot: 'Hikes priced (gold) and cuts priced (blue); 25bp is one standard move. What the market expects, not what the bank will do.' };
  }
  if (layer === 'tone') {
    for (const x of ctx.cbBoard?.ranking ?? []) rows.push({ id: home(x.ccy, ctx), name: x.bank, sub: x.ccy, value: sg(x.score), note: `${String(x.regime ?? '').toLowerCase()}${fin(x.delta) ? ` · ${sg(x.delta)} vs last` : ''}`, cls: /HAWK/i.test(x.regime ?? '') ? 'gold' : /DOV/i.test(x.regime ?? '') ? 'pur' : '' });
    const miss = (ctx.cbBoard?.banks ?? []).filter(b => b.status !== 'read' && !String(b.id ?? '').startsWith('beige')).map(b => b.bank);
    return { title: 'Hawkish to dovish', sub: 'banks with a read for their latest meeting', rows, foot: `${miss.length ? `No current read: ${miss.join(', ')}. ` : ''}Tone of the last statement, -1 dovish to +1 hawkish. It is priced within 30 minutes and does not predict the next-day dollar (Evidence Book cb-tone-direction, NULL).` };
  }
  if (layer === 'y10') {
    for (const r of [...(ctx.gy?.rows ?? [])].filter(x => fin(x.y10)).sort((a, b) => b.y10 - a.y10)) rows.push({ id: home(r.ccy, ctx), name: r.short ?? r.ccy, sub: r.ccy, value: `${(+r.y10).toFixed(2)}%`, note: fin(r.chg10y20d) ? `20d ${sg(r.chg10y20d, 0)}bp` : '', spark: r.sparkGap });
    return { title: '10-year yields', sub: 'highest first', rows, foot: 'Daily from each issuer. Sparkline = the gap to the US over 60 days.' };
  }
  if (layer === 'gap') {
    for (const r of [...(ctx.gy?.rows ?? [])].filter(x => fin(x.gapToUs) && x.ccy !== 'USD').sort((a, b) => b.gapToUs - a.gapToUs)) rows.push({ id: home(r.ccy, ctx), name: r.short ?? r.ccy, sub: r.ccy, value: `${sg(r.gapToUs, 0)}bp`, note: fin(r.gapChg20d) ? `20d ${sg(r.gapChg20d, 0)}bp` : '', spark: r.sparkGap, cls: r.gapToUs > 0 ? 'gold' : 'blue' });
    return { title: '2-year gap to the US', sub: 'pays more than the US first', rows, foot: 'The 2-year gap is a core FX driver, but nothing here tests it as a daily signal: a widening gap in a currency\'s favour has tended to lift it, loosely.' };
  }
  if (layer === 'macro') {
    const r = Object.keys(ctx.me?.composite ?? {}).map(c => ({ c, v: compositeOf(c, ctx), cv: ctx.me.composite[c] })).filter(x => x.v != null).sort((a, b) => b.v - a.v);
    for (const x of r) rows.push({ id: home(x.c, ctx), name: x.c, sub: CCY_BANK[x.c] ?? '', value: sg(x.v), note: x.cv.factorsTotal ? `${x.cv.factorsScored} of ${x.cv.factorsTotal} factors` : '', cls: x.v > 0 ? 'up' : x.v < 0 ? 'dn' : '' });
    return { title: 'Macro composite', sub: 'strongest economy first', rows, foot: 'Latest releases against their own history. Green is a stronger economy than usual, not a stronger currency. The country card has the full currency-by-indicator row.' };
  }
  if (layer === 'credit') {
    const list = (ctx.bc?.usdBorrowers ?? ctx.bc?.borrowers ?? []).filter(b => fin(b.g));
    for (const b of [...list].sort((a, b) => b.g - a.g).slice(0, 10)) rows.push({ id: ctx.iso2n?.[b.code] ?? null, name: b.name ?? b.code, sub: '', value: `${sg(b.g, 1)}%`, note: `$${Math.round(b.stockBn ?? 0).toLocaleString('en-GB')}bn`, cls: b.g > 0 ? 'up' : 'dn' });
    const h = ctx.bc?.headline;
    return { title: 'Cross-border bank credit', sub: '4-quarter growth, dollar borrowers, fastest first', rows, foot: h ? `All cross-border ${sg(h.totalG, 1)}% · in dollars ${sg(h.usdG, 1)}% · to non-banks ${sg(h.nbfiG, 1)}% · offshore yen ${sg(h.yenOffshoreG, 1)}%. The regime reads ${h.regime ?? '–'}.` : '' };
  }
  if (layer === 'value') {
    const list = (ctx.fv?.rows ?? []).filter(r => fin(r.devPct)).sort((a, b) => b.devPct - a.devPct);
    const pick = [...list.slice(0, 5), ...list.slice(-5).filter(x => !list.slice(0, 5).includes(x))];
    for (const r of pick) rows.push({ id: (ctx.fvIso?.[r.area] ?? [])[0] ?? null, name: r.name ?? r.area, sub: r.ccy, value: `${sg(r.devPct, 1)}%`, note: r.label, spark: r.spark, cls: r.devPct > 0 ? 'dn' : 'up' });
    return { title: 'Dearest and cheapest', sub: 'real effective rate against its 20-year average', rows, foot: 'Red = dearer than usual, green = cheaper. Fair value pulls slowly over months and years; it says where a move has room, not when.' };
  }
  return { title: '', sub: '', rows: [], foot: '' };
}

/** The ranking as HTML (a compact table under the map; each row opens that country's card). */
export function rankingHtml(layer, ctx) {
  const esc = ctx.h?.esc ?? defEsc, spk = ctx.h?.spk;
  const r = layerRanking(layer, ctx);
  if (!r.rows.length) return '';
  const body = r.rows.map(x => `<tr${x.id ? ` class="click" tabindex="0" data-ctry="${esc(x.id)}"` : ''}><td><b>${esc(x.name)}</b>${x.sub ? ` <span class="muted">${esc(x.sub)}</span>` : ''}</td><td>${spk && x.spark ? spk(x.spark, 90, 22, x.cls === 'gold' ? '#e8b85a' : x.cls === 'blue' ? '#5b9dff' : x.cls === 'dn' ? '#ff5d78' : x.cls === 'up' ? '#2fd39a' : x.cls === 'pur' ? '#b4a9ff' : 'var(--gold)') : ''}</td><td class="n mono ${esc(x.cls ?? '')}">${esc(x.value)}</td><td class="muted">${esc(x.note ?? '')}</td></tr>`).join('');
  return `<div class="ch" style="margin-bottom:4px"><span class="lbl">${esc(r.title)}</span><span class="r muted">${esc(r.sub)}</span></div><div class="scroll"><table><tbody>${body}</tbody></table></div>${r.foot ? `<p class="muted" style="font-size:12px;margin:6px 0 0">${esc(r.foot)}</p>` : ''}`;
}

// ── the country card ──────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * The card a click opens, built from every layer's data for that country. Sections only for what exists; what has no feed is named
 * in one muted line (never a zero). Reuses the Central banks tile and the Macro engines cells through ctx.h so nothing is drawn twice.
 */
export function countryCardHtml(id, name, ctx, { deskButton = false } = {}) {
  const esc = ctx.h?.esc ?? defEsc, sg = ctx.h?.sgn ?? sgnD, spk = ctx.h?.spk;
  const ccy = ctx.zone?.[id] ?? null, b = bankOf(id, ctx), missing = [];
  const kv = (k, v, cls = '') => `<tr><td class="muted">${esc(k)}</td><td class="n mono ${cls}">${v}</td></tr>`;
  const out = [];
  if (b) out.push(`<div><span class="lbl">Policy rate · BIS</span><table><tbody>${kv(`${b.name}`, `<b>${b.rate}%</b> <span class="muted">${esc(b.asOf)}</span>`)}${kv('Cycle', esc(b.cycle), /hik/.test(b.cycle) ? 'gold' : /cut/.test(b.cycle) ? 'blue' : '')}${kv('3 / 12 months', `${sg(b.change3m)} / ${sg(b.change12m)}pp`)}</tbody></table>${spk && b.spark ? spk(b.spark, 200, 28, 'var(--gold)') : ''}${b.stale ? '<p class="muted" style="font-size:12px;margin:2px 0 0">stale print</p>' : ''}</div>`);
  else missing.push('BIS policy rate');
  if (ccy) {
    const x = ctx.cbx?.[ccy];
    if (x) { const f = h => (h && fin(h.bp) ? `${sg(h.bp, 0)}bp` : '–'); out.push(`<div><span class="lbl">Futures price</span><table><tbody>${kv('~3 months', f(x.m3))}${kv('~6 months', f(x.m6), pricedOf(ccy, ctx) > 0 ? 'gold' : pricedOf(ccy, ctx) < 0 ? 'blue' : '')}${kv('~12 months', f(x.m12))}</tbody></table></div>`); } else missing.push('futures-priced path');
    const r = gyRow(ccy, ctx);
    if (r && (fin(r.y10) || fin(r.y2))) out.push(`<div><span class="lbl">Yields</span><table><tbody>${fin(r.y2) ? kv(r.note ? '2-year (5-year for the UK)' : '2-year', `${(+r.y2).toFixed(2)}%`) : ''}${fin(r.y10) ? kv('10-year', `${(+r.y10).toFixed(2)}%`) : ''}${fin(r.slope) ? kv('10y minus 2y', `${sg(r.slope, 0)}bp`) : ''}${fin(r.gapToUs) && ccy !== 'USD' ? kv('2-year gap to the US', `${sg(r.gapToUs, 0)}bp`, r.gapToUs > 0 ? 'gold' : 'blue') : ''}</tbody></table>${spk && r.sparkGap ? spk(r.sparkGap, 200, 28) : ''}</div>`); else missing.push('government yields');
  } else missing.push('futures-priced path, statement tone, macro engines and yields (the eight desk currencies only)');
  const bank = ccy ? cbBank(ccy, ctx) : null;
  const tileHtml = bank && ctx.h?.tile ? ctx.h.tile(bank) : '';
  const credit = (ctx.bc?.usdBorrowers ?? ctx.bc?.borrowers ?? []).find(r => ctx.iso2n?.[r.code] === id);
  if (credit) out.push(`<div><span class="lbl">Cross-border bank credit · BIS</span><table><tbody>${kv('Stock', `$${Math.round(credit.stockBn ?? 0).toLocaleString('en-GB')}bn`)}${kv('4-quarter growth', `${sg(credit.g, 1)}%`, credit.g > 0 ? 'up' : 'dn')}</tbody></table></div>`); else missing.push('BIS bank credit');
  const area = Object.keys(ctx.fvIso ?? {}).find(a => ctx.fvIso[a].includes(String(id).padStart(3, '0')));
  const fvr = area ? (ctx.fv?.rows ?? []).find(r => r.area === area) : null;
  if (fvr) out.push(`<div><span class="lbl">Fair value · BIS</span><table><tbody>${kv('Real effective rate', `${sg(fvr.devPct, 1)}% vs its 20-year average`, fvr.devPct > 0 ? 'dn' : 'up')}${kv('Reading', esc(fvr.label))}${kv('12 months', `${sg(fvr.chg12m, 1)}%`)}</tbody></table></div>`); else missing.push('BIS fair value');
  const fams = ctx.h?.families ?? [];
  const macro = ccy && ctx.me?.cells?.[ccy] && ctx.h?.cell ? `<div style="grid-column:1/-1"><span class="lbl">Macro engines · latest headline releases</span><div class="scroll"><table class="metab"><thead><tr>${fams.map(f => `<th>${esc(f.label)}</th>`).join('')}<th class="n">Composite</th></tr></thead><tbody><tr>${fams.map(f => ctx.h.cell(ccy, f, ctx.me.cells[ccy][f.key])).join('')}<td class="n mono ${compositeOf(ccy, ctx) > 0 ? 'up' : compositeOf(ccy, ctx) < 0 ? 'dn' : ''}">${compositeOf(ccy, ctx) == null ? '–' : sg(compositeOf(ccy, ctx))}</td></tr></tbody></table></div></div>` : '';
  return `<div class="card" id="herocardbox" style="margin:10px 0 0;background:var(--bg2)"><div class="ch"><h3>${esc(name)}${ccy ? ` <span class="muted">${esc(ccy)} · ${esc(CCY_BANK[ccy] ?? '')}</span>` : ''}</h3><span class="r">${deskButton && ccy ? `<button class="btn" data-deskcard="${esc(ccy)}">Desk card</button> ` : ''}<button class="btn" data-herocard-close="1" aria-label="close the country card">close ✕</button></span></div>
<div class="grid g2">${out.join('')}${macro}</div>${tileHtml ? `<div style="margin-top:8px">${tileHtml}</div>` : ''}${missing.length ? `<p class="muted" style="font-size:12px;margin:8px 0 0">No feed here: ${missing.map(esc).join('; ')}.</p>` : ''}</div>`;
}
