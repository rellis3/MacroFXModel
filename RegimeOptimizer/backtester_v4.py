"""
backtester_v4.py — Python port of the JavaScript V4 regime bot.

Matches regime-backtest.html simulateV4 / computeHMMSignalsV4 exactly so
optimizer results transfer directly to the live bot config.

Designed for repeated calls during parameter search: the expensive HMM signal
computation is separated from the fast simulation loop so signals can be
pre-computed once and reused across thousands of config trials.
"""

import math
from dataclasses import dataclass
from typing import Optional

import numpy as np


# ─── HMM configuration ────────────────────────────────────────────────────────

HMM_CONFIG = {
    "XAU/USD":    {"selfProb": 0.88, "linregN": 40, "adxN": 30},
    "NAS100_USD": {"selfProb": 0.94, "linregN": 60, "adxN": 40},
    "SPX500_USD": {"selfProb": 0.93, "linregN": 55, "adxN": 40},
    "DE30_USD":   {"selfProb": 0.93, "linregN": 55, "adxN": 40},
    "UK100_GBP":  {"selfProb": 0.93, "linregN": 55, "adxN": 40},
    "_default":   {"selfProb": 0.92, "linregN": 50, "adxN": 50},
}

DEFAULT_MEANS = np.array([
    [ 1.0,  0.0,  0.7],   # BULL  — positive trend, normal vol, above-avg ADX
    [-1.0,  0.0,  0.7],   # BEAR  — negative trend, normal vol, above-avg ADX
    [ 0.0,  0.0, -1.0],   # RANGE — flat, quiet, low ADX
    [ 0.0,  0.8, -0.8],   # CHOP  — elevated vol + below-avg ADX
], dtype=float)

STATE_NAMES = ["BULL", "BEAR", "RANGE", "CHOP"]
K = 4
WARMUP = 110


# ─── V4 default config (matches regime-backtest.html V4_DEFAULTS) ─────────────

V4_DEFAULTS: dict = {
    "entry_conf": 70.0,          "candle_hold": 2,
    "entry_score_min": 65.0,     "sl_atr_mult": 1.8,
    "window_start": 7,           "window_end": 20,
    "post_exit_cooldown": 0,
    "max_range_hold_bars": 30,   "mfe_trail_r": 1.0,
    "mfe_suppress_r": 1.5,
    "conf_floor": 45.0,          "drop_thresh": 15.0,
    "slope_thresh": -5.0,        "slope_bars": 3,
    "bocpd_thresh": 70.0,        "bocpd_exit_bars": 4,
    "bocpd_exit_bars_range": 8,
    "hold_score_min": 40.0,      "score_drop_exit": 30.0,
    "score_drop_bars": 2,
    "mfe_retrace_pct": 0.25,     "mfe_min_r": 1.0,
    "decay_exit": 0.70,
}


# ─── Feature computation (vectorised where possible) ──────────────────────────

def _wilder_atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, n: int) -> np.ndarray:
    N = len(close)
    out = np.zeros(N)
    out[0] = high[0] - low[0]
    k = 1.0 / n
    for i in range(1, N):
        tr = max(high[i] - low[i], abs(high[i] - close[i - 1]), abs(low[i] - close[i - 1]))
        out[i] = k * tr + (1 - k) * out[i - 1] if tr > 0 else out[i - 1]
    return out


def _wilder_adx(high: np.ndarray, low: np.ndarray, close: np.ndarray, n: int) -> np.ndarray:
    N = len(close)
    out = np.zeros(N)
    if N < n * 2 + 2:
        return out

    dm_p = np.zeros(N - 1)
    dm_m = np.zeros(N - 1)
    tr_a = np.zeros(N - 1)
    for i in range(1, N):
        h, l   = high[i],     low[i]
        ph, pl = high[i - 1], low[i - 1]
        pc     = close[i - 1]
        up, dn = h - ph, pl - l
        dm_p[i - 1] = up if (up > dn and up > 0) else 0.0
        dm_m[i - 1] = dn if (dn > up and dn > 0) else 0.0
        tr_a[i - 1] = max(h - l, abs(h - pc), abs(l - pc))

    s_dmp = dm_p[:n].sum()
    s_dmm = dm_m[:n].sum()
    s_tr  = tr_a[:n].sum()
    dx_list = []
    for i in range(n, len(dm_p)):
        s_dmp = s_dmp - s_dmp / n + dm_p[i]
        s_dmm = s_dmm - s_dmm / n + dm_m[i]
        s_tr  = s_tr  - s_tr  / n + tr_a[i]
        if s_tr < 1e-10:
            dx_list.append(0.0)
            continue
        dip = s_dmp / s_tr * 100
        dim = s_dmm / s_tr * 100
        dx_list.append(abs(dip - dim) / (dip + dim) * 100 if (dip + dim) > 0 else 0.0)

    dx = np.array(dx_list)
    if len(dx) < n:
        return out

    adx_val = dx[:n].mean()
    off = n * 2
    if off < N:
        out[off] = adx_val
    for i in range(n, len(dx)):
        adx_val = (adx_val * (n - 1) + dx[i]) / n
        if i + n < N:
            out[i + n] = adx_val
    if out[-1] == 0.0 and N > 1:
        out[-1] = out[-2]
    return out


def _rolling_z(arr: np.ndarray, w: int = 200) -> np.ndarray:
    N = len(arr)
    out = np.zeros(N)
    s = sq = 0.0
    for i in range(N):
        v = arr[i]
        s += v; sq += v * v
        if i >= w:
            old = arr[i - w]; s -= old; sq -= old * old
        cnt = min(i + 1, w)
        if cnt < 5:
            continue
        mu  = s / cnt
        var = max(0.0, sq / cnt - mu * mu)
        std = math.sqrt(var)
        out[i] = (v - mu) / std if std > 1e-12 else 0.0
    return out


def _linreg_slopes(closes: np.ndarray, n: int) -> np.ndarray:
    N = len(closes)
    out = np.zeros(N)
    x   = np.arange(n, dtype=float) - (n - 1) / 2.0
    sX2 = float((x * x).sum())
    if sX2 == 0:
        return out
    for i in range(n - 1, N):
        out[i] = float((x * closes[i - n + 1:i + 1]).sum()) / sX2
    return out


def _build_trans_matrix(self_prob: float) -> np.ndarray:
    off = (1.0 - self_prob) / (K - 1)
    A = np.full((K, K), off)
    np.fill_diagonal(A, self_prob)
    return A


def _session_trans_matrix(A: np.ndarray, hour_utc: int) -> np.ndarray:
    if 2 <= hour_utc < 17:
        return A
    A2 = A.copy()
    for i in range(K):
        self_p = A2[i, i]
        boost  = min(0.97, self_p + (1 - self_p) * 0.2)
        scale  = (1 - boost) / max(1 - self_p, 1e-10)
        A2[i]  = A2[i] * scale
        A2[i, i] = boost
    return A2


def _session_mult(ts: int) -> float:
    h = int((ts // 3600) % 24)
    if 8 <= h < 21:
        return 1.00
    if h < 8:
        return 0.75
    return 0.80


# ─── Signal computation ───────────────────────────────────────────────────────

def compute_signals_v4(bars: dict, sym: str = "EUR/USD", trained_params: Optional[dict] = None) -> list:
    """
    Compute V2 HMM signals (4-state: BULL/BEAR/RANGE/CHOP) and add V4-specific
    fields: bocpd_trend (OLS slope of last 5 BOCPD values) and v4_score.

    bars: dict with numpy arrays {time, open, high, low, close}
    Returns: list[dict | None] — None for warmup bars, dict otherwise.
    """
    cfg     = HMM_CONFIG.get(sym, HMM_CONFIG["_default"])
    ln      = cfg["linregN"]
    adx_n   = cfg["adxN"]
    warmup  = max(WARMUP, ln + 50)

    time_a  = bars["time"]
    high_a  = bars["high"]
    low_a   = bars["low"]
    close_a = bars["close"]
    N       = len(close_a)

    # Pre-compute features
    atr_hmm = _wilder_atr(high_a, low_a, close_a, 20)   # HMM vol feature
    atr_sl  = _wilder_atr(high_a, low_a, close_a, 70)   # SL distance (ATR14 M5 equivalent)
    adx     = _wilder_adx(high_a, low_a, close_a, adx_n)
    trend   = _linreg_slopes(close_a, ln)
    tZ      = _rolling_z(trend,   200)
    vZ      = _rolling_z(atr_hmm, 200)
    aZ      = _rolling_z(adx,     200)

    # HMM parameters (learned or defaults)
    if trained_params and sym in trained_params:
        lp       = trained_params[sym]
        means    = np.array(lp["means"],      dtype=float)
        variances = np.array(lp["vars"],       dtype=float)
        base_A   = np.array(lp["transMatrix"], dtype=float)
    else:
        means     = DEFAULT_MEANS.copy()
        variances = np.ones((K, 3), dtype=float)
        base_A    = _build_trans_matrix(cfg["selfProb"])

    log_alpha   = np.full(K, math.log(1.0 / K))
    signals     = [None] * N
    prev_regime = None
    regime_bars = 0

    for i in range(1, N):
        obs      = np.array([tZ[i], vZ[i], aZ[i]])
        hour_utc = int((int(time_a[i]) // 3600) % 24)
        A        = _session_trans_matrix(base_A, hour_utc)
        log_A    = np.log(np.clip(A, 1e-300, None))  # shape (K, K)

        new_log_alpha = np.zeros(K)
        for j in range(K):
            trans = log_alpha + log_A[:, j]          # log P(from → j) for each from-state
            mx    = trans.max()
            lse   = mx + math.log(np.exp(trans - mx).sum())
            em    = -0.5 * (((obs - means[j]) ** 2) / np.clip(variances[j], 1e-6, None)).sum()
            em   -= 0.5 * np.log(np.clip(variances[j], 1e-6, None)).sum()
            new_log_alpha[j] = lse + em
        log_alpha = new_log_alpha

        if i < warmup:
            continue

        mx    = log_alpha.max()
        exps  = np.exp(log_alpha - mx)
        probs = exps / exps.sum()
        best  = int(probs.argmax())

        regime = STATE_NAMES[best]
        conf   = float(probs[best]) * 100.0

        if regime != prev_regime:
            prev_regime = regime
            regime_bars = 1
        else:
            regime_bars += 1

        rl     = min(1.0, regime_bars / 480)
        decay  = min(0.99, 1.0 - math.exp(-regime_bars / 180))
        slope  = float((trend[i] - trend[i - 3]) * 1000) if i >= 3 else 0.0
        bocpd  = min(100.0, abs(tZ[i]) * 15.0 + abs(vZ[i]) * 10.0)

        signals[i] = {
            "ts":     int(time_a[i]),
            "regime": regime,
            "conf":   conf,
            "pBull":  float(probs[0]) * 100,
            "pBear":  float(probs[1]) * 100,
            "pRange": float(probs[2]) * 100,
            "pChop":  float(probs[3]) * 100,
            "vz":     float(vZ[i]),
            "rl":     rl,
            "decay":  decay,
            "slope":  slope,
            "bocpd":  bocpd,
            "atr":    float(atr_hmm[i]),
            "atrSL":  float(atr_sl[i]),
        }

    # ── V4 second pass: bocpd_trend + v4_score ────────────────────────────────
    BTREND_W  = 5
    bval_buf  = []

    for i in range(N):
        sig = signals[i]
        if sig is None:
            continue

        bval_buf.append(sig["bocpd"])
        if len(bval_buf) > BTREND_W:
            bval_buf.pop(0)

        bvals = np.array(bval_buf)
        n     = len(bvals)
        bocpd_trend = 0.0
        if n >= 2:
            x   = np.arange(n, dtype=float) - (n - 1) / 2.0
            sX2 = float((x * x).sum())
            bocpd_trend = float((x * bvals).sum() / sX2) if sX2 > 0 else 0.0
        sig["bocpd_trend"] = bocpd_trend

        # V4 7-component score (DXY / consensus / vol / credit all neutral in backtest)
        hmm_s   = max(0.0, min(100.0, (sig["conf"] - 65.0) / 35.0 * 100.0))
        bocpd_s = max(0.0, 100.0 - sig["bocpd"])
        if bocpd_trend > 10.0:
            bocpd_s = max(0.0, bocpd_s - bocpd_trend)   # rising-trend penalty

        sm      = _session_mult(sig["ts"])
        sess_s  = max(0.0, min(100.0, (sm - 0.70) / 0.30 * 100.0))

        # Neutral contribution: DXY=50×0.10 + cons=50×0.10 + vol=75×0.05 + credit=50×0.05 = 16.25
        sig["v4_score"] = min(100.0,
            hmm_s   * 0.35 +
            bocpd_s * 0.20 +
            sess_s  * 0.15 +
            16.25
        )

    return signals


# ─── Trade dataclass ──────────────────────────────────────────────────────────

@dataclass
class Trade:
    direction:      str
    entry_ts:       int
    entry_price:    float
    exit_ts:        int
    exit_price:     float
    exit_reason:    str
    sl:             float
    orig_sl_dist:   float
    pnl_pct:        float
    pnl_r:          float
    mfe_r:          float
    risk_pct:       float
    regime:         str
    conf_at_entry:  float
    decay_at_entry: float
    entry_score:    float
    duration_min:   int
    win:            bool
    state_at_exit:  str   # TREND_HOLD or RANGE_HOLD


# ─── V4 simulation ────────────────────────────────────────────────────────────

def simulate_v4(bars: dict, signals: list, cfg: dict,
                spread_pips: float = 1.0, pip_size: float = 0.0001) -> list[Trade]:
    """
    Simulate V4 regime bot bar-by-bar on pre-computed signals.

    spread_pips: round-trip cost in pips (default 1.0 pip for major FX).
    pip_size:    pip value as price fraction (0.0001 for FX majors, 0.01 for JPY).

    Key V4 behaviour:
      - RANGE-hold state machine: RANGE/CHOP → RANGE_HOLD (hold, don't close)
      - RANGE_HOLD exits: reversal, conf-floor, extended-BOCPD, MFE-retrace, decay, timeout
      - RANGE_HOLD suppresses: X3/X4 (slope/conf-drop), X11/X12 (score exits)
      - Breakeven trail: SL → entry price once MFE ≥ mfe_trail_r (orig SL used for R calcs)
      - X3/X4 in TREND_HOLD suppressed when MFE ≥ mfe_suppress_r
    """
    time_a  = bars["time"]
    high_a  = bars["high"]
    low_a   = bars["low"]
    close_a = bars["close"]
    N = len(time_a)

    # Round-trip spread as % of price (applied in _mk_trade)
    # Using mid-price from close_a[0] to convert pips → %
    ref_price   = float(close_a[close_a > 0][0]) if close_a[close_a > 0].size else 1.0
    spread_pct  = spread_pips * pip_size / ref_price * 100.0

    ec         = cfg["entry_conf"]
    ch         = cfg["candle_hold"]
    esm        = cfg["entry_score_min"]
    sl_mult    = cfg["sl_atr_mult"]
    ws         = cfg["window_start"]
    we         = cfg["window_end"]
    cooldown_n = cfg["post_exit_cooldown"]
    mrhb       = cfg["max_range_hold_bars"]
    mtr        = cfg["mfe_trail_r"]
    msr        = cfg["mfe_suppress_r"]
    cf         = cfg["conf_floor"]
    dt         = cfg["drop_thresh"]
    st         = cfg["slope_thresh"]
    sb         = cfg["slope_bars"]
    bt         = cfg["bocpd_thresh"]
    beb        = cfg["bocpd_exit_bars"]
    bebr       = cfg["bocpd_exit_bars_range"]
    hsm        = cfg["hold_score_min"]
    sde        = cfg["score_drop_exit"]
    sdb        = cfg["score_drop_bars"]
    mrp        = cfg["mfe_retrace_pct"]
    mmr        = cfg["mfe_min_r"]
    de         = cfg["decay_exit"]

    trades     = []
    pos        = None
    debounce   = 0
    cooldown   = 0
    prev_conf  = None

    for i in range(WARMUP, N):
        sig = signals[i]
        if sig is None:
            continue

        bar_ts    = int(time_a[i])
        bar_high  = float(high_a[i])
        bar_low   = float(low_a[i])
        bar_close = float(close_a[i])
        hour_utc  = int((bar_ts // 3600) % 24)
        in_win    = ws <= hour_utc < we
        sm        = _session_mult(bar_ts)
        eff_conf  = sig["conf"] * sm
        conf_drop = (prev_conf - sig["conf"]) if prev_conf is not None else 0.0
        score     = sig.get("v4_score", sig.get("score", 0.0))

        if pos is not None:
            # ── SL check ──────────────────────────────────────────────────────
            sl_hit = ((pos["dir"] == "LONG"  and bar_low  <= pos["sl"]) or
                      (pos["dir"] == "SHORT" and bar_high >= pos["sl"]))
            if sl_hit:
                trades.append(_mk_trade(pos, bar_ts, pos["sl"], "SL", spread_pct))
                pos = None; debounce = 0; cooldown = cooldown_n
                prev_conf = sig["conf"]; continue

            # ── MFE update (always use original SL dist for consistent R values) ──
            fav = (bar_high - pos["ep"]) if pos["dir"] == "LONG" else (pos["ep"] - bar_low)
            if fav > pos["mfe"]:
                pos["mfe"] = fav
            pos["mfe_r"] = pos["mfe"] / pos["osd"] if pos["osd"] > 0 else 0.0

            # ── Breakeven trail ───────────────────────────────────────────────
            if pos["mfe_r"] >= mtr:
                if pos["dir"] == "LONG"  and pos["sl"] < pos["ep"]: pos["sl"] = pos["ep"]
                if pos["dir"] == "SHORT" and pos["sl"] > pos["ep"]: pos["sl"] = pos["ep"]

            xp     = bar_close
            exited = False
            flipped   = pos["regime"] != sig["regime"]
            is_range  = sig["regime"] in ("RANGE", "CHOP")
            opp_dir   = ((pos["dir"] == "LONG"  and sig["regime"] == "BEAR") or
                         (pos["dir"] == "SHORT" and sig["regime"] == "BULL"))

            state = pos["state"]

            # ── TREND_HOLD exit logic ──────────────────────────────────────────
            if state == "TREND_HOLD":
                if flipped and is_range:
                    pos["state"] = "RANGE_HOLD"
                    pos["rb"]    = 0
                    pos["bct"]   = 0

                elif flipped and opp_dir:
                    trades.append(_mk_trade(pos, bar_ts, xp, "REGIME_FLIP", spread_pct)); exited = True

                else:
                    # X2: conf floor
                    if not exited and sig["conf"] < cf:
                        trades.append(_mk_trade(pos, bar_ts, xp, "CONF_FLOOR", spread_pct)); exited = True
                    # X4: conf drop (off when MFE ≥ mfe_suppress_r)
                    if not exited and conf_drop >= dt and pos["mfe_r"] < msr:
                        trades.append(_mk_trade(pos, bar_ts, xp, "CONF_DROP", spread_pct)); exited = True
                    # X3: slope (off when MFE ≥ mfe_suppress_r)
                    if not exited:
                        if sig["slope"] < st and pos["mfe_r"] < msr:
                            pos["sct"] += 1
                            if pos["sct"] >= sb:
                                trades.append(_mk_trade(pos, bar_ts, xp, "SLOPE", spread_pct)); exited = True
                        else:
                            pos["sct"] = 0
                    # X6: BOCPD (fast in TREND_HOLD)
                    if not exited:
                        if sig["bocpd"] >= bt:
                            pos["bct"] += 1
                            if pos["bct"] >= beb:
                                trades.append(_mk_trade(pos, bar_ts, xp, "BOCPD", spread_pct)); exited = True
                        else:
                            pos["bct"] = 0
                    # X11/X12: score exits
                    if not exited:
                        if score < hsm:
                            pos["slct"] += 1
                            if pos["slct"] >= sdb:
                                trades.append(_mk_trade(pos, bar_ts, xp, "SCORE_LOW", spread_pct)); exited = True
                        else:
                            pos["slct"] = 0
                        if not exited and (pos["es"] - score) >= sde:
                            trades.append(_mk_trade(pos, bar_ts, xp, "SCORE_DROP", spread_pct)); exited = True
                    # X13: MFE retrace
                    if not exited and pos["mfe_r"] >= mmr and pos["mfe"] > 0:
                        cur_fav = (xp - pos["ep"]) if pos["dir"] == "LONG" else (pos["ep"] - xp)
                        retrace = (pos["mfe"] - max(0.0, cur_fav)) / pos["mfe"]
                        if retrace >= mrp:
                            trades.append(_mk_trade(pos, bar_ts, xp, "MFE_RETRACE", spread_pct)); exited = True
                    # X5: decay
                    if not exited and sig["decay"] >= de:
                        trades.append(_mk_trade(pos, bar_ts, xp, "DECAY", spread_pct)); exited = True

            # ── RANGE_HOLD exit logic ──────────────────────────────────────────
            elif state == "RANGE_HOLD":
                pos["rb"] += 1

                # X1_reverse: opposite direction → exit
                if not exited and opp_dir:
                    trades.append(_mk_trade(pos, bar_ts, xp, "REGIME_FLIP", spread_pct)); exited = True
                # X2: conf floor (emergency exit, always active)
                if not exited and sig["conf"] < cf:
                    trades.append(_mk_trade(pos, bar_ts, xp, "CONF_FLOOR", spread_pct)); exited = True
                # X6: BOCPD with extended patience
                if not exited:
                    if sig["bocpd"] >= bt:
                        pos["bct"] += 1
                        if pos["bct"] >= bebr:
                            trades.append(_mk_trade(pos, bar_ts, xp, "BOCPD", spread_pct)); exited = True
                    else:
                        pos["bct"] = 0
                # X13: MFE retrace (primary profit-lock while holding)
                if not exited and pos["mfe_r"] >= mmr and pos["mfe"] > 0:
                    cur_fav = (xp - pos["ep"]) if pos["dir"] == "LONG" else (pos["ep"] - xp)
                    retrace = (pos["mfe"] - max(0.0, cur_fav)) / pos["mfe"]
                    if retrace >= mrp:
                        trades.append(_mk_trade(pos, bar_ts, xp, "MFE_RETRACE", spread_pct)); exited = True
                # X5: decay
                if not exited and sig["decay"] >= de:
                    trades.append(_mk_trade(pos, bar_ts, xp, "DECAY", spread_pct)); exited = True
                # X_rt: range timeout
                if not exited and pos["rb"] >= mrhb:
                    trades.append(_mk_trade(pos, bar_ts, xp, "RANGE_TIMEOUT", spread_pct)); exited = True
                # Resume: original regime returned → back to TREND_HOLD
                if not exited and sig["regime"] == pos["regime"]:
                    pos["state"] = "TREND_HOLD"
                    pos["rb"]    = 0
                    pos["bct"]   = 0

            if exited:
                pos = None; debounce = 0; cooldown = cooldown_n

        if cooldown > 0:
            cooldown -= 1
            prev_conf = sig["conf"]
            continue

        # ── Entry ─────────────────────────────────────────────────────────────
        if pos is None and in_win:
            is_dir   = sig["regime"] in ("BULL", "BEAR")
            ok_conf  = eff_conf >= ec
            ok_score = score    >= esm
            ok_slope = ((sig["regime"] == "BULL" and sig["slope"] > 0) or
                        (sig["regime"] == "BEAR" and sig["slope"] < 0))

            if is_dir and ok_conf and ok_score and ok_slope:
                debounce += 1
                if debounce >= ch and sig["atrSL"] > 0:
                    direction = "LONG" if sig["regime"] == "BULL" else "SHORT"
                    ep        = bar_close
                    osd       = sig["atrSL"] * sl_mult   # original SL distance
                    sl        = ep - osd if direction == "LONG" else ep + osd
                    pos = {
                        "dir":    direction, "regime": sig["regime"],
                        "ep":     ep,        "sl":     sl,
                        "osd":    osd,       "es":     score,
                        "entry_ts": bar_ts,
                        "conf_entry": sig["conf"], "decay_entry": sig["decay"],
                        "mfe":    0.0,   "mfe_r":  0.0,
                        "sct":    0,     "bct":    0,     "slct": 0,
                        "state":  "TREND_HOLD",            "rb":  0,
                    }
                    debounce = 0
            else:
                debounce = 0
        elif pos is None:
            debounce = 0

        prev_conf = sig["conf"]

    # Close any open position at end of data
    if pos is not None:
        trades.append(_mk_trade(pos, int(time_a[-1]), float(close_a[-1]), "END", spread_pct))

    return trades


def _mk_trade(pos: dict, exit_ts: int, exit_price: float, reason: str,
              spread_pct: float = 0.0) -> Trade:
    sign     = 1.0 if pos["dir"] == "LONG" else -1.0
    gross    = (exit_price - pos["ep"]) / pos["ep"] * sign * 100.0
    pnl_pct  = gross - spread_pct          # deduct round-trip spread cost
    risk_pct = pos["osd"] / pos["ep"] * 100.0
    pnl_r    = pnl_pct / risk_pct if risk_pct > 0 else 0.0
    mfe_r    = (pos["mfe"] / pos["ep"] * 100.0) / risk_pct if risk_pct > 0 else 0.0
    return Trade(
        direction=pos["dir"],         entry_ts=pos["entry_ts"],
        entry_price=pos["ep"],        exit_ts=exit_ts,
        exit_price=exit_price,        exit_reason=reason,
        sl=pos["sl"],                 orig_sl_dist=pos["osd"],
        pnl_pct=pnl_pct,             pnl_r=pnl_r,
        mfe_r=mfe_r,                 risk_pct=risk_pct,
        regime=pos["regime"],        conf_at_entry=pos["conf_entry"],
        decay_at_entry=pos["decay_entry"], entry_score=pos["es"],
        duration_min=round((exit_ts - pos["entry_ts"]) / 60),
        win=pnl_pct > 0,
        state_at_exit=pos.get("state", "TREND_HOLD"),
    )


# ─── V5: MTF aggregation + mapping ───────────────────────────────────────────

def aggregate_to_mtf(bars: dict, minutes: int) -> dict:
    """Aggregate M1 bars to a higher timeframe (e.g. 30, 60, 240 minutes)."""
    if minutes <= 1:
        return bars
    period_sec = minutes * 60
    time_a  = bars["time"]
    open_a  = bars["open"]
    high_a  = bars["high"]
    low_a   = bars["low"]
    close_a = bars["close"]

    periods: dict[int, list] = {}
    for i in range(len(time_a)):
        ps = int(time_a[i] // period_sec) * period_sec
        if ps not in periods:
            periods[ps] = [float(open_a[i]), float(high_a[i]), float(low_a[i]), float(close_a[i])]
        else:
            p = periods[ps]
            if high_a[i] > p[1]: p[1] = float(high_a[i])
            if low_a[i]  < p[2]: p[2] = float(low_a[i])
            p[3] = float(close_a[i])

    keys = sorted(periods.keys())
    return {
        "time":  np.array(keys,                              dtype=float),
        "open":  np.array([periods[k][0] for k in keys],    dtype=float),
        "high":  np.array([periods[k][1] for k in keys],    dtype=float),
        "low":   np.array([periods[k][2] for k in keys],    dtype=float),
        "close": np.array([periods[k][3] for k in keys],    dtype=float),
    }


def compute_signals_v5(bars: dict, sym: str = "EUR/USD",
                       mtf_minutes: int = 30,
                       trained_params: Optional[dict] = None) -> list:
    """
    Compute regime signals on MTF bars (e.g. 30m, 1h, 4h), then map back
    to M1 bars with strict no-look-ahead: a completed MTF bar is only available
    to M1 bars that start AFTER that bar's period closes.
    """
    if mtf_minutes <= 1:
        return compute_signals_v4(bars, sym, trained_params)

    mtf_bars    = aggregate_to_mtf(bars, mtf_minutes)
    mtf_signals = compute_signals_v4(mtf_bars, sym, trained_params)
    period_sec  = mtf_minutes * 60

    # (validFrom, signal) — MTF bar closing at T valid from T + period_sec
    valid = [(sig["ts"] + period_sec, sig)
             for sig in mtf_signals if sig is not None]

    N   = len(bars["time"])
    out = [None] * N
    vi  = -1
    for i in range(N):
        t = float(bars["time"][i])
        while vi + 1 < len(valid) and valid[vi + 1][0] <= t:
            vi += 1
        if vi >= 0:
            out[i] = {**valid[vi][1], "ts": int(t)}

    return out


def simulate_v5(bars: dict, signals: list, cfg: dict,
                mtf_minutes: int = 30,
                spread_pips: float = 1.0, pip_size: float = 0.0001) -> list[Trade]:
    """
    V5 simulation: V4 state machine with bar-count params scaled from
    MTF-bar units → M1 bars. cfg values for candle_hold etc. are expressed
    in MTF-bar units (matching the HTML backtester UI labels).
    """
    S = max(1, mtf_minutes)
    scaled = {
        **cfg,
        "candle_hold":           int(cfg.get("candle_hold",           2) * S),
        "post_exit_cooldown":    int(cfg.get("post_exit_cooldown",    4) * S),
        "max_range_hold_bars":   int(cfg.get("max_range_hold_bars",  16) * S),
        "bocpd_exit_bars":       int(cfg.get("bocpd_exit_bars",       4) * S),
        "bocpd_exit_bars_range": int(cfg.get("bocpd_exit_bars_range", 8) * S),
        "slope_bars":            int(cfg.get("slope_bars",            3) * S),
        "score_drop_bars":       int(cfg.get("score_drop_bars",       2) * S),
    }
    return simulate_v4(bars, signals, scaled, spread_pips=spread_pips, pip_size=pip_size)


# ─── Analytics ────────────────────────────────────────────────────────────────

def compute_analytics(trades: list[Trade]) -> Optional[dict]:
    if not trades:
        return None

    pnls      = np.array([t.pnl_pct for t in trades])
    wins_mask = pnls > 0
    wins      = pnls[wins_mask]
    losses    = pnls[~wins_mask & (pnls != 0)]

    win_rate   = float(wins_mask.sum()) / len(pnls) * 100.0
    gross_win  = float(wins.sum())   if len(wins)   > 0 else 0.0
    gross_loss = float(abs(losses.sum())) if len(losses) > 0 else 0.0
    pf         = gross_win / gross_loss if gross_loss > 0 else (99.0 if gross_win > 0 else 0.0)

    equity = np.cumsum(pnls)
    peak   = np.maximum.accumulate(equity)
    max_dd = float((peak - equity).max())
    total_pnl = float(equity[-1])

    # ── Daily Sharpe (annualised) ─────────────────────────────────────────────
    # Aggregate closed PnL by calendar day (exit date), then use sqrt(252).
    # This avoids the per-trade annualisation inflation that makes high-frequency
    # configs look deceptively good.
    day_pnl: dict = {}
    for t in trades:
        day = int(t.exit_ts) // 86400   # calendar day key
        day_pnl[day] = day_pnl.get(day, 0.0) + t.pnl_pct

    if len(day_pnl) >= 5:
        dpnls  = np.array(list(day_pnl.values()))
        dmean  = float(dpnls.mean())
        dstd   = float(dpnls.std())
        sharpe = dmean / dstd * math.sqrt(252) if dstd > 1e-9 else 0.0
        dneg   = dpnls[dpnls < 0]
        ddown  = math.sqrt(float((dneg ** 2).mean())) if len(dneg) > 0 else 0.0
        sortino = dmean / ddown * math.sqrt(252) if ddown > 1e-9 else 0.0
    else:
        sharpe  = 0.0
        sortino = 0.0

    sorted_ts = sorted(trades, key=lambda t: t.exit_ts)
    t_span = (sorted_ts[-1].exit_ts - sorted_ts[0].entry_ts) / (365.25 * 86400) if len(trades) > 1 else 1 / 52
    tpy    = len(trades) / max(t_span, 1 / 52)
    calmar = total_pnl / max_dd if max_dd > 0 else 0.0

    avg_duration = float(np.mean([t.duration_min for t in trades]))

    avg_win  = float(wins.mean())   if len(wins)   > 0 else 0.0
    avg_loss = float(abs(losses.mean())) if len(losses) > 0 else 0.0
    rr_ratio = avg_win / avg_loss   if avg_loss   > 0 else 0.0
    expectancy = win_rate / 100 * avg_win - (1 - win_rate / 100) * avg_loss

    by_reason: dict = {}
    for t in trades:
        r = t.exit_reason
        if r not in by_reason:
            by_reason[r] = {"count": 0, "wins": 0, "pnl": 0.0}
        by_reason[r]["count"] += 1
        by_reason[r]["pnl"]   += t.pnl_pct
        if t.win:
            by_reason[r]["wins"] += 1

    by_regime: dict = {}
    for t in trades:
        r = t.regime
        if r not in by_regime:
            by_regime[r] = {"count": 0, "wins": 0, "pnl": 0.0}
        by_regime[r]["count"] += 1
        by_regime[r]["pnl"]   += t.pnl_pct
        if t.win:
            by_regime[r]["wins"] += 1

    range_holds = sum(1 for t in trades if t.state_at_exit == "RANGE_HOLD")

    return {
        "total":       len(trades),
        "wins":        int(wins_mask.sum()),
        "losses":      int((~wins_mask & (pnls != 0)).sum()),
        "win_rate":    win_rate,
        "pf":          pf,
        "sharpe":      sharpe,
        "sortino":     sortino,
        "calmar":      calmar,
        "max_dd":      max_dd,
        "total_pnl":   total_pnl,
        "avg_win":     avg_win,
        "avg_loss":    avg_loss,
        "rr_ratio":    rr_ratio,
        "expectancy":  expectancy,
        "tpy":              tpy,
        "avg_duration_min": avg_duration,
        "equity":           equity.tolist(),
        "by_reason":        by_reason,
        "by_regime":        by_regime,
        "range_holds":      range_holds,
    }
