/**
 * Vol & Range Forecaster — core math engine (no network, no I/O).
 *
 * Methodology:
 *   σ       : EWMA(λ=0.94) on log close-to-close returns — one-step-ahead daily σ
 *   Ranges  : Trailing 504-day H-L and |O-C| distributions, expressed as
 *             multiples of σ; 50th and 75th percentiles applied to σ_forecast
 *   DOW     : Day-of-week seasonality multiplier (empirical, Wed = 1.00 baseline)
 *   News    : High-impact US event multiplier applied on top of DOW
 */

const LAMBDA       = 0.94;
const TRADING_DAYS = 252;
const CAL_WINDOW   = 504;   // 2-year calibration window

// ── Day-of-week multipliers (0=Mon … 4=Fri) ──────────────────────────────────
// Source: Berument & Kiymaz (2001), Baillie & Bollerslev (1991).
// Wednesday is the normalised baseline. Friday close-out flow widens ranges ~9%.
export const DOW_MULT = { 0: 0.93, 1: 0.97, 2: 1.00, 3: 1.02, 4: 1.09 };

// ── News event multipliers ────────────────────────────────────────────────────
const NEWS_PATTERNS = [
  { re: /federal\s*fund|fomc.*rate|fed.*rate/i, mult: 1.35, label: 'FOMC Rate' },
  { re: /non.?farm|nonfarm|payroll/i,           mult: 1.30, label: 'NFP'       },
  { re: /consumer\s*price|cpi/i,                mult: 1.25, label: 'CPI'       },
  { re: /personal\s*consumption|pce/i,          mult: 1.20, label: 'PCE'       },
  { re: /gross\s*domestic|gdp/i,                mult: 1.15, label: 'GDP'       },
  { re: /producer\s*price|ppi/i,                mult: 1.15, label: 'PPI'       },
];

/**
 * Detect the largest news multiplier for a given array of calendar events.
 * @param {Array<{event:string, impact:string, country:string}>} events
 * @returns {{ mult: number, label: string|null }}
 */
export function detectNewsMultiplier(events = []) {
  const usHigh = events.filter(e =>
    e.country === 'US' && String(e.impact ?? '').toLowerCase() === 'high',
  );
  let best = { mult: 1.0, label: null };
  for (const ev of usHigh) {
    for (const p of NEWS_PATTERNS) {
      if (p.re.test(ev.event) && p.mult > best.mult) {
        best = { mult: p.mult, label: p.label };
      }
    }
  }
  return best;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function ewmaVolSeries(logReturns, lam = LAMBDA) {
  const n    = logReturns.length;
  const out  = new Array(n);
  const seed = logReturns.slice(0, Math.min(20, n));
  let v = seed.reduce((s, r) => s + r * r, 0) / (seed.length || 1) || 1e-8;
  for (let i = 0; i < n; i++) {
    v = lam * v + (1 - lam) * logReturns[i] ** 2;
    out[i] = Math.sqrt(v);
  }
  return out;
}

function percentile(arr, p) {
  const s   = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

// ── Main forecast ─────────────────────────────────────────────────────────────

/**
 * Compute a session range forecast.
 *
 * @param {Array<{open,high,low,close}>} ohlc  Daily bars, oldest → newest
 * @param {number} targetDow   0=Mon … 4=Fri (the day being forecast)
 * @param {number} newsMult    Output from detectNewsMultiplier()
 * @returns {{
 *   vol_annual, hl_median, hl_75, oc_median, oc_75,
 *   dow_mult, news_mult
 * }}  All values are percentages.
 */
export function computeForecast(ohlc, targetDow = 2, newsMult = 1.0) {
  const n = ohlc.length;
  if (n < 60) throw new Error(`Need ≥60 bars, got ${n}`);

  const closes = ohlc.map(b => b.close);
  const logRet = [];
  for (let i = 1; i < n; i++) logRet.push(Math.log(closes[i] / closes[i - 1]));

  // One-step-ahead σ — the last EWMA value already incorporates today's return,
  // making it the σ_forecast for tomorrow (standard EWMA property).
  const sigAll      = ewmaVolSeries(logRet);
  const sigFwd      = sigAll.at(-1);
  const sigFwdPct   = sigFwd * 100;
  const volAnnual   = sigFwdPct * Math.sqrt(TRADING_DAYS);

  // Calibration window: trailing CAL_WINDOW bars
  const nCal    = Math.min(CAL_WINDOW, logRet.length);
  const retCal  = logRet.slice(-nCal);
  const sigCal  = ewmaVolSeries(retCal).map(s => s * 100);  // daily σ in %
  const ohlcCal = ohlc.slice(-(nCal + 1));                  // extra bar for prior close

  const hlRatios = [];
  const ocRatios = [];
  for (let i = 1; i <= nCal; i++) {
    const bar  = ohlcCal[i];
    const prev = ohlcCal[i - 1].close;
    const s    = sigCal[i - 1];
    if (s <= 0 || !prev || !bar.open) continue;

    const hl = (bar.high - bar.low) / prev * 100;
    const oc = Math.abs(bar.close - bar.open) / bar.open * 100;
    if (hl > 0 && isFinite(hl / s)) hlRatios.push(hl / s);
    if (oc >= 0 && isFinite(oc / s)) ocRatios.push(oc / s);
  }
  if (!hlRatios.length || !ocRatios.length) throw new Error('No valid ratio data');

  const hlMedR = percentile(hlRatios, 50);
  const hl75R  = percentile(hlRatios, 75);
  const ocMedR = percentile(ocRatios, 50);
  const oc75R  = percentile(ocRatios, 75);

  const dowMult   = DOW_MULT[targetDow] ?? 1.0;
  const totalMult = dowMult * newsMult;
  const r2        = x => Math.round(x * 100) / 100;

  return {
    vol_annual: r2(volAnnual),
    hl_median:  r2(hlMedR * sigFwdPct * totalMult),
    hl_75:      r2(hl75R  * sigFwdPct * totalMult),
    oc_median:  r2(ocMedR * sigFwdPct * totalMult),
    oc_75:      r2(oc75R  * sigFwdPct * totalMult),
    dow_mult:   r2(dowMult),
    news_mult:  r2(newsMult),
  };
}
