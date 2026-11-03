/**
 * Per-currency exposure cap on the Head of Desk's book: plain arithmetic after the model, no model call.
 *
 * WHY. The first full run (2026-11-03) rated 32 of 41 instruments short and the risk desk said so itself: "one trade
 * wearing twenty tickers". The risk voices can say it; nothing enforced it. This adds up what the book is really
 * betting on, currency by currency, and when one currency's net exposure passes the cap it scales down the cards
 * building it, in proportion, and records every cut on the card.
 *
 * HOW A CARD COUNTS. Signed size = direction x weight x size: LONG +1, STRONG_LONG +1.5, SHORT -1, STRONG_SHORT
 * -1.5, FLAT / REVIEW 0; size defaults to 1. An FX pair puts +signed on its base and -signed on its quote (long
 * EURUSD = long EUR, short USD). A USD-priced commodity or crypto puts -signed on USD (long gold = short USD).
 * Equity indices carry equity risk, not a currency position, so they are not counted here.
 *
 * The cap is in "normal-size units" (one LONG at size 1 = 1 unit). Default 4: four full-size bets on one currency.
 *
 * Pure. Tested in js/deskExposure.test.mjs.
 */
import { DESK_CCYS, groupOf, instrumentLegs } from './deskPack.js';

const DIR = { STRONG_LONG: 1.5, LONG: 1, FLAT: 0, SHORT: -1, STRONG_SHORT: -1.5, REVIEW: 0 };

/** The currency legs a card puts exposure on, each with its sign (+1 = long that currency when the card is long). */
export function exposureLegs(name) {
  const g = groupOf(name);
  if (g === 'fx_majors' || g === 'fx_crosses') { const [b, q] = instrumentLegs(name); return [[b, 1], [q, -1]]; }
  if (g === 'metals' || g === 'energy' || g === 'ags' || g === 'crypto') return [['USD', -1]];
  return [];   // indices: equity risk, not a currency position
}

const signedSize = c => (DIR[c?.rating] ?? 0) * (Number.isFinite(c?.size) ? c.size : 1);

/** Net exposure per currency, and which cards build it. */
export function netExposure(cards) {
  const net = Object.fromEntries(DESK_CCYS.map(c => [c, 0]));
  const by = Object.fromEntries(DESK_CCYS.map(c => [c, []]));
  for (const [name, card] of Object.entries(cards)) {
    const s = signedSize(card);
    if (!s) continue;
    for (const [ccy, sign] of exposureLegs(name)) { net[ccy] += s * sign; by[ccy].push({ name, contrib: s * sign }); }
  }
  for (const c of DESK_CCYS) net[c] = Math.round(net[c] * 100) / 100;
  return { net, by };
}

/**
 * Apply the cap. Returns { cards, report }: new cards (sizes cut where needed, `sizeBeforeCap` and `cappedBy` set)
 * and a report of the exposure before and after. Repeats a few times, because cutting a cross to fix one currency
 * also changes its other leg.
 */
export function capExposure(cards, { cap = 4 } = {}) {
  const out = Object.fromEntries(Object.entries(cards).map(([k, c]) => [k, { ...c }]));
  const before = netExposure(out).net;
  const cuts = [];
  for (let pass = 0; pass < 4; pass++) {
    const { net, by } = netExposure(out);
    const worst = DESK_CCYS.filter(c => Math.abs(net[c]) > cap + 1e-9).sort((a, b) => Math.abs(net[b]) - Math.abs(net[a]))[0];
    if (!worst) break;
    const sameSide = by[worst].filter(x => Math.sign(x.contrib) === Math.sign(net[worst]));
    const gross = sameSide.reduce((a, x) => a + Math.abs(x.contrib), 0);
    const excess = Math.abs(net[worst]) - cap;
    const factor = Math.max(0, 1 - excess / gross);   // shrink the same-side cards just enough to land on the cap
    for (const { name } of sameSide) {
      const c = out[name];
      const was = Number.isFinite(c.size) ? c.size : 1;
      if (c.sizeBeforeCap == null) c.sizeBeforeCap = was;
      c.size = Math.round(was * factor * 100) / 100;
      c.cappedBy = [...new Set([...(c.cappedBy ?? []), worst])];
    }
    cuts.push({ ccy: worst, net: net[worst], factor: Math.round(factor * 1000) / 1000, cards: sameSide.map(x => x.name) });
  }
  const after = netExposure(out).net;
  return { cards: out, report: { cap, before, after, cuts } };
}
