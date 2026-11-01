/**
 * The direction evidence for each market, laid next to the market's own base rate.
 *
 * Source: /api/global-read (js/globalReadCore.js). Its direction arm combines only inputs that have a tested track record; an input with no
 * measured edge carries weight 0 and is read, not used. This module does not re-score anything. It reports three things per market:
 *   - how many tested inputs are live (nLive) and the P(up) they give,
 *   - the base rate: how often that market rose over one day, 2006 to 2026-08-21 (analysis/output/direction-bar, frozen B0),
 *   - the inputs that were read but carry no weight, grouped by why (never tested, tested null).
 * When no tested input is live the line says so in those words. The story arm (nominal weights, unvalidated) is deliberately not used.
 *
 * Pure. Tested in js/directionRead.test.mjs.
 */

/** Share of one-day closes that were up, per market: B0 of analysis/output/direction-bar/ledger_baselines.json (version b0b2-frozen-20260821). */
export const BASE_1D = { NQ: 0.554, SPX500: 0.55, GOLD: 0.531, EURUSD: 0.502, GBPUSD: 0.499, USDJPY: 0.514 };
/** The smallest one-day shift in the up-chance that 20 years of one market can show at 80% power (direction-bar tables.md): 0.13 sigma, about 6 points. */
export const SMALLEST_SHIFT_PP = 6;

const LABEL = { NQ: 'Nasdaq', SPX500: 'S&P 500', US2000: 'Russell 2000', GOLD: 'Gold', EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY', AUDUSD: 'AUD/USD', USDCAD: 'USD/CAD', USDCHF: 'USD/CHF', NZDUSD: 'NZD/USD' };
const num = v => (Number.isFinite(v) ? v : null);
const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;

/** { rows, zero } from the Global Read payload, or null when it did not load. Row order follows the payload's `ranked` list, then the rest. */
export function directionReads(gr) {
  if (!gr?.cards) return null;
  const order = [...(gr.ranked ?? []).map(r => r.sym), ...Object.keys(gr.cards)].filter((s, i, a) => a.indexOf(s) === i && gr.cards[s]);
  const zeroBy = new Map();
  const rows = order.map(sym => {
    const c = gr.cards[sym], d = c.direction ?? {}, r = c.range ?? {};
    const live = Number.isFinite(d.nLive) ? d.nLive : 0, pUp = num(d.pUp);
    for (const x of d.shown ?? []) {
      if (num(x.e) !== null && x.e > 0) continue;
      const tier = x.tier === 'null' ? 'null' : 'untested';
      if (!zeroBy.has(tier)) zeroBy.set(tier, new Set());
      zeroBy.get(tier).add(x.label);
    }
    const weighted = (d.shown ?? []).filter(x => num(x.e) !== null && x.e > 0).map(x => ({ label: x.label, tier: x.tier, e: x.e, s: x.s }));
    return {
      sym, label: LABEL[sym] ?? sym, base: BASE_1D[sym] ?? null, live, pUp: live > 0 ? pUp : null, weighted,
      range: num(r.hlP50) !== null ? { p50: r.hlP50, p75: num(r.hlP75), pBeyond: num(r.pAbove75) } : null,
    };
  });
  const zero = { untested: [...(zeroBy.get('untested') ?? [])], null: [...(zeroBy.get('null') ?? [])] };
  return { rows, zero, live: rows.filter(r => r.live > 0).length };
}

/** The short cell for a market's direction evidence: the words, and the base rate beside it when one is measured. */
export function directionCell(row) {
  const base = row.base !== null ? ` <small>base ${pct(row.base)}</small>` : ' <small>no base rate</small>';
  if (!row.live || row.pUp === null) return `none${base}`;
  return `${pct(row.pUp)} up${base}`;
}

/** The plain footnote under the table: what the cell means, the detectability limit, and which inputs were read but carry no weight. */
export function directionNote(reads) {
  if (!reads) return '';
  const list = a => (a.length < 2 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
  const parts = [];
  if (reads.zero.untested.length) parts.push(`${list(reads.zero.untested)} (never tested)`);
  if (reads.zero.null.length) parts.push(`${list(reads.zero.null)} (tested, no edge)`);
  const live = reads.live ? `${reads.live} of ${reads.rows.length} markets have a tested input live; the rest show no directional evidence beyond the baseline.` : 'No market has a tested direction input live: there is no directional evidence beyond the baseline.';
  return `${live} Base is the share of days the market closed up, 2006 to August 2026; a one-day shift under about ${SMALLEST_SHIFT_PP} points cannot be told from chance in that history.${parts.length ? ` Read but given no weight: ${list(parts)}.` : ''}`;
}

/** Range columns for a market: the typical day and the mark that 1 day in 4 goes past, in percent of price, with a flag when today is set up wider than usual. */
export function rangeCell(row) {
  const r = row?.range;
  if (!r) return '';
  const wide = r.pBeyond !== null && r.pBeyond >= 0.32 ? 'wider' : r.pBeyond !== null && r.pBeyond <= 0.18 ? 'narrower' : '';
  return `${r.p50.toFixed(2)}%${r.p75 !== null ? ` · ${r.p75.toFixed(2)}%` : ''}${wide ? ` <small>${wide}</small>` : ''}`;
}
