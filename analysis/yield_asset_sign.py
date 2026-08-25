"""
Stage 3: the pure-DIRECTION test.

COG's refinement: strip the magnitude out of both legs. Don't ask "how much did it
move", ask only "was it delta-positive or delta-negative relative to the bonds".
The reasoning is sound -- returns are fat-tailed, so a handful of crisis days can
drown a genuine directional tell.

The trap this guards against: you cannot score "did it go up?" against 50%. Over
20y the unconditional base rate of a 21-day SPX gain is ~62%. A signal that is
merely long-biased scores 62% and looks brilliant. So the headline statistic here
is the drift-immune one:

    spread = P(asset up | yields FELL) - P(asset up | yields ROSE)

The base rate cancels out of the difference. spread = 0 means the yield direction
told you nothing, whatever the raw hit rate looks like.

Also reports:
  * agreement % vs the chance agreement implied by the two marginals
  * rolling 252d agreement, to show whether it is stable or regime-flipping
  * a non-overlapping, pure +/-1 sign backtest net of cost

Usage:
    python -m analysis.yield_asset_sign
    python -m analysis.yield_asset_sign --rolling FTSE y10 21 21
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from analysis.yield_asset_coupling import ASSETS, DRIVERS, LOOKBACKS, HORIZONS, OUT
from analysis.yield_asset_trade import COST_BP, load_px

N_NULL = 2000
MIN_OBS = 400
SIGNAL_LAG = 1


def frame(name, yields):
    px = load_px(name)
    y = yields.reindex(px.index.union(yields.index)).sort_index().ffill(limit=4)
    df = pd.concat([np.log(px).rename("lp"), y.reindex(px.index)], axis=1)
    return df[~df.index.duplicated()].sort_index()


def sign_stats(sig: np.ndarray, dirn: np.ndarray, rng):
    """sig/dirn are +/-1 arrays. Returns the drift-immune conditional spread."""
    down = sig < 0
    up = sig > 0
    if down.sum() < 60 or up.sum() < 60:
        return None
    p_up_given_down = float((dirn[down] > 0).mean())
    p_up_given_up = float((dirn[up] > 0).mean())
    spread = p_up_given_down - p_up_given_up
    base = float((dirn > 0).mean())
    agree = float((np.sign(-sig) == dirn).mean())
    # agreement you would get by chance from the marginals alone
    ps, pd_ = float((sig < 0).mean()), float((dirn > 0).mean())
    chance = ps * pd_ + (1 - ps) * (1 - pd_)

    # circular-shift null on the drift-immune spread
    n = len(sig)
    offs = rng.integers(30, n - 30, size=N_NULL)
    idx = (np.arange(n)[None, :] + offs[:, None]) % n
    S = sig[idx]
    up_mask = S > 0
    dn_mask = S < 0
    d_pos = (dirn > 0).astype(float)
    with np.errstate(invalid="ignore"):
        pu_dn = (dn_mask * d_pos).sum(1) / np.maximum(dn_mask.sum(1), 1)
        pu_up = (up_mask * d_pos).sum(1) / np.maximum(up_mask.sum(1), 1)
    null = pu_dn - pu_up
    p = float((np.abs(null) >= abs(spread)).mean())

    half = n // 2
    def sp(a, b):
        d_, u_ = a < 0, a > 0
        if d_.sum() < 20 or u_.sum() < 20:
            return np.nan
        return float((b[d_] > 0).mean() - (b[u_] > 0).mean())

    return dict(base_rate=base, hit_raw=agree, chance_agree=chance,
                p_up_yields_fell=p_up_given_down, p_up_yields_rose=p_up_given_up,
                spread=spread, p_null=p,
                spread_h1=sp(sig[:half], dirn[:half]),
                spread_h2=sp(sig[half:], dirn[half:]), n=n)


def run(yields):
    rng = np.random.default_rng(11)
    rows = []
    for name, (_tk, grp) in ASSETS.items():
        df = frame(name, yields)
        for drv in DRIVERS:
            for k in LOOKBACKS:
                dy = df[drv].diff(k)
                # contemporaneous control
                m0 = pd.concat([dy, df["lp"].diff(k)], axis=1).dropna()
                if len(m0) >= MIN_OBS:
                    st = sign_stats(np.sign(m0.iloc[:, 0].to_numpy()),
                                    np.sign(m0.iloc[:, 1].to_numpy()), rng)
                    if st:
                        rows.append(dict(asset=name, group=grp, driver=drv,
                                         lookback=k, horizon=0, tradeable=0, **st))
                dyl = dy.shift(SIGNAL_LAG)
                for h in HORIZONS:
                    fwd = df["lp"].shift(-h) - df["lp"]
                    m = pd.concat([dyl, fwd], axis=1).dropna()
                    if len(m) < MIN_OBS:
                        continue
                    st = sign_stats(np.sign(m.iloc[:, 0].to_numpy()),
                                    np.sign(m.iloc[:, 1].to_numpy()), rng)
                    if st:
                        rows.append(dict(asset=name, group=grp, driver=drv,
                                         lookback=k, horizon=h, tradeable=1, **st))
        print("  %-7s done" % name)
    out = pd.DataFrame(rows)
    out["stable"] = ((np.sign(out.spread_h1) == np.sign(out.spread_h2))
                     & (out[["spread_h1", "spread_h2"]].abs().min(axis=1) > 0.02)).astype(int)
    out.to_csv(OUT / "study_sign.csv", index=False)
    return out


def sign_backtest(sym, driver, k, h, yields, cost_bp=None):
    """Pure +/-1, non-overlapping h-day holds. No magnitude anywhere."""
    df = frame(sym, yields).dropna(subset=["lp", driver])
    sig = -np.sign(df[driver].diff(k)).shift(SIGNAL_LAG)
    fwd = df["lp"].shift(-h) - df["lp"]
    m = pd.concat([sig.rename("s"), fwd.rename("f")], axis=1).dropna()
    m = m.iloc[::h]                                  # non-overlapping entries
    cost = (cost_bp if cost_bp is not None else COST_BP.get(sym, COST_BP["default"])) / 1e4
    r = m["s"] * m["f"] - 2 * cost                   # in and out each period
    if len(r) < 30 or r.std() == 0:
        return None
    per_yr = 252 / h
    half = len(r) // 2
    f = lambda s: (float(s.mean() / s.std() * np.sqrt(per_yr)) if len(s) > 5 and s.std() else np.nan)
    return dict(asset=sym, driver=driver, k=k, h=h, trades=len(r),
                win_rate=float((r > 0).mean()), sharpe_net=f(r),
                sharpe_h1=f(r.iloc[:half]), sharpe_h2=f(r.iloc[half:]),
                total_ret=float(np.expm1(r.sum())))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rolling", nargs=4, metavar=("ASSET", "DRIVER", "K", "H"))
    a = ap.parse_args()
    yields = pd.read_csv(OUT / "yields.csv", index_col=0, parse_dates=True)
    pd.set_option("display.width", 250)
    pd.set_option("display.max_rows", 400)
    f3 = lambda v: "%7.3f" % v

    if a.rolling:
        sym, drv, k, h = a.rolling[0], a.rolling[1], int(a.rolling[2]), int(a.rolling[3])
        df = frame(sym, yields)
        sig = np.sign(df[drv].diff(k)).shift(SIGNAL_LAG)
        dirn = np.sign(df["lp"].shift(-h) - df["lp"])
        agree = (np.sign(-sig) == dirn).astype(float)
        agree[sig.isna() | dirn.isna()] = np.nan
        roll = agree.rolling(252, min_periods=200).mean().dropna()
        print("rolling 252d directional agreement: %s %s k=%d h=%d" % (sym, drv, k, h))
        print("  mean %.3f   min %.3f   max %.3f   sd %.3f"
              % (roll.mean(), roll.min(), roll.max(), roll.std()))
        print("  %% of windows below 50%%: %.1f%%" % (100 * (roll < 0.5).mean()))
        print(roll.resample("YE").mean().to_string(float_format=f3))
        return

    print("running pure-direction study...")
    res = run(yields)
    con, fwd = res[res.tradeable == 0], res[res.tradeable == 1]

    print("\n" + "=" * 90)
    print("DRIFT TRAP: raw 'did it go up' hit rate is NOT evidence")
    print("=" * 90)
    demo = fwd[(fwd.driver == "y10") & (fwd.lookback == 21) & (fwd.horizon == 21)]
    print(demo[["asset", "base_rate", "hit_raw", "chance_agree", "p_up_yields_fell",
                "p_up_yields_rose", "spread"]].to_string(index=False, float_format=f3))

    print("\n" + "=" * 90)
    print("CONTEMPORANEOUS conditional spread (control, k=5) -- P(up|yields fell) - P(up|yields rose)")
    print("=" * 90)
    print(con[con.lookback == 5].pivot_table(index="asset", columns="driver",
          values="spread").to_string(float_format=f3))

    print("\n" + "=" * 90)
    print("FORWARD conditional spread, strongest 20 by |spread|")
    print("=" * 90)
    top = fwd.reindex(fwd.spread.abs().sort_values(ascending=False).index).head(20)
    print(top[["asset", "driver", "lookback", "horizon", "n", "base_rate", "hit_raw",
               "spread", "p_null", "spread_h1", "spread_h2", "stable"]]
          .to_string(index=False, float_format=f3))

    surv = fwd[(fwd.stable == 1) & (fwd.p_null < 0.05)]
    print("\n" + "=" * 90)
    print("SCALE CHECK")
    print("=" * 90)
    print("  contemporaneous  median |spread| = %.4f   max = %.4f"
          % (con.spread.abs().median(), con.spread.abs().max()))
    print("  forward          median |spread| = %.4f   max = %.4f"
          % (fwd.spread.abs().median(), fwd.spread.abs().max()))
    print("  forward cells = %d ; survivors (stable & p<0.05) = %d ; expected by luck ~ %d"
          % (len(fwd), len(surv), round(len(fwd) * 0.05)))
    print("  FX forward: cells = %d, max |spread| = %.4f, survivors = %d"
          % ((fwd.group == "fx").sum(), fwd[fwd.group == "fx"].spread.abs().max(),
             len(surv[surv.group == "fx"])))

    print("\n" + "=" * 90)
    print("PURE +/-1 NON-OVERLAPPING BACKTEST, net of cost -- top 15 by |spread|")
    print("=" * 90)
    pool = (surv if len(surv) else fwd)
    pool = pool[pool.group != "bond"]
    pool = pool.reindex(pool.spread.abs().sort_values(ascending=False).index).head(15)
    bt = [sign_backtest(r.asset, r.driver, int(r.lookback), int(r.horizon), yields)
          for r in pool.itertuples()]
    bt = pd.DataFrame([b for b in bt if b])
    print(bt.to_string(index=False, float_format=f3))
    print("\n  net Sharpe > 0.5 : %d / %d" % ((bt.sharpe_net > 0.5).sum(), len(bt)))
    print("  positive in BOTH halves: %d / %d"
          % (((bt.sharpe_h1 > 0) & (bt.sharpe_h2 > 0)).sum(), len(bt)))
    bt.to_csv(OUT / "sign_trade_test.csv", index=False)
    print("\nwrote %s and %s" % (OUT / "study_sign.csv", OUT / "sign_trade_test.csv"))


if __name__ == "__main__":
    main()
