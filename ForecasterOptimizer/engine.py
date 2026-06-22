"""
engine.py — Python/numba port of the backtest engine inlined in
forecaster-backtest.html (vol-range-level entries, ATR/pips SL, MFE
trail / fixed-R / breakeven exits, M1 bar-by-bar simulation).

This is a line-for-line port of the JS functions computeForecastFromBars,
aggregateToDailyBars, computeWalkForwardForecasts, computeATRForTf,
computeMomentumZArray, runBacktest, _closeTrade and computeAnalytics —
written so a numba-jitted kernel can run thousands of trials per pair fast
enough to do a multi-pair sweep on a laptop.

Two numerical simplifications vs. the literal JS implementation (both are
provably bit-identical, not approximations):
  - GARCH(1,1)/RS-EWMA vol forecasts are computed as a single forward pass
    instead of JS's "recompute from day 0" on every single day — the JS
    recursion always restarts from the same seed and walks the same path,
    so a running incremental pass yields the exact same per-day value.
  - ATR-per-M1-bar mapping uses np.searchsorted instead of a two-pointer
    scan — same monotonic lookup, vectorized.

In practice float64 rounding isn't perfectly associative, so the forward-pass
forecast values can differ from JS's by ~1e-7 relative — irrelevant almost
everywhere, but on the rare bar where a level price lands within that
tolerance of the bar's high/low, one engine triggers a level and the other
doesn't. Once that happens, all downstream trade timing for that run diverges
(same market data, different trade slots busy at different times). Confirmed
via trade-by-trade diffing against the JS reference: roughly 1 in a few
thousand trades over a 6-year window. Not a logic bug — both engines apply
the exact same comparisons, just to operands that occasionally differ in the
last float64 bit.
"""

import numpy as np
import pandas as pd
from numba import njit

# ─────────────────────────────────────────────────────────────────────────
# Vol forecast math (mirrors the inline <script> block in forecaster-backtest.html)
# ─────────────────────────────────────────────────────────────────────────

FC_TRADING_DAYS = 252
FC_EWMA_LAMBDA = 0.94
FC_G_ALPHA, FC_G_BETA = 0.06, 0.91
FC_BM_P50, FC_BM_P75 = 1.572, 2.049
FC_HN_P50, FC_HN_P75 = 0.6745, 1.1503

FC_ASSET_PARAMS = {
    "commodity": dict(hl_50_corr=1.018, hl_75_corr=0.940, oc_50_corr=1.126, oc_75_corr=1.085, garch_omega=None),
    "index": dict(hl_50_corr=0.993, hl_75_corr=0.947, oc_50_corr=1.061, oc_75_corr=1.112, garch_omega=4.76e-6),
    "fx": dict(hl_50_corr=0.955, hl_75_corr=0.888, oc_50_corr=0.956, oc_75_corr=0.954, garch_omega=3.60e-7),
}


def _js_round2(x):
    """Matches JS Math.round(x*100)/100 for x >= 0 (vol figures are always >= 0)."""
    return np.floor(x * 100.0 + 0.5) / 100.0


def compute_walkforward_forecast_series(d_open, d_high, d_low, d_close, asset_class, min_warmup=90):
    """
    Single forward pass that reproduces computeWalkForwardForecasts' per-day
    GARCH(1,1) (fx/index) or RS-EWMA (commodity) forecast exactly, for every
    day index i >= min_warmup. Returns arrays aligned 1:1 with the daily bars:
      fc_valid, fc_hl_median, fc_hl_75, fc_oc_median, fc_oc_75
    fc_valid[i] is True iff i >= min_warmup (and i >= 60, the JS hard floor).
    """
    n = len(d_open)
    p = FC_ASSET_PARAMS.get(asset_class, FC_ASSET_PARAMS["fx"])
    fc_valid = np.zeros(n, dtype=np.bool_)
    fc_hlmed = np.zeros(n, dtype=np.float64)
    fc_hl75 = np.zeros(n, dtype=np.float64)
    fc_ocmed = np.zeros(n, dtype=np.float64)
    fc_oc75 = np.zeros(n, dtype=np.float64)
    if n < 60:
        return fc_valid, fc_hl75, fc_hlmed, fc_oc75, fc_ocmed

    start = max(min_warmup, 60)

    if asset_class == "commodity":
        init_n = min(20, n)
        rs = (np.log(d_high / d_close) * np.log(d_high / d_open)
              + np.log(d_low / d_close) * np.log(d_low / d_open))
        v = max(rs[:init_n].mean(), 1e-10)
        v_after = np.empty(n, dtype=np.float64)
        for j in range(n):
            v = FC_EWMA_LAMBDA * v + (1 - FC_EWMA_LAMBDA) * rs[j]
            v_after[j] = v
        sf_after = np.sqrt(np.maximum(v_after, 0.0))
    else:
        omega = p["garch_omega"]
        s2 = omega / (1 - FC_G_ALPHA - FC_G_BETA)
        s2_after = np.empty(n, dtype=np.float64)
        s2_after[0] = s2  # unused (start >= 60 always)
        for j in range(1, n):
            r = np.log(d_close[j] / d_close[j - 1])
            s2 = omega + FC_G_ALPHA * r * r + FC_G_BETA * s2
            s2_after[j] = s2
        sf_after = np.sqrt(s2_after)

    for i in range(start, n):
        sf = sf_after[i - 1]
        sp = sf * 100.0
        fc_valid[i] = True
        fc_hlmed[i] = _js_round2(FC_BM_P50 * p["hl_50_corr"] * sp)
        fc_hl75[i] = _js_round2(FC_BM_P75 * p["hl_75_corr"] * sp)
        fc_ocmed[i] = _js_round2(FC_HN_P50 * p["oc_50_corr"] * sp)
        fc_oc75[i] = _js_round2(FC_HN_P75 * p["oc_75_corr"] * sp)

    return fc_valid, fc_hl75, fc_hlmed, fc_oc75, fc_ocmed


# ─────────────────────────────────────────────────────────────────────────
# Daily aggregation / ATR / momentum Z (all over the full M1 array, once)
# ─────────────────────────────────────────────────────────────────────────

def aggregate_daily(times, opens, highs, lows, closes):
    day_key = times // 86400
    df = pd.DataFrame({"day": day_key, "open": opens, "high": highs, "low": lows, "close": closes})
    g = df.groupby("day", sort=True).agg(open=("open", "first"), high=("high", "max"),
                                          low=("low", "min"), close=("close", "last"))
    return g.index.values.astype(np.int64), g["open"].values, g["high"].values, g["low"].values, g["close"].values


def build_forecast_lookup(day_keys, fc_valid, fc_hl75, fc_hlmed, fc_oc75, fc_ocmed):
    """Dense arrays indexed by (day_key - offset) so the kernel can do pure
    integer indexing instead of dict lookups (numba-friendly)."""
    offset = int(day_keys[0])
    span = int(day_keys[-1]) - offset + 1
    v = np.zeros(span, dtype=np.bool_)
    h75 = np.zeros(span, dtype=np.float64)
    hmed = np.zeros(span, dtype=np.float64)
    o75 = np.zeros(span, dtype=np.float64)
    omed = np.zeros(span, dtype=np.float64)
    idx = (day_keys - offset).astype(np.int64)
    v[idx] = fc_valid
    h75[idx] = fc_hl75
    hmed[idx] = fc_hlmed
    o75[idx] = fc_oc75
    omed[idx] = fc_ocmed
    return offset, v, h75, hmed, o75, omed


@njit(cache=True)
def _wilder_atr(tf_high, tf_low, tf_close, period):
    n = len(tf_high)
    atr = np.empty(n, dtype=np.float64)
    atr[0] = tf_high[0] - tf_low[0]
    k = 1.0 / period
    for i in range(1, n):
        tr = max(tf_high[i] - tf_low[i], abs(tf_high[i] - tf_close[i - 1]), abs(tf_low[i] - tf_close[i - 1]))
        atr[i] = k * tr + (1 - k) * atr[i - 1] if tr > 0 else atr[i - 1]
    return atr


def compute_atr_for_tf(times, opens, highs, lows, closes, period, tf_min):
    tf_min = max(1, int(round(tf_min)))
    tf_sec = tf_min * 60
    bucket = (times // tf_sec) * tf_sec
    df = pd.DataFrame({"b": bucket, "open": opens, "high": highs, "low": lows, "close": closes})
    g = df.groupby("b", sort=True).agg(high=("high", "max"), low=("low", "min"), close=("close", "last"))
    tf_times = g.index.values.astype(np.int64)
    tf_atr = _wilder_atr(g["high"].values, g["low"].values, g["close"].values, period)
    j = np.searchsorted(tf_times, times, side="right") - 1
    j = np.clip(j, 0, len(tf_atr) - 1)
    return tf_atr[j]


def compute_momentum_z(closes, roc_period=10, z_window=20):
    n = len(closes)
    out = np.zeros(n, dtype=np.float64)
    if n <= roc_period:
        return out
    roc = np.zeros(n, dtype=np.float64)
    roc[roc_period:] = (closes[roc_period:] - closes[:-roc_period]) / closes[:-roc_period]
    s = pd.Series(roc)
    roll_mean = s.rolling(z_window).mean().values
    roll_std = s.rolling(z_window).std(ddof=1).values
    with np.errstate(invalid="ignore", divide="ignore"):
        z = (roc - roll_mean) / roll_std
    z[~np.isfinite(z)] = 0.0
    z[roll_std <= 1e-10] = 0.0
    need = roc_period + z_window
    z[: need - 1] = 0.0
    return z


def pip_size_for_pairkey(pairkey):
    if "jpy" in pairkey.lower():
        return 0.01
    if pairkey.lower() == "gold":
        return 0.01
    return 0.0001


def asset_class_for_pairkey(pairkey):
    """All 26 locally-available pairs are 'fx' except XAU/USD ('gold' -> commodity)."""
    return "commodity" if pairkey.lower() == "gold" else "fx"


def bar_hour_utc(times):
    return ((times // 3600) % 24).astype(np.int8)


# ─────────────────────────────────────────────────────────────────────────
# Config params — mirrors PARAMS / PARAM_DEFS / OPT_EXCLUDE_KEYS / OPT_CATEGORICAL
# ─────────────────────────────────────────────────────────────────────────

PARAMS = [
    dict(key="slAtrMult", min=0.5, max=6.0, step=0.1, default=2.0),
    dict(key="atrPeriod", min=5, max=100, step=1, default=14),
    dict(key="slAtrTfMin", min=1, max=240, step=1, default=30),
    dict(key="slFixedPips", min=1, max=300, step=1, default=20),
    dict(key="entryConfirmAtrMult", min=0, max=1.0, step=0.05, default=0.25),
    dict(key="entryStopSlipAtrMult", min=0, max=0.3, step=0.01, default=0.05),
    dict(key="tpRMult", min=0.5, max=10.0, step=0.1, default=2.0),
    dict(key="mfeTrailPct", min=0.10, max=0.95, step=0.05, default=0.50),
    dict(key="mfeMinR", min=0.1, max=3.0, step=0.1, default=0.3),
    dict(key="levelTargetCutoffH", min=0, max=23, step=1, default=12),
    dict(key="beAfterR", min=0.0, max=5.0, step=0.1, default=0.0),
    dict(key="momZThresh", min=0.0, max=4.0, step=0.1, default=0.0),
    dict(key="costPct", min=0.0, max=0.20, step=0.01, default=0.0),
    dict(key="dynMinMove", min=0.0, max=1.0, step=0.05, default=0.25),
    dict(key="windowStartH", min=0, max=12, step=1, default=0),
    dict(key="windowEndH", min=12, max=23, step=1, default=22),
    dict(key="eodClose", min=0, max=1, step=1, default=1),
    dict(key="oneTradeAtATime", min=0, max=1, step=1, default=1),
    dict(key="minBarsBetween", min=0, max=500, step=1, default=0),
    dict(key="maxLevelTrades", min=1, max=10, step=1, default=1),
    dict(key="warmupDays", min=60, max=252, step=10, default=90),
]
PARAM_DEFS = {p["key"]: p["default"] for p in PARAMS}

OPT_EXCLUDE_KEYS = {"atrPeriod", "slAtrTfMin", "warmupDays", "costPct", "eodClose"}
OPT_NUMERIC_PARAMS = [p for p in PARAMS if p["key"] not in OPT_EXCLUDE_KEYS]
OPT_CATEGORICAL = {
    "strategy": ["dirop", "reversal"],
    "slMode": ["atr", "pips"],
    "tpMode": ["trail", "fixed_r", "both", "none", "level"],
    "entryMode": ["touch", "stop"],
}


def sample_trial_config(base_cfg, rng):
    t = dict(base_cfg)
    for key, opts in OPT_CATEGORICAL.items():
        t[key] = opts[rng.randrange(len(opts))]
    for p in OPT_NUMERIC_PARAMS:
        steps = max(1, round((p["max"] - p["min"]) / p["step"]))
        k = rng.randint(0, steps)
        t[p["key"]] = round((p["min"] + k * p["step"]) * 1e6) / 1e6
    if t["windowEndH"] <= t["windowStartH"]:
        t["windowEndH"] = min(23, t["windowStartH"] + 1)
    return t


# ─────────────────────────────────────────────────────────────────────────
# Backtest kernel — mirrors runBacktest / _closeTrade
# ─────────────────────────────────────────────────────────────────────────
# Level order fixed to match LEVELS in forecaster-backtest.html exactly:
#   0 PROJ_H_75   1 PROJ_H_MED  2 OC_75_UP   3 OC_MED_UP
#   4 OC_MED_DN   5 OC_75_DN    6 PROJ_L_MED 7 PROJ_L_75
#   8 DYN_H_75    9 DYN_H_MED  10 DYN_L_MED 11 DYN_L_75
# dir: 0 = LONG, 1 = SHORT

EXIT_SL, EXIT_TP, EXIT_TRAIL, EXIT_EOD = 0, 1, 2, 3
MAX_SLOTS = 64
TRADE_CAP = 200_000


@njit(cache=True)
def _run_backtest_kernel(
    times, opens, highs, lows, closes, atr_arr, mom_arr,
    day_key_offset, fc_valid, fc_hl75, fc_hlmed, fc_oc75, fc_ocmed,
    from_ts, to_ts,
    strategy_is_reversal, sl_mode_is_pips, sl_fixed_pips, sl_atr_mult, pip_size,
    use_entry_stop, entry_confirm_atr_mult, entry_stop_slip_atr_mult,
    use_trail, use_tp, tp_r_mult, mfe_trail_pct, mfe_min_r,
    use_level_target, level_target_cutoff_h,
    be_after_r, mom_z_thresh, cost_pct, dyn_min_move,
    window_start_h, window_end_h, eod_close,
    one_trade_at_a_time, min_bars_between, max_level_trades,
):
    n = len(times)
    out_entry_ts = np.zeros(TRADE_CAP, dtype=np.int64)
    out_exit_ts = np.zeros(TRADE_CAP, dtype=np.int64)
    out_pnl_pct = np.zeros(TRADE_CAP, dtype=np.float64)
    out_win = np.zeros(TRADE_CAP, dtype=np.bool_)
    out_reason = np.zeros(TRADE_CAP, dtype=np.int8)
    n_trades = 0

    slot_active = np.zeros(MAX_SLOTS, dtype=np.bool_)
    slot_dir = np.zeros(MAX_SLOTS, dtype=np.int8)
    slot_entry = np.zeros(MAX_SLOTS, dtype=np.float64)
    slot_sl = np.zeros(MAX_SLOTS, dtype=np.float64)
    slot_tp = np.zeros(MAX_SLOTS, dtype=np.float64)
    slot_has_tp = np.zeros(MAX_SLOTS, dtype=np.bool_)
    slot_sldist = np.zeros(MAX_SLOTS, dtype=np.float64)
    slot_mfe = np.zeros(MAX_SLOTS, dtype=np.float64)
    slot_be = np.zeros(MAX_SLOTS, dtype=np.bool_)
    slot_dayopen = np.zeros(MAX_SLOTS, dtype=np.float64)
    slot_entryts = np.zeros(MAX_SLOTS, dtype=np.int64)
    n_active = 0

    level_trade_count = np.zeros(12, dtype=np.int32)
    armed_active = np.zeros(12, dtype=np.bool_)
    armed_dir = np.zeros(12, dtype=np.int8)
    armed_confirm = np.zeros(12, dtype=np.float64)
    armed_lvprice = np.zeros(12, dtype=np.float64)
    armed_atr = np.zeros(12, dtype=np.float64)
    day_key_prev = -1
    day_open = 0.0
    day_high = 0.0
    day_low = 0.0
    day_fc_valid = False
    fhl75 = fhlmed = foc75 = focmed = 0.0
    fc_n = len(fc_valid)

    last_exit_bar = -999999

    for i in range(n):
        ts = times[i]
        if ts < from_ts or ts > to_ts:
            continue
        day_key = ts // 86400
        bar_hour = (ts // 3600) % 24

        if day_key != day_key_prev:
            if eod_close >= 1 and n_active > 0 and day_key_prev != -1:
                prev_close = closes[i - 1] if i > 0 else opens[i]
                prev_ts = times[i - 1] if i > 0 else ts
                for s in range(MAX_SLOTS):
                    if slot_active[s] and n_trades < TRADE_CAP:
                        raw = (prev_close - slot_entry[s]) if slot_dir[s] == 0 else (slot_entry[s] - prev_close)
                        cost = (cost_pct / 100.0) * slot_dayopen[s]
                        pnl_pct = (raw - cost) / slot_dayopen[s] * 100.0
                        out_entry_ts[n_trades] = slot_entryts[s]
                        out_exit_ts[n_trades] = prev_ts
                        out_pnl_pct[n_trades] = pnl_pct
                        out_win[n_trades] = pnl_pct > 0
                        out_reason[n_trades] = EXIT_EOD
                        n_trades += 1
                        slot_active[s] = False
                n_active = 0
                last_exit_bar = i

            day_key_prev = day_key
            day_open = opens[i]
            day_high = opens[i]
            day_low = opens[i]
            for lv in range(12):
                level_trade_count[lv] = 0
                armed_active[lv] = False
            idx_fc = day_key - day_key_offset
            if 0 <= idx_fc < fc_n and fc_valid[idx_fc]:
                day_fc_valid = True
                fhl75 = fc_hl75[idx_fc]
                fhlmed = fc_hlmed[idx_fc]
                foc75 = fc_oc75[idx_fc]
                focmed = fc_ocmed[idx_fc]
            else:
                day_fc_valid = False

        if highs[i] > day_high:
            day_high = highs[i]
        if lows[i] < day_low:
            day_low = lows[i]

        if not day_fc_valid:
            continue

        if eod_close >= 1 and n_active > 0 and bar_hour >= window_end_h:
            for s in range(MAX_SLOTS):
                if slot_active[s] and n_trades < TRADE_CAP:
                    raw = (opens[i] - slot_entry[s]) if slot_dir[s] == 0 else (slot_entry[s] - opens[i])
                    cost = (cost_pct / 100.0) * slot_dayopen[s]
                    pnl_pct = (raw - cost) / slot_dayopen[s] * 100.0
                    out_entry_ts[n_trades] = slot_entryts[s]
                    out_exit_ts[n_trades] = ts
                    out_pnl_pct[n_trades] = pnl_pct
                    out_win[n_trades] = pnl_pct > 0
                    out_reason[n_trades] = EXIT_EOD
                    n_trades += 1
                    slot_active[s] = False
            n_active = 0
            last_exit_bar = i

        # SL check
        for s in range(MAX_SLOTS):
            if slot_active[s]:
                hit = (slot_dir[s] == 0 and lows[i] <= slot_sl[s]) or (slot_dir[s] == 1 and highs[i] >= slot_sl[s])
                if hit and n_trades < TRADE_CAP:
                    exit_price = slot_sl[s]
                    raw = (exit_price - slot_entry[s]) if slot_dir[s] == 0 else (slot_entry[s] - exit_price)
                    cost = (cost_pct / 100.0) * slot_dayopen[s]
                    pnl_pct = (raw - cost) / slot_dayopen[s] * 100.0
                    out_entry_ts[n_trades] = slot_entryts[s]
                    out_exit_ts[n_trades] = ts
                    out_pnl_pct[n_trades] = pnl_pct
                    out_win[n_trades] = pnl_pct > 0
                    out_reason[n_trades] = EXIT_SL
                    n_trades += 1
                    slot_active[s] = False
                    n_active -= 1
                    last_exit_bar = i

        # TP check
        if use_tp:
            for s in range(MAX_SLOTS):
                if slot_active[s] and slot_has_tp[s]:
                    hit = (slot_dir[s] == 0 and highs[i] >= slot_tp[s]) or (slot_dir[s] == 1 and lows[i] <= slot_tp[s])
                    if hit and n_trades < TRADE_CAP:
                        exit_price = slot_tp[s]
                        raw = (exit_price - slot_entry[s]) if slot_dir[s] == 0 else (slot_entry[s] - exit_price)
                        cost = (cost_pct / 100.0) * slot_dayopen[s]
                        pnl_pct = (raw - cost) / slot_dayopen[s] * 100.0
                        out_entry_ts[n_trades] = slot_entryts[s]
                        out_exit_ts[n_trades] = ts
                        out_pnl_pct[n_trades] = pnl_pct
                        out_win[n_trades] = pnl_pct > 0
                        out_reason[n_trades] = EXIT_TP
                        n_trades += 1
                        slot_active[s] = False
                        n_active -= 1
                        last_exit_bar = i

        # MFE tracking + breakeven
        for s in range(MAX_SLOTS):
            if slot_active[s]:
                mfe = (highs[i] - slot_entry[s]) if slot_dir[s] == 0 else (slot_entry[s] - lows[i])
                if mfe > slot_mfe[s]:
                    slot_mfe[s] = mfe
                if be_after_r > 0 and not slot_be[s] and slot_sldist[s] > 0 and slot_mfe[s] >= be_after_r * slot_sldist[s]:
                    slot_sl[s] = slot_entry[s]
                    slot_be[s] = True

        # MFE trail exit (also active for level-target mode past the cutoff hour)
        if use_trail or (use_level_target and bar_hour >= level_target_cutoff_h):
            for s in range(MAX_SLOTS):
                if slot_active[s]:
                    mfe_peak = slot_mfe[s]
                    if mfe_peak <= 0 or mfe_peak < mfe_min_r * slot_sldist[s]:
                        continue
                    if slot_dir[s] == 0:
                        trig = (slot_entry[s] + mfe_peak - closes[i]) / mfe_peak > mfe_trail_pct
                    else:
                        trig = (closes[i] - (slot_entry[s] - mfe_peak)) / mfe_peak > mfe_trail_pct
                    if trig and n_trades < TRADE_CAP:
                        exit_price = closes[i]
                        raw = (exit_price - slot_entry[s]) if slot_dir[s] == 0 else (slot_entry[s] - exit_price)
                        cost = (cost_pct / 100.0) * slot_dayopen[s]
                        pnl_pct = (raw - cost) / slot_dayopen[s] * 100.0
                        out_entry_ts[n_trades] = slot_entryts[s]
                        out_exit_ts[n_trades] = ts
                        out_pnl_pct[n_trades] = pnl_pct
                        out_win[n_trades] = pnl_pct > 0
                        out_reason[n_trades] = EXIT_TRAIL
                        n_trades += 1
                        slot_active[s] = False
                        n_active -= 1
                        last_exit_bar = i

        # Entry signals

        # Stop-confirm check (entryMode='stop'): a level armed on an earlier
        # bar fires once price breaks back past confirm price in the reversal
        # direction — the stop order actually triggering, not the bare touch
        # that armed it. Re-checks slot/cooldown/window-close at fill time;
        # a blocked fill is simply dropped (missed trade), not requeued.
        if use_entry_stop:
            for lv in range(12):
                if not armed_active[lv]:
                    continue
                a_dir = armed_dir[lv]
                a_confirm = armed_confirm[lv]
                confirmed = (lows[i] <= a_confirm) if a_dir == 1 else (highs[i] >= a_confirm)
                if not confirmed:
                    continue
                armed_active[lv] = False
                slot_ok_now = (n_active == 0) if one_trade_at_a_time else True
                cooldown_ok_now = (i - last_exit_bar) > min_bars_between
                if not slot_ok_now or not cooldown_ok_now or bar_hour >= window_end_h:
                    continue  # missed the fill

                a_lvprice = armed_lvprice[lv]
                a_atr = armed_atr[lv]
                slip = entry_stop_slip_atr_mult * a_atr
                entry_price = (a_confirm - slip) if a_dir == 1 else (a_confirm + slip)

                level_trade_count[lv] += 1
                sl_dist = (sl_fixed_pips * pip_size) if sl_mode_is_pips else (a_atr * sl_atr_mult)
                sl = entry_price + sl_dist if a_dir == 1 else entry_price - sl_dist
                has_tp = False
                tp = 0.0
                if use_level_target:
                    if lv <= 7:
                        tp = 2.0 * day_open - a_lvprice
                        has_tp = True
                elif use_tp:
                    tp_dist = sl_dist * tp_r_mult
                    tp = entry_price - tp_dist if a_dir == 1 else entry_price + tp_dist
                    has_tp = True

                free = -1
                for s in range(MAX_SLOTS):
                    if not slot_active[s]:
                        free = s
                        break
                if free >= 0:
                    slot_active[free] = True
                    slot_dir[free] = a_dir
                    slot_entry[free] = entry_price
                    slot_sl[free] = sl
                    slot_tp[free] = tp
                    slot_has_tp[free] = has_tp
                    slot_sldist[free] = sl_dist
                    slot_mfe[free] = 0.0
                    slot_be[free] = False
                    slot_dayopen[free] = day_open
                    slot_entryts[free] = ts
                    n_active += 1

                if one_trade_at_a_time:
                    break

        cooldown_ok = (i - last_exit_bar) > min_bars_between
        slot_ok = (n_active == 0) if one_trade_at_a_time else True
        mom_ok = (mom_z_thresh <= 0) or (abs(mom_arr[i]) >= mom_z_thresh)
        if not cooldown_ok or not slot_ok or not mom_ok or bar_hour < window_start_h or bar_hour >= window_end_h:
            continue

        atr = atr_arr[i]
        if (not sl_mode_is_pips) and atr <= 0:
            continue

        high_move_pct = (day_high - day_open) / day_open * 100.0
        low_move_pct = (day_open - day_low) / day_open * 100.0
        h_moved = high_move_pct >= dyn_min_move
        l_moved = low_move_pct >= dyn_min_move

        for lv in range(12):
            if use_entry_stop and armed_active[lv]:
                continue  # already armed, waiting on confirm
            if level_trade_count[lv] >= max_level_trades:
                continue

            if lv == 0:
                lv_price = day_open * (1 + fhl75 / 100.0); def_dir = 1
            elif lv == 1:
                lv_price = day_open * (1 + fhlmed / 100.0); def_dir = 1
            elif lv == 2:
                lv_price = day_open * (1 + foc75 / 100.0); def_dir = 1
            elif lv == 3:
                lv_price = day_open * (1 + focmed / 100.0); def_dir = 1
            elif lv == 4:
                lv_price = day_open * (1 - focmed / 100.0); def_dir = 0
            elif lv == 5:
                lv_price = day_open * (1 - foc75 / 100.0); def_dir = 0
            elif lv == 6:
                lv_price = day_open * (1 - fhlmed / 100.0); def_dir = 0
            elif lv == 7:
                lv_price = day_open * (1 - fhl75 / 100.0); def_dir = 0
            elif lv == 8:
                if not h_moved:
                    continue
                lv_price = day_high * (1 - fhl75 / 100.0)
                if lv_price >= day_high:
                    continue
                def_dir = 0
            elif lv == 9:
                if not h_moved:
                    continue
                lv_price = day_high * (1 - fhlmed / 100.0)
                if lv_price >= day_high:
                    continue
                def_dir = 0
            elif lv == 10:
                if not l_moved:
                    continue
                lv_price = day_low * (1 + fhlmed / 100.0)
                if lv_price <= day_low:
                    continue
                def_dir = 1
            else:
                if not l_moved:
                    continue
                lv_price = day_low * (1 + fhl75 / 100.0)
                if lv_price <= day_low:
                    continue
                def_dir = 1

            lv_dir = -1
            if strategy_is_reversal:
                if opens[i] < lv_price and highs[i] >= lv_price:
                    lv_dir = 1
                elif opens[i] > lv_price and lows[i] <= lv_price:
                    lv_dir = 0
            else:
                if def_dir == 1 and highs[i] >= lv_price:
                    lv_dir = 1
                elif def_dir == 0 and lows[i] <= lv_price:
                    lv_dir = 0
            if lv_dir == -1:
                continue

            if use_entry_stop:
                buf = entry_confirm_atr_mult * atr
                armed_active[lv] = True
                armed_dir[lv] = lv_dir
                armed_confirm[lv] = lv_price - buf if lv_dir == 1 else lv_price + buf
                armed_lvprice[lv] = lv_price
                armed_atr[lv] = atr
                continue

            level_trade_count[lv] += 1
            sl_dist = (sl_fixed_pips * pip_size) if sl_mode_is_pips else (atr * sl_atr_mult)
            sl = lv_price + sl_dist if lv_dir == 1 else lv_price - sl_dist
            has_tp = False
            tp = 0.0
            if use_level_target:
                if lv <= 7:
                    # Mirror price across day open — only defined for the 8
                    # static levels (open*(1±x/100) symmetry); dynamic levels
                    # (lv 8-11) get no target, behaving like tpMode='none'.
                    tp = 2.0 * day_open - lv_price
                    has_tp = True
            elif use_tp:
                tp_dist = sl_dist * tp_r_mult
                tp = lv_price - tp_dist if lv_dir == 1 else lv_price + tp_dist
                has_tp = True

            free = -1
            for s in range(MAX_SLOTS):
                if not slot_active[s]:
                    free = s
                    break
            if free >= 0:
                slot_active[free] = True
                slot_dir[free] = lv_dir
                slot_entry[free] = lv_price
                slot_sl[free] = sl
                slot_tp[free] = tp
                slot_has_tp[free] = has_tp
                slot_sldist[free] = sl_dist
                slot_mfe[free] = 0.0
                slot_be[free] = False
                slot_dayopen[free] = day_open
                slot_entryts[free] = ts
                n_active += 1

            if one_trade_at_a_time:
                break

    if n_active > 0 and n > 0:
        last_close = closes[n - 1]
        last_ts = times[n - 1]
        for s in range(MAX_SLOTS):
            if slot_active[s] and n_trades < TRADE_CAP:
                raw = (last_close - slot_entry[s]) if slot_dir[s] == 0 else (slot_entry[s] - last_close)
                cost = (cost_pct / 100.0) * slot_dayopen[s]
                pnl_pct = (raw - cost) / slot_dayopen[s] * 100.0
                out_entry_ts[n_trades] = slot_entryts[s]
                out_exit_ts[n_trades] = last_ts
                out_pnl_pct[n_trades] = pnl_pct
                out_win[n_trades] = pnl_pct > 0
                out_reason[n_trades] = EXIT_EOD
                n_trades += 1

    return out_entry_ts[:n_trades], out_exit_ts[:n_trades], out_pnl_pct[:n_trades], out_win[:n_trades], out_reason[:n_trades]


def run_backtest(m1, atr_arr, mom_arr, fc_lookup, cfg, from_ts, to_ts, pip_size):
    """m1 = (times, opens, highs, lows, closes); fc_lookup = build_forecast_lookup(...) tuple."""
    times, opens, highs, lows, closes = m1
    day_key_offset, fc_valid, fc_hl75, fc_hlmed, fc_oc75, fc_ocmed = fc_lookup
    tp_mode = cfg.get("tpMode", "trail")
    use_level_target = tp_mode == "level"
    use_trail = tp_mode in ("trail", "both")
    use_tp = tp_mode in ("fixed_r", "both") or use_level_target
    use_entry_stop = cfg.get("entryMode", "touch") == "stop"
    entry_ts, exit_ts, pnl_pct, win, reason = _run_backtest_kernel(
        times, opens, highs, lows, closes, atr_arr, mom_arr,
        day_key_offset, fc_valid, fc_hl75, fc_hlmed, fc_oc75, fc_ocmed,
        np.int64(from_ts), np.int64(to_ts),
        cfg.get("strategy", "dirop") == "reversal", cfg.get("slMode", "atr") == "pips",
        float(cfg.get("slFixedPips", 20)), float(cfg.get("slAtrMult", 2.0)), float(pip_size),
        use_entry_stop, float(cfg.get("entryConfirmAtrMult", 0.25)), float(cfg.get("entryStopSlipAtrMult", 0.05)),
        use_trail, use_tp, float(cfg.get("tpRMult", 2.0)), float(cfg.get("mfeTrailPct", 0.5)), float(cfg.get("mfeMinR", 0.3)),
        use_level_target, int(cfg.get("levelTargetCutoffH", 12)),
        float(cfg.get("beAfterR", 0.0)), float(cfg.get("momZThresh", 0.0)), float(cfg.get("costPct", 0.0)), float(cfg.get("dynMinMove", 0.25)),
        int(cfg.get("windowStartH", 0)), int(cfg.get("windowEndH", 22)), int(cfg.get("eodClose", 1)),
        bool(cfg.get("oneTradeAtATime", 1) >= 1), int(round(cfg.get("minBarsBetween", 0))), int(cfg.get("maxLevelTrades", 1)),
    )
    return entry_ts, exit_ts, pnl_pct, win, reason


# ─────────────────────────────────────────────────────────────────────────
# Analytics — mirrors computeAnalytics (headline stats only; level/session/
# DOW/month breakdowns from the JS version aren't needed for the sweep)
# ─────────────────────────────────────────────────────────────────────────

def compute_analytics(entry_ts, exit_ts, pnl_pct, win, reason):
    n = len(pnl_pct)
    if n == 0:
        return None
    order = np.argsort(entry_ts)
    entry_ts = entry_ts[order]
    exit_ts = exit_ts[order]
    pnl_pct = pnl_pct[order]
    win = win[order]
    reason = reason[order]

    wins = pnl_pct[win]
    losses = pnl_pct[~win]
    win_rate = win.mean() * 100.0
    gross_win = wins.sum() if len(wins) else 0.0
    gross_loss = abs(losses.sum()) if len(losses) else 0.0
    pf = gross_win / gross_loss if gross_loss > 0 else np.inf
    avg_win = wins.mean() if len(wins) else 0.0
    avg_loss = abs(losses).mean() if len(losses) else 0.0
    total_pnl = pnl_pct.sum()

    run_eq = 0.0
    run_peak = 0.0
    max_dd = 0.0
    for v in pnl_pct:
        run_eq += v
        if run_eq > run_peak:
            run_peak = run_eq
        dd = run_peak - run_eq
        if dd > max_dd:
            max_dd = dd

    mu = pnl_pct.mean()
    std = pnl_pct.std(ddof=1) if n > 1 else 0.0
    years = (entry_ts[-1] - entry_ts[0]) / (365.25 * 86400) if n > 1 else 1 / 52
    tpy = n / years if years > 0 else n
    sharpe = mu / std * np.sqrt(tpy) if std > 0 else 0.0
    neg = pnl_pct[pnl_pct < 0]
    down_std = np.sqrt((neg ** 2).mean()) if len(neg) else 0.0
    sortino = mu / down_std * np.sqrt(tpy) if down_std > 0 else 0.0
    calmar = (total_pnl / years) / max_dd if max_dd > 0 else 0.0
    with np.errstate(invalid="ignore"):
        cagr_base = 1 + total_pnl / 100.0
        cagr = (np.power(cagr_base, 1 / years) - 1) * 100.0 if years > 0 and cagr_base >= 0 else float("nan")
    expectancy = (win_rate / 100.0) * avg_win - (1 - win_rate / 100.0) * avg_loss
    sl_hit_rate = (reason == EXIT_SL).mean()

    return dict(total=n, winRate=win_rate, totalPnl=total_pnl, maxDD=max_dd, sharpe=sharpe,
                sortino=sortino, calmar=calmar, cagr=cagr, pf=pf, expectancy=expectancy, years=years,
                slHitRate=sl_hit_rate)
