"""
optimizer.py — Bayesian (Optuna/TPE) parameter search for V4 regime bot.

Usage:
    python optimizer.py --pair EURUSD --trials 1000 --jobs 4

Walk-forward splits (applied to the date range in the fetched data):
    Train 60% | Validate 20% | Test 20% (blind — only evaluated for the top-20)

Objective:
    0.7 * validate_sharpe + 0.3 * train_sharpe

Pruning rules (trial returns -inf):
    - < 20 trades on train or validate split
    - max drawdown > 30% on validate
    - validate_sharpe < 0.4 * train_sharpe  (overfit guard)

Results are written to:
    results/<pair>_<timestamp>.json   — top-20 configs + analytics
    results/<pair>_<timestamp>.db     — full Optuna SQLite study (for importance plots)
"""

import argparse
import json
import math
import os
import pickle
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import numpy as np
import optuna
import requests
from optuna.samplers import TPESampler

from backtester_v4 import (
    V4_DEFAULTS,
    compute_analytics,
    compute_signals_v4,
    compute_signals_v5,
    simulate_v4,
    simulate_v5,
)

optuna.logging.set_verbosity(optuna.logging.WARNING)

RESULTS_DIR = Path(__file__).parent / "results"
CACHE_DIR   = Path(__file__).parent / ".cache"

RAILWAY_BASE = "https://macrofxmodel-production.up.railway.app"

TRAIN_PCT    = 0.60
VAL_PCT      = 0.20
# Remaining 20% is TEST (blind)

MIN_TRADES    = 20
MAX_DD_LIMIT  = 30.0    # %
OVERFIT_GUARD = 0.40    # val_sharpe must be ≥ 40% of train_sharpe

# Per-MTF pruning limits — higher TF = fewer trades expected, longer holds expected
_MTF_LIMITS = {
    1:   {"max_tpy": 800,  "min_avg_dur":  60},   # M1  raw
    15:  {"max_tpy": 800,  "min_avg_dur":  60},   # 15m regime
    30:  {"max_tpy": 400,  "min_avg_dur": 120},   # 30m regime
    60:  {"max_tpy": 200,  "min_avg_dur": 240},   # 1h  regime
    240: {"max_tpy":  60,  "min_avg_dur": 480},   # 4h  regime
}

def _mtf_limits(mtf: int) -> dict:
    """Return pruning limits for the given MTF, falling back to nearest key."""
    if mtf in _MTF_LIMITS:
        return _MTF_LIMITS[mtf]
    closest = min(_MTF_LIMITS.keys(), key=lambda k: abs(k - mtf))
    return _MTF_LIMITS[closest]


# ─── Data fetching ────────────────────────────────────────────────────────────

def _pair_safe(pair: str) -> str:
    """Convert 'EUR/USD' or 'EURUSD' → 'eurusd' (matches HTML pairSafe())."""
    return pair.lower().replace("/", "").replace("_", "")


def _fetch_chunk(pair_safe: str, from_dt: datetime, to_dt: datetime,
                 timeout: int = 120, max_retries: int = 3) -> list[dict]:
    """
    Fetch one 14-day chunk. from/to are date strings.
    Retries with backoff — first call to the Railway server triggers a 28MB R2
    parquet load which can take 60–90 s on a cold server.
    """
    url    = f"{RAILWAY_BASE}/api/vol-backtest/candles/{pair_safe}"
    params = {
        "from": from_dt.strftime("%Y-%m-%d"),
        "to":   to_dt.strftime("%Y-%m-%d"),
    }
    last_err = None
    for attempt in range(max_retries):
        try:
            r = requests.get(url, params=params, timeout=timeout)
            if r.status_code == 404:
                # Server couldn't load parquet yet — wait and retry
                delay = 15 * (attempt + 1)
                print(f"\n    [retry {attempt+1}/{max_retries}] 404 — waiting {delay}s for server cold-start…", end="")
                time.sleep(delay)
                last_err = requests.exceptions.HTTPError(f"404 for {url}?{r.request.url.split('?',1)[-1]}")
                continue
            r.raise_for_status()
            data = r.json()
            if isinstance(data, list):
                return data
            if isinstance(data, dict):
                return data.get("candles", [])
            return []
        except requests.exceptions.Timeout:
            delay = 10 * (attempt + 1)
            print(f"\n    [retry {attempt+1}/{max_retries}] timeout — waiting {delay}s…", end="")
            time.sleep(delay)
            last_err = Exception("timeout")
        except requests.exceptions.HTTPError as e:
            last_err = e
            break   # non-404 HTTP error — no point retrying
    raise last_err or Exception("max retries exceeded")


def fetch_m1_candles(pair: str, months: int = 18,
                     from_date: Optional[str] = None,
                     to_date:   Optional[str] = None) -> dict:
    """
    Fetch M1 candles from Railway, cache as pickle.

    from_date / to_date: 'YYYY-MM-DD' strings. If omitted, uses last <months> months.
    The Railway server loads EUR/USD from a static R2 parquet file whose data
    typically ends ~Dec 2024 — use --from / --to to target the available range.
    """
    CACHE_DIR.mkdir(exist_ok=True)
    safe = _pair_safe(pair)

    # Determine date window
    if to_date:
        end_dt = datetime.strptime(to_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        end_dt = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    if from_date:
        start_dt = datetime.strptime(from_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        start_dt = end_dt - timedelta(days=months * 30)

    tag        = f"{from_date or 'auto'}_{to_date or 'now'}"
    cache_file = CACHE_DIR / f"{safe}_{tag}.pkl"

    if cache_file.exists():
        age_days = (time.time() - cache_file.stat().st_mtime) / 86400
        if age_days < 1:
            print(f"  [cache] {pair} from {cache_file.name}")
            with open(cache_file, "rb") as f:
                return pickle.load(f)

    print(f"  [fetch] {pair} ({safe}) from {start_dt.strftime('%Y-%m-%d')} → {end_dt.strftime('%Y-%m-%d')} …")
    print(f"  [info]  First chunk may take 60–90s (Railway cold-start loading parquet from R2)")
    CHUNK = timedelta(days=14)

    all_candles: list[dict] = []
    cur = start_dt
    chunk_n = 0
    while cur < end_dt:
        chunk_end = min(cur + CHUNK, end_dt)
        chunk_n += 1
        print(f"  chunk {chunk_n}: {cur.strftime('%Y-%m-%d')} → {chunk_end.strftime('%Y-%m-%d')} ", end="\r")
        try:
            chunk = _fetch_chunk(safe, cur, chunk_end)
            all_candles.extend(chunk)
        except Exception as e:
            print(f"\n  [warn] chunk {cur.strftime('%Y-%m-%d')}: {type(e).__name__}: {e}")
        cur += CHUNK
        time.sleep(0.3)

    print(f"\n  Fetched {len(all_candles):,} raw candles across {chunk_n} chunks")
    if not all_candles:
        raise ValueError(
            f"No candles returned for {pair}. "
            f"The R2 parquet file may not cover {start_dt.strftime('%Y-%m-%d')} – {end_dt.strftime('%Y-%m-%d')}. "
            f"Try --from 2023-01-01 --to 2024-12-01 to target known-good data."
        )

    # Parse timestamps — API returns ISO strings like "2024-01-01T00:01:00"
    def _ts(c: dict) -> int:
        raw = c.get("time", c.get("t", ""))
        if isinstance(raw, (int, float)):
            return int(raw)
        if isinstance(raw, str):
            raw = raw.rstrip("Z")
            try:
                return int(datetime.fromisoformat(raw).replace(tzinfo=timezone.utc).timestamp())
            except ValueError:
                return 0
        return 0

    # Sort and deduplicate by Unix timestamp
    parsed = [(c, _ts(c)) for c in all_candles]
    parsed.sort(key=lambda x: x[1])
    seen = set()
    uniq = []
    for c, ts in parsed:
        if ts > 0 and ts not in seen:
            seen.add(ts)
            uniq.append((c, ts))

    if not uniq:
        raise ValueError(f"No parseable candles returned for {pair}")

    bars = {
        "time":  np.array([ts           for _, ts in uniq], dtype=float),
        "open":  np.array([c.get("open",  c.get("o", 0)) for c, _ in uniq], dtype=float),
        "high":  np.array([c.get("high",  c.get("h", 0)) for c, _ in uniq], dtype=float),
        "low":   np.array([c.get("low",   c.get("l", 0)) for c, _ in uniq], dtype=float),
        "close": np.array([c.get("close", c.get("c", 0)) for c, _ in uniq], dtype=float),
    }

    with open(cache_file, "wb") as f:
        pickle.dump(bars, f)
    print(f"  [fetch] Got {len(uniq):,} bars → cached to {cache_file.name}")
    return bars


def _split_bars(bars: dict, train_end: int, val_end: int) -> tuple[dict, dict, dict]:
    """Return train / val / test bar dicts by index split."""
    def _slice(b, lo, hi):
        return {k: v[lo:hi] for k, v in b.items()}

    N = len(bars["time"])
    return (
        _slice(bars, 0, train_end),
        _slice(bars, train_end, val_end),
        _slice(bars, val_end, N),
    )


def _cfg_from_trial(trial: optuna.Trial, mtf: int = 1) -> dict:
    """
    Sample a config from the Optuna trial.

    For MTF > 1 (V5 mode), bar-count params are expressed in MTF-bar units
    (matching the HTML V5 UI) and scaled to M1 bars internally by simulate_v5.

    For MTF == 1 (V4 mode), bar-count params are already in M1 bars.
    """
    if mtf > 1:
        # V5: bar-count params in MTF-bar units, small numeric ranges
        return {
            "entry_conf":            trial.suggest_int("entry_conf",            60, 90),
            "candle_hold":           trial.suggest_int("candle_hold",            1,  8),
            "entry_score_min":       trial.suggest_int("entry_score_min",       55, 85),
            "sl_atr_mult":           trial.suggest_float("sl_atr_mult",         1.0, 4.0, step=0.1),
            "window_start":          trial.suggest_int("window_start",           0, 12),
            "window_end":            trial.suggest_int("window_end",            12, 23),
            "post_exit_cooldown":    trial.suggest_int("post_exit_cooldown",     1, 16),
            "max_range_hold_bars":   trial.suggest_int("max_range_hold_bars",    4, 24),
            "mfe_trail_r":           trial.suggest_float("mfe_trail_r",         0.5, 3.0, step=0.1),
            "mfe_suppress_r":        trial.suggest_float("mfe_suppress_r",      1.0, 5.0, step=0.1),
            "conf_floor":            trial.suggest_int("conf_floor",            25, 60),
            "drop_thresh":           trial.suggest_int("drop_thresh",            5, 30),
            "slope_thresh":          trial.suggest_int("slope_thresh",         -15, -1),
            "slope_bars":            trial.suggest_int("slope_bars",             1,  6),
            "bocpd_thresh":          trial.suggest_int("bocpd_thresh",          50, 95),
            "bocpd_exit_bars":       trial.suggest_int("bocpd_exit_bars",        2,  8),
            "bocpd_exit_bars_range": trial.suggest_int("bocpd_exit_bars_range",  4, 16),
            "hold_score_min":        trial.suggest_int("hold_score_min",        10, 60),
            "score_drop_exit":       trial.suggest_int("score_drop_exit",       10, 60),
            "score_drop_bars":       trial.suggest_int("score_drop_bars",        1,  4),
            "mfe_retrace_pct":       trial.suggest_float("mfe_retrace_pct",     0.10, 0.60, step=0.01),
            "mfe_min_r":             trial.suggest_float("mfe_min_r",           0.5, 4.0, step=0.1),
            "decay_exit":            trial.suggest_float("decay_exit",          0.50, 0.99, step=0.01),
        }
    else:
        # V4: bar-count params in M1 bars, larger numeric ranges
        return {
            "entry_conf":            trial.suggest_int("entry_conf",            65, 90),
            "candle_hold":           trial.suggest_int("candle_hold",            3, 20),
            "entry_score_min":       trial.suggest_int("entry_score_min",       60, 85),
            "sl_atr_mult":           trial.suggest_float("sl_atr_mult",         1.2, 4.0, step=0.1),
            "window_start":          trial.suggest_int("window_start",           0, 12),
            "window_end":            trial.suggest_int("window_end",            12, 23),
            "post_exit_cooldown":    trial.suggest_int("post_exit_cooldown",    60, 480),
            "max_range_hold_bars":   trial.suggest_int("max_range_hold_bars",   30, 480, step=10),
            "mfe_trail_r":           trial.suggest_float("mfe_trail_r",         0.5, 3.0, step=0.1),
            "mfe_suppress_r":        trial.suggest_float("mfe_suppress_r",      1.0, 5.0, step=0.1),
            "conf_floor":            trial.suggest_int("conf_floor",            25, 60),
            "drop_thresh":           trial.suggest_int("drop_thresh",            5, 30),
            "slope_thresh":          trial.suggest_int("slope_thresh",         -15, -1),
            "slope_bars":            trial.suggest_int("slope_bars",             2, 10),
            "bocpd_thresh":          trial.suggest_int("bocpd_thresh",          50, 95),
            "bocpd_exit_bars":       trial.suggest_int("bocpd_exit_bars",        2, 12),
            "bocpd_exit_bars_range": trial.suggest_int("bocpd_exit_bars_range",  5, 40),
            "hold_score_min":        trial.suggest_int("hold_score_min",        10, 60),
            "score_drop_exit":       trial.suggest_int("score_drop_exit",       10, 60),
            "score_drop_bars":       trial.suggest_int("score_drop_bars",        1,  5),
            "mfe_retrace_pct":       trial.suggest_float("mfe_retrace_pct",     0.10, 0.60, step=0.01),
            "mfe_min_r":             trial.suggest_float("mfe_min_r",           0.5, 4.0, step=0.1),
            "decay_exit":            trial.suggest_float("decay_exit",          0.50, 0.99, step=0.01),
        }


def _run_split(bars: dict, signals: list, cfg: dict,
               spread_pips: float = 1.0, mtf: int = 1) -> Optional[dict]:
    """Run backtest on a pre-sliced bars+signals pair. Returns analytics or None."""
    if mtf > 1:
        trades = simulate_v5(bars, signals, cfg, mtf_minutes=mtf, spread_pips=spread_pips)
    else:
        trades = simulate_v4(bars, signals, cfg, spread_pips=spread_pips)
    if not trades:
        return None
    return compute_analytics(trades)


def _sharpe(an: Optional[dict]) -> float:
    if an is None:
        return -999.0
    return float(an.get("sharpe", -999.0))


def make_objective(bars_train, bars_val, sigs_train, sigs_val,
                   spread_pips: float = 1.0, mtf: int = 1):
    limits = _mtf_limits(mtf)
    max_tpy     = limits["max_tpy"]
    min_avg_dur = limits["min_avg_dur"]

    def objective(trial: optuna.Trial) -> float:
        cfg = _cfg_from_trial(trial, mtf)

        an_tr = _run_split(bars_train, sigs_train, cfg, spread_pips, mtf)
        an_va = _run_split(bars_val,   sigs_val,   cfg, spread_pips, mtf)

        tr_sh = _sharpe(an_tr)
        va_sh = _sharpe(an_va)

        if an_tr is None or an_tr["total"] < MIN_TRADES:
            return -1_000.0
        if an_va is None or an_va["total"] < MIN_TRADES:
            return -1_000.0
        if an_va["max_dd"] > MAX_DD_LIMIT:
            return -1_000.0
        if tr_sh > 0 and va_sh < OVERFIT_GUARD * tr_sh:
            return -500.0
        if an_va["tpy"] > max_tpy:
            return -200.0
        if an_va.get("avg_duration_min", 0) < min_avg_dur:
            return -200.0

        return 0.7 * va_sh + 0.3 * tr_sh

    return objective


# ─── Main optimisation routine ────────────────────────────────────────────────

def run_optimisation(pair: str, n_trials: int = 1000, n_jobs: int = 1, months: int = 18,
                     from_date: Optional[str] = None, to_date: Optional[str] = None,
                     spread_pips: float = 1.0, mtf: int = 1):
    RESULTS_DIR.mkdir(exist_ok=True)
    ts_str = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    tag    = f"{pair.replace('/', '')}_{ts_str}"
    db_path = RESULTS_DIR / f"{tag}.db"

    print(f"\n{'='*60}")
    print(f"  V4 Regime Optimizer — {pair}")
    if from_date or to_date:
        print(f"  Range:  {from_date or 'auto'} → {to_date or 'now'}")
    print(f"  Trials: {n_trials}  |  Jobs: {n_jobs}  |  Data: {months}m")
    print(f"{'='*60}")

    # Load data
    bars = fetch_m1_candles(pair, months, from_date=from_date, to_date=to_date)
    N    = len(bars["time"])

    # Walk-forward split indices
    ti  = int(N * TRAIN_PCT)
    vi  = int(N * (TRAIN_PCT + VAL_PCT))

    bars_train, bars_val, bars_test = _split_bars(bars, ti, vi)

    print(f"  Bars — train: {ti:,}  val: {vi-ti:,}  test: {N-vi:,}")

    # Pre-compute signals for each split (expensive, but done once per study)
    print("  Pre-computing HMM signals …")
    t0 = time.time()
    sigs_all   = compute_signals_v4(bars, pair)
    sigs_train = sigs_all[:ti]
    sigs_val   = sigs_all[ti:vi]
    sigs_test  = sigs_all[vi:]
    print(f"  Signals done in {time.time()-t0:.1f}s  ({sum(s is not None for s in sigs_all):,} non-null)")

    # Create Optuna study
    sampler  = TPESampler(seed=42)
    storage  = f"sqlite:///{db_path}"
    study    = optuna.create_study(
        direction="maximize",
        sampler=sampler,
        storage=storage,
        study_name=tag,
        load_if_exists=True,
    )
    objective = make_objective(bars_train, bars_val, sigs_train, sigs_val, spread_pips)

    print(f"\n  Starting optimisation (n_trials={n_trials}) …")
    t1 = time.time()
    study.optimize(objective, n_trials=n_trials, n_jobs=n_jobs, show_progress_bar=True)
    elapsed = time.time() - t1
    print(f"\n  Done in {elapsed:.0f}s — best val objective: {study.best_value:.4f}")

    # ── Collect top-20 valid trials ────────────────────────────────────────────
    all_trials = [t for t in study.trials if t.value is not None and t.value > -100]
    top_trials = sorted(all_trials, key=lambda t: t.value, reverse=True)[:20]

    print(f"\n  Evaluating top {len(top_trials)} trials on TEST split …")

    results = []
    for rank, trial in enumerate(top_trials, 1):
        cfg = trial.params.copy()
        # ensure float types for float params (Optuna stores as suggested)
        for fp in ("sl_atr_mult","mfe_trail_r","mfe_suppress_r","mfe_retrace_pct","mfe_min_r","decay_exit"):
            if fp in cfg:
                cfg[fp] = float(cfg[fp])
        for ip in ("entry_conf","candle_hold","entry_score_min","window_start","window_end",
                   "post_exit_cooldown","max_range_hold_bars","conf_floor","drop_thresh",
                   "slope_thresh","slope_bars","bocpd_thresh","bocpd_exit_bars",
                   "bocpd_exit_bars_range","hold_score_min","score_drop_exit","score_drop_bars"):
            if ip in cfg:
                cfg[ip] = int(cfg[ip])

        an_tr = _run_split(bars_train, sigs_train, cfg, spread_pips)
        an_va = _run_split(bars_val,   sigs_val,   cfg, spread_pips)
        an_te = _run_split(bars_test,  sigs_test,  cfg, spread_pips)

        diff = {k: round(cfg.get(k, V4_DEFAULTS.get(k)) - V4_DEFAULTS.get(k, 0), 4)
                for k in cfg if k in V4_DEFAULTS}

        results.append({
            "rank":          rank,
            "trial_number":  trial.number,
            "objective":     round(trial.value, 4),
            "config":        cfg,
            "diff_from_default": diff,
            "train": _summarise(an_tr),
            "val":   _summarise(an_va),
            "test":  _summarise(an_te),
        })

        _print_row(rank, cfg, an_tr, an_va, an_te)

    # Parameter importances (best effort — requires >= 4 trials)
    try:
        importances = optuna.importance.get_param_importances(study)
        imp_list = [{"param": k, "importance": round(v, 4)} for k, v in importances.items()]
    except Exception:
        imp_list = []

    # Write results JSON
    out = {
        "pair":          pair,
        "generated_at":  ts_str,
        "n_trials":      n_trials,
        "months_data":   months,
        "split_bars":    {"train": ti, "val": vi - ti, "test": N - vi},
        "param_importances": imp_list,
        "top_results":   results,
    }
    json_path = RESULTS_DIR / f"{tag}.json"
    with open(json_path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"\n  Results → {json_path}")
    print(f"  Study DB → {db_path}")
    return str(json_path)


def _summarise(an: Optional[dict]) -> dict:
    if an is None:
        return {}
    return {
        "trades":        an["total"],
        "tpy":           round(an.get("tpy", 0), 0),
        "avg_dur_min":   round(an.get("avg_duration_min", 0), 0),
        "win_rate":      round(an["win_rate"], 1),
        "sharpe":        round(an["sharpe"], 3),
        "sortino":       round(an.get("sortino", 0), 3),
        "pf":            round(an["pf"], 2),
        "max_dd":        round(an["max_dd"], 2),
        "total_pnl":     round(an["total_pnl"], 2),
        "calmar":        round(an.get("calmar", 0), 3),
        "range_holds":   an.get("range_holds", 0),
    }


def _print_row(rank, cfg, an_tr, an_va, an_te):
    def fmt(an):
        if not an:
            return "  n/a  "
        return (f"  sh={an['sharpe']:.2f}  wr={an['win_rate']:.0f}%"
                f"  dd={an['max_dd']:.1f}%  n={an['total']}")
    print(f"  #{rank:02d}  TR:{fmt(an_tr)}  VA:{fmt(an_va)}  TE:{fmt(an_te)}")


# ─── CLI ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    ap = argparse.ArgumentParser(
        description="V4 regime bot parameter optimizer",
        epilog=(
            "Examples:\n"
            "  python optimizer.py --pair EURUSD --from 2023-01-01 --to 2024-12-01 --trials 1000\n"
            "  python optimizer.py --pair XAUUSD --months 18 --trials 500 --jobs 4 --report\n"
            "\n"
            "Tip: If you get 404 errors, the R2 parquet file may not cover the requested\n"
            "     date range. Check what date range the HTML backtester uses successfully\n"
            "     and pass those as --from / --to."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--pair",    default="EURUSD",  help="Currency pair (e.g. EURUSD, XAUUSD)")
    ap.add_argument("--trials",  type=int, default=1000)
    ap.add_argument("--jobs",    type=int, default=1,    help="Parallel Optuna workers")
    ap.add_argument("--months",  type=int, default=18,   help="Months of M1 data (ignored if --from/--to set)")
    ap.add_argument("--from",    dest="from_date", default=None, metavar="YYYY-MM-DD",
                    help="Start date for data window (e.g. 2023-01-01)")
    ap.add_argument("--to",      dest="to_date",   default=None, metavar="YYYY-MM-DD",
                    help="End date for data window (e.g. 2024-12-01)")
    ap.add_argument("--spread",  type=float, default=1.0, metavar="PIPS",
                    help="Round-trip spread cost in pips (default 1.0 — EUR/USD typical; use 2.0 for Gold)")
    ap.add_argument("--report",  action="store_true",    help="Auto-generate HTML report after optimisation")
    args = ap.parse_args()

    pair = args.pair.replace("_", "/")   # normalise EURUSD → EUR/USD
    if "/" not in pair and len(pair) == 6:
        pair = pair[:3] + "/" + pair[3:]

    json_path = run_optimisation(pair, args.trials, args.jobs, args.months,
                                 from_date=args.from_date, to_date=args.to_date,
                                 spread_pips=args.spread)

    if args.report:
        from reporter import generate_report
        rpt = generate_report(json_path)
        print(f"  Report  → {rpt}")
