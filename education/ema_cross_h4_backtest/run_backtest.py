"""
9/21 EMA CROSS ON M5, PULLBACK-AND-CONTINUE, FILTERED BY THE LAST H4 CLOSE.

Pre-registration: education/ema_cross_h4_backtest/PREREGISTRATION.md (commit
217fd2d, written and committed BEFORE this ran). Every ambiguity in the stated
rule is resolved there, with its alternative declared.

Costs are MEASURED, not assumed: the M1 parquet files carry real per-bar
spread_open/spread_close, charged on entry and exit. The execution feasibility
gate (spread/ATR > 0.15 = dead) is computed and printed BEFORE any P&L number.

Usage: .venv/Scripts/python.exe education/ema_cross_h4_backtest/run_backtest.py
"""
import json
import numpy as np
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PQ = ROOT / "Oanda Parquet Files"
OUT = Path(__file__).resolve().parent

INSTRUMENTS = {"EUR_USD": "eurusd", "GBP_USD": "gbpusd", "NAS100_USD": "nas100_usd"}

FAST, SLOW = 9, 21
SETUP_EXPIRY_BARS = 12        # 1 hour on M5
ATR_LEN = 14
IS_FRACTION = 0.60
FEASIBILITY_GATE = 0.15


def load_m5(stem):
    """M1 -> M5 OHLC, carrying the real spread. Spread is taken as the bar's mean
    so a 5-minute bar is charged what it actually cost to trade inside it."""
    df = pd.read_parquet(PQ / f"{stem}_m1.parquet")
    df = df[~df.index.duplicated(keep="first")].sort_index()
    sp = (df["spread_open"] + df["spread_close"]) / 2.0
    df = df.assign(_sp=sp)
    m5 = df.resample("5min").agg(
        open=("open", "first"), high=("high", "max"),
        low=("low", "min"), close=("close", "last"),
        spread=("_sp", "mean"))
    return m5.dropna(subset=["open", "high", "low", "close"])


def add_indicators(m5):
    m5 = m5.copy()
    m5["ema_f"] = m5["close"].ewm(span=FAST, adjust=False).mean()
    m5["ema_s"] = m5["close"].ewm(span=SLOW, adjust=False).mean()

    tr = pd.concat([m5["high"] - m5["low"],
                    (m5["high"] - m5["close"].shift()).abs(),
                    (m5["low"] - m5["close"].shift()).abs()], axis=1).max(axis=1)
    m5["atr"] = tr.ewm(span=ATR_LEN, adjust=False).mean()

    # last COMPLETED H4 close, known at the signal bar -> shift by one H4 period
    h4 = m5["close"].resample("4h").last()
    m5["h4_ref"] = h4.shift(1).reindex(m5.index, method="ffill")
    return m5


def find_trades(m5, pullback_ema="ema_f", expiry=SETUP_EXPIRY_BARS):
    """Walk forward bar by bar. Population is counted at every filter."""
    o = m5["open"].to_numpy(); h = m5["high"].to_numpy()
    l = m5["low"].to_numpy(); c = m5["close"].to_numpy()
    ef = m5["ema_f"].to_numpy(); es = m5["ema_s"].to_numpy()
    atr = m5["atr"].to_numpy(); h4 = m5["h4_ref"].to_numpy()
    spread = m5["spread"].to_numpy(); idx = m5.index

    above = ef > es
    cross_up = np.r_[False, above[1:] & ~above[:-1]]
    cross_dn = np.r_[False, ~above[1:] & above[:-1]]

    pop = {"crosses": 0, "expired_no_pullback": 0, "expired_no_continue": 0,
           "blocked_by_h4": 0, "blocked_nan": 0, "entered": 0}
    trades = []
    n = len(m5)

    i = 0
    while i < n:
        if not (cross_up[i] or cross_dn[i]):
            i += 1
            continue
        long_side = bool(cross_up[i])
        pop["crosses"] += 1

        # extreme since the cross, used for the continuation trigger
        ext = h[i] if long_side else l[i]
        pulled = False
        pb_ext = None          # pullback low (long) / high (short) -> the stop
        entry_i = None

        for j in range(i + 1, min(i + 1 + expiry, n)):
            # regime must persist; a re-cross voids the setup
            if long_side and ef[j] <= es[j]:
                break
            if (not long_side) and ef[j] >= es[j]:
                break

            if not pulled:
                touched = (l[j] <= m5[pullback_ema].to_numpy()[j] if long_side
                           else h[j] >= m5[pullback_ema].to_numpy()[j])
                if touched:
                    pulled = True
                    pb_ext = l[j] if long_side else h[j]
                else:
                    ext = max(ext, h[j]) if long_side else min(ext, l[j])
            else:
                pb_ext = min(pb_ext, l[j]) if long_side else max(pb_ext, h[j])
                cont = c[j] > ext if long_side else c[j] < ext
                if cont:
                    entry_i = j
                    break

        if entry_i is None:
            pop["expired_no_pullback" if not pulled else "expired_no_continue"] += 1
            i += 1
            continue

        k = entry_i
        if not np.isfinite(h4[k]) or not np.isfinite(atr[k]) or not np.isfinite(pb_ext):
            pop["blocked_nan"] += 1
            i += 1
            continue

        # THE H4 FILTER: long only above the last completed H4 close, short below
        if (long_side and not (c[k] > h4[k])) or ((not long_side) and not (c[k] < h4[k])):
            pop["blocked_by_h4"] += 1
            i += 1
            continue

        # entry on the NEXT bar's open -- never on the signal bar itself
        if k + 1 >= n:
            i += 1
            continue
        entry = o[k + 1]
        stop = pb_ext
        risk = abs(entry - stop)
        if risk <= 0 or risk < 1e-12:
            pop["blocked_nan"] += 1
            i += 1
            continue

        pop["entered"] += 1
        trades.append({"i": k + 1, "time": idx[k + 1], "long": long_side,
                       "entry": entry, "stop": stop, "risk": risk,
                       "spread_in": spread[k + 1], "atr": atr[k]})
        i = k + 2

    return trades, pop


def simulate(m5, trades, target_r, time_exit_bars=24):
    """Exit scan starts at i+1, never on the entry bar. Stop is checked before
    target within a bar (the conservative assumption when both are touched)."""
    h = m5["high"].to_numpy(); l = m5["low"].to_numpy()
    c = m5["close"].to_numpy(); spread = m5["spread"].to_numpy()
    n = len(m5)
    rows = []
    for t in trades:
        i0, long_side, entry, stop, risk = t["i"], t["long"], t["entry"], t["stop"], t["risk"]
        tgt = entry + target_r * risk if long_side else entry - target_r * risk
        exit_px, bars = None, 0
        for j in range(i0 + 1, min(i0 + 1 + time_exit_bars, n)):
            bars = j - i0
            hit_stop = (l[j] <= stop) if long_side else (h[j] >= stop)
            hit_tgt = (h[j] >= tgt) if long_side else (l[j] <= tgt)
            if hit_stop:                      # conservative: stop first
                exit_px = stop
                break
            if hit_tgt and target_r is not None:
                exit_px = tgt
                break
        if exit_px is None:
            j = min(i0 + time_exit_bars, n - 1)
            exit_px = c[j]
            bars = j - i0
        gross = (exit_px - entry) if long_side else (entry - exit_px)
        cost = t["spread_in"] + spread[min(i0 + bars, n - 1)]   # real spread in AND out
        rows.append({"time": t["time"], "long": long_side, "risk": risk,
                     "gross": gross, "cost": cost, "net": gross - cost,
                     "gross_r": gross / risk, "net_r": (gross - cost) / risk,
                     "bars": bars, "atr": t["atr"], "spread_in": t["spread_in"]})
    return pd.DataFrame(rows)


def stats(df):
    if df.empty:
        return {"n": 0}
    def pf(x):
        w, lo = x[x > 0].sum(), -x[x < 0].sum()
        return float(w / lo) if lo > 0 else float("inf")
    return {"n": int(len(df)),
            "gross_exp_R": round(float(df["gross_r"].mean()), 4),
            "net_exp_R": round(float(df["net_r"].mean()), 4),
            "gross_pf": round(pf(df["gross_r"]), 3),
            "net_pf": round(pf(df["net_r"]), 3),
            "win_rate": round(float((df["net_r"] > 0).mean()), 4),
            "median_bars": int(df["bars"].median())}


def main():
    report = {}
    print("=" * 84)
    print("FEASIBILITY GATE FIRST (spread / ATR14 on M5; > 0.15 = dead)")
    print("=" * 84)
    frames = {}
    for inst, stem in INSTRUMENTS.items():
        m5 = add_indicators(load_m5(stem))
        frames[inst] = m5
        ratio = (m5["spread"] / m5["atr"]).replace([np.inf, -np.inf], np.nan).dropna()
        med = float(ratio.median())
        report[inst] = {"feasibility_spread_over_atr_median": round(med, 4),
                        "feasibility_verdict": "PASS" if med <= FEASIBILITY_GATE else "DEAD",
                        "m5_bars": int(len(m5)),
                        "span": [str(m5.index[0].date()), str(m5.index[-1].date())]}
        print(f"  {inst:>11}: spread/ATR median = {med:.4f}  "
              f"[{'PASS' if med <= FEASIBILITY_GATE else 'DEAD'}]   "
              f"{len(m5):,} M5 bars  {m5.index[0].date()} -> {m5.index[-1].date()}")

    for inst, m5 in frames.items():
        print("\n" + "=" * 84)
        print(f"{inst}")
        print("=" * 84)
        trades, pop = find_trades(m5)
        print(f"  population: {pop}")
        if pop['crosses']:
            print(f"  survival: {pop['entered']}/{pop['crosses']} crosses reached entry "
                  f"({pop['entered']/pop['crosses']*100:.1f}%)")
        report[inst]["population"] = pop
        if not trades:
            continue

        split_t = trades[int(len(trades) * IS_FRACTION)]["time"]
        report[inst]["oos_starts"] = str(split_t.date())
        report[inst]["targets"] = {}
        for tr in (1.0, 2.0):
            df = simulate(m5, trades, tr)
            is_df, oos_df = df[df["time"] < split_t], df[df["time"] >= split_t]
            report[inst]["targets"][f"{tr}R"] = {"IS": stats(is_df), "OOS": stats(oos_df)}
            s_is, s_oos = stats(is_df), stats(oos_df)
            print(f"\n  target {tr}R   IS  n={s_is['n']:>4} "
                  f"grossR={s_is['gross_exp_R']:+.4f} netR={s_is['net_exp_R']:+.4f} "
                  f"gPF={s_is['gross_pf']:.2f} nPF={s_is['net_pf']:.2f} win={s_is['win_rate']*100:.1f}%")
            print(f"             OOS n={s_oos['n']:>4} "
                  f"grossR={s_oos['gross_exp_R']:+.4f} netR={s_oos['net_exp_R']:+.4f} "
                  f"gPF={s_oos['gross_pf']:.2f} nPF={s_oos['net_pf']:.2f} win={s_oos['win_rate']*100:.1f}%")

    # pre-registered verdict
    verdicts = []
    for inst in INSTRUMENTS:
        t = report[inst].get("targets", {}).get("1.0R", {}).get("OOS", {})
        if not t or t.get("n", 0) < 200:
            verdicts.append("insufficient")
        elif t["net_exp_R"] > 0 and t["net_pf"] >= 1.10:
            verdicts.append("pass")
        elif t["net_exp_R"] <= 0 or t["net_pf"] < 1.05:
            verdicts.append("fail")
        else:
            verdicts.append("inconclusive")
    n_pass, n_fail = verdicts.count("pass"), verdicts.count("fail")
    verdict = ("SUPPORTED" if n_pass >= 2 else
               "NULL" if n_fail >= 2 else "INCONCLUSIVE")
    print("\n" + "=" * 84)
    print(f"per-instrument (1R, OOS): {dict(zip(INSTRUMENTS, verdicts))}")
    print(f">>> PRE-REGISTERED VERDICT: {verdict}")
    print("=" * 84)

    report["verdict"] = verdict
    report["per_instrument"] = dict(zip(INSTRUMENTS, verdicts))
    (OUT / "results.json").write_text(json.dumps(report, indent=2, default=str))
    print(f"\nwrote {OUT / 'results.json'}")


if __name__ == "__main__":
    main()
