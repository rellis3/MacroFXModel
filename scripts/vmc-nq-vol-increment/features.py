"""vmc-nq-vol-increment feature tables (prereg sections 3.1-3.4). Every feature is built PER SEGMENT (seams.py): no
lookback crosses a roll or a feed join. Targets are stored for the later stages but nothing is scored here.

Information sets (column prefixes):  c_ clock   p_ price   k_ calendar   v_ VuManChu (block in the name)
  pvd_ price-VWAP distance (not Cipher B)   sv_ stale VuManChu (+12 bars)   y12 / y48 targets   s4_ Stage 4 inputs

    python -I scripts/vmc-nq-vol-increment/features.py          writes data/tf{1,3,5,30}.parquet (gitignored)
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/vmc-nq-cipher"))
import seams  # noqa: E402
import vmcds  # noqa: E402
from s0_dataset import divergences  # noqa: E402
from vmcResearch.vmcfeat import tf_state  # noqa: E402

OUT = ROOT / "analysis/output/vmc-nq-vol-increment"
DATA = OUT / "data"
TFS = (1, 3, 5, 30)
LOOKBACK = 512          # sigma500 / VWAP-distance sigma (500) + stale shift (12)
STALE = 12
TICK = 0.25
TEST_FIRST = pd.Timestamp("2023-01-01")
CAL_LAST = pd.Timestamp("2026-07-01")      # calendar_events.csv ends 2026-07-02 (amendment A1)
F32 = np.float32
V_BLOCKS = {
    "WTL": ["v_wtl_wt1", "v_wtl_abs", "v_wtl_near0", "v_wtl_slope", "v_wtl_accel"],
    "WTC": ["v_wtc_cross", "v_wtc_since", "v_wtc_lvl"],
    "SPR": ["v_spr", "v_spr_abs", "v_spr_slope"],
    "MF": ["v_mf", "v_mf_abs", "v_mf_slope", "v_mf_run", "v_mf_zc12"],
    "ALN": ["v_aln_count", "v_aln_dis"],
    "DIV": ["v_div_reg12", "v_div_hid12"],
}
V_COLS = [c for b in V_BLOCKS.values() for c in b]
PVD_COLS = ["pvd", "pvd_abs"]


def load_m1():
    m1 = vmcds.load(1, columns=["t_open", "trade_date", "contract", "open", "high", "low", "close", "raw_close",
                                "volume", "owner_share"])
    return m1[pd.to_datetime(m1.trade_date) <= pd.Timestamp("2026-08-20")].reset_index(drop=True)


def releases():
    c = pd.read_csv(ROOT / "calendar_events.csv", encoding="latin-1", usecols=["datetime_raw", "country", "impact"])
    c = c[(c.country == "United States") & (c.impact.astype(str).str.lower() == "major")]
    t = pd.to_datetime(c.datetime_raw, errors="coerce", utc=True).dropna()
    return np.sort(((t - pd.Timestamp("1970-01-01", tz="UTC")).dt.total_seconds()).astype("int64").unique())


def resample(m1, tf):
    if tf == 1:
        g = m1.copy()
        g["t_close"] = g.t_open + 60
        return g.reset_index(drop=True)
    k = (m1.t_open // (tf * 60)) * (tf * 60)
    g = m1.groupby(k, sort=True).agg(open=("open", "first"), high=("high", "max"), low=("low", "min"),
                                     close=("close", "last"), raw_close=("raw_close", "last"), volume=("volume", "sum"),
                                     trade_date=("trade_date", "last"), owner_share=("owner_share", "mean"))
    g["t_open"] = np.asarray(g.index, dtype="int64")
    g["t_close"] = g.t_open + tf * 60
    return g.reset_index(drop=True)


# ---------------------------------------------------------------- 1-minute realised variance, per 1m segment
def rv_1m(d):
    r2 = np.log(d.close).diff() ** 2                 # first bar of the segment: NaN (no seam return)
    td = pd.to_datetime(d.trade_date)
    out = pd.DataFrame(index=d.index)
    out["rv60"] = r2.rolling(60).sum()
    out["rvday"] = r2.groupby(td.values).cumsum()
    day = r2.groupby(td.values).sum(min_count=1)
    out["rvprev"] = day.shift(1).reindex(td.values).to_numpy()
    return out


# ---------------------------------------------------------------- per tau-segment features
def seg_features(d):
    o, hi, lo, c = (d[k].astype(float) for k in ("open", "high", "low", "close"))
    tick = TICK * c / d.raw_close.astype(float)
    out = pd.DataFrame(index=d.index)
    rng = {}
    for k in (1, 3, 12, 48, 288):
        rng[k] = hi.rolling(k).max() - lo.rolling(k).min()
        out[f"p_lr{k}"] = np.log((rng[k] + tick) / c)
    r = np.log(c).diff()
    sd = {k: r.rolling(k).std() for k in (12, 48, 288, 500)}
    for k in (12, 48, 288, 500):
        out[f"p_ls{k}"] = np.log(sd[k] + 1e-7)
    out["p_exp_12_48"] = out.p_lr12 - out.p_lr48
    out["p_exp_12_lag"] = out.p_lr12 - out.p_lr12.shift(12)
    out["p_exp_sig"] = out.p_ls12 - out.p_ls288
    for k in (12, 48):
        dc = c - c.shift(k)
        out[f"p_disp{k}"] = dc / (rng[k] + tick)
        out[f"p_zdisp{k}"] = np.abs(np.log(c / c.shift(k))) / (sd[500] * np.sqrt(k) + 1e-9)
        out[f"p_eff{k}"] = np.abs(dc) / (c.diff().abs().rolling(k).sum() + tick)
    td = pd.to_datetime(d.trade_date)
    g = pd.DataFrame({"h": hi.values, "l": lo.values, "c": c.values, "o": o.values}, index=d.index).groupby(td.values)
    th, tl = g.h.cummax(), g.l.cummin()
    day = g.agg(h=("h", "max"), l=("l", "min"), c=("c", "last"), o=("o", "first"))
    prev_rng = (day.h - day.l).shift(1).reindex(td.values).to_numpy()
    prev_c = day.c.shift(1).reindex(td.values).to_numpy()
    first_o = day.o.reindex(td.values).to_numpy()
    out["p_today_vs_yday"] = np.log((th - tl + tick) / (prev_rng + tick.to_numpy()))
    out["p_lyday"] = np.log(prev_rng / prev_c)
    out["p_gap"] = np.log(first_o / prev_c)
    for k in ("rv60", "rvday", "rvprev"):
        out[f"p_{k}"] = np.log(d[k].astype(float) + 1e-10)
    # VuManChu, restarted at the segment start
    st = tf_state(d[["open", "high", "low", "close", "volume"]].reset_index(drop=True), vwap_window=20, sigma_window=500)
    st.index = d.index
    wt1 = st.wt1
    cross = st.cross_dir != 0
    out["v_wtl_wt1"], out["v_wtl_abs"] = wt1, wt1.abs()
    out["v_wtl_near0"] = (wt1.abs() < 20).astype(F32)
    out["v_wtl_slope"], out["v_wtl_accel"] = st.wt1_slope, st.wt1_accel
    out["v_wtc_cross"] = cross.astype(F32)
    out["v_wtc_since"] = st.bars_since_cross.clip(upper=48).fillna(48)
    out["v_wtc_lvl"] = wt1.where(cross).ffill().fillna(wt1)
    out["v_spr"], out["v_spr_abs"], out["v_spr_slope"] = st.wt_spread, st.wt_spread.abs(), st.spread_slope
    out["v_mf"], out["v_mf_abs"], out["v_mf_slope"] = st.mf, st.mf.abs(), st.mf_slope
    out["v_mf_run"] = st.mf_run
    out["v_mf_zc12"] = st.mf_zero_cross.astype(float).rolling(12, min_periods=1).max()
    sg = np.sign(st.wt_spread) + np.sign(wt1) + np.sign(st.mf)
    out["v_aln_count"], out["v_aln_dis"] = sg, (sg.abs() < 3).astype(F32)
    sig_px = (st.sigma * c).to_numpy(float)
    reg = np.zeros(len(d), bool)
    hid = np.zeros(len(d), bool)
    for osc, gate in ((st.wt2, True), (st.wt_spread, False), (st.mf, False)):
        code = divergences(hi.to_numpy(float), lo.to_numpy(float), osc.to_numpy(float), sig_px, gate)[0]
        reg |= np.abs(code) == 1
        hid |= np.abs(code) == 2
    out["v_div_reg12"] = pd.Series(reg.astype(float), index=d.index).rolling(12, min_periods=1).max()
    out["v_div_hid12"] = pd.Series(hid.astype(float), index=d.index).rolling(12, min_periods=1).max()
    out["pvd"], out["pvd_abs"] = st.vwap_dist, st.vwap_dist.abs()
    for col in V_COLS:
        out["s" + col] = out[col].shift(STALE)
    # targets and Stage 4 inputs
    fh12 = hi[::-1].rolling(12).max()[::-1].shift(-1)
    fl12 = lo[::-1].rolling(12).min()[::-1].shift(-1)
    fh48 = hi[::-1].rolling(48).max()[::-1].shift(-1)
    fl48 = lo[::-1].rolling(48).min()[::-1].shift(-1)
    out["y12"] = np.log((fh12 - fl12 + tick) / c)
    out["y48"] = np.log((fh48 - fl48 + tick) / c)
    out["s4_r12"] = np.log(hi.rolling(12).max() / lo.rolling(12).min())     # own 12-bar window (percentile input)
    out["s4_bar"] = np.arange(len(d))                                        # position in segment
    return out


def build(m1, tf, seam_t, ignore_seams=False):
    """The ONE builder (used by the run and by test_seams.py). ignore_seams=True is the negative control."""
    st = seam_t[:0] if ignore_seams else seam_t
    m1 = m1.reset_index(drop=True)
    bars = resample(m1, tf)
    seg, _ = seams.segments(bars, st, m1.t_open.to_numpy())
    # 1-minute inputs follow the tau segments exactly (1-minute bars of a mixed tau-bar are not used either)
    k = (m1.t_open.to_numpy() // (tf * 60)) * (tf * 60)
    seg1 = seg[np.searchsorted(bars.t_open.to_numpy(), k)]
    rv = seams.per_segment(m1, seg1, rv_1m)
    j = np.searchsorted(m1.t_open.to_numpy(), bars.t_close.to_numpy()) - 1     # the bar's last 1-minute bar
    for c in ("rv60", "rvday", "rvprev"):
        bars[c] = rv[c].to_numpy()[j]
    f = seams.per_segment(bars, seg, seg_features)
    f["seg"] = seg
    return bars, f


def clock(bars, tf, h):
    et = pd.to_datetime(bars.t_open, unit="s", utc=True).dt.tz_convert("America/New_York")
    m = (et.dt.hour * 60 + et.dt.minute).to_numpy()
    out = pd.DataFrame(index=bars.index)
    out["c_hh"] = m // 30
    out["c_dow"] = pd.to_datetime(bars.trade_date).dt.dayofweek.to_numpy()
    out["c_sess"] = np.select([(m >= 570) & (m < 960), (m >= 180) & (m < 570), (m >= 960) & (m < 1080)], [0, 1, 2], 3)
    since = (m + tf - 1080) % 1440                    # minutes since the 18:00 ET open, at the bar's close
    out["c_since_open"] = since
    out["c_brk"] = (since + h * tf > 1380).astype(np.int8)
    return out


def calendar(bars, tf, h, rel):
    tc = bars.t_close.to_numpy()
    j = np.searchsorted(rel, tc, side="right")       # first release strictly after the origin
    nxt = np.where(j < len(rel), rel[np.minimum(j, len(rel) - 1)], 2**62)
    jp = np.searchsorted(rel, tc, side="right") - 1
    prv = np.where(jp >= 0, rel[np.maximum(jp, 0)], -2**62)
    out = pd.DataFrame(index=bars.index)
    out["k_in_window"] = ((nxt - tc) <= h * tf * 60).astype(np.int8)
    out["k_recent"] = ((tc - prv) < 12 * tf * 60).astype(np.int8)
    out["k_mins_next"] = np.minimum((nxt - tc) / 60, 240)
    return out


def table(m1, tf, seam_t, rel):
    bars, f = build(m1, tf, seam_t)
    td = pd.to_datetime(bars.trade_date)
    t = pd.concat([bars[["t_open", "t_close", "trade_date"]], clock(bars, tf, 12), calendar(bars, tf, 12, rel), f], axis=1)
    t["c_brk48"] = clock(bars, tf, 48).c_brk
    t["k_in_window48"] = calendar(bars, tf, 48, rel).k_in_window
    t["src"] = (bars.owner_share.to_numpy() > 0.5).astype(np.int8)
    per = np.where(td >= TEST_FIRST, 1, 0)
    n = len(t)
    idx = np.arange(n)
    for h in (12, 24, 48):
        e = seams.eligible(f.seg.to_numpy(), bars.trade_date, LOOKBACK, h)
        same = np.zeros(n, bool)
        ok = idx + h < n
        same[ok] = per[idx[ok] + h] == per[ok]
        t[f"elig{h}"] = e & same & (td <= CAL_LAST).to_numpy()
    t["period"] = np.where(per == 1, "test", "fit")
    for c in t.columns:
        if t[c].dtype == np.float64:
            t[c] = t[c].astype(F32)
    return t


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    m1 = load_m1()
    seam_t = seams.find_seams(m1).t_open.to_numpy()
    rel = releases()
    for tf in TFS:
        t = table(m1, tf, seam_t, rel)
        t.to_parquet(DATA / f"tf{tf}.parquet")
        e = t.elig12
        print(tf, len(t), "eligible", int(e.sum()), "fit", int((e & (t.period == "fit")).sum()),
              "test", int((e & (t.period == "test")).sum()), flush=True)


if __name__ == "__main__":
    main()
