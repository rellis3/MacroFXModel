#!/usr/bin/env python3
"""
Dynamic multi-pair hedge portfolio backtester — institutional model.

Mirrors how a stat-arb desk operates:
  - Pre-screens pairs via Engle-Granger cointegration test (only trades cointegrated pairs)
  - Scans all cointegrated pair combinations every H1 bar
  - Enters on z-score divergence, sizes legs beta-neutral (OLS hedge ratio)
  - Exits on spread z-score reversion or continuation (spread-level stops, not per-leg ATR)
  - Time stop closes positions held longer than max_hold_bars

Entry trigger : cointegration spread z-score — (log(A)−β·log(B) − mean) / std
Pair screen   : Engle-Granger cointegration test (p < coint_pval) + minimum |correlation|
Direction     : sign of spread deviation — SHORT A when log(A)−β·log(B) is above its rolling mean
Sizing        : beta-neutral — Leg B weighted by OLS hedge ratio |beta|
Exit          : z-score reverts to ±exit_z  |  z-score breaches ±stop_z  |  time stop

Usage:
    python portfolio_backtest.py --from 2024-01-01 --to 2026-01-01
    python portfolio_backtest.py --coint-pval 0.05 --max-hold-bars 48 --entry-z 2.5
    python portfolio_backtest.py --help
"""

import os, io, sys, json, time, logging, argparse
from pathlib import Path
from itertools import combinations
from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd
import boto3
from botocore.config import Config

try:
    from statsmodels.tsa.stattools import coint as _eg_coint
    _HAS_STATSMODELS = True
except ImportError:
    _HAS_STATSMODELS = False

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
    entry_z            = 2.0,
    exit_z             = 0.5,
    stop_z             = 3.5,
    min_score          = 0.1,
    min_corr           = 0.3,    # minimum |rolling correlation| to consider a pair (quality gate)
    risk_pct           = 1.0,    # allocation multiplier per trade (1.0 = 100% of unit)
    corr_window        = 200,    # H1 bars for rolling correlation, OLS, and spread stats (~8 days)
    warmup             = 300,    # H1 bars before any trading starts
    max_positions      = 5,
    block_same_leg     = True,
    coint_pval         = 0.05,   # Engle-Granger p-value threshold (lower = more stringent)
    max_hold_bars      = 48,     # H1 bars before time stop fires (~2 trading days)
    pair_cooldown_bars = 0,      # H1 bars to wait before re-entering same pair (0 = no cooldown)
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

    if "time" in df.columns:
        df["time"] = pd.to_datetime(df["time"], utc=True)
        df = df.set_index("time")
    else:
        df.index = pd.to_datetime(df.index, utc=True)
    df = df.sort_index()

    keep = [c for c in ("open", "high", "low", "close") if c in df.columns]
    return df[keep]


def resample_h1(df: pd.DataFrame) -> pd.DataFrame:
    return df.resample("1h").agg({"open": "first", "high": "max", "low": "min", "close": "last"}).dropna()


# ── Feature computation ────────────────────────────────────────────────────────

def _rolling_ols_beta(x: np.ndarray, y: np.ndarray, window: int) -> np.ndarray:
    """Vectorised rolling OLS beta: regress x on y."""
    xs = pd.Series(x)
    ys = pd.Series(y)
    cov = (xs * ys).rolling(window).mean() - xs.rolling(window).mean() * ys.rolling(window).mean()
    var = ys.rolling(window).var(ddof=0)
    return (cov / var.where(var > 1e-12)).values


def compute_pair_features(
    close_a: pd.Series,
    close_b: pd.Series,
    corr_window: int,
) -> pd.DataFrame:
    """
    Compute per-bar features for a pair combination on aligned H1 data.

    Returns DataFrame with columns:
      corr       – rolling Pearson correlation of log-returns (pair quality gate)
      score      – hedge score: -corr*0.7 + |beta_spread|*0.3
      beta       – rolling OLS beta (log_ret_a ~ beta * log_ret_b), used for beta-neutral sizing
      spread_z   – z-score of log(A)−β·log(B) vs its rolling mean/std; PRIMARY entry/exit signal
      spread_dev – raw deviation (spread_s − mean); sign alone determines trade direction
    """
    df = pd.DataFrame({"a": close_a, "b": close_b}).dropna()
    if len(df) < corr_window + 10:
        return pd.DataFrame()

    log_a = np.log(df["a"])
    log_b = np.log(df["b"])
    ret_a = log_a.diff()
    ret_b = log_b.diff()

    corr = ret_a.rolling(corr_window, min_periods=corr_window // 2).corr(ret_b)

    beta = _rolling_ols_beta(ret_a.values, ret_b.values, corr_window)
    beta_spread = np.minimum(np.abs(beta - 1) / 2, 1.0)
    score_arr = (-corr.values * 0.7) + (beta_spread * 0.3)

    # Welford online z-score of the cointegration spread S(t) = log(A) − β(t)·log(B).
    # No lookahead bias; accumulates the full series so the reference mean is the true long-run
    # mean of the stationary spread — correct for cointegrated pairs.
    # spread_z  → primary entry/exit/stop signal (how many σ from long-run mean)
    # spread_dev → sign determines direction (+ve = A overvalued → SHORT A, LONG B)
    spread_s = (log_a.values - beta * log_b.values)
    sp_mu, sp_M2, sp_n = 0.0, 0.0, 0
    sz_vals = np.full(len(spread_s), np.nan)
    sd_vals = np.full(len(spread_s), np.nan)
    for i, s in enumerate(spread_s):
        if np.isnan(s):
            continue
        sp_n += 1
        d1 = s - sp_mu
        sp_mu += d1 / sp_n
        sp_M2 += d1 * (s - sp_mu)
        sp_std = np.sqrt(sp_M2 / (sp_n - 1)) if sp_n >= 2 else 0.0
        sd_vals[i] = s - sp_mu
        sz_vals[i] = (s - sp_mu) / sp_std if sp_std > 0.001 else 0.0

    return pd.DataFrame({
        "corr":       corr.values,
        "beta":       beta,
        "score":      score_arr,
        "spread_z":   sz_vals,
        "spread_dev": sd_vals,
    }, index=df.index)


# ── Cointegration screening ────────────────────────────────────────────────────

def cointegration_pvalue(log_a: np.ndarray, log_b: np.ndarray) -> float:
    """
    Engle-Granger cointegration test on log-price arrays.
    Returns p-value — lower = more evidence of cointegration (stationary spread).
    """
    if not _HAS_STATSMODELS:
        raise RuntimeError("statsmodels required: pip install statsmodels")
    try:
        _, pval, _ = _eg_coint(log_a, log_b)
        return float(pval)
    except Exception:
        return 1.0


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
    beta: float          # OLS hedge ratio at entry, for beta-neutral sizing
    z_entry: float
    score: float
    entry_bar_idx: int   # H1 bar index at entry, used for time stop


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
    beta: float          # OLS hedge ratio at entry
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
        """Beta-neutral weighted combined P&L (fraction). Leg B notional = |beta| × Leg A."""
        hr = max(0.1, min(10.0, abs(self.beta)))
        return (self.pnl_a + self.pnl_b * hr) / (1.0 + hr)

    @property
    def r_a(self) -> float:
        return self.pnl_a * 100  # as percent

    @property
    def r_b(self) -> float:
        return self.pnl_b * 100  # as percent

    @property
    def r_combined(self) -> float:
        return self.pnl_c * 100  # as percent; used by equity curve

    @property
    def duration_min(self) -> int:
        return int((self.exit_ts - self.entry_ts).total_seconds() / 60)

    @property
    def win(self) -> bool:
        return self.pnl_c > 0


# ── Portfolio simulation ───────────────────────────────────────────────────────

def simulate_portfolio(
    universe: list,
    h1_data: dict,
    pair_features: dict,
    params: dict,
    from_ts: pd.Timestamp,
    to_ts: pd.Timestamp,
) -> list:
    trades: list[Trade] = []
    open_positions: list[Position] = []
    warmup    = params["warmup"]
    max_hold  = params["max_hold_bars"]
    cooldown  = params.get("pair_cooldown_bars", 0)
    pair_last_close: dict = {}  # fk -> bar_idx of last close; enforces cooldown

    all_ts = sorted(
        set().union(*[set(h1_data[p].index) for p in universe if p in h1_data])
    )
    all_ts = [t for t in all_ts if from_ts <= t <= to_ts]
    total = len(all_ts)
    log.info(f"Simulation: {total} H1 bars | {len(universe)} pairs | "
             f"{len(pair_features)} cointegrated combos | "
             f"max {params['max_positions']} positions")

    for bar_idx, h1_ts in enumerate(all_ts):

        # ── 1. Manage open positions ──────────────────────────────────────────
        still_open: list[Position] = []
        for pos in open_positions:
            exited = False

            # Time stop: spread hasn't reverted within the expected half-life window
            if bar_idx - pos.entry_bar_idx >= max_hold:
                ea = _last_close(h1_data, pos.pair_a, h1_ts, pos.entry_a)
                eb = _last_close(h1_data, pos.pair_b, h1_ts, pos.entry_b)
                trades.append(_make_trade(pos, h1_ts, ea, eb, "TIME_STOP"))
                exited = True

            if not exited:
                # Spread z-score exit and stop — compare same signal used at entry
                fk = _feat_key(pos.pair_a, pos.pair_b)
                feat = pair_features.get(fk)
                if feat is not None:
                    feat_at = feat.loc[:h1_ts]
                    if len(feat_at) > 0:
                        z = feat_at["spread_z"].iloc[-1]
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
                still_open.append(pos)
            elif cooldown > 0:
                pair_last_close[_feat_key(pos.pair_a, pos.pair_b)] = bar_idx

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
            if cooldown > 0 and bar_idx - pair_last_close.get(fk, -cooldown) < cooldown:
                continue

            feat = pair_features.get(fk)
            if feat is None:
                continue

            feat_at = feat.loc[:h1_ts]
            if len(feat_at) < warmup:
                continue

            row        = feat_at.iloc[-1]
            z          = row["spread_z"]
            score      = row["score"]
            beta       = row["beta"]
            spread_dev = row["spread_dev"]
            corr       = row["corr"]

            if np.isnan(z) or np.isnan(score) or np.isnan(beta) or np.isnan(spread_dev):
                continue
            if abs(corr) < params.get("min_corr", 0.3):
                continue
            if abs(z) < params["entry_z"] or score < params["min_score"]:
                continue

            candidates.append(dict(
                pair_a=pair_a, pair_b=pair_b, fk=fk,
                z=z, score=score, beta=beta, spread_dev=spread_dev,
                priority=abs(z) * max(score, 0.01),
            ))

        candidates.sort(key=lambda x: -x["priority"])

        # ── 3. Enter best non-conflicting signals ─────────────────────────────
        for cand in candidates:
            if len(open_positions) >= params["max_positions"]:
                break

            pair_a, pair_b = cand["pair_a"], cand["pair_b"]

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

            # Direction: cointegration spread level vs its rolling mean.
            # spread_dev > 0 → A overvalued relative to B → SHORT A, LONG B (expect reversion down)
            # spread_dev < 0 → A undervalued relative to B → LONG A, SHORT B (expect reversion up)
            if cand["spread_dev"] >= 0:
                dir_a, dir_b = "SHORT", "LONG"
            else:
                dir_a, dir_b = "LONG", "SHORT"

            open_positions.append(Position(
                pair_a=pair_a, pair_b=pair_b,
                dir_a=dir_a, dir_b=dir_b,
                entry_ts=h1_ts,
                entry_a=ea, entry_b=eb,
                beta=cand["beta"],
                z_entry=cand["z"], score=cand["score"],
                entry_bar_idx=bar_idx,
            ))

        if bar_idx % 1000 == 0 and bar_idx > 0:
            log.info(f"  {bar_idx}/{total} bars | open: {len(open_positions)} | trades: {len(trades)}")

    # Force-close remaining positions at last bar
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
        beta=pos.beta,
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

    # Compounding equity (risk_pct = allocation multiplier per trade)
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

    curve = [{"date": t.exit_ts.strftime("%Y-%m-%d"), "v": round(acct2 - 100, 3)}
             for t, acct2 in zip(sorted_t, _equity_curve(sorted_t, risk_pct))]

    return dict(
        total=len(trades), wins=len(wins), losses=len(losses),
        win_rate=wr, profit_factor=pf, expectancy_pct=expect,
        total_pnl_pct=total_pnl, max_drawdown_pct=max_dd, sharpe=sharpe,
        avg_duration_h=np.mean([t.duration_min for t in trades]) / 60,
        by_pair=by_pair, by_why=by_why, curve=curve,
    )


def _equity_curve(sorted_trades: list, risk_pct: float) -> list:
    acct = 100.0
    out = []
    for t in sorted_trades:
        acct *= 1 + t.r_combined * risk_pct / 100
        out.append(acct)
    return out


def print_report(a: dict, trades: list):
    if not a:
        print("No trades generated — try lowering --entry-z or --coint-pval, or widening the date range.")
        return
    print("\n" + "=" * 64)
    print("  PORTFOLIO HEDGE BACKTEST — RESULTS (institutional model)")
    print("=" * 64)
    print(f"  Trades        {a['total']:>6}  ({a['wins']}W / {a['losses']}L)")
    print(f"  Win Rate      {a['win_rate']:>6.1f}%  (institutional target: 60–72%)")
    print(f"  Profit Factor {a['profit_factor']:>6.2f}")
    print(f"  Sharpe        {a['sharpe']:>6.2f}")
    print(f"  Max Drawdown  {-a['max_drawdown_pct']:>6.1f}%")
    print(f"  Total P&L     {a['total_pnl_pct']:>+6.2f}%  (compounded, {DEFAULT_PARAMS['risk_pct']}× allocation)")
    print(f"  Expectancy    {a['expectancy_pct']:>+6.3f}% per trade")
    print(f"  Avg Duration  {a['avg_duration_h']:>6.1f}h")

    print("\n  By Exit Reason:")
    for why, d in sorted(a["by_why"].items(), key=lambda x: -x[1]["n"]):
        wr = d["wins"] / d["n"] * 100
        print(f"    {why:<12} {d['n']:>4} trades  {wr:>5.1f}%WR  {d['pnl']:>+8.2f}%PnL")

    print("\n  Top Pairs (by trade count):")
    top = sorted(a["by_pair"].items(), key=lambda x: -x[1]["n"])[:20]
    for pair, d in top:
        wr    = d["wins"] / d["n"] * 100
        avg_r = d["R"] / d["n"]
        print(f"    {pair:<24} {d['n']:>4} trades  {wr:>5.1f}%WR  {avg_r:>+5.2f}% avg  {d['pnl']:>+7.2f}%PnL")
    print()


# ── HTML report ───────────────────────────────────────────────────────────────

def generate_html_report(
    a: dict, trades: list, params: dict,
    from_date: str, to_date: str,
    universe: list, n_cointegrated: int = 0,
) -> str:
    import json as _json

    sorted_t = sorted(trades, key=lambda t: t.entry_ts)

    trade_rows = ""
    for i, t in enumerate(sorted_t):
        rc = t.r_combined
        win_cls = "pos" if t.win else "neg"
        why_cls = t.why.replace("_", "-").lower()
        da_cls  = "dl" if t.dir_a == "LONG" else "ds"
        db_cls  = "dl" if t.dir_b == "LONG" else "ds"
        trade_rows += f"""<tr>
          <td style="color:var(--muted)">{i+1}</td>
          <td>{t.entry_ts.strftime("%Y-%m-%d %H:%M")}</td>
          <td style="font-weight:600">{t.pair_a.upper()}</td>
          <td><span class="{da_cls}">{'▲' if t.dir_a=='LONG' else '▼'} {t.dir_a}</span></td>
          <td style="font-weight:600">{t.pair_b.upper()}</td>
          <td><span class="{db_cls}">{'▲' if t.dir_b=='LONG' else '▼'} {t.dir_b}</span></td>
          <td>{t.z_entry:+.2f}</td>
          <td>{t.score:.3f}</td>
          <td style="color:var(--muted)">{t.beta:+.2f}</td>
          <td class="{win_cls}">{t.r_a:+.2f}%</td>
          <td class="{win_cls}">{t.r_b:+.2f}%</td>
          <td class="{win_cls}" style="font-weight:700">{rc:+.2f}%</td>
          <td><span class="ep ep-{why_cls}">{t.why}</span></td>
          <td style="color:var(--muted)">{_fmt_dur(t.duration_min)}</td>
          <td>{t.exit_ts.strftime("%Y-%m-%d %H:%M")}</td>
        </tr>"""

    by_pair_rows = ""
    for pair, d in sorted(a["by_pair"].items(), key=lambda x: -x[1]["n"]):
        wr    = d["wins"] / d["n"] * 100
        avg_r = d["R"] / d["n"]
        wr_cls = "pos" if wr >= 50 else "neg"
        r_cls  = "pos" if avg_r >= 0 else "neg"
        by_pair_rows += f"""<tr>
          <td style="font-weight:600">{pair.upper()}</td>
          <td>{d['n']}</td>
          <td class="{wr_cls}">{wr:.1f}%</td>
          <td class="{r_cls}">{avg_r:+.2f}%</td>
          <td class="{'pos' if d['pnl']>=0 else 'neg'}">{d['pnl']:+.2f}%</td>
        </tr>"""

    by_why_rows = ""
    for why, d in sorted(a["by_why"].items(), key=lambda x: -x[1]["n"]):
        wr = d["wins"] / d["n"] * 100 if d["n"] else 0
        why_cls = why.replace("_", "-").lower()
        by_why_rows += f"""<tr>
          <td><span class="ep ep-{why_cls}">{why}</span></td>
          <td>{d['n']}</td>
          <td class="{'pos' if wr>=50 else 'neg'}">{wr:.1f}%</td>
          <td class="{'pos' if d['pnl']>=0 else 'neg'}">{d['pnl']:+.2f}%</td>
        </tr>"""

    pf_val = a["profit_factor"]
    pf_str = "∞" if pf_val >= 99 else f"{pf_val:.2f}"
    pf_cls = "kv-g" if pf_val >= 1.5 else ("kv-y" if pf_val >= 1 else "kv-r")
    wr_cls = "kv-g" if a["win_rate"] >= 60 else ("kv-y" if a["win_rate"] >= 50 else "kv-r")
    sh_cls = "kv-g" if a["sharpe"] >= 2 else ("kv-b" if a["sharpe"] >= 1 else "kv-y")
    pnl_cls = "kv-g" if a["total_pnl_pct"] >= 0 else "kv-r"
    exp_cls = "kv-g" if a["expectancy_pct"] >= 0 else "kv-r"

    curve_json = _json.dumps(a.get("curve", []))
    n_total_combos = len(universe) * (len(universe) - 1) // 2
    param_str = (f"EntryZ={params['entry_z']} · ExitZ={params['exit_z']} · StopZ={params['stop_z']} · "
                 f"MinScore={params['min_score']} · CoIntP≤{params['coint_pval']} · "
                 f"MaxHold={params['max_hold_bars']}H · MaxPos={params['max_positions']} · "
                 f"Risk={params['risk_pct']}×")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Portfolio Hedge Backtest</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
:root{{
  --bg:#0f1117;--bg2:#161b27;--bg3:#1e2535;--bg4:#252d3e;
  --border:#2a3347;--border2:#374160;
  --text:#e2e8f0;--muted:#64748b;
  --green:#22c55e;--red:#ef4444;--yellow:#f59e0b;--blue:#3b82f6;--accent:#4f8ef7;
  --font:'Inter',system-ui,sans-serif;--mono:'Fira Mono','JetBrains Mono',monospace;
}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:var(--bg);color:var(--text);font-family:var(--font);font-size:14px;min-height:100vh}}
.topbar{{display:flex;align-items:center;gap:12px;padding:12px 20px;background:var(--bg2);border-bottom:1px solid var(--border)}}
.topbar h1{{font-size:15px;font-weight:700}}
.badge{{background:var(--bg3);border:1px solid var(--border2);padding:2px 10px;border-radius:999px;font-size:11px;color:var(--muted)}}
.badge-g{{border-color:#22c55e44;color:var(--green)}}
.params{{font-size:11px;color:var(--muted);padding:8px 20px;background:var(--bg2);border-bottom:1px solid var(--border)}}
.params span{{color:var(--text)}}
.section{{padding:14px 20px}}
.kpi-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:14px}}
.kpi-card{{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:11px;text-align:center}}
.kv{{font-size:21px;font-weight:700;font-family:var(--mono);margin-bottom:2px}}
.kl{{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}}
.ks{{font-size:10px;color:var(--muted);margin-top:2px}}
.kv-g{{color:var(--green)}}.kv-r{{color:var(--red)}}.kv-y{{color:var(--yellow)}}.kv-b{{color:var(--blue)}}.kv-m{{color:var(--muted)}}
.pos{{color:var(--green)}}.neg{{color:var(--red)}}
.eq-wrap{{background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px;height:200px;position:relative}}
.stats-row{{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}}
@media(max-width:700px){{.stats-row{{grid-template-columns:1fr}}}}
.spanel{{background:var(--bg2);border:1px solid var(--border);border-radius:10px;overflow:hidden}}
.spanel-hd{{padding:9px 14px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}}
.stbl{{width:100%;border-collapse:collapse;font-size:12px}}
.stbl th{{text-align:left;padding:6px 10px;color:var(--muted);font-size:10px;text-transform:uppercase;border-bottom:1px solid var(--border)}}
.stbl td{{padding:6px 10px;border-bottom:1px solid rgba(42,51,71,.5)}}
.stbl tr:last-child td{{border-bottom:none}}
.tlog-wrap{{background:var(--bg2);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:40px}}
.tlog-hd{{display:flex;align-items:center;justify-content:space-between;padding:9px 14px;border-bottom:1px solid var(--border)}}
.tlog-title{{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}}
.tbl-wrap{{overflow-x:auto}}
.tlog-tbl{{width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap}}
.tlog-tbl th{{text-align:left;padding:6px 10px;color:var(--muted);font-size:10px;text-transform:uppercase;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg2);cursor:pointer;user-select:none}}
.tlog-tbl th:hover{{color:var(--text)}}
.tlog-tbl td{{padding:6px 10px;border-bottom:1px solid rgba(42,51,71,.5)}}
.tlog-tbl tr:last-child td{{border-bottom:none}}
.tlog-tbl tr:hover td{{background:rgba(79,142,247,.05)}}
.dl{{color:var(--green);font-weight:600}}.ds{{color:var(--red);font-weight:600}}
.ep{{display:inline-block;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase}}
.ep-exit-z{{background:rgba(34,197,94,.12);color:var(--green)}}
.ep-stop-z{{background:rgba(239,68,68,.12);color:var(--red)}}
.ep-time-stop{{background:rgba(245,158,11,.12);color:var(--yellow)}}
.ep-end{{background:rgba(100,116,139,.12);color:var(--muted)}}
.universe-chips{{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}}
.chip{{padding:2px 9px;border-radius:5px;background:var(--bg3);border:1px solid var(--border2);font-size:11px;color:var(--muted)}}
</style>
</head>
<body>
<div class="topbar">
  <h1>Portfolio Hedge Backtest</h1>
  <span class="badge">{from_date} → {to_date}</span>
  <span class="badge">{a['total']} trades</span>
  <span class="badge">{len(universe)} pairs · {n_total_combos} combos</span>
  <span class="badge badge-g">{n_cointegrated} cointegrated</span>
</div>
<div class="params">
  <b style="color:var(--text)">Parameters:</b> {param_str}
  <div class="universe-chips" style="margin-top:5px">
    {''.join(f'<span class="chip">{p.upper()}</span>' for p in universe)}
  </div>
</div>

<div class="section">
  <div class="kpi-grid">
    <div class="kpi-card"><div class="kv {wr_cls}">{a['win_rate']:.1f}%</div><div class="kl">Win Rate</div><div class="ks">{a['wins']}W / {a['losses']}L</div></div>
    <div class="kpi-card"><div class="kv {pf_cls}">{pf_str}</div><div class="kl">Profit Factor</div></div>
    <div class="kpi-card"><div class="kv {sh_cls}">{a['sharpe']:.2f}</div><div class="kl">Sharpe</div></div>
    <div class="kpi-card"><div class="kv kv-r">-{a['max_drawdown_pct']:.1f}%</div><div class="kl">Max Drawdown</div></div>
    <div class="kpi-card"><div class="kv {pnl_cls}">{a['total_pnl_pct']:+.2f}%</div><div class="kl">Total P&L</div><div class="ks">compounded</div></div>
    <div class="kpi-card"><div class="kv {exp_cls}">{a['expectancy_pct']:+.3f}%</div><div class="kl">Expectancy</div><div class="ks">per trade</div></div>
    <div class="kpi-card"><div class="kv kv-m">{a['total']}</div><div class="kl">Trades</div><div class="ks">{a['wins']}W · {a['losses']}L</div></div>
    <div class="kpi-card"><div class="kv kv-m">{a['avg_duration_h']:.1f}h</div><div class="kl">Avg Duration</div></div>
  </div>

  <div class="eq-wrap">
    <canvas id="eqChart"></canvas>
  </div>

  <div class="stats-row">
    <div class="spanel">
      <div class="spanel-hd">By Exit Reason</div>
      <table class="stbl">
        <thead><tr><th>Reason</th><th>Trades</th><th>Win%</th><th>P&L</th></tr></thead>
        <tbody>{by_why_rows}</tbody>
      </table>
    </div>
    <div class="spanel">
      <div class="spanel-hd">By Pair — Top 20</div>
      <table class="stbl">
        <thead><tr><th>Pair</th><th>N</th><th>Win%</th><th>Avg PnL%</th><th>Tot P&L%</th></tr></thead>
        <tbody>{by_pair_rows}</tbody>
      </table>
    </div>
  </div>

  <div class="tlog-wrap">
    <div class="tlog-hd">
      <span class="tlog-title">Trade Log — {a['total']} trades</span>
      <input id="srch" placeholder="Filter pair…" style="padding:4px 9px;background:var(--bg3);border:1px solid var(--border2);border-radius:5px;color:var(--text);font-size:12px;width:160px"/>
    </div>
    <div class="tbl-wrap">
      <table class="tlog-tbl" id="tlog">
        <thead><tr>
          <th>#</th><th>Entry</th>
          <th>Pair A</th><th>Dir A</th>
          <th>Pair B</th><th>Dir B</th>
          <th>Z</th><th>Score</th><th>β</th>
          <th>PnL-A%</th><th>PnL-B%</th><th>PnL%</th>
          <th>Exit</th><th>Duration</th><th>Closed</th>
        </tr></thead>
        <tbody id="tlogBody">{trade_rows}</tbody>
      </table>
    </div>
  </div>
</div>

<script>
const CURVE = {curve_json};

const ctx = document.getElementById('eqChart').getContext('2d');
new Chart(ctx, {{
  type: 'line',
  data: {{
    labels: CURVE.map(p => p.date),
    datasets: [{{
      data: CURVE.map(p => p.v),
      borderColor: '#4f8ef7',
      backgroundColor: 'rgba(79,142,247,.07)',
      fill: true, tension: .25, pointRadius: 0, borderWidth: 1.5,
    }}]
  }},
  options: {{
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: {{ legend: {{display:false}}, tooltip: {{ callbacks: {{ label: ctx => (ctx.parsed.y >= 0 ? '+' : '') + ctx.parsed.y.toFixed(2) + '%' }} }} }},
    scales: {{
      x: {{ grid: {{color:'rgba(255,255,255,.04)'}}, ticks: {{color:'#5a6380',maxTicksLimit:10,font:{{size:10}}}} }},
      y: {{ grid: {{color:'rgba(255,255,255,.04)'}}, ticks: {{color:'#5a6380',font:{{size:10}},callback:v=>(v>=0?'+':'')+v.toFixed(1)+'%'}} }}
    }}
  }}
}});

document.getElementById('srch').addEventListener('input', function() {{
  const q = this.value.toUpperCase();
  document.querySelectorAll('#tlogBody tr').forEach(tr => {{
    tr.style.display = !q || tr.innerText.toUpperCase().includes(q) ? '' : 'none';
  }});
}});
</script>
</body>
</html>"""


def _fmt_dur(minutes: int) -> str:
    if minutes < 60:
        return f"{minutes}m"
    h = minutes // 60
    m = minutes % 60
    return f"{h}h {m}m" if m else f"{h}h"


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Multi-pair hedge portfolio backtester — institutional model")
    ap.add_argument("--from",          dest="from_date",    default="2024-01-01")
    ap.add_argument("--to",            dest="to_date",      default="2026-06-01")
    ap.add_argument("--pairs",          nargs="+",           default=DEFAULT_UNIVERSE)
    ap.add_argument("--exclude",        nargs="+",           default=[],
                    metavar="SYMBOL",    help="Exclude these instruments from pair formation (e.g. --exclude USDCHF)")
    ap.add_argument("--entry-z",        type=float,          default=DEFAULT_PARAMS["entry_z"])
    ap.add_argument("--exit-z",        type=float,          default=DEFAULT_PARAMS["exit_z"])
    ap.add_argument("--stop-z",        type=float,          default=DEFAULT_PARAMS["stop_z"])
    ap.add_argument("--min-score",     type=float,          default=DEFAULT_PARAMS["min_score"])
    ap.add_argument("--max-pos",       type=int,            default=DEFAULT_PARAMS["max_positions"])
    ap.add_argument("--risk-pct",      type=float,          default=DEFAULT_PARAMS["risk_pct"])
    ap.add_argument("--corr-win",      type=int,            default=DEFAULT_PARAMS["corr_window"])
    ap.add_argument("--warmup",        type=int,            default=DEFAULT_PARAMS["warmup"])
    ap.add_argument("--coint-pval",    type=float,          default=DEFAULT_PARAMS["coint_pval"],
                    help="Engle-Granger p-value threshold (default 0.05; try 0.10 if no pairs pass)")
    ap.add_argument("--min-corr",       type=float,          default=DEFAULT_PARAMS["min_corr"],
                    help="Minimum |rolling correlation| to consider a pair (default 0.3)")
    ap.add_argument("--max-hold-bars",  type=int,            default=DEFAULT_PARAMS["max_hold_bars"],
                    help="H1 bars before time stop fires (default 48 = ~2 trading days)")
    ap.add_argument("--pair-cooldown",  type=int,            default=DEFAULT_PARAMS["pair_cooldown_bars"],
                    help="H1 bars to wait before re-entering same pair after close (0 = no cooldown)")
    ap.add_argument("--force-dl",       action="store_true", help="Re-download M1 data from R2")
    ap.add_argument("--output",         default="results.json")
    args = ap.parse_args()

    if not _HAS_STATSMODELS:
        log.error("statsmodels not installed — run: pip install statsmodels")
        sys.exit(1)

    params = {**DEFAULT_PARAMS,
              "entry_z": args.entry_z, "exit_z": args.exit_z, "stop_z": args.stop_z,
              "min_score": args.min_score, "min_corr": args.min_corr,
              "max_positions": args.max_pos, "risk_pct": args.risk_pct,
              "corr_window": args.corr_win, "warmup": args.warmup,
              "coint_pval": args.coint_pval, "max_hold_bars": args.max_hold_bars,
              "pair_cooldown_bars": args.pair_cooldown}

    from_ts  = pd.Timestamp(args.from_date, tz="UTC")
    to_ts    = pd.Timestamp(args.to_date,   tz="UTC")
    excluded = {s.lower() for s in args.exclude}
    universe = [p for p in args.pairs if p in ALL_PAIRS and p.lower() not in excluded]
    if not universe:
        log.error(f"No valid pairs. Available: {ALL_PAIRS}")
        sys.exit(1)
    if excluded:
        log.info(f"Excluded instruments: {sorted(excluded)}")

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

    # Compute rolling features
    log.info("Computing rolling features (corr, z-score, OLS beta) …")
    pair_features = {}
    combos = list(combinations(active, 2))
    for i, (a, b) in enumerate(combos):
        fk = _feat_key(a, b)
        try:
            feat = compute_pair_features(
                h1_data[a]["close"], h1_data[b]["close"],
                params["corr_window"],
            )
            if len(feat):
                pair_features[fk] = feat
        except Exception as e:
            log.debug(f"  {a}/{b}: {e}")
        if (i + 1) % 50 == 0:
            log.info(f"  {i+1}/{len(combos)} combos …")

    log.info(f"Features ready for {len(pair_features)} combinations")

    # Cointegration screening — only trade pairs with a stationary (mean-reverting) spread
    log.info(f"Cointegration screening {len(pair_features)} combinations "
             f"(Engle-Granger p < {params['coint_pval']}) …")
    cointegrated = {}
    for fk, feat in pair_features.items():
        a, b = fk
        try:
            sa = np.log(h1_data[a]["close"].dropna())
            sb = np.log(h1_data[b]["close"].dropna())
            common = sa.index.intersection(sb.index)
            if len(common) < 200:
                continue
            pval = cointegration_pvalue(sa.loc[common].values, sb.loc[common].values)
            if pval <= params["coint_pval"]:
                cointegrated[fk] = feat
                log.debug(f"  {a}/{b}: PASS  p={pval:.4f}")
            else:
                log.debug(f"  {a}/{b}: skip  p={pval:.4f}")
        except Exception as e:
            log.debug(f"  {a}/{b}: coint error — {e}")

    n_pass  = len(cointegrated)
    n_total = len(pair_features)
    log.info(f"Cointegration: {n_pass}/{n_total} pairs pass (p < {params['coint_pval']})")
    if n_pass == 0:
        log.warning("No cointegrated pairs found — try raising --coint-pval (e.g. 0.10) "
                    "or widening the date range")
    pair_features = cointegrated

    # Simulate
    log.info("Simulating …")
    t0 = time.perf_counter()
    trades = simulate_portfolio(active, h1_data, pair_features, params, from_ts, to_ts)
    elapsed = time.perf_counter() - t0
    log.info(f"Done in {elapsed:.1f}s — {len(trades)} trades")

    # Report
    a = analytics(trades, params["risk_pct"])
    print_report(a, trades)

    # Save HTML report
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    html_path = out.with_suffix(".html")
    html = generate_html_report(
        a, trades, params, args.from_date, args.to_date, active,
        n_cointegrated=n_pass,
    )
    html_path.write_text(html, encoding="utf-8")
    log.info(f"HTML report → {html_path}")
    import webbrowser
    webbrowser.open(html_path.resolve().as_uri())

    # Save JSON
    payload = dict(
        params=params,
        from_date=args.from_date, to_date=args.to_date,
        universe=active,
        n_cointegrated=n_pass,
        analytics={k: v for k, v in a.items() if k not in ("by_pair", "by_why", "curve")},
        by_pair=a.get("by_pair", {}),
        by_why=a.get("by_why", {}),
        trades=[dict(
            pair_a=t.pair_a, pair_b=t.pair_b,
            dir_a=t.dir_a,   dir_b=t.dir_b,
            entry=t.entry_ts.isoformat(), exit=t.exit_ts.isoformat(),
            entry_a=round(t.entry_a, 6), entry_b=round(t.entry_b, 6),
            exit_a=round(t.exit_a,  6),  exit_b=round(t.exit_b,  6),
            beta=round(t.beta, 4),
            pnl_a=round(t.pnl_a * 100, 4), pnl_b=round(t.pnl_b * 100, 4),
            pnl_c=round(t.pnl_c * 100, 4),
            why=t.why, win=t.win, duration_min=t.duration_min,
        ) for t in sorted(trades, key=lambda t: t.entry_ts)],
    )
    with open(out, "w") as f:
        json.dump(payload, f, indent=2)
    log.info(f"Results → {out}")


if __name__ == "__main__":
    main()
