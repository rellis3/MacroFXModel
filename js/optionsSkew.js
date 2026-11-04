/**
 * Options skew board (owner, 2026-11-04): what the options market pays for protection each way, from the laptop's IBKR
 * pull (scripts/rates_line/refresh_options_skew.py → KV options_skew_v1). Per market and tenor: at-the-money vol,
 * the 25-delta risk reversal (calls minus puts; positive = upside protection dearer) and the butterfly (the wings over
 * the middle). One point a day is kept (KV options_skew_hist) so each reading is set against its own history.
 *
 * The currency futures quote US$ per unit of the currency, so a positive EUR risk reversal = the market pays up for
 * EUR/USD to rise; for JPY, CHF and CAD the dollar-first pair moves the other way (pairRr flips the sign).
 *
 * Pure. Tested in js/optionsSkew.test.mjs.
 */
export const SKEW_ORDER = ['EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'GOLD', 'NQ', 'ES', 'WTI'];
const PAIR = { EUR: ['EUR/USD', 1], GBP: ['GBP/USD', 1], AUD: ['AUD/USD', 1], JPY: ['USD/JPY', -1], CAD: ['USD/CAD', -1], CHF: ['USD/CHF', -1], GOLD: ['Gold', 1], NQ: ['Nasdaq 100', 1], ES: ['S&P 500', 1], WTI: ['WTI crude', 1] };
const r2 = x => (Number.isFinite(x) ? +x.toFixed(2) : null);

/** Add today's 1-month (and 1-week ATM) reading per market to the history; { hist, changed }. */
export function updateHist(hist = {}, pull, { keep = 260 } = {}) {
  const day = String(pull?.asOf ?? '').slice(0, 10); let changed = false;
  if (!day) return { hist, changed };
  for (const [k, r] of Object.entries(pull?.rows ?? {})) {
    const m = r.tenors?.['1m'] ?? r.tenors?.['3m'] ?? r.tenors?.['1w']; if (!m) continue;
    const h = (hist[k] ??= []), pt = { date: day, rr: m.rr25, atm: m.atm, bf: m.bf25, atm1w: r.tenors?.['1w']?.atm ?? null };
    if (h.at(-1)?.date === day) { h[h.length - 1] = pt; } else h.push(pt);
    hist[k] = h.slice(-keep); changed = true;
  }
  return { hist, changed };
}

const pctRank = (arr, v) => (arr.length >= 20 && Number.isFinite(v) ? Math.round((arr.filter(x => x < v).length / arr.length) * 100) : null);

/** The board: one row per market with every tenor, the term slope, the 5-day change and where the skew sits in its history. */
export function skewBoard(pull, hist = {}, now = Date.now()) {
  const rows = [];
  for (const k of [...SKEW_ORDER, ...Object.keys(pull?.rows ?? {}).filter(x => !SKEW_ORDER.includes(x))]) {
    const r = pull?.rows?.[k]; if (!r?.tenors) continue;
    const m = r.tenors['1m'] ?? r.tenors['3m'] ?? r.tenors['1w'], w = r.tenors['1w'], h = hist[k] ?? [];
    const prev5 = h.length > 5 ? h.at(-6) : null, [pair, sgn] = PAIR[k] ?? [k, 1];
    const slope = w && m && w !== m ? r2(w.atm - m.atm) : null;
    const rrPct = pctRank(h.map(x => x.rr).filter(Number.isFinite), m?.rr25);
    const fx = ['EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF'].includes(k);
    const lean = !m ? '' : Math.abs(m.rr25) < 0.15 ? 'balanced' : fx ? (m.rr25 > 0 ? `paying for ${k} strength` : `paying for ${k} weakness`) : m.rr25 > 0 ? 'paying for upside' : 'paying for downside';
    rows.push({ id: k, label: r.label ?? k, pair, sign: sgn, data: r.data ?? null, tenors: r.tenors, atm: m?.atm ?? null, rr: m?.rr25 ?? null, bf: m?.bf25 ?? null, pairRr: m ? r2(m.rr25 * sgn) : null,
      slope, event: slope != null && slope >= 1 ? 'near-term vol bid: an event is priced' : null, rr5d: prev5 && m ? r2(m.rr25 - prev5.rr) : null, rrPct, lean, history: h.length, spark: h.slice(-60).map(x => x.rr) });
  }
  const ageH = pull?.asOf ? +((now - Date.parse(pull.asOf)) / 3.6e6).toFixed(1) : null;
  return { ok: rows.length > 0, asOf: pull?.asOf ?? null, ageH, rows, errors: pull?.errors ?? {},
    label: 'risk reversal = the 25-delta call\'s vol minus the put\'s (vol points): positive = protection against a rise costs more. Butterfly = the wings over the middle: fear of a big move either way. Slope = 1-week minus 1-month at-the-money vol: positive = something near-term is priced. Currency futures are quoted in dollars per unit of the currency; "pair RR" is the same reading for the pair as traded.' };
}
