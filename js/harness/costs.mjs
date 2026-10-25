/**
 * Costs the harness charges — measured on this desk, not assumed.
 *
 * Source: the `spread_profile` feature (the server's spread sampler, every 10 minutes per
 * pair per UTC hour since 2026-09-17, read through the store like any other feature). The
 * profile is in PIPS as the server computes them: 0.01 for JPY pairs, 1.0 for gold and the
 * indices, else 0.0001 — the same PIP_SIZE table as server.js. One full spread is paid per
 * round trip, so half a spread per unit of position turnover.
 *
 * Indices are not in the profile. The prereg's rule: flag them UNMEASURED and charge the
 * worst measured FX pair at that hour — "worst" in fraction-of-price terms, which needs a
 * price, so it is the worst among the FX pairs the store holds a price for.
 *
 * Hour 21 UTC is the rollover spike (EURUSD 3.28 pips vs 0.77–0.86 either side). The
 * default entry hour is 22, the first hour a close-based signal can be filled with normal
 * spreads; a study that trades another hour declares it.
 */
import { mean } from '../statsCore.js';

const PROFILE_KEY = inst => (inst === 'xauusd' ? 'gold' : inst);
const PIP = inst => (/jpy$/.test(inst) ? 0.01 : (inst === 'xauusd' || inst === 'gold' || /^(nas100|spx500|us30|de30|uk100|us2000)/.test(inst)) ? 1.0 : 0.0001);
const IS_INDEX = inst => /^(nas100|spx500|us30|de30|uk100|us2000)/.test(inst);

export class CostModel {
  static async open(store, { entryHourUtc, universe, px, unmeasuredFrac }) {
    const rows = await store.profile('spread_profile');
    const byPair = {};
    for (const r of rows) (byPair[r.pair] ??= {})[Number(r.hour)] = r;
    return new CostModel(byPair, { entryHourUtc, universe, px, unmeasuredFrac });
  }

  constructor(byPair, { entryHourUtc, universe, px, unmeasuredFrac }) {
    this.byPair = byPair;
    this.hour = entryHourUtc;
    this.notes = [];
    this.spreadPrice = {};     // inst → spread in price units at the entry hour
    this.unmeasured = [];
    for (const inst of universe) {
      const cell = byPair[PROFILE_KEY(inst)]?.[entryHourUtc];
      if (cell && Number.isFinite(cell.mean) && cell.n > 0) this.spreadPrice[inst] = cell.mean * PIP(inst);
      else this.unmeasured.push(inst);
    }
    // worst measured FX pair in fraction-of-price terms, among pairs with a store price
    let worst = null;
    for (const [inst, P] of Object.entries(px)) {
      if (IS_INDEX(inst) || !this.spreadPrice[inst]) continue;
      const refPx = mean(P.closes.slice(-250));
      const frac = this.spreadPrice[inst] / refPx;
      if (!worst || frac > worst.frac) worst = { inst, frac };
    }
    // fall back to the whole profile when the universe has no measured FX leg
    if (!worst) {
      for (const [pair, hours] of Object.entries(byPair)) {
        const c = hours[entryHourUtc]; if (!c || !(c.n > 0)) continue;
        // no price for crosses in the store: a conservative reference of 1.0 (EURUSD-like) keeps this a fallback, not a measurement
        const frac = (c.mean * PIP(pair)) / 1.0;
        if (!worst || frac > worst.frac) worst = { inst: pair, frac, assumedPrice: true };
      }
    }
    this.worstFx = worst;
    // Opt-in (spec.unmeasuredCostFrac): a fixed round-trip fraction for unmeasured instruments. The default rule below prices
    // the worst FX pair off the mean of the window's LAST 250 closes, so the charge depends on where the window ends and on
    // which FX legs share the universe (found by forge/PORTFOLIO_BOOK_VALIDATE_PREREG.md T1, 2026-10-25). Studies that do not
    // pass it are unchanged.
    if (Number.isFinite(unmeasuredFrac)) {
      this.worstFx = { inst: 'fixed', frac: unmeasuredFrac };
      for (const inst of this.unmeasured) this.notes.push(`${inst}: spread UNMEASURED — charged a fixed ${(unmeasuredFrac * 1e4).toFixed(2)} bp of price per round trip (spec.unmeasuredCostFrac)`);
      return;
    }
    for (const inst of this.unmeasured) {
      if (worst) this.notes.push(`${inst}: spread UNMEASURED at ${entryHourUtc}:00 UTC — charged the worst measured FX pair (${worst.inst}, ${(worst.frac * 1e4).toFixed(2)} bp of price per round trip)`);
      else this.notes.push(`${inst}: spread UNMEASURED and no reference pair — cost 0 (this result is gross)`);
    }
  }

  /** Full round-trip spread as a fraction of price at `date` for `inst`. */
  fraction(inst, _date, price) {
    const sp = this.spreadPrice[inst];
    if (sp != null && price > 0) return sp / price;
    return this.worstFx ? this.worstFx.frac : 0;
  }

  summary() {
    const perInst = Object.fromEntries(Object.entries(this.spreadPrice).map(([k, v]) => [k, { spreadPriceUnits: +v.toFixed(6), pips: +(v / PIP(k)).toFixed(2) }]));
    return {
      rule: `half of the measured ${this.hour}:00 UTC spread per unit turnover (spread_profile feature); indices charged the worst measured FX pair`,
      entryHourUtc: this.hour, measured: perInst, unmeasured: this.unmeasured,
      worstFx: this.worstFx ? { inst: this.worstFx.inst, roundTripBp: +(this.worstFx.frac * 1e4).toFixed(2) } : null,
    };
  }
}
