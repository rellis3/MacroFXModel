"""
backtester_v1v2v6.py — Python port of the JavaScript V1, V2 and V6 regime bots.

Matches regime-backtest.html computeHMMSignalsV1 / computeHMMSignalsV2 /
simulateV1 / simulateV2 / simulateV6 exactly so optimizer results transfer
directly to the live bot configs.

V1 — 3-state HMM (BULL/BEAR/RANGE), simplest gating, has a trading-window
     forced exit, no entry score (always 0).
V2 — 4-state HMM (BULL/BEAR/RANGE/CHOP), composite 0-100 score with 6
     weighted components, 8 hard entry gates (one hardcoded: bocpd < 55),
     8 exit gates including MFE-retrace profit lock.
V6 — reuses the V4/V5 MTF-aggregated 4-state signal pipeline
     (backtester_v4.compute_signals_v5) but with a stripped-back simulate
     loop: SL/breakeven, opposite-regime-flip, conf-floor, MFE-retrace and
     max-hold-timeout only. No RANGE_HOLD state machine — RANGE/CHOP alone
     never closes a position.
"""

import math

import numpy as np

from backtester_v4 import (
    DEFAULT_MEANS,
    K,
    STATE_NAMES,
    WARMUP,
    _build_trans_matrix,
    _linreg_slopes,
    _mk_trade,
    _rolling_z,
    _session_mult,
    _session_trans_matrix,
    _wilder_adx,
    _wilder_atr,
)

__all__ = [
    "V1_DEFAULTS", "V2_DEFAULTS", "V6_DEFAULTS",
    "V1_PARAM_SPEC", "V2_PARAM_SPEC", "V6_PARAM_SPEC",
    "cfg_from_trial",
    "compute_signals_v1", "compute_signals_v2",
    "simulate_v1", "simulate_v2", "simulate_v6",
]


# ─── V1 HMM configuration (3-state, per-symbol incl. dirAdxTarget) ────────────

HMM_CONFIG_V1 = {
    "XAU/USD":    {"selfProb": 0.88, "linregN": 40, "adxN": 30, "dirAdxTarget": 0.7},
    "NAS100_USD": {"selfProb": 0.94, "linregN": 60, "adxN": 40, "dirAdxTarget": 0.7},
    "_default":   {"selfProb": 0.92, "linregN": 50, "adxN": 50, "dirAdxTarget": 0.5},
}

# V2 reuses the same per-symbol table as V4/V5 (backtester_v4.HMM_CONFIG),
# imported lazily below to avoid a circular naming clash with HMM_CONFIG_V1.
from backtester_v4 import HMM_CONFIG as HMM_CONFIG_V2  # noqa: E402

STATE_NAMES_V1 = ["BULL", "BEAR", "RANGE"]


def _lse3(a: float, b: float, c: float) -> float:
    mx = max(a, b, c)
    return mx + math.log(math.exp(a - mx) + math.exp(b - mx) + math.exp(c - mx))


def _gauss_ll_unit(x: float, mu: float) -> float:
    return -0.5 * (x - mu) ** 2


# ─── V1 default config (matches regime-backtest.html V1_DEFAULTS) ────────────

V1_DEFAULTS: dict = {
    "min_confidence": 65,        "candle_hold": 3,
    "vol_z_max": 2.5,            "entry_decay_max": 0.25,
    "decay_exit": 0.70,          "sl_atr_mult": 1.8,
    "range_exit_hold": 2,        "window_start": 7,
    "window_end": 20,            "post_exit_cooldown": 0,
    "exit_on_range": True,
}

# (key, kind, low, high, step) — kind in {"int", "float", "bool"}
V1_PARAM_SPEC = [
    ("min_confidence",     "int",   50,   90,   1),
    ("candle_hold",        "int",    1,   20,   1),
    ("vol_z_max",          "float", 0.5,  5.0,  0.1),
    ("entry_decay_max",    "float", 0.01, 0.50, 0.01),
    ("decay_exit",         "float", 0.30, 0.99, 0.01),
    ("sl_atr_mult",        "float", 0.5,  4.0,  0.1),
    ("range_exit_hold",    "int",    0,   10,   1),
    ("window_start",       "int",    0,   12,   1),
    ("window_end",         "int",   12,   23,   1),
    ("post_exit_cooldown", "int",    0,  240,   1),
    ("exit_on_range",      "bool", None, None, None),
]


# ─── V2 default config (matches regime-backtest.html V2_DEFAULTS) ────────────

V2_DEFAULTS: dict = {
    "entry_conf": 70,            "candle_hold": 2,
    "vol_z_max": 2.5,            "entry_decay_max": 0.25,
    "entry_score_min": 55,       "sl_atr_mult": 1.8,
    "conf_floor": 45,            "drop_thresh": 15,
    "slope_thresh": -5,          "slope_bars": 3,
    "bocpd_thresh": 70,          "bocpd_exit_bars": 2,
    "decay_exit": 0.70,          "hold_score_min": 40,
    "score_drop_exit": 30,       "score_drop_bars": 2,
    "mfe_retrace_pct": 0.25,     "mfe_min_r": 1.0,
    "range_exit_hold": 2,        "window_start": 7,
    "window_end": 20,            "post_exit_cooldown": 0,
    "exit_on_range": True,       "require_rising_conf": True,
}

V2_PARAM_SPEC = [
    ("entry_conf",         "int",   50,   95,   1),
    ("candle_hold",        "int",    1,   20,   1),
    ("vol_z_max",          "float", 0.5,  5.0,  0.1),
    ("entry_decay_max",    "float", 0.01, 0.50, 0.01),
    ("entry_score_min",    "int",   30,   80,   1),
    ("sl_atr_mult",        "float", 0.5,  4.0,  0.1),
    ("conf_floor",         "int",   20,   70,   1),
    ("drop_thresh",        "int",    1,   30,   1),
    ("slope_thresh",       "int",  -15,   -1,   1),
    ("slope_bars",         "int",    1,   10,   1),
    ("bocpd_thresh",       "int",   40,   95,   1),
    ("bocpd_exit_bars",    "int",    1,    5,   1),
    ("decay_exit",         "float", 0.30, 0.99, 0.01),
    ("hold_score_min",     "int",   10,   70,   1),
    ("score_drop_exit",    "int",    5,   60,   1),
    ("score_drop_bars",    "int",    1,    5,   1),
    ("mfe_retrace_pct",    "float", 0.05, 0.60, 0.01),
    ("mfe_min_r",          "float", 0.2,  5.0,  0.1),
    ("range_exit_hold",    "int",    0,   10,   1),
    ("window_start",       "int",    0,   12,   1),
    ("window_end",         "int",   12,   23,   1),
    ("post_exit_cooldown", "int",    0,  240,   1),
    ("exit_on_range",      "bool", None, None, None),
    ("require_rising_conf","bool", None, None, None),
]


# ─── V6 default config (matches regime-backtest.html V6_DEFAULTS) ────────────

V6_DEFAULTS: dict = {
    "entry_conf": 70,            "entry_score_min": 62,
    "sl_atr_mult": 2.0,          "candle_hold": 2,
    "conf_floor": 45,            "mfe_retrace_pct": 0.25,
    "mfe_min_r": 1.5,            "max_hold_bars": 24,
    "window_start": 7,           "window_end": 20,
    "post_exit_cooldown": 4,
}

V6_PARAM_SPEC = [
    ("entry_conf",         "int",   50,   95,  1),
    ("entry_score_min",    "int",   40,   90,  1),
    ("sl_atr_mult",        "float", 0.5,  5.0, 0.1),
    ("candle_hold",        "int",    1,   10,  1),
    ("conf_floor",         "int",   20,   70,  1),
    ("mfe_retrace_pct",    "float", 0.05, 0.60, 0.01),
    ("mfe_min_r",          "float", 0.5,  4.0, 0.1),
    ("max_hold_bars",      "int",    4,   96,  1),
    ("window_start",       "int",    0,   12,  1),
    ("window_end",         "int",   12,   23,  1),
    ("post_exit_cooldown", "int",    0,   24,  1),
]


def cfg_from_trial(trial, spec: list) -> dict:
    """Sample a config dict from an Optuna trial using a (key, kind, low, high, step) spec."""
    cfg = {}
    for key, kind, low, high, step in spec:
        if kind == "int":
            cfg[key] = trial.suggest_int(key, low, high, step=step)
        elif kind == "float":
            cfg[key] = trial.suggest_float(key, low, high, step=step)
        elif kind == "bool":
            cfg[key] = trial.suggest_categorical(key, [True, False])
    return cfg


# ─── V1 signal computation (3-state HMM) ──────────────────────────────────────

def compute_signals_v1(bars: dict, sym: str = "EUR/USD") -> list:
    """
    Compute V1 HMM signals (3-state: BULL/BEAR/RANGE) — unit-variance Gaussian
    emissions, no learned variance/means (V1 never trains, always uses the
    hardcoded directional ADX target per symbol).
    """
    cfg    = HMM_CONFIG_V1.get(sym, HMM_CONFIG_V1["_default"])
    ln     = cfg["linregN"]
    warmup = ln + 50
    self_p = cfg["selfProb"]
    other_p = (1.0 - self_p) / 2.0
    log_s, log_o = math.log(self_p), math.log(other_p)
    dir_adx_t = cfg.get("dirAdxTarget", 0.5)

    time_a  = bars["time"]
    high_a  = bars["high"]
    low_a   = bars["low"]
    close_a = bars["close"]
    N       = len(close_a)

    atr_hmm = _wilder_atr(high_a, low_a, close_a, 20)
    atr_sl  = _wilder_atr(high_a, low_a, close_a, 70)
    adx     = _wilder_adx(high_a, low_a, close_a, cfg["adxN"])
    trend   = _linreg_slopes(close_a, ln)
    tZ      = _rolling_z(trend,   200)
    vZ      = _rolling_z(atr_hmm, 200)
    aZ      = _rolling_z(adx,     200)

    log_init = math.log(1.0 / 3.0)
    lA = [log_init, log_init, log_init]   # [BULL, BEAR, RANGE]

    signals     = [None] * N
    prev_regime = None
    regime_bars = 0

    for i in range(1, N):
        tz, vz, az = tZ[i], vZ[i], aZ[i]

        eB  = _gauss_ll_unit(tz, 1.0) + _gauss_ll_unit(az, dir_adx_t) + _gauss_ll_unit(vz, 0.0)
        eBr = _gauss_ll_unit(tz, -1.0) + _gauss_ll_unit(az, dir_adx_t) + _gauss_ll_unit(vz, 0.0)
        eR  = _gauss_ll_unit(tz, 0.0) + _gauss_ll_unit(az, -1.0)       + _gauss_ll_unit(vz, 0.0)

        pB  = _lse3(lA[0] + log_s, lA[1] + log_o, lA[2] + log_o)
        pBr = _lse3(lA[0] + log_o, lA[1] + log_s, lA[2] + log_o)
        pR  = _lse3(lA[0] + log_o, lA[1] + log_o, lA[2] + log_s)

        lA = [pB + eB, pBr + eBr, pR + eR]
        if i < warmup:
            continue

        mx   = max(lA)
        exps = [math.exp(v - mx) for v in lA]
        s    = exps[0] + exps[1] + exps[2]
        pb, pbr, pr = exps[0] / s, exps[1] / s, exps[2] / s

        if pb >= pbr and pb >= pr:
            regime = "BULL"
        elif pbr >= pb and pbr >= pr:
            regime = "BEAR"
        else:
            regime = "RANGE"
        conf = max(pb, pbr, pr) * 100.0

        if regime != prev_regime:
            prev_regime = regime
            regime_bars = 1
        else:
            regime_bars += 1

        decay = min(0.99, 1.0 - math.exp(-regime_bars / 180))
        slope = float((trend[i] - trend[i - 3]) * 1000) if i >= 3 else 0.0
        bocpd = min(100.0, abs(tz) * 15.0 + abs(vz) * 10.0)

        hmm_c = min(100.0, (conf - 50.0) * 2.0) if regime in ("BULL", "BEAR") else 0.0
        vol_c = max(0.0, 100.0 - abs(vz) * 25.0)
        score = min(100.0, hmm_c * 0.55 + vol_c * 0.25 + _session_mult(int(time_a[i])) * 100.0 * 0.20)

        signals[i] = {
            "ts":     int(time_a[i]),
            "regime": regime,
            "conf":   conf,
            "vz":     float(vz),
            "decay":  decay,
            "slope":  slope,
            "bocpd":  bocpd,
            "score":  score,
            "atr":    float(atr_hmm[i]),
            "atrSL":  float(atr_sl[i]),
        }

    return signals


# ─── V2 signal computation (4-state HMM, V2-specific composite score) ────────

def compute_signals_v2(bars: dict, sym: str = "EUR/USD") -> list:
    """
    Compute V2 HMM signals (4-state: BULL/BEAR/RANGE/CHOP) with the V2
    composite score: HMM conf 40% + vol 15% + session 15% + BOCPD-stability
    15% + slope-match 10% + raw-ADX 5%. Always uses default (untrained)
    means/variances/transition matrix, matching the optimizer's V4/V5 path.
    """
    cfg     = HMM_CONFIG_V2.get(sym, HMM_CONFIG_V2["_default"])
    ln      = cfg["linregN"]
    adx_n   = cfg["adxN"]
    warmup  = ln + 50

    time_a  = bars["time"]
    high_a  = bars["high"]
    low_a   = bars["low"]
    close_a = bars["close"]
    N       = len(close_a)

    atr_hmm = _wilder_atr(high_a, low_a, close_a, 20)
    atr_sl  = _wilder_atr(high_a, low_a, close_a, 70)
    adx     = _wilder_adx(high_a, low_a, close_a, adx_n)
    trend   = _linreg_slopes(close_a, ln)
    tZ      = _rolling_z(trend,   200)
    vZ      = _rolling_z(atr_hmm, 200)
    aZ      = _rolling_z(adx,     200)

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
        log_A    = np.log(np.clip(A, 1e-300, None))

        new_log_alpha = np.zeros(K)
        for j in range(K):
            trans = log_alpha + log_A[:, j]
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

        decay = min(0.99, 1.0 - math.exp(-regime_bars / 180))
        slope = float((trend[i] - trend[i - 3]) * 1000) if i >= 3 else 0.0
        bocpd = min(100.0, abs(tZ[i]) * 15.0 + abs(vZ[i]) * 10.0)

        hmm_c      = min(100.0, (conf - 50.0) * 2.0) if regime in ("BULL", "BEAR") else 0.0
        vol_c      = max(0.0, 100.0 - abs(vZ[i]) * 25.0)
        bocpd_stab = max(0.0, 100.0 - bocpd)
        slope_match = (regime == "BULL" and slope > 0) or (regime == "BEAR" and slope < 0)
        slope_c    = min(100.0, abs(slope) * 8.0) if slope_match else 0.0
        adx_c      = min(100.0, float(adx[i]) * 4.0)

        score = min(100.0,
            hmm_c * 0.40 +
            vol_c * 0.15 +
            _session_mult(int(time_a[i])) * 100.0 * 0.15 +
            bocpd_stab * 0.15 +
            slope_c * 0.10 +
            adx_c * 0.05
        )

        signals[i] = {
            "ts":     int(time_a[i]),
            "regime": regime,
            "conf":   conf,
            "vz":     float(vZ[i]),
            "decay":  decay,
            "slope":  slope,
            "bocpd":  bocpd,
            "score":  score,
            "atr":    float(atr_hmm[i]),
            "atrSL":  float(atr_sl[i]),
        }

    return signals


# ─── V1 simulation ────────────────────────────────────────────────────────────

def simulate_v1(bars: dict, signals: list, cfg: dict,
                spread_pips: float = 1.0, pip_size: float = 0.0001) -> list:
    """
    Simulate V1 regime bot bar-by-bar.

    Key V1 behaviour (no MFE trail, no breakeven — simplest of the three):
      - WINDOW exit: forced flat if a held trade drifts outside [window_start, window_end)
      - REGIME_FLIP: immediate exit on opposite BULL/BEAR
      - RANGE_EXIT: debounced exit (range_exit_hold bars) when flipping to RANGE/CHOP,
        only if exit_on_range is True
      - DECAY: staleness exit, only checked when NOT flipped this bar
      - entry_score is always 0 (V1 has no composite score)
    """
    time_a  = bars["time"]
    high_a  = bars["high"]
    low_a   = bars["low"]
    close_a = bars["close"]
    N = len(time_a)

    ref_price  = float(close_a[close_a > 0][0]) if (close_a > 0).any() else 1.0
    spread_pct = spread_pips * pip_size / ref_price * 100.0

    min_conf      = cfg["min_confidence"]
    ch            = cfg["candle_hold"]
    vzm           = cfg["vol_z_max"]
    edm           = cfg["entry_decay_max"]
    de            = cfg["decay_exit"]
    sl_mult       = cfg["sl_atr_mult"]
    reh           = cfg["range_exit_hold"]
    ws            = cfg["window_start"]
    we            = cfg["window_end"]
    cooldown_n    = cfg["post_exit_cooldown"]
    exit_on_range = cfg.get("exit_on_range", True)

    trades     = []
    pos        = None
    debounce   = 0
    range_hold = 0
    cooldown   = 0

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

        if pos is not None:
            sl_hit = ((pos["dir"] == "LONG"  and bar_low  <= pos["sl"]) or
                      (pos["dir"] == "SHORT" and bar_high >= pos["sl"]))
            if sl_hit:
                trades.append(_mk_trade(pos, bar_ts, pos["sl"], "SL", spread_pct))
                pos = None; debounce = 0; range_hold = 0; cooldown = cooldown_n
                continue

            fav = (bar_high - pos["ep"]) if pos["dir"] == "LONG" else (pos["ep"] - bar_low)
            if fav > pos["mfe"]:
                pos["mfe"] = fav

            if not in_win:
                trades.append(_mk_trade(pos, bar_ts, bar_close, "WINDOW", spread_pct))
                pos = None; debounce = 0; range_hold = 0; cooldown = cooldown_n
                continue

            flipped = pos["regime"] != sig["regime"]
            if flipped and sig["regime"] in ("BULL", "BEAR"):
                trades.append(_mk_trade(pos, bar_ts, bar_close, "REGIME_FLIP", spread_pct))
                pos = None; debounce = 0; range_hold = 0; cooldown = cooldown_n
            elif flipped and exit_on_range and sig["regime"] in ("RANGE", "CHOP"):
                range_hold += 1
                if range_hold >= reh:
                    trades.append(_mk_trade(pos, bar_ts, bar_close, "RANGE_EXIT", spread_pct))
                    pos = None; debounce = 0; range_hold = 0; cooldown = cooldown_n
            elif not flipped:
                range_hold = 0
                if sig["decay"] >= de:
                    trades.append(_mk_trade(pos, bar_ts, bar_close, "DECAY", spread_pct))
                    pos = None; debounce = 0; cooldown = cooldown_n

        if cooldown > 0:
            cooldown -= 1
            continue

        if pos is None and in_win:
            is_dir = sig["regime"] in ("BULL", "BEAR")
            ok = is_dir and sig["conf"] >= min_conf and sig["vz"] <= vzm and sig["decay"] < edm
            if ok:
                debounce += 1
                if debounce >= ch and sig["atrSL"] > 0:
                    direction = "LONG" if sig["regime"] == "BULL" else "SHORT"
                    ep  = bar_close
                    osd = sig["atrSL"] * sl_mult
                    sl  = ep - osd if direction == "LONG" else ep + osd
                    pos = {
                        "dir": direction, "regime": sig["regime"],
                        "ep": ep, "sl": sl, "osd": osd, "es": 0.0,
                        "entry_ts": bar_ts,
                        "conf_entry": sig["conf"], "decay_entry": sig["decay"],
                        "mfe": 0.0,
                    }
                    debounce = 0; range_hold = 0
            else:
                debounce = 0
        elif pos is None:
            debounce = 0

    if pos is not None:
        trades.append(_mk_trade(pos, int(time_a[-1]), float(close_a[-1]), "END", spread_pct))

    return trades


# ─── V2 simulation ────────────────────────────────────────────────────────────

def simulate_v2(bars: dict, signals: list, cfg: dict,
                spread_pips: float = 1.0, pip_size: float = 0.0001) -> list:
    """
    Simulate V2 regime bot bar-by-bar.

    Entry gates (all must pass): regime is BULL/BEAR, session-adjusted conf
    >= entry_conf, conf rising (if required), vol-z <= vol_z_max, decay <
    entry_decay_max, score >= entry_score_min, BOCPD < 55 (hardcoded —
    not a tunable param), slope direction agrees with regime.

    Exit order each bar: SL -> regime-flip/range-exit -> conf-floor/conf-drop
    -> slope (debounced) -> BOCPD (debounced) -> score-low/score-drop ->
    MFE-retrace -> decay. No WINDOW exit (window only gates new entries).
    """
    time_a  = bars["time"]
    high_a  = bars["high"]
    low_a   = bars["low"]
    close_a = bars["close"]
    N = len(time_a)

    ref_price  = float(close_a[close_a > 0][0]) if (close_a > 0).any() else 1.0
    spread_pct = spread_pips * pip_size / ref_price * 100.0

    ec      = cfg["entry_conf"]
    ch      = cfg["candle_hold"]
    vzm     = cfg["vol_z_max"]
    edm     = cfg["entry_decay_max"]
    esm     = cfg["entry_score_min"]
    sl_mult = cfg["sl_atr_mult"]
    cf      = cfg["conf_floor"]
    dt      = cfg["drop_thresh"]
    st      = cfg["slope_thresh"]
    sb      = cfg["slope_bars"]
    bt      = cfg["bocpd_thresh"]
    beb     = cfg["bocpd_exit_bars"]
    de      = cfg["decay_exit"]
    hsm     = cfg["hold_score_min"]
    sde     = cfg["score_drop_exit"]
    sdb     = cfg["score_drop_bars"]
    mrp     = cfg["mfe_retrace_pct"]
    mmr     = cfg["mfe_min_r"]
    reh     = cfg["range_exit_hold"]
    ws      = cfg["window_start"]
    we      = cfg["window_end"]
    cooldown_n          = cfg["post_exit_cooldown"]
    exit_on_range       = cfg.get("exit_on_range", True)
    require_rising_conf = cfg.get("require_rising_conf", True)

    trades     = []
    pos        = None
    debounce   = 0
    range_hold = 0
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
        in_win      = ws <= hour_utc < we
        eff_conf    = sig["conf"] * _session_mult(bar_ts)
        conf_drop   = (prev_conf - sig["conf"]) if prev_conf is not None else 0.0
        conf_rising = prev_conf is None or sig["conf"] >= prev_conf

        if pos is not None:
            sl_hit = ((pos["dir"] == "LONG"  and bar_low  <= pos["sl"]) or
                      (pos["dir"] == "SHORT" and bar_high >= pos["sl"]))
            if sl_hit:
                trades.append(_mk_trade(pos, bar_ts, pos["sl"], "SL", spread_pct))
                pos = None; debounce = 0; range_hold = 0; cooldown = cooldown_n
                prev_conf = sig["conf"]; continue

            fav = (bar_high - pos["ep"]) if pos["dir"] == "LONG" else (pos["ep"] - bar_low)
            if fav > pos["mfe"]:
                pos["mfe"] = fav
            risk_pr      = abs(pos["ep"] - pos["sl"])
            pos["mfe_r"] = pos["mfe"] / risk_pr if risk_pr > 0 else 0.0

            xp     = bar_close
            exited = False

            flipped = pos["regime"] != sig["regime"]
            if flipped and sig["regime"] in ("BULL", "BEAR"):
                trades.append(_mk_trade(pos, bar_ts, xp, "REGIME_FLIP", spread_pct)); exited = True
            elif flipped and exit_on_range and sig["regime"] in ("RANGE", "CHOP"):
                range_hold += 1
                if range_hold >= reh:
                    trades.append(_mk_trade(pos, bar_ts, xp, "RANGE_EXIT", spread_pct)); exited = True
            elif not flipped:
                range_hold = 0

            if not exited:
                if sig["conf"] < cf:
                    trades.append(_mk_trade(pos, bar_ts, xp, "CONF_FLOOR", spread_pct)); exited = True
                elif conf_drop >= dt:
                    trades.append(_mk_trade(pos, bar_ts, xp, "CONF_DROP", spread_pct)); exited = True
            if not exited:
                if sig["slope"] < st:
                    pos["sct"] += 1
                    if pos["sct"] >= sb:
                        trades.append(_mk_trade(pos, bar_ts, xp, "SLOPE", spread_pct)); exited = True
                else:
                    pos["sct"] = 0
            if not exited:
                if sig["bocpd"] >= bt:
                    pos["bct"] += 1
                    if pos["bct"] >= beb:
                        trades.append(_mk_trade(pos, bar_ts, xp, "BOCPD", spread_pct)); exited = True
                else:
                    pos["bct"] = 0
            if not exited:
                if sig["score"] < hsm:
                    pos["slct"] += 1
                    if pos["slct"] >= sdb:
                        trades.append(_mk_trade(pos, bar_ts, xp, "SCORE_LOW", spread_pct)); exited = True
                else:
                    pos["slct"] = 0
                if not exited and (pos["es"] - sig["score"]) >= sde:
                    trades.append(_mk_trade(pos, bar_ts, xp, "SCORE_DROP", spread_pct)); exited = True
            if not exited and pos["mfe_r"] >= mmr and pos["mfe"] > 0:
                cur_fav = (xp - pos["ep"]) if pos["dir"] == "LONG" else (pos["ep"] - xp)
                retrace = (pos["mfe"] - max(0.0, cur_fav)) / pos["mfe"]
                if retrace >= mrp:
                    trades.append(_mk_trade(pos, bar_ts, xp, "MFE_RETRACE", spread_pct)); exited = True
            if not exited and sig["decay"] >= de:
                trades.append(_mk_trade(pos, bar_ts, xp, "DECAY", spread_pct)); exited = True

            if exited:
                pos = None; debounce = 0; range_hold = 0; cooldown = cooldown_n

        if cooldown > 0:
            cooldown -= 1
            prev_conf = sig["conf"]
            continue

        if pos is None and in_win:
            is_dir   = sig["regime"] in ("BULL", "BEAR")
            ok_conf  = eff_conf >= ec
            ok_rise  = (not require_rising_conf) or conf_rising
            ok_vz    = sig["vz"] <= vzm
            ok_decay = sig["decay"] < edm
            ok_score = sig["score"] >= esm
            ok_bocpd = sig["bocpd"] < 55             # hardcoded — not a tunable param
            ok_slope = ((sig["regime"] == "BULL" and sig["slope"] > 0) or
                        (sig["regime"] == "BEAR" and sig["slope"] < 0))

            if is_dir and ok_conf and ok_rise and ok_vz and ok_decay and ok_score and ok_bocpd and ok_slope:
                debounce += 1
                if debounce >= ch and sig["atrSL"] > 0:
                    direction = "LONG" if sig["regime"] == "BULL" else "SHORT"
                    ep  = bar_close
                    osd = sig["atrSL"] * sl_mult
                    sl  = ep - osd if direction == "LONG" else ep + osd
                    pos = {
                        "dir": direction, "regime": sig["regime"],
                        "ep": ep, "sl": sl, "osd": osd, "es": sig["score"],
                        "entry_ts": bar_ts,
                        "conf_entry": sig["conf"], "decay_entry": sig["decay"],
                        "mfe": 0.0, "mfe_r": 0.0,
                        "sct": 0, "bct": 0, "slct": 0,
                    }
                    debounce = 0; range_hold = 0
            else:
                debounce = 0
        elif pos is None:
            debounce = 0

        prev_conf = sig["conf"]

    if pos is not None:
        trades.append(_mk_trade(pos, int(time_a[-1]), float(close_a[-1]), "END", spread_pct))

    return trades


# ─── V6 simulation ────────────────────────────────────────────────────────────

def simulate_v6(bars: dict, signals: list, cfg: dict,
                mtf_minutes: int = 30,
                spread_pips: float = 1.0, pip_size: float = 0.0001) -> list:
    """
    Simulate V6 regime bot bar-by-bar. Signals come from
    backtester_v4.compute_signals_v5 (same MTF-aggregated 4-state pipeline
    as V5) — V6 only simplifies the exit logic, not the signal source.

    Bar-count params (candle_hold, post_exit_cooldown, max_hold_bars) are
    expressed in MTF-bar units and scaled to M1 bars here, matching the
    HTML's simulateV6.

    Exits: SL (with hardcoded breakeven at 1.0R) -> opposite-regime-flip ->
    conf-floor -> MFE-retrace -> max-hold timeout. RANGE/CHOP alone never
    exits a position — only an opposite BULL/BEAR flip does.
    """
    S = max(1, mtf_minutes)

    time_a  = bars["time"]
    high_a  = bars["high"]
    low_a   = bars["low"]
    close_a = bars["close"]
    N = len(time_a)

    ref_price  = float(close_a[close_a > 0][0]) if (close_a > 0).any() else 1.0
    spread_pct = spread_pips * pip_size / ref_price * 100.0

    ch    = max(1, round(cfg.get("candle_hold",        2)  * S))
    coolN = max(0, round(cfg.get("post_exit_cooldown",  4) * S))
    maxHN = max(1, round(cfg.get("max_hold_bars",      24) * S))

    ec  = cfg.get("entry_conf",        70)
    esm = cfg.get("entry_score_min",   62)
    slM = cfg.get("sl_atr_mult",      2.0)
    ws  = cfg.get("window_start",       7)
    we  = cfg.get("window_end",        20)
    cf  = cfg.get("conf_floor",        45)
    mrp = cfg.get("mfe_retrace_pct", 0.25)
    mmr = cfg.get("mfe_min_r",       1.5)

    trades   = []
    pos      = None
    debounce = 0
    cooldown = 0

    for i in range(WARMUP, N):
        sig = signals[i]
        if sig is None:
            continue

        bar_ts    = int(time_a[i])
        bar_high  = float(high_a[i])
        bar_low   = float(low_a[i])
        bar_close = float(close_a[i])
        eff_conf  = sig["conf"] * _session_mult(bar_ts)
        score     = sig.get("v4_score", sig.get("score", 0.0))
        hour_utc  = int((bar_ts % 86400) // 3600)
        in_win    = ws <= hour_utc < we

        if cooldown > 0:
            cooldown -= 1
            continue

        if pos is not None:
            sl_hit = ((pos["dir"] == "LONG"  and bar_low  <= pos["sl"]) or
                      (pos["dir"] == "SHORT" and bar_high >= pos["sl"]))
            if sl_hit:
                trades.append(_mk_trade(pos, bar_ts, pos["sl"], "SL", spread_pct))
                pos = None; debounce = 0; cooldown = coolN
                continue

            fav = (bar_high - pos["ep"]) if pos["dir"] == "LONG" else (pos["ep"] - bar_low)
            if fav > pos["mfe"]:
                pos["mfe"] = fav
            mfe_r = pos["mfe"] / pos["osd"] if pos["osd"] > 0 else 0.0

            if mfe_r >= 1.0:    # breakeven — hardcoded, always on
                if pos["dir"] == "LONG"  and pos["sl"] < pos["ep"]: pos["sl"] = pos["ep"]
                if pos["dir"] == "SHORT" and pos["sl"] > pos["ep"]: pos["sl"] = pos["ep"]

            xp     = bar_close
            exited = False

            opp_flip = ((pos["dir"] == "LONG"  and sig["regime"] == "BEAR") or
                        (pos["dir"] == "SHORT" and sig["regime"] == "BULL"))
            if opp_flip:
                trades.append(_mk_trade(pos, bar_ts, xp, "REGIME_FLIP", spread_pct)); exited = True

            if not exited and sig["conf"] < cf:
                trades.append(_mk_trade(pos, bar_ts, xp, "CONF_FLOOR", spread_pct)); exited = True

            if not exited and mfe_r >= mmr and pos["mfe"] > 0:
                peak_price   = pos["ep"] + pos["mfe"] if pos["dir"] == "LONG" else pos["ep"] - pos["mfe"]
                retrace_dist = (peak_price - xp) if pos["dir"] == "LONG" else (xp - peak_price)
                if retrace_dist / pos["mfe"] >= mrp:
                    trades.append(_mk_trade(pos, bar_ts, xp, "MFE_RETRACE", spread_pct)); exited = True

            if not exited:
                pos["bars_held"] += 1
                if pos["bars_held"] >= maxHN:
                    trades.append(_mk_trade(pos, bar_ts, xp, "MAX_HOLD", spread_pct)); exited = True

            if exited:
                pos = None; debounce = 0; cooldown = coolN
                continue

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
                    ep  = bar_close
                    osd = sig["atrSL"] * slM
                    pos = {
                        "dir": direction, "regime": sig["regime"],
                        "ep": ep, "sl": ep - osd if direction == "LONG" else ep + osd,
                        "osd": osd, "es": score,
                        "entry_ts": bar_ts,
                        "conf_entry": sig["conf"], "decay_entry": sig.get("decay", 0.0) or 0.0,
                        "mfe": 0.0, "bars_held": 0,
                    }
                    debounce = 0
            else:
                debounce = 0
        elif pos is None:
            debounce = 0

    if pos is not None:
        trades.append(_mk_trade(pos, int(time_a[-1]), float(close_a[-1]), "END", spread_pct))

    return trades
