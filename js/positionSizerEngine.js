/**
 * Position Sizer — the risk layer that turns the (accurate) forecast into sizing.
 *
 * This is where the durable retail edge actually lives: vol-based sizing + diversification
 * + a stop outside the noise. It is a RISK FRAMEWORK, not an alpha source — it does not
 * create edge, it makes whatever entry you use survivable and equal-risk across the book.
 *
 * The core is deliberately CURRENCY-AGNOSTIC (no pip/FX-rate conversion — the #1 way a
 * sizer ships a 10× bug): everything keys off the forecast range as a % of price.
 *   • stop distance   = stopMult × forecast daily H-L range (% of price) — outside the day's noise
 *   • $ risk/trade    = equity × riskPct
 *   • position size   = notionalFraction = riskPct ÷ stopPct  (the leverage that makes a
 *                       stop-out lose exactly riskPct of equity — independent of the pair's
 *                       currency, because both sides are in % of price)
 * pips / lots are optional add-ons when price + pip are supplied; the %-based outputs are
 * the robust, correct core.
 *
 * Diversification: each position is sized to the SAME $ risk (that's the vol normalisation),
 * and the portfolio caps total heat — if N positions × riskPct exceeds maxHeatPct, every
 * position scales down proportionally so the book's worst-case loss stays bounded.
 *
 * Pure + unit-testable. No network, no forecast coupling — the range is passed in.
 */
const r3 = (x, d = 3) => x == null || !isFinite(x) ? null : +x.toFixed(d);

/**
 * sizePosition — one position, given the forecast range and account params.
 *   equity     account equity (currency units)
 *   riskPct    % of equity to risk if the stop is hit (e.g. 0.5)
 *   stopMult   stop distance as a multiple of the forecast daily range (default 1.0)
 *   rangePct   forecast daily H-L range, % of price (the calibrated forecast)
 *   price,pip  optional — enables stopPips + an approx lot size (USD-quote basis)
 */
export function sizePosition({ equity, riskPct, stopMult = 1, rangePct, price = null, pip = null }) {
  if (!(equity > 0) || !(riskPct > 0) || !(rangePct > 0)) return { invalid: true };
  const stopPct = stopMult * rangePct;                       // stop distance, % of price
  const riskDollar = equity * riskPct / 100;
  const notionalFraction = stopPct > 0 ? riskPct / stopPct : null;   // leverage on this position
  const notionalDollar = notionalFraction != null ? equity * notionalFraction : null;
  const stopPips = (price > 0 && pip > 0) ? stopPct / 100 * price / pip : null;
  const lotsApprox = (price > 0 && notionalDollar != null) ? notionalDollar / (100000 * price) : null;  // USD-quote approx
  return {
    stopPct: r3(stopPct), stopPips: r3(stopPips, 1),
    riskDollar: r3(riskDollar, 2),
    notionalFraction: r3(notionalFraction), notionalDollar: r3(notionalDollar, 0),
    lotsApprox: r3(lotsApprox, 2),
  };
}

/**
 * sizePortfolio — size a book and cap total heat.
 *   positions: [{ pair, rangePct, price?, pip? }]
 *   maxHeatPct: cap on nominal total risk (Σ per-trade risk); positions scale down to fit.
 */
export function sizePortfolio({ equity, riskPct, stopMult = 1, maxHeatPct = null, positions = [] }) {
  const valid = positions.filter(p => p && p.rangePct > 0);
  const grossHeat = riskPct * valid.length;                 // nominal total risk if all stop out
  const scale = (maxHeatPct > 0 && grossHeat > maxHeatPct) ? maxHeatPct / grossHeat : 1;
  const perTradeRisk = riskPct * scale;
  const sized = valid.map(p => ({
    pair: p.pair, rangePct: r3(p.rangePct),
    ...sizePosition({ equity, riskPct: perTradeRisk, stopMult, rangePct: p.rangePct, price: p.price, pip: p.pip }),
  }));
  return {
    nPositions: valid.length,
    riskPctPerTrade: r3(perTradeRisk),
    grossHeatPct: r3(grossHeat),
    maxHeatPct: maxHeatPct ?? null,
    scaledDown: scale < 1,
    effectiveHeatPct: r3(Math.min(grossHeat, maxHeatPct || grossHeat)),
    totalNotionalFraction: r3(sized.reduce((s, x) => s + (x.notionalFraction || 0), 0)),
    positions: sized,
  };
}
