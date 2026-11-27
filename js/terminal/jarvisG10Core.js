// js/terminal/jarvisG10Core.js: the pure half of Helix's G10 RATES + FUNDING view (jarvisViewG10.js). Formats /api/g10-rates and /api/funding-board (built by js/helixData.js) into
// table cells and plain-words lines. DESCRIPTION ONLY: the 2y gap to the US is context (nonus-yield-gap-label), never a direction call (nonus-yield-gap-direction: null); funding readings
// are not stress signals (funding-stress: null). No word here says long, short, buy, sell, or what happens next.
const fin = v => typeof v === 'number' && Number.isFinite(v);
export const pct = (v, d = 2) => (fin(v) ? `${v.toFixed(d)}%` : '—');
export const bp = (v, d = 0) => (fin(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}bp` : '—');
export const zTxt = z => (fin(z) ? `${z > 0 ? '+' : z < 0 ? '−' : ''}${Math.abs(z).toFixed(1)}σ` : '—');
/** ▲ / ▼ / • for a change, so the direction never rides on colour alone. */
export const arrow = v => (fin(v) ? (v > 0 ? '▲' : v < 0 ? '▼' : '•') : ' ');
export const money = v => (fin(v) ? (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(2)}tn` : `$${v.toFixed(0)}bn`) : '—');

/** The rates table: one row per currency, the US first. */
export function g10Rows(board) {
  const rows = Array.isArray(board?.rows) ? board.rows : [];
  return rows.map(r => ({
    ccy: r.ccy, missing: !!r.missing, note: r.note ?? null,
    short: r.short ? `${r.short.tenor} ${pct(r.short.value)}` : '—', long: r.long ? `${r.long.tenor} ${pct(r.long.value)}` : '—',
    gap: r.gapShort ? bp(r.gapShort.bp) : r.ccy === 'USD' ? 'base' : '—', gapVs: r.gapShort?.vs ?? null,
    gapChg: r.gapShort ? bp(r.gapShort.chg20bp) : '', gapZ: r.gapShort?.z20 ?? null, gapArrow: arrow(r.gapShort?.chg20bp),
    longGap: r.gapLong ? bp(r.gapLong.bp) : '', stale: !!(r.short?.stale || r.long?.stale), date: r.short?.date ?? r.long?.date ?? null,
  }));
}
/** The funding lines: label, value, a short context cell. */
export function fundingRows(fb) {
  return (Array.isArray(fb?.items) ? fb.items : []).map(x => ({
    id: x.id, label: x.label, stale: !!x.stale, date: x.date ?? null,
    value: x.unit === 'bp' ? bp(x.value, 1) : x.unit === '$bn' ? money(x.value) : fin(x.value) ? String(x.value) : '—',
    ctx: x.unit === 'bp' ? (fin(x.pct250) ? `percentile ${x.pct250} of 250 sessions` : '') : fin(x.chg) ? `${arrow(x.chg)} ${money(Math.abs(x.chg))} over ${x.chgOver}` : '',
  }));
}
export function auctionRows(fb) {
  return (Array.isArray(fb?.auctions) ? fb.auctions : []).map(a => (a.ok
    ? { tenor: a.tenor, date: a.date, line: `${a.tenor} ${a.date}: high ${pct(a.highYield, 3)}, bid-to-cover ${fin(a.bidToCover) ? a.bidToCover.toFixed(2) : '—'} (percentile ${fin(a.btcPct) ? a.btcPct : "—"} of the last ${a.vsN}), high − median ${bp(a.highVsMedianBp, 1)}${a.reopening ? ' · reopening' : ''}` }
    : { tenor: a.tenor, date: null, line: `${a.tenor}: ${a.why ?? 'no auction stored yet'}` }));
}
/** One paragraph for the panel (and any narration that wants it): the widest 2y gaps and the biggest 20-session gap change by z, plus the funding calendar. Description only. */
export function g10Brief(board, fb) {
  const parts = [];
  const g = (board?.rows ?? []).filter(r => r.gapShort && fin(r.gapShort.bp));
  if (g.length) {
    const big = g.filter(r => fin(r.gapShort.z20)).sort((a, b) => Math.abs(b.gapShort.z20) - Math.abs(a.gapShort.z20))[0];
    const wide = [...g].sort((a, b) => Math.abs(b.gapShort.bp) - Math.abs(a.gapShort.bp))[0];
    parts.push(`The ${wide.ccy} short end sits furthest from the US, ${Math.abs(wide.gapShort.bp).toFixed(0)}bp ${wide.gapShort.bp < 0 ? 'below' : 'above'} it (${wide.gapShort.vs}).`);
    if (big && Math.abs(big.gapShort.z20) >= 1.5) parts.push(`The biggest 20-session change in a gap is ${big.ccy}: ${bp(big.gapShort.chg20bp)}, ${zTxt(big.gapShort.z20)} against its own past year of 20-session changes.`);
    else parts.push('No 2y gap has moved unusually over the last 20 sessions.');
    parts.push('That is context for the day it moves on, not a read on the next session.');
  }
  const p99 = (fb?.items ?? []).find(x => x.id === 'sofr_p99_iorb');
  if (p99 && fin(p99.value)) parts.push(`SOFR's 99th percentile is ${bp(p99.value, 1)} against interest on reserves.`);
  if (fb?.calendar?.text) parts.push(fb.calendar.text);
  return parts.join(' ');
}
