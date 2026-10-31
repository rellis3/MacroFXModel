"""vmc-nq-cipher Stage 0: the NQ futures research dataset. NO OUTCOMES are computed here.

Input: analysis/output/nt8/continuous/NQ_1m_ratio.parquet (+ _unadj for raw prices) and NQ_rolls.csv (gitignored, local).
  NT8 stamps a 1-minute bar at its CLOSE; this script restamps to bar OPEN (t - 60 s) and checks that against the
  owner's open-stamped 1-minute file (drive/NQ_1m_drive.parquet) by lagged return correlation.
  Indicators are computed on the RATIO back-adjusted series (no jump at rolls; % moves exact). Raw contract prices are kept.

Output (gitignored): analysis/output/vmc-nq-cipher/data/{explore,lockbox}/tf<N>.parquet, one table per timeframe,
plus data_quality.json and leak_tests.json (committed, small).

Components per timeframe (all causal at the bar's close):
  WaveTrend 9/12/3 (operator setup): wt1, wt2, wt_spread = wt1 - wt2 (THE Cipher B "VWAP", Pine wtVwap), slopes,
    acceleration, cross events, zones (+-53 / +-60), bars since cross / zero
  Money Flow: faithful Pine f_rsimfi, SMA(60) of (close-open)/(high-low)*150 - 2.5 (no volume)
  vwap_dist: SEPARATE price-VWAP oscillator: close minus a rolling 20-bar volume-weighted VWAP, in trailing sigma
    (uses real futures volume; this is NOT the Cipher B "VWAP")
  RSI(14), Stoch RSI(14,14,3,3) (Cipher B carries both; kept for completeness)
  Divergences, Pine f_findDivs as ported in js/divergenceCore.js: strict 5-bar fractal (reach 2) on the oscillator,
    price high/low at the oscillator pivots, regular gated at osc >= 45 (bear) / <= -65 (bull) for WT2 only, hidden
    ungated; also run on wt_spread, money flow and vwap_dist (ungated). Stamped at the CONFIRMATION bar (pivot + 2),
    with pivot gap (bars), price change (sigma) and oscillator change carried.
  Context: sigma (trailing 500-bar return sd), roll flags, contract, gap-before flag, trade date, session label.

    python -I scripts/vmc-nq-cipher/s0_dataset.py
"""
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from vmcResearch.vmcfeat import tf_state  # noqa: E402
import vmcds  # noqa: E402

SRC = Path(os.environ.get("NT8_DIR", ROOT / "analysis/output/nt8"))
OUT = vmcds.DATA
REPORT = ROOT / "analysis/output/vmc-nq-cipher"
REACH, DIV_OB, DIV_OS = 2, 45.0, -65.0
F32 = np.float32


# ---------------------------------------------------------------- 1-minute base
def epoch_s(ts):
    return (ts.dt.tz_convert("UTC").astype("datetime64[ns, UTC]") - pd.Timestamp("1970-01-01", tz="UTC")).dt.total_seconds().astype("int64")


def load_base():
    """NT8 ratio series (restamped to bar open), with NT8's month-long backfill holes filled from the owner's
    open-stamped file. Owner prices are put on the NT8 scale per contract (median price ratio on that contract's
    overlapping bars) and get the contract from the roll schedule. `source` says which feed each bar came from."""
    r = pd.read_parquet(SRC / "continuous/NQ_1m_ratio.parquet")
    u = pd.read_parquet(SRC / "continuous/NQ_1m_unadj.parquet", columns=["timestamp", "close", "contract"])
    assert (r.timestamp.values == u.timestamp.values).all()
    t_close = epoch_s(r.timestamp)
    b = pd.DataFrame({"t_open": (t_close - 60).values, "open": r.open.values, "high": r.high.values, "low": r.low.values,
                      "close": r.close.values, "volume": r.volume.astype(float).values, "raw_close": u.close.values,
                      "contract": r.contract.astype(str).values, "source": "nt8"})
    dup = int(b.t_open.duplicated().sum())
    b = b.drop_duplicates("t_open", keep="last")
    fill = {"bars": 0, "per_contract_ratio_cv_max": None}
    dp = SRC / "drive/NQ_1m_drive.parquet"
    if dp.exists():
        d = pd.read_parquet(dp)
        d = pd.DataFrame({"t_open": epoch_s(d.utc).values, "open": d.o.values, "high": d.h.values, "low": d.l.values,
                          "close": d.c.values, "volume": d.v.astype(float).values})
        rolls = pd.read_csv(SRC / "continuous/NQ_rolls.csv")
        sw = epoch_s(pd.to_datetime(rolls.switch_utc, utc=True).to_frame()[ "switch_utc"]).to_numpy() - 60
        first = b.contract.iloc[0]
        names = np.array([first] + rolls["to"].tolist())
        d["contract"] = names[np.searchsorted(sw, d.t_open.to_numpy(), side="right")]
        d = d[(d.t_open >= b.t_open.min()) & (d.t_open <= b.t_open.max())].copy()
        # replace WHOLE trade dates where NT8 is missing or truncated (its backfill chunks start/stop mid-session):
        # a date goes to the owner file when that file has > 1.2x NT8's bars for it; never mix feeds inside a date
        d["td"] = trade_date(d.t_open.values)
        b["td"] = trade_date(b.t_open.values)
        nn, no = b.td.value_counts(), d.td.value_counts()
        swap = [x for x in no.index if no[x] > 1.2 * nn.get(x, 0)]
        b = b[~b.td.isin(swap)].drop(columns="td").reset_index(drop=True)
        new = d[d.td.isin(swap)].drop(columns="td").copy()
        fill_partial = int(sum(1 for x in swap if nn.get(x, 0) > 0))
        # each contiguous block is anchored to the last NT8 bar before it: the owner file's own minute-to-minute moves
        # are kept exactly, scaled so the block starts on NT8's price; the mismatch where NT8 resumes is measured
        bt, bc, bu = b.t_open.to_numpy(), b.close.to_numpy(), b.raw_close.to_numpy()
        dt_, dc = d.t_open.to_numpy(), d.close.to_numpy()
        pos = np.searchsorted(bt, new.t_open.to_numpy())          # NT8 bars before each new bar
        new["block"] = pos
        kr, ku, mism = {}, {}, []
        for blk, g in new.groupby("block"):
            i_nt = blk - 1
            if i_nt < 0:
                continue
            j = np.searchsorted(dt_, bt[i_nt], side="right") - 1      # owner bar at/just before the anchor
            kr[blk], ku[blk] = bc[i_nt] / dc[j], bu[i_nt] / dc[j]
            if blk < len(bt):                                         # where NT8 resumes
                j2 = np.searchsorted(dt_, bt[blk], side="right") - 1
                mism.append(abs(bc[blk] / (dc[j2] * kr[blk]) - 1))
        new = new[new.block.isin(list(kr))]
        f_r, f_u = new.block.map(kr), new.block.map(ku)
        for c in ("open", "high", "low", "close"):
            new[c] = new[c] * f_r
        new["raw_close"] = d.loc[new.index, "close"] * f_u
        new["source"] = "owner"
        b = pd.concat([b, new[b.columns]], ignore_index=True)
        mism = np.array(mism)
        fill = {"bars": int(len(new)), "blocks": int(len(kr)), "partial_nt8_dates_replaced": fill_partial, "trade_dates": int(len(set(trade_date(new.t_open.values)))),
                "rejoin_mismatch_pct_median": float(np.median(mism) * 100), "rejoin_mismatch_pct_max": float(mism.max() * 100),
                "contracts_used": int(new.contract.nunique())}
    b = b.sort_values("t_open").reset_index(drop=True)
    return b, dup, fill


def trade_date(t_open):
    ct = pd.to_datetime(t_open, unit="s", utc=True).tz_convert("America/Chicago")
    return (ct + pd.Timedelta(hours=7)).normalize().tz_localize(None)   # 17:00 CT boundary -> next date


def session_label(t_open):
    et = pd.to_datetime(t_open, unit="s", utc=True).tz_convert("America/New_York")
    h = et.hour + et.minute / 60
    return np.select([(h >= 9.5) & (h < 16), (h >= 3) & (h < 9.5), (h >= 16) & (h < 18)], ["rth", "europe", "post"], "asia")


def resample(b, tf):
    if tf == 1:
        g = b.copy()
        g["t_close"] = g.t_open + 60
        g["roll_in_bar"], g["n_1m"], g["owner_share"] = g.roll_bar, 1, g.is_owner.astype(float)
        return g
    if tf == "D":
        key = b.trade_date.rename("_k")
    else:
        key = ((b.t_open // (tf * 60)) * (tf * 60)).rename("_k")
    g = b.groupby(key, sort=True).agg(t_open=("t_open", "first"), t_last=("t_open", "last"), open=("open", "first"),
                                     high=("high", "max"), low=("low", "min"), close=("close", "last"),
                                     volume=("volume", "sum"), raw_close=("raw_close", "last"), contract=("contract", "last"),
                                     n_1m=("t_open", "size"), trade_date=("trade_date", "last"),
                                     roll_in_bar=("roll_bar", "max"), gap_before=("gap_before", "max"),
                                     owner_share=("is_owner", "mean"))
    if tf == "D":
        g["t_close"] = g.t_last + 60
    else:
        g["t_open"] = np.asarray(g.index, dtype="int64")
        g["t_close"] = g.t_open + tf * 60
    return g.drop(columns="t_last").reset_index(drop=True)


# ---------------------------------------------------------------- extra components
def rsi(c, n=14):
    d = np.diff(c, prepend=np.nan)
    up = pd.Series(np.where(d > 0, d, 0.0)).ewm(alpha=1 / n, adjust=False).mean()
    dn = pd.Series(np.where(d < 0, -d, 0.0)).ewm(alpha=1 / n, adjust=False).mean()
    return (100 - 100 / (1 + up / dn.replace(0, np.nan))).to_numpy()


def stoch_rsi(c, n=14, k=3, d=3):
    r = pd.Series(rsi(c, n))
    lo, hi = r.rolling(n).min(), r.rolling(n).max()
    st = 100 * (r - lo) / (hi - lo).replace(0, np.nan)
    kk = st.rolling(k).mean()
    return kk.to_numpy(), kk.rolling(d).mean().to_numpy()


def fractal(osc, reach, high):
    n = osc.size
    ok = np.ones(n, dtype=bool)
    ok[:reach] = ok[n - reach:] = False
    for j in range(1, reach + 1):
        if high:
            ok[reach:n - reach] &= (osc[reach:n - reach] > osc[reach - j:n - reach - j]) & (osc[reach:n - reach] > osc[reach + j:n - reach + j])
        else:
            ok[reach:n - reach] &= (osc[reach:n - reach] < osc[reach - j:n - reach - j]) & (osc[reach:n - reach] < osc[reach + j:n - reach + j])
    return np.where(ok & np.isfinite(osc))[0]


def divergences(hi, lo, osc, sigma_px, gate):
    """Pine f_findDivs (js/divergenceCore.js). Returns per-bar arrays stamped at confirmation (pivot + REACH).
    code: +1 regular bull, -1 regular bear, +2 hidden bull, -2 hidden bear (latest wins on a shared bar)."""
    n = osc.size
    code = np.zeros(n, np.int8)
    gap = np.full(n, np.nan, F32)
    dpx = np.full(n, np.nan, F32)
    dosc = np.full(n, np.nan, F32)
    tops, bots = fractal(osc, REACH, True), fractal(osc, REACH, False)
    rtops = tops if not gate else tops[osc[tops] >= DIV_OB]
    rbots = bots if not gate else bots[osc[bots] <= DIV_OS]
    ev = []
    for p, r in zip(rtops[:-1], rtops[1:]):
        if hi[r] > hi[p] and osc[r] < osc[p]:
            ev.append((r, p, -1, hi[r] - hi[p]))
    for p, r in zip(rbots[:-1], rbots[1:]):
        if lo[r] < lo[p] and osc[r] > osc[p]:
            ev.append((r, p, 1, lo[r] - lo[p]))
    for p, r in zip(tops[:-1], tops[1:]):
        if hi[r] < hi[p] and osc[r] > osc[p]:
            ev.append((r, p, -2, hi[r] - hi[p]))
    for p, r in zip(bots[:-1], bots[1:]):
        if lo[r] > lo[p] and osc[r] < osc[p]:
            ev.append((r, p, 2, lo[r] - lo[p]))
    ev.sort(key=lambda e: (e[0], abs(e[2])))
    for r, p, c, dp in ev:
        s = r + REACH
        if s >= n:
            continue
        code[s], gap[s] = c, r - p
        dpx[s] = dp / sigma_px[r] if sigma_px[r] > 0 else np.nan
        dosc[s] = osc[r] - osc[p]
    return code, gap, dpx, dosc


def features(bars):
    st = tf_state(bars.rename(columns={}).set_index(pd.RangeIndex(len(bars))), vwap_window=20, sigma_window=500)
    out = pd.DataFrame({"t_open": bars.t_open.values, "t_close": bars.t_close.values, "trade_date": bars.trade_date.values,
                        "contract": bars.contract.values, "open": bars.open.values, "high": bars.high.values,
                        "low": bars.low.values, "close": bars.close.values, "raw_close": bars.raw_close.values,
                        "volume": bars.volume.values})
    for c in ("roll_in_bar", "gap_before", "n_1m", "owner_share"):
        if c in bars:
            out[c] = bars[c].values
    keep = ["wt1", "wt2", "wt_spread", "wt1_slope", "wt1_accel", "wt2_slope", "spread_slope", "wt_shape", "cross_dir",
            "bars_since_cross", "last_cross_dir", "cross_above_zero", "wt_zone", "bars_since_zero", "mf", "mf_slope",
            "mf_accel", "mf_run", "mf_zero_cross", "vwap_dist", "sigma"]
    for c in keep:
        v = st[c].to_numpy()
        out[c] = v.astype(F32) if v.dtype.kind == "f" else v
    c = bars.close.to_numpy(float)
    out["rsi"] = rsi(c).astype(F32)
    k, d = stoch_rsi(c)
    out["stoch_k"], out["stoch_d"] = k.astype(F32), d.astype(F32)
    sig_px = st["sigma"].to_numpy(float) * c
    hi, lo = bars.high.to_numpy(float), bars.low.to_numpy(float)
    for name, osc, gate in (("wt2", st["wt2"].to_numpy(float), True), ("spread", st["wt_spread"].to_numpy(float), False),
                            ("mf", st["mf"].to_numpy(float), False), ("vwapd", st["vwap_dist"].to_numpy(float), False)):
        code, gap, dpx, dosc = divergences(hi, lo, osc, sig_px, gate)
        out[f"div_{name}"], out[f"div_{name}_gap"], out[f"div_{name}_dpx"], out[f"div_{name}_dosc"] = code, gap, dpx, dosc
    return out


# ---------------------------------------------------------------- quality and leak checks
def quality(b, rolls):
    q = {"bars_1m": int(len(b)), "first": str(pd.to_datetime(b.t_open.iloc[0], unit="s", utc=True)),
         "last": str(pd.to_datetime(b.t_open.iloc[-1], unit="s", utc=True)), "contracts": int(b.contract.nunique()),
         "rolls": int(len(rolls))}
    per = b.groupby("trade_date").size()
    wk = per[pd.to_datetime(per.index).dayofweek < 5]
    q["trade_dates"] = int(len(per))
    q["bars_per_trade_date_median"] = float(wk.median())
    q["trade_dates_under_80pct_of_median"] = int((wk < 0.8 * wk.median()).sum())
    q["short_dates_list_first20"] = [str(x.date()) for x in wk[wk < 0.8 * wk.median()].index[:20]]
    q["zero_range_bars_pct"] = float(((b.high - b.low) == 0).mean() * 100)
    q["ohlc_inconsistent"] = int(((b.high < b[["open", "close"]].max(axis=1)) | (b.low > b[["open", "close"]].min(axis=1))).sum())
    dt = np.diff(b.t_open.to_numpy())
    q["gaps_over_70min"] = int((dt > 70 * 60).sum())
    # stamp check against the owner's open-stamped file (where it exists)
    dp = SRC / "drive/NQ_1m_drive.parquet"
    if dp.exists():
        d = pd.read_parquet(dp)
        dts = (d.utc.astype("datetime64[ns, UTC]") - pd.Timestamp("1970-01-01", tz="UTC")).dt.total_seconds().astype("int64")
        dr = pd.Series(np.log(d.c.values), index=dts.values).diff()
        nr = pd.Series(np.log(b.close.values), index=b.t_open.values).diff()
        res = {}
        for L in (-60, 0, 60):
            dd = pd.Series(dr.values, index=dr.index + L)
            j = pd.concat([nr.rename("n"), dd.rename("d")], axis=1, join="inner")
            res[str(L)] = round(float(j.n.corr(j.d)), 4)
        q["return_corr_vs_owner_file_by_shift_s"] = res
        q["owner_file_overlap_bars"] = int(len(set(nr.index) & set(dr.index)))
    return q


def leak_test(b, tf, cut_frac=0.6):
    """Features computed on history truncated at a cut must equal the full-history features on the prefix."""
    full = features(resample(b, tf))
    cut_t = b.t_open.iloc[int(len(b) * cut_frac)]
    part = features(resample(b[b.t_open < cut_t], tf))
    m = len(part) - (1 if tf != 1 else 0)          # last partial bar may differ legitimately
    m -= REACH                                     # divergences confirm REACH bars later
    cols = [c for c in part.columns if c not in ("contract",)]
    bad = {}
    for c in cols:
        a, z = full[c].to_numpy()[:m], part[c].to_numpy()[:m]
        if a.dtype.kind in "fc":
            diff = ~((a == z) | (np.isnan(a) & np.isnan(z)))
        else:
            diff = a != z
        if diff.any():
            bad[c] = int(diff.sum())
    return {"tf": str(tf), "rows_compared": int(m), "mismatched_columns": bad}


def main():
    t0 = time.time()
    (OUT / "explore").mkdir(parents=True, exist_ok=True)
    (OUT / "lockbox").mkdir(parents=True, exist_ok=True)
    REPORT.mkdir(parents=True, exist_ok=True)
    b, dup, fill = load_base()
    rolls = pd.read_csv(SRC / "continuous/NQ_rolls.csv")
    b["trade_date"] = trade_date(b.t_open.values)
    sw = (pd.to_datetime(rolls.switch_utc, utc=True) - pd.Timestamp("1970-01-01", tz="UTC")).dt.total_seconds().astype("int64").to_numpy() - 60
    roll_dates = set(trade_date(sw))
    b["roll_bar"] = b.contract.ne(b.contract.shift()).astype(np.int8)
    b.loc[0, "roll_bar"] = 0
    b["roll_date"] = b.trade_date.isin(roll_dates).astype(np.int8)
    b["is_owner"] = (b.source == "owner").astype(np.int8)
    b["gap_before"] = (np.diff(b.t_open.to_numpy(), prepend=b.t_open.iloc[0] - 60) > 60).astype(np.int8)
    q = quality(b[b.source == "nt8"].reset_index(drop=True), rolls)
    q["trade_dates_after_fill"] = int(b.trade_date.nunique())
    q["duplicates_dropped"] = dup
    q["filled_from_owner_file"] = fill
    print("quality", json.dumps(q)[:600], flush=True)

    leaks = [leak_test(b[b.trade_date < pd.Timestamp("2018-01-01")], tf) for tf in (1, 5, 60, "D")]
    print("leak tests", leaks, flush=True)

    meta = {"lockbox_first_trade_date": str(vmcds.LOCKBOX_FIRST.date()), "discovery_end": str(vmcds.DISCOVERY_END.date()),
            "tables": {}}
    for tf in vmcds.TFS:
        f = features(resample(b, tf))
        if tf == 1:
            f["roll_date"] = b.roll_date.values
        f["session"] = session_label(f.t_open.values)
        lock = pd.to_datetime(f.trade_date) >= vmcds.LOCKBOX_FIRST
        f[~lock].to_parquet(OUT / "explore" / f"{vmcds.tf_name(tf)}.parquet", index=False)
        f[lock].to_parquet(OUT / "lockbox" / f"{vmcds.tf_name(tf)}.parquet", index=False)
        meta["tables"][str(tf)] = {"explore_rows": int((~lock).sum()), "lockbox_rows": int(lock.sum()),
                                   "explore_last_trade_date": str(pd.to_datetime(f.trade_date[~lock]).max().date()),
                                   "columns": len(f.columns)}
        print(tf, meta["tables"][str(tf)], f"{time.time() - t0:.0f}s", flush=True)
    # alignment self-check: every HTF value attached to a 5m row comes from an HTF bar closed by then
    base = vmcds.load(5, columns=["t_close", "close"])
    for htf in (60, 240, "D"):
        h = vmcds.load(htf, columns=["t_close", "close", "wt1"])
        a = vmcds.align(base, h, ["wt1"], f"tf{htf}")
        meta.setdefault("alignment", {})[str(htf)] = {"rows": int(len(a)), "max_htf_close_minus_row_close_s":
                                                      int((a["_htf_close"] - base.t_close).max())}
    (REPORT / "data_quality.json").write_text(json.dumps({"quality": q, "meta": meta}, indent=1, default=str))
    (REPORT / "leak_tests.json").write_text(json.dumps(leaks, indent=1))
    (OUT / "lockbox" / "README.txt").write_text("CONFIRMATION ONLY. Trade dates >= 2026-08-21. Not to be read for exploration, "
                                                "feature or threshold selection. Load only via vmcds.load(split='lockbox') with "
                                                "the owner's approval (VMC_LOCKBOX_APPROVED=1).\n")
    print("done", f"{time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
