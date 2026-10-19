/**
 * CME listed options book → contracts for js/hedgingScenario.js, in CFD (OANDA) price terms. Shared by the OI Lab v2
 * hedging map (CME source) and /api/hedging-summary (FX majors, US30). Pure.
 *
 * Unit handling, in order: native strike × priceScale (grains are quoted in cents) or 1/strike for the inverted FX
 * futures (CME quotes JPY/CAD/CHF per USD), then minus the stored futures−CFD basis. Inverted entries already carry
 * their call/put labels flipped into pair terms when `cpSwapped` is set (js/oi.js), the same convention the
 * gamma-flip code uses.
 */
import { oiMatrixExpiryLegs, oiFlatVol, oiSpec } from './oi.js';

export const INVERTED_PAIRS = new Set(['USD/JPY', 'USD/CAD', 'USD/CHF']);

/**
 * @param sym   store key ('EUR/USD', 'USD/JPY', 'NAS100_USD', 'XAG/USD', 'CORN_USD' …)
 * @param e     the oi_store / oi_store_cmdty entry (rawOI, basis, cpSwapped, ivTermStructure, minOI, spot)
 * @returns { contracts:[{K,T,cp,oi,iv}], spot, ivNote } or null
 */
export function cmeBookContracts(sym, e, { maxDte = 45 } = {}) {
  if (!e?.rawOI) return null;
  const inverted = INVERTED_PAIRS.has(sym);
  let legs = oiMatrixExpiryLegs(e.rawOI, { basis: 0, inverted, minOI: e.minOI ?? 1 });
  if (!legs?.length) return null;
  if (e.cpSwapped) legs = legs.map(l => ({ ...l, calls: l.puts, puts: l.calls }));
  const scale = inverted ? 1 : (oiSpec(sym)?.priceScale ?? 1);
  const basis = Number.isFinite(e.basis) ? e.basis : 0;
  const pts = (e.ivTermStructure?.points || []).filter(p => p && p.iv > 0 && Number.isFinite(p.dte));
  const flat = oiFlatVol(sym);
  const sig = d => (pts.length && Number.isFinite(d) ? pts.slice().sort((a, b) => Math.abs(a.dte - d) - Math.abs(b.dte - d))[0].iv / 100 : flat);
  const contracts = [];
  for (const l of legs) {
    const d = Number.isFinite(l.dte) ? l.dte : 14;
    if (d > maxDte) continue;
    const T = Math.max(0.25, d) / 365, iv = sig(d);
    l.strikes.forEach((k0, i) => {
      const K = (inverted ? 1 / k0 : k0 * scale) - basis;
      if (!(K > 0)) return;
      if (l.calls[i] > 0) contracts.push({ K, T, cp: 'C', oi: l.calls[i], iv });
      if (l.puts[i] > 0) contracts.push({ K, T, cp: 'P', oi: l.puts[i], iv });
    });
  }
  return contracts.length ? { contracts, spot: e.spot,
    ivNote: pts.length ? 'one IV per expiry (term structure), no skew' : `flat ${(flat * 100).toFixed(0)}% vol (no IV stored)` } : null;
}

/** Decimal places for a price on this instrument. */
export function priceDigits(sym, px) {
  const spec = oiSpec(sym);
  if (spec?.dp != null) return spec.dp;
  if (/JPY/.test(sym)) return 3;
  if (/^[A-Z]{3}\/[A-Z]{3}$/.test(sym) && !/XAU|XAG/.test(sym)) return 5;
  return px >= 1000 ? 1 : 2;
}
