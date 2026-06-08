#!/usr/bin/env python3
"""
Dynamic multi-pair hedge portfolio backtester.

Mirrors how the live hedge bot operates: scans ALL pair combinations every H1 bar,
picks the best non-conflicting signals by z-score × hedge score, enters up to
max_positions concurrent trades, and checks M1 data for precise SL hits.

Entry trigger : rolling correlation z-score (Welford online, no lookahead)
Direction     : SHORT outperformer / LONG underperformer (24H return comparison)
Exit          : z-score reverts to ±exit_z  |  z-score breaches ±stop_z
Stop loss     : ATR(70 M1) × sl_atr_mult per leg

Usage:
    python portfolio_backtest.py --from 2024-01-01 --to 2026-01-01
    python portfolio_backtest.py --pairs eurusd gbpusd audusd usdchf --entry-z 2.5
    python portfolio_backtest.py --help
"""

import os, io, sys, json, time, logging, argparse
from pathlib import Path
from itertools import combinations
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd
import boto3
from botocore.config import Config

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

# ── R2 config ──────────────────────────────────────────────────────────────────
R2_ENDPOINT   = os.environ.get("R2_ENDPOINT",   "https://3e867110ae519cd24afc877c72e5026e.r2.cloudflarestorage.com")
R2_BUCKET     = os.environ.get("R2_BUCKET",     "r2-storage")
R2_PREFIX     = os.environ.get("R2_KEY_PREFIX", "m1")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY", "25f206aea31c52f4f432c46bd6d5a249")
R2_SECRET_KEY = os.environ.get("R2_SECRET_KEY", "7a16548bb2b7060ff09dab76e683b8d5334eb1b002ffaf255b258fb6a7c7b0ab")

CACHE_DIR = Path(__file__).parent / "cache"

# ── Available pairs ────────────────────────────────────────────────────────────
ALL_PAIRS = [
    # FX majors & minors
    "audcad", "audchf", "audjpy", "audnzd", "audusd",
    "cadjpy", "chfjpy",
    "euraud", "eurcad", "eurchf", "eurgbp", "eurjpy", "eurnzd", "eurusd",
    "gbpaud", "gbpcad", "gbpchf", "gbpjpy", "gbpnzd", "gbpusd",
    "nzdjpy", "nzdusd",
    "usdcad", "usdchf", "usdjpy",
    # Commodities & indices
    "gold", "us2000", "us30", "nq", "spx500", "de30", "uk100",
]

DEFAULT_UNIVERSE = [
    "eurusd", "gbpusd", "audusd", "nzdusd", "usdcad", "usdchf", "usdjpy",
    "eurgbp", "eurjpy", "eurcad", "eurchf",
    "gbpjpy", "gbpcad", "gbpchf", "audjpy",
    "gold", "us2000", "us30",
]

DEFAULT_PARAMS = dict(
    entry_z      = 2.0,
    exit_z       = 0.5,
    stop_z       = 3.5,
    min_score    = 0.1,
    risk_pct     = 1.0,
    sl_atr_mult  = 2.0,
    corr_window  = 200,   # H1 bars for rolling correlation & OLS (~8 days)
    dir_window   = 24,    # H1 bars to measure "recent return" for direction
    warmup       = 300,   # H1 bars before any trading starts
    atr_period   = 70,    # M1 bars for ATR
    max_positions = 5,
    block_same_leg = True,
)

# ── Data loading ───────────────────────────────────────────────────────────────

def _s3():
    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def load_pair_m1(pair: str, force: bool = False) -> pd.DataFrame:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / f"{pair}_m1.parquet"

    if cache.exists() and not force:
        df = pd.read_parquet(cache)
    else:
        log.info(f"  Downloading {pair}_m1.parquet …")
        buf = io.BytesIO()
        _s3().download_fileobj(R2_BUCKET, f"{R2_PREFIX}/{pair}_m1.parquet", buf)
        buf.seek(0)
        df = pd.read_parquet(buf)
        df.to_parquet(cache)

    # Normalise index to UTC DatetimeIndex
    if "time" in df.columns:
        df["time"] = pd.to_datetime(df["time"], utc=True)
        df = df.set_index("time")
    else:
        df.index = pd.to_datetime(df.index, utc=True)
    df = df.sort_index()

    keep = [c for c in ("open", "high", "low", "close") if c in df.columns]
    return df[keep]


def resample_h1(df: pd.DataFrame) -> pd.DataFrame:
    return df.resample("1h").agg(open="first", high="max", low="min", close="last").dropna()


# ── Feature computation ────────────────────────────────────────────────────────

def _rolling_ols_beta(x: np.ndarray, y: np.ndarray, window: int) -> np.ndarray:
    """Vectorised rolling OLS beta: regress x on y."""
    n = len(x)
    out = np.full(n, np.nan)
    # Use pandas for speed
    xs = pd.Series(x)
    ys = pd.Series(y)
    cov = (xs * ys).rolling(window).mean() - xs.rolling(window).mean() * ys.rolling(window).mean()
    var = ys.rolling(window).var(ddof=0)
    beta = (cov / var.where(var > 1e-12)).values
    out[:] = beta
    return out


def compute_pair_features(
    close_a: pd.Series,
    close_b: pd.Series,
    corr_window: int,
    dir_window: int,
) -> pd.DataFrame:
    """
    Compute per-bar features for a pair combination on aligned H1 data.

    Returns DataFrame with columns:
      corr      – rolling Pearson correlation of log-returns
      corr_z    – Welford online z-score of corr (no lookahead)
      score     – hedge score: -corr*0.7 + |beta_spread|*0.3 (capped at 1)
      beta      – rolling OLS beta (log_ret_a ~ beta * log_ret_b)
      ret_a     – rolling dir_window cumulative log-return for A
      ret_b     – rolling dir_window cumulative log-return for B
    """
    df = pd.DataFrame({"a": close_a, "b": close_b}).dropna()
    if len(df) < corr_window + 10:
        return pd.DataFrame()

    log_a = np.log(df["a"])
    log_b = np.log(df["b"])
    ret_a = log_a.diff()
    ret_b = log_b.diff()

    # Rolling Pearson correlation on log-returns
    corr = ret_a.rolling(corr_window, min_periods=corr_window // 2).corr(ret_b)

    # Welford online z-score of corr (matches JS backtest exactly)
    mu, M2, n = 0.0, 0.0, 0
    z_vals = np.full(len(corr), np.nan)
    for i, c in enumerate(corr.values):
        if np.isnan(c):
            continue
        n += 1
        d1 = c - mu
        mu += d1 / n
        M2 += d1 * (c - mu)
        std = np.sqrt(M2 / (n - 1)) if n >= 2 else 0.0
        z_vals[i] = (c - mu) / std if std > 0.01 else 0.0

    # Rolling OLS beta (log_ret_a ~ beta * log_ret_b)
    beta = _rolling_ols_beta(ret_a.values, ret_b.values, corr_window)

    # Hedge score: mirrors JS hScore — rewards negative correlation & beta spread
    # score = (-corr * 0.7) + (min(|beta - 1| / 2, 1) * 0.3)
    # |beta - 1| approximates beta-spread relative to a "neutral" 1:1 relationship
    beta_spread = np.minimum(np.abs(beta - 1) / 2, 1.0)
    score_arr = (-corr.values * 0.7) + (beta_spread * 0.3)

    # Recent cumulative returns for direction logic
    cum_ret_a = ret_a.rolling(dir_window, min_periods=1).sum()
    cum_ret_b = ret_b.rolling(dir_window, min_periods=1).sum()

    return pd.DataFrame({
        "corr":   corr.values,
        "corr_z": z_vals,
        "beta":   beta,
        "score":  score_arr,
        "ret_a":  cum_ret_a.values,
        "ret_b":  cum_ret_b.values,
    }, index=df.index)


# ── ATR (vectorised, M1 bars up to ts) ────────────────────────────────────────

def atr_at(df_m1: pd.DataFrame, ts: pd.Timestamp, period: int = 70) -> float:
    sub = df_m1.loc[:ts].tail(period + 5)
    if len(sub) < 2:
        return float(sub["close"].iloc[-1] * 0.002) if len(sub) else 0.001
    h = sub["high"].values[1:]
    l = sub["low"].values[1:]
    pc = sub["close"].values[:-1]
    tr = np.maximum(h - l, np.maximum(np.abs(h - pc), np.abs(l - pc)))
    if len(tr) >= period:
        atr = tr[:period].mean()
        for v in tr[period:]:
            atr = (atr * (period - 1) + v) / period
        return float(atr)
    return float(tr.mean())


# ── SL check on M1 (vectorised) ───────────────────────────────────────────────

def check_sl(
    sl_a: float, dir_a: str, sl_b: float, dir_b: str,
    df_a: pd.DataFrame, df_b: pd.DataFrame,
    from_ts: pd.Timestamp, to_ts: pd.Timestamp,
) -> Optional[dict]:
    """
    Vectorised scan of M1 bars in (from_ts, to_ts] for first SL hit on either leg.
    Returns None if no hit, else dict with ts, exit_a, exit_b, why.
    """
    a_sl = df_a.loc[from_ts:to_ts]
    b_sl = df_b.loc[from_ts:to_ts]
    if a_sl.empty:
        return None

    hit_a = (a_sl["low"] <= sl_a) if dir_a == "LONG" else (a_sl["high"] >= sl_a)
    hit_b = (b_sl["low"] <= sl_b) if dir_b == "LONG" else (b_sl["high"] >= sl_b)

    first_a = hit_a.idxmax() if hit_a.any() else None
    first_b = hit_b.idxmax() if hit_b.any() else None

    if first_a is None and first_b is None:
        return None

    # Determine which hit first
    if first_a is not None and (first_b is None or first_a <= first_b):
        ts = first_a
        exit_a = sl_a
        exit_b_rows = b_sl.loc[:ts]
        exit_b = float(exit_b_rows["close"].iloc[-1]) if len(exit_b_rows) else sl_b
        both = first_b is not None and first_b <= ts
        why = "SL_BOTH" if both else "SL_A"
    else:
        ts = first_b
        exit_b = sl_b
        exit_a_rows = a_sl.loc[:ts]
        exit_a = float(exit_a_rows["close"].iloc[-1]) if len(exit_a_rows) else sl_a
        both = first_a is not None and first_a <= ts
        why = "SL_BOTH" if both else "SL_B"

    return dict(ts=ts, exit_a=exit_a, exit_b=exit_b, why=why)


# ── Data structures ────────────────────────────────────────────────────────────

@dataclass
class Position:
    pair_a: str
    pair_b: str
    dir_a: str
    dir_b: str
    entry_ts: pd.Timestamp
    entry_a: float
    entry_b: float
    sl_a: float
    sl_b: float
    z_entry: float
    score: float
    last_sl_check: pd.Timestamp


@dataclass
class Trade:
    pair_a: str
    pair_b: str
    dir_a: str
    dir_b: str
    entry_ts: pd.Timestamp
    exit_ts: pd.Timestamp
    entry_a: float
    entry_b: float
    exit_a: float
    exit_b: float
    sl_a: float
    sl_b: float
    z_entry: float
    score: float
    why: str

    @property
    def pnl_a(self) -> float:
        s = 1 if self.dir_a == "LONG" else -1
        return (self.exit_a - self.entry_a) / self.entry_a * s

    @property
    def pnl_b(self) -> float:
        s = 1 if self.dir_b == "LONG" else -1
        return (self.exit_b - self.entry_b) / self.entry_b * s

    @property
    def pnl_c(self) -> float:
        return (self.pnl_a + self.pnl_b) / 2

    @property
    def risk_a(self) -> float:
        return abs(self.entry_a - self.sl_a) / self.entry_a

    @property
    def risk_b(self) -> float:
        return abs(self.entry_b - self.sl_b) / self.entry_b

    @property
    def r_a(self) -> float:
        return self.pnl_a / self.risk_a if self.risk_a > 1e-8 else 0.0

    @property
    def r_b(self) -> float:
        return self.pnl_b / self.risk_b if self.risk_b > 1e-8 else 0.0

    @property
    def r_combined(self) -> float:
        return (self.r_a + self.r_b) / 2

    @property
    def duration_min(self) -> int:
        return int((self.exit_ts - self.entry_ts).total_seconds() / 60)

    @property
    def win(self) -> bool:
        return self.r_combined > 0


# ── Portfolio simulation ───────────────────────────────────────────────────────

def simulate_portfolio(
    universe: list,
    m1_data: dict,
    h1_data: dict,
    pair_features: dict,
    params: dict,
    from_ts: pd.Timestamp,
    to_ts: pd.Timestamp,
) -> list:
    trades: list[Trade] = []
    open_positions: list[Position] = []
    warmup = params["warmup"]

    # Build sorted list of all H1 timestamps in range
    all_ts = sorted(
        set().union(*[set(h1_data[p].index) for p in universe if p in h1_data])
    )
    all_ts = [t for t in all_ts if from_ts <= t <= to_ts]
    total = len(all_ts)
    log.info(f"Simulation: {total} H1 bars | {len(universe)} pairs | "
             f"{len(list(combinations(universe, 2)))} combos | "
             f"max {params['max_positions']} positions")

    for bar_idx, h1_ts in enumerate(all_ts):
        next_ts = all_ts[bar_idx + 1] if bar_idx + 1 < total else to_ts

        # ── 1. Manage open positions ──────────────────────────────────────────
        still_open: list[Position] = []
        for pos in open_positions:
            exited = False

            # SL check on M1 bars since last check
            sl_result = check_sl(
                pos.sl_a, pos.dir_a, pos.sl_b, pos.dir_b,
                m1_data[pos.pair_a], m1_data[pos.pair_b],
                pos.last_sl_check, h1_ts,
            )
            if sl_result:
                trades.append(Trade(
                    pair_a=pos.pair_a, pair_b=pos.pair_b,
                    dir_a=pos.dir_a, dir_b=pos.dir_b,
                    entry_ts=pos.entry_ts, exit_ts=sl_result["ts"],
                    entry_a=pos.entry_a, entry_b=pos.entry_b,
                    exit_a=sl_result["exit_a"], exit_b=sl_result["exit_b"],
                    sl_a=pos.sl_a, sl_b=pos.sl_b,
                    z_entry=pos.z_entry, score=pos.score, why=sl_result["why"],
                ))
                exited = True

            if not exited:
                # z-score exit / stop check
                fk = _feat_key(pos.pair_a, pos.pair_b)
                feat = pair_features.get(fk)
                if feat is not None:
                    feat_at = feat.loc[:h1_ts]
                    if len(feat_at) > 0:
                        z = feat_at["corr_z"].iloc[-1]
                        if not np.isnan(z):
                            ea = _last_close(h1_data, pos.pair_a, h1_ts, pos.entry_a)
                            eb = _last_close(h1_data, pos.pair_b, h1_ts, pos.entry_b)
                            if abs(z) <= params["exit_z"]:
                                trades.append(_make_trade(pos, h1_ts, ea, eb, "EXIT_Z"))
                                exited = True
                            elif abs(z) > params["stop_z"]:
                                trades.append(_make_trade(pos, h1_ts, ea, eb, "STOP_Z"))
                                exited = True

            if not exited:
                pos.last_sl_check = h1_ts
                still_open.append(pos)

        open_positions = still_open

        # ── 2. Scan for entry signals ─────────────────────────────────────────
        if len(open_positions) >= params["max_positions"]:
            continue

        blocked = set()
        if params["block_same_leg"]:
            for p in open_positions:
                blocked.add(p.pair_a)
                blocked.add(p.pair_b)
        open_pair_keys = {_feat_key(p.pair_a, p.pair_b) for p in open_positions}

        candidates = []
        for pair_a, pair_b in combinations(universe, 2):
            fk = _feat_key(pair_a, pair_b)
            if fk in open_pair_keys:
                continue
            if params["block_same_leg"] and (pair_a in blocked or pair_b in blocked):
                continue

            feat = pair_features.get(fk)
            if feat is None:
                continue

            feat_at = feat.loc[:h1_ts]
            if len(feat_at) < warmup:
                continue

            row = feat_at.iloc[-1]
            z, score, ret_a, ret_b = row["corr_z"], row["score"], row["ret_a"], row["ret_b"]

            if np.isnan(z) or np.isnan(score):
                continue
            if abs(z) < params["entry_z"] or score < params["min_score"]:
                continue

            candidates.append(dict(
                pair_a=pair_a, pair_b=pair_b, fk=fk,
                z=z, score=score, ret_a=ret_a, ret_b=ret_b,
                priority=abs(z) * max(score, 0.01),
            ))

        candidates.sort(key=lambda x: -x["priority"])

        # ── 3. Enter best non-conflicting signals ─────────────────────────────
        for cand in candidates:
            if len(open_positions) >= params["max_positions"]:
                break

            pair_a, pair_b = cand["pair_a"], cand["pair_b"]

            # Re-check blocking after entries this bar
            if params["block_same_leg"]:
                live_blocked = {s for p in open_positions for s in (p.pair_a, p.pair_b)}
                if pair_a in live_blocked or pair_b in live_blocked:
                    continue

            if pair_a not in h1_data or pair_b not in h1_data:
                continue
            ea = _last_close(h1_data, pair_a, h1_ts, None)
            eb = _last_close(h1_data, pair_b, h1_ts, None)
            if ea is None or eb is None:
                continue

            # Direction: SHORT outperformer / LONG underperformer
            # (mean-reversion bet: whoever ran more will revert)
            ret_a, ret_b = cand["ret_a"], cand["ret_b"]
            if ret_a >= ret_b:
                dir_a, dir_b = "SHORT", "LONG"
            else:
                dir_a, dir_b = "LONG", "SHORT"

            # ATR stops
            atr_a = atr_at(m1_data[pair_a], h1_ts, params["atr_period"])
            atr_b = atr_at(m1_data[pair_b], h1_ts, params["atr_period"])
            mult = params["sl_atr_mult"]
            sl_a = ea - atr_a * mult if dir_a == "LONG" else ea + atr_a * mult
            sl_b = eb - atr_b * mult if dir_b == "LONG" else eb + atr_b * mult

            open_positions.append(Position(
                pair_a=pair_a, pair_b=pair_b,
                dir_a=dir_a, dir_b=dir_b,
                entry_ts=h1_ts,
                entry_a=ea, entry_b=eb,
                sl_a=sl_a, sl_b=sl_b,
                z_entry=cand["z"], score=cand["score"],
                last_sl_check=h1_ts,
            ))

        if bar_idx % 1000 == 0 and bar_idx > 0:
            log.info(f"  {bar_idx}/{total} bars | open: {len(open_positions)} | trades: {len(trades)}")

    # Force-close all remaining positions at last bar
    if all_ts:
        last_ts = all_ts[-1]
        for pos in open_positions:
            ea = _last_close(h1_data, pos.pair_a, last_ts, pos.entry_a)
            eb = _last_close(h1_data, pos.pair_b, last_ts, pos.entry_b)
            trades.append(_make_trade(pos, last_ts, ea, eb, "END"))

    return trades


# ── Helpers ───────────────────────────────────────────────────────────────────

def _feat_key(a: str, b: str) -> tuple:
    return (min(a, b), max(a, b))


def _last_close(h1_data: dict, pair: str, ts: pd.Timestamp, fallback) -> Optional[float]:
    if pair not in h1_data:
        return fallback
    sub = h1_data[pair].loc[:ts]
    if sub.empty:
        return fallback
    v = float(sub["close"].iloc[-1])
    return None if np.isnan(v) else v


def _make_trade(pos: Position, exit_ts: pd.Timestamp, ea: float, eb: float, why: str) -> Trade:
    return Trade(
        pair_a=pos.pair_a, pair_b=pos.pair_b,
        dir_a=pos.dir_a, dir_b=pos.dir_b,
        entry_ts=pos.entry_ts, exit_ts=exit_ts,
        entry_a=pos.entry_a, entry_b=pos.entry_b,
        exit_a=ea, exit_b=eb,
        sl_a=pos.sl_a, sl_b=pos.sl_b,
        z_entry=pos.z_entry, score=pos.score, why=why,
    )


# ── Analytics ─────────────────────────────────────────────────────────────────

def analytics(trades: list, risk_pct: float = 1.0) -> dict:
    if not trades:
        return {}

    wins   = [t for t in trades if t.win]
    losses = [t for t in trades if not t.win]
    wr     = len(wins) / len(trades) * 100
    g_w    = sum(t.pnl_c for t in wins) * 100
    g_l    = abs(sum(t.pnl_c for t in losses)) * 100
    pf     = g_w / g_l if g_l > 0 else (99.0 if g_w > 0 else 0.0)
    avg_w  = g_w / len(wins)   if wins   else 0.0
    avg_l  = g_l / len(losses) if losses else 0.0
    expect = wr / 100 * avg_w - (1 - wr / 100) * avg_l

    # Compounding equity
    sorted_t = sorted(trades, key=lambda t: t.exit_ts)
    acct = peak = 100.0
    max_dd = 0.0
    for t in sorted_t:
        acct *= 1 + t.r_combined * risk_pct / 100
        peak  = max(peak, acct)
        max_dd = max(max_dd, (peak - acct) / peak * 100)
    total_pnl = acct - 100.0

    # Sharpe (annualised, trade-based)
    rs   = [t.r_combined for t in trades]
    mu_r = np.mean(rs)
    sd_r = np.std(rs)
    span = (sorted_t[-1].exit_ts - sorted_t[0].entry_ts).total_seconds()
    years = max(span / (365.25 * 86400), 1 / 52)
    sharpe = mu_r / sd_r * np.sqrt(len(trades) / years) if sd_r > 0 else 0.0

    # By pair
    by_pair = {}
    for t in trades:
        k = f"{t.pair_a}/{t.pair_b}"
        d = by_pair.setdefault(k, dict(n=0, wins=0, R=0.0, pnl=0.0))
        d["n"] += 1; d["R"] += t.r_combined; d["pnl"] += t.pnl_c * 100
        if t.win: d["wins"] += 1

    # By exit reason
    by_why = {}
    for t in trades:
        d = by_why.setdefault(t.why, dict(n=0, wins=0, pnl=0.0))
        d["n"] += 1; d["pnl"] += t.pnl_c * 100
        if t.win: d["wins"] += 1

    return dict(
        total=len(trades), wins=len(wins), losses=len(losses),
        win_rate=wr, profit_factor=pf, expectancy_pct=expect,
        total_pnl_pct=total_pnl, max_drawdown_pct=max_dd, sharpe=sharpe,
        avg_duration_h=np.mean([t.duration_min for t in trades]) / 60,
        by_pair=by_pair, by_why=by_why,
    )


def print_report(a: dict, trades: list):
    if not a:
        print("No trades generated — try lowering entry_z or min_score, or widening the date range.")
        return
    print("\n" + "=" * 64)
    print("  PORTFOLIO HEDGE BACKTEST — RESULTS")
    print("=" * 64)
    print(f"  Trades        {a['total']:>6}  ({a['wins']}W / {a['losses']}L)")
    print(f"  Win Rate      {a['win_rate']:>6.1f}%")
    print(f"  Profit Factor {a['profit_factor']:>6.2f}")
    print(f"  Sharpe        {a['sharpe']:>6.2f}")
    print(f"  Max Drawdown  {-a['max_drawdown_pct']:>6.1f}%")
    print(f"  Total P&L     {a['total_pnl_pct']:>+6.2f}%  (compounded, {DEFAULT_PARAMS['risk_pct']}% risk/trade)")
    print(f"  Expectancy    {a['expectancy_pct']:>+6.3f}% per trade")
    print(f"  Avg Duration  {a['avg_duration_h']:>6.1f}h")

    print("\n  By Exit Reason:")
    for why, d in sorted(a["by_why"].items(), key=lambda x: -x[1]["n"]):
        wr = d["wins"] / d["n"] * 100
        print(f"    {why:<12} {d['n']:>4} trades  {wr:>5.1f}%WR  {d['pnl']:>+8.2f}%PnL")

    print("\n  Top Pairs (by trade count):")
    top = sorted(a["by_pair"].items(), key=lambda x: -x[1]["n"])[:20]
    for pair, d in top:
        wr  = d["wins"] / d["n"] * 100
        avg_r = d["R"] / d["n"]
        print(f"    {pair:<24} {d['n']:>4} trades  {wr:>5.1f}%WR  {avg_r:>+5.2f}R avg  {d['pnl']:>+7.2f}%PnL")
    print()


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Multi-pair hedge portfolio backtester")
    ap.add_argument("--from",      dest="from_date",  default="2024-01-01")
    ap.add_argument("--to",        dest="to_date",    default="2026-06-01")
    ap.add_argument("--pairs",     nargs="+",         default=DEFAULT_UNIVERSE)
    ap.add_argument("--entry-z",   type=float,        default=DEFAULT_PARAMS["entry_z"])
    ap.add_argument("--exit-z",    type=float,        default=DEFAULT_PARAMS["exit_z"])
    ap.add_argument("--stop-z",    type=float,        default=DEFAULT_PARAMS["stop_z"])
    ap.add_argument("--min-score", type=float,        default=DEFAULT_PARAMS["min_score"])
    ap.add_argument("--sl-mult",   type=float,        default=DEFAULT_PARAMS["sl_atr_mult"])
    ap.add_argument("--max-pos",   type=int,          default=DEFAULT_PARAMS["max_positions"])
    ap.add_argument("--risk-pct",  type=float,        default=DEFAULT_PARAMS["risk_pct"])
    ap.add_argument("--corr-win",  type=int,          default=DEFAULT_PARAMS["corr_window"])
    ap.add_argument("--warmup",    type=int,          default=DEFAULT_PARAMS["warmup"])
    ap.add_argument("--force-dl",  action="store_true", help="Re-download M1 data from R2")
    ap.add_argument("--output",    default="results.json")
    args = ap.parse_args()

    params = {**DEFAULT_PARAMS,
              "entry_z": args.entry_z, "exit_z": args.exit_z, "stop_z": args.stop_z,
              "min_score": args.min_score, "sl_atr_mult": args.sl_mult,
              "max_positions": args.max_pos, "risk_pct": args.risk_pct,
              "corr_window": args.corr_win, "warmup": args.warmup}

    from_ts = pd.Timestamp(args.from_date, tz="UTC")
    to_ts   = pd.Timestamp(args.to_date,   tz="UTC")
    universe = [p for p in args.pairs if p in ALL_PAIRS]
    if not universe:
        log.error(f"No valid pairs. Available: {ALL_PAIRS}")
        sys.exit(1)

    log.info(f"Universe: {len(universe)} pairs — {args.from_date} → {args.to_date}")

    # Load data
    log.info("Loading M1 data …")
    m1_data, h1_data = {}, {}
    for pair in universe:
        try:
            df = load_pair_m1(pair, force=args.force_dl)
            df = df.loc[from_ts:to_ts]
            if len(df) < 5000:
                log.warning(f"  {pair}: only {len(df)} bars — skipped")
                continue
            m1_data[pair] = df
            h1_data[pair] = resample_h1(df)
            log.info(f"  {pair}: {len(df):>9,} M1 → {len(h1_data[pair]):>6,} H1")
        except Exception as e:
            log.warning(f"  {pair}: {e}")

    active = list(m1_data)
    log.info(f"Loaded {len(active)} pairs, {len(list(combinations(active, 2)))} combinations")

    # Compute features
    log.info("Computing rolling features (corr, z-score, OLS beta) …")
    pair_features = {}
    combos = list(combinations(active, 2))
    for i, (a, b) in enumerate(combos):
        fk = _feat_key(a, b)
        try:
            feat = compute_pair_features(
                h1_data[a]["close"], h1_data[b]["close"],
                params["corr_window"], params["dir_window"],
            )
            if len(feat):
                pair_features[fk] = feat
        except Exception as e:
            log.debug(f"  {a}/{b}: {e}")
        if (i + 1) % 50 == 0:
            log.info(f"  {i+1}/{len(combos)} combos …")

    log.info(f"Features ready for {len(pair_features)} combinations")

    # Simulate
    log.info("Simulating …")
    t0 = time.perf_counter()
    trades = simulate_portfolio(active, m1_data, h1_data, pair_features, params, from_ts, to_ts)
    elapsed = time.perf_counter() - t0
    log.info(f"Done in {elapsed:.1f}s — {len(trades)} trades")

    # Report
    a = analytics(trades, params["risk_pct"])
    print_report(a, trades)

    # Save JSON
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = dict(
        params=params,
        from_date=args.from_date, to_date=args.to_date,
        universe=active,
        analytics={k: v for k, v in a.items() if k not in ("by_pair", "by_why")},
        by_pair=a.get("by_pair", {}),
        by_why=a.get("by_why", {}),
        trades=[dict(
            pair_a=t.pair_a, pair_b=t.pair_b,
            dir_a=t.dir_a,   dir_b=t.dir_b,
            entry=t.entry_ts.isoformat(), exit=t.exit_ts.isoformat(),
            entry_a=round(t.entry_a, 6), entry_b=round(t.entry_b, 6),
            exit_a=round(t.exit_a,  6), exit_b=round(t.exit_b,  6),
            pnl_a=round(t.pnl_a * 100, 4), pnl_b=round(t.pnl_b * 100, 4),
            pnl_c=round(t.pnl_c * 100, 4),
            r_a=round(t.r_a, 3), r_b=round(t.r_b, 3), r=round(t.r_combined, 3),
            z=round(t.z_entry, 3), score=round(t.score, 4),
            why=t.why, win=t.win, duration_min=t.duration_min,
        ) for t in sorted(trades, key=lambda t: t.entry_ts)],
    )
    with open(out, "w") as f:
        json.dump(payload, f, indent=2)
    log.info(f"Results → {out}")


if __name__ == "__main__":
    main()
