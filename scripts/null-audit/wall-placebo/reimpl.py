"""Independent re-implementation of the wall-placebo comparison (step 4) plus the positive control (step 3)
and the corrected variants. Imports NOTHING from oi_research_book/scripts except the pair table.

Walls are rebuilt from the raw CME chains (OI Data/<PAIR>.csv): per contract OI forward-filled up to 5 rows,
summed across all expiries per strike, max-OI strike per side. Detector, classifier and statistic are
written from the prereg text (WALL_PLACEBO_PREREG.md) and 05's documented rules:
  touch: from a 'ready' state, call side high >= W - 2 pip (put: low <= W + 2 pip); ready when the close is
  > 5 pip on the approach side (initial state from the day's first close); one touch per arming.
  break at h: close of bar touch+h (same UTC day) beyond W.
  statistic: wall break rate - grid placebo break rate, pooled, cluster bootstrap over (pair, ISO week), 2000 reps.

Modes (comma flags):  base            exactly the banked design (no basis, CME C/P labels as-is)
                      swap            inverted pairs: CME put-on-foreign OI is the OANDA call wall and vice versa
                      basis           shift every level by that day's front-expiry futures-minus-CFD basis
                      basisx          shift by the basis of the expiry holding most OI at the wall strike
                      pit             publish-lag honest: book of CME date D used from D+1 16:00 UTC to D+2 16:00 UTC
                      timeh           horizon by clock time (last bar <= touch + h min) instead of bar count
Plant: --plant F --plant-mode MODE   pull back (mirror to the reject side) the path after a random fraction F of
                                     the wall touches found under MODE, for 240 bars, then re-run detection.

    python scripts/null-audit/wall-placebo/reimpl.py MODE [--plant F --plant-mode MODE] [--tag TAG]
"""
import sys, os, json, argparse, time
import numpy as np
import pandas as pd
import numba as nb

sys.path.insert(0, "oi_research_book/scripts")
from pair_config import PAIR_CONFIG  # table of constants only

OUT = "analysis/output/null-audit/wall-placebo/reimpl"
BAS = "analysis/output/null-audit/wall-placebo/basis"
PAIRS = ["EUR_USD", "GBP_USD", "AUD_USD", "USD_CAD", "USD_CHF", "USD_JPY", "NAS100_USD"]
M1F = {"EUR_USD": "eurusd", "GBP_USD": "gbpusd", "AUD_USD": "audusd", "USD_CAD": "usdcad",
       "USD_CHF": "usdchf", "USD_JPY": "usdjpy", "NAS100_USD": "nas100_usd"}
STEP = {"USD_JPY": 5e-5, "NAS100_USD": 100.0}
GRID = [-2, -1, 1, 2]; OFF = [-0.5, 0.5]; HZ = [15, 60, 240]
PLANT_BARS = 240


# ---------------------------------------------------------------- walls from raw
def walls_from_raw(pair):
    cache = f"{OUT}/walls_{pair.lower()}.parquet"
    if os.path.exists(cache):
        return pd.read_parquet(cache)
    raw = pd.read_csv(f"OI Data/{pair}.csv", usecols=["date", "expiry", "strike", "right", "open_interest"])
    raw["date"] = pd.to_datetime(raw["date"])
    raw["expiry"] = pd.to_datetime(raw["expiry"], utc=True).dt.tz_localize(None).dt.normalize()
    raw = raw.sort_values(["expiry", "strike", "right", "date"])
    raw["oi"] = raw.groupby(["expiry", "strike", "right"], sort=False)["open_interest"].ffill(limit=5)
    raw = raw[raw["oi"].notna()]
    rows = []
    for right in ("C", "P"):
        r = raw[raw["right"] == right]
        by = r.groupby(["date", "strike"])["oi"].sum().reset_index()
        by = by[by["oi"] > 0]
        # tie-break as 01 (idxmax over strikes ascending in OANDA terms)
        by["so"] = 1.0 / by["strike"] if PAIR_CONFIG[pair]["inverted"] else by["strike"]
        top = by.sort_values(["date", "oi", "so"], ascending=[True, False, True], kind="mergesort").groupby("date").head(2)
        # tie check: top-2 equal OI
        w = top.groupby("date").head(1).set_index("date")
        sec = top.groupby("date").nth(1).set_index("date")["oi"]
        dom = r.sort_values("oi", ascending=False).drop_duplicates(["date", "strike"])[["date", "strike", "expiry"]]
        w = w.reset_index().merge(dom, on=["date", "strike"], how="left").set_index("date")
        w["tie"] = (sec.reindex(w.index) == w["oi"]).fillna(False)
        rows.append(w.add_prefix(f"{right}_"))
    out = pd.concat(rows, axis=1).reset_index()
    os.makedirs(OUT, exist_ok=True)
    out.to_parquet(cache)
    return out


# ---------------------------------------------------------------- M1
def load_m1(pair):
    m = pd.read_parquet(f"VolRangeForecaster/data/m1/{M1F[pair]}_m1.parquet")
    ts = pd.to_datetime(m.index).tz_convert("UTC").tz_localize(None)
    df = pd.DataFrame({"ts": ts, "high": m["high"].values, "low": m["low"].values, "close": m["close"].values})
    df = df.sort_values("ts").reset_index(drop=True)
    df["date"] = df["ts"].dt.normalize()
    return df


# ---------------------------------------------------------------- numba detector
@nb.njit(cache=True)
def detect(high, low, close, dstart, dend, W, sgn, buf, rearm):
    """sgn=+1 call (approach from below), -1 put. Returns touch bar indices (global) and the segment id."""
    idx = []; seg = []
    for d in range(len(dstart)):
        w = W[d]
        if not np.isfinite(w):
            continue
        a, b = dstart[d], dend[d]
        if sgn > 0:
            ready = close[a] < w - rearm
        else:
            ready = close[a] > w + rearm
        for i in range(a, b):
            if sgn > 0:
                if ready and high[i] >= w - buf:
                    idx.append(i); seg.append(d); ready = False
                elif (not ready) and close[i] < w - rearm:
                    ready = True
            else:
                if ready and low[i] <= w + buf:
                    idx.append(i); seg.append(d); ready = False
                elif (not ready) and close[i] > w + rearm:
                    ready = True
    return np.array(idx, dtype=np.int64), np.array(seg, dtype=np.int64)


@nb.njit(cache=True)
def pullback(high, low, close, idx, Wv, sgnv, endv, nbars):
    """Mirror the path to the reject side of W for nbars after each planted touch (break -> reject)."""
    for e in range(len(idx)):
        w = Wv[e]; s = sgnv[e]
        for j in range(idx[e] + 1, min(idx[e] + 1 + nbars, endv[e])):
            h, l, c = high[j], low[j], close[j]
            if s > 0:   # call: nothing may close above W
                c2 = c if c <= w else 2 * w - c
                if l > w:
                    h2 = 2 * w - l; l2 = 2 * w - h
                elif h > w:
                    h2 = w; l2 = min(l, 2 * w - h)
                else:
                    h2 = h; l2 = l
            else:
                c2 = c if c >= w else 2 * w - c
                if h < w:
                    l2 = 2 * w - h; h2 = 2 * w - l
                elif l < w:
                    l2 = w; h2 = max(h, 2 * w - l)
                else:
                    h2 = h; l2 = l
            high[j], low[j], close[j] = h2, l2, c2


# ---------------------------------------------------------------- levels per pair & mode
def levels(pair, modes, m1dates):
    c = PAIR_CONFIG[pair]; inv = c["inverted"]; step = STEP.get(pair, 0.005)
    w = walls_from_raw(pair)
    w = w[w["date"].isin(m1dates)].sort_values("date").reset_index(drop=True)   # CME dates that have price bars
    natC, natP = w["C_strike"].values, w["P_strike"].values
    expC, expP = w["C_expiry"].values, w["P_expiry"].values
    if inv and "swap" in modes:            # CME call on the foreign ccy = put on USD/xxx
        natC, natP, expC, expP = natP, natC, expP, expC
    lv = pd.DataFrame({"date": w["date"], "natC": natC, "natP": natP, "expC": expC, "expP": expP})
    lv["basis"] = 0.0; lv["basisC"] = 0.0; lv["basisP"] = 0.0
    if "basis" in modes or "basisx" in modes:
        b = pd.read_parquet(f"{BAS}/basis_{pair.lower()}.parquet")["basis"]
        b.index = pd.to_datetime(b.index)
        bf = b.reindex(lv["date"].values).ffill(limit=3).values
        lv["basisC"] = bf; lv["basisP"] = bf
        if "basisx" in modes:
            be = pd.read_parquet(f"{BAS}/basis_by_expiry_{pair.lower()}.parquet")
            be["date"] = pd.to_datetime(be["date"]); be["expiry"] = pd.to_datetime(be["expiry"])
            bmap = be.set_index(["date", "expiry"])["b"]
            for s_, ecol in (("C", "expC"), ("P", "expP")):
                key = pd.MultiIndex.from_arrays([lv["date"], pd.to_datetime(lv[ecol])])
                bx = bmap.reindex(key).values
                lv[f"basis{s_}"] = np.where(np.isfinite(bx), bx, lv[f"basis{s_}"].values)
    def to_o(nat, bcol):
        x = 1.0 / nat if inv else nat
        return x - lv[bcol].values
    out = {"date": lv["date"].values}
    for side, ncol, bcol, oside, oncol, obcol in (("call", "natC", "basisC", "put", "natP", "basisP"),
                                                   ("put", "natP", "basisP", "call", "natC", "basisC")):
        wall = to_o(lv[ncol].values, bcol); other = to_o(lv[oncol].values, obcol)
        out[f"{side}_wall"] = wall
        for k in GRID + OFF:
            pl = to_o(lv[ncol].values + k * step, bcol)
            half = 0.5 * step * ((1.0 / lv[ncol].values) ** 2 if inv else 1.0)
            pl = np.where(np.abs(pl - other) < half, np.nan, pl)
            out[f"{side}_{k}"] = pl
    L = pd.DataFrame(out)
    # lag: book of CME row D applies to the next CME row (banked T-1) ...
    cols = [x for x in L.columns if x != "date"]
    L[cols] = L[cols].shift(1)
    return L


def segments(m1, L, modes):
    """Return per-segment (start, end, row in L). Segment = UTC day (banked) or 16:00->16:00 UTC (pit)."""
    if "pit" in modes:
        # book of CME date D becomes public ~15-16 UTC on D+1 -> valid from (D+1 16:00) to (D+2 16:00).
        # L is already shifted one CME row, so row r (label date X) carries book of the previous CME row; give it
        # the window [X 16:00, next label 16:00).
        key = (m1["ts"] - pd.Timedelta(hours=16)).dt.normalize()
        # map each bar to the last L date <= key
        ld = L["date"].values
        pos = np.searchsorted(ld, key.values, side="right") - 1
    else:
        ld = L["date"].values
        pos = np.searchsorted(ld, m1["date"].values, side="left")
        ok = (pos < len(ld)) & (ld[np.minimum(pos, len(ld) - 1)] == m1["date"].values)
        pos = np.where(ok, pos, -1)
    pos = np.asarray(pos)
    valid = pos >= 0
    # contiguous runs of equal pos
    chg = np.r_[True, pos[1:] != pos[:-1]]
    starts = np.flatnonzero(chg); ends = np.r_[starts[1:], len(pos)]
    keep = valid[starts]
    return starts[keep], ends[keep], pos[starts[keep]]


def run_pair(pair, modes, plant=0.0, plant_modes=None, rng=None, plant_log=None):
    c = PAIR_CONFIG[pair]; pip = c["pip_size"]
    m1 = load_m1(pair)
    m1dates = set(pd.to_datetime(m1["date"].unique()))
    H, Lo, C = m1["high"].values.copy(), m1["low"].values.copy(), m1["close"].values.copy()
    tsv = m1["ts"].values.astype("datetime64[m]").astype(np.int64)
    if plant > 0:
        Lp = levels(pair, plant_modes, m1dates)
        st, en, rows = segments(m1, Lp, plant_modes)
        pidx, pW, ps, pe = [], [], [], []
        for side, sgn in (("call", 1), ("put", -1)):
            Wd = Lp[f"{side}_wall"].values[rows]
            idx, seg = detect(H, Lo, C, st, en, Wd, sgn, 2 * pip, 5 * pip)
            pick = rng.random(len(idx)) < plant
            pidx.append(idx[pick]); pW.append(Wd[seg[pick]]); ps.append(np.full(pick.sum(), sgn)); pe.append(en[seg[pick]])
        pidx = np.concatenate(pidx); order = np.argsort(pidx)
        pullback(H, Lo, C, pidx[order], np.concatenate(pW)[order], np.concatenate(ps)[order], np.concatenate(pe)[order], PLANT_BARS)
        if plant_log is not None:
            plant_log[pair] = int(len(pidx))
    L = levels(pair, modes, m1dates)
    st, en, rows = segments(m1, L, modes)
    ev = []
    for side, sgn in (("call", 1), ("put", -1)):
        for kind, ks in (("wall", [None]), ("grid", GRID), ("offgrid", OFF)):
            for k in ks:
                col = f"{side}_wall" if k is None else f"{side}_{k}"
                Wd = L[col].values[rows]
                idx, seg = detect(H, Lo, C, st, en, Wd, sgn, 2 * pip, 5 * pip)
                if len(idx) == 0:
                    continue
                W = Wd[seg]; end = en[seg]
                d = {"pair": pair, "side": side, "kind": kind, "k": 0.0 if k is None else k,
                     "date": L["date"].values[rows[seg]], "touch_ts": m1["ts"].values[idx], "level": W}
                for h in HZ:
                    if "timeh" in modes:
                        tgt = tsv[idx] + h
                        j = np.searchsorted(tsv, tgt, side="right") - 1
                        # need a bar at/after the target inside the segment, else unresolved
                        okj = (j < end) & (np.searchsorted(tsv, tgt, side="left") < end) & (j > idx)
                    else:
                        j = idx + h
                        okj = j < end
                    px = C[np.minimum(j, len(C) - 1)]
                    brk = (px > W) if sgn > 0 else (px < W)
                    d[f"b{h}"] = np.where(okj, brk.astype(float), np.nan)
                ev.append(pd.DataFrame(d))
    return pd.concat(ev, ignore_index=True)


def report(ev, n_boot=2000, seed=7):
    rng = np.random.default_rng(seed)
    iso = pd.to_datetime(ev["date"]).dt.isocalendar()
    ev = ev.assign(cluster=ev["pair"] + "_" + iso["year"].astype(str) + "_" + iso["week"].astype(str))
    pooled, per = [], []
    for side in ("call", "put"):
        for h in HZ:
            s = ev[(ev["side"] == side) & ev[f"b{h}"].notna()]
            rate = s.groupby("kind")[f"b{h}"].mean()
            g = s[s["kind"].isin(["wall", "grid"])]
            agg = g.groupby(["cluster", "kind"])[f"b{h}"].agg(["sum", "count"]).unstack("kind", fill_value=0)
            sw, cw = agg[("sum", "wall")].values, agg[("count", "wall")].values
            sg, cg = agg[("sum", "grid")].values, agg[("count", "grid")].values
            n = len(agg); diffs = np.empty(n_boot)
            for b in range(n_boot):
                p = rng.integers(0, n, n)
                diffs[b] = sw[p].sum() / max(cw[p].sum(), 1) - sg[p].sum() / max(cg[p].sum(), 1)
            lo, hi = np.percentile(diffs, [2.5, 97.5])
            pooled.append({"side": side, "h": h, "wall": 100 * rate.get("wall", np.nan), "grid": 100 * rate.get("grid", np.nan),
                           "offgrid": 100 * rate.get("offgrid", np.nan),
                           "diff": 100 * (rate.get("wall", np.nan) - rate.get("grid", np.nan)), "lo": 100 * lo, "hi": 100 * hi,
                           "n_wall": int((s["kind"] == "wall").sum()), "n_grid": int((s["kind"] == "grid").sum()), "n_cl": n})
            for p_, sp in s.groupby("pair"):
                r = sp.groupby("kind")[f"b{h}"].mean()
                per.append({"pair": p_, "side": side, "h": h, "wall": 100 * r.get("wall", np.nan), "grid": 100 * r.get("grid", np.nan),
                            "n_wall": int((sp["kind"] == "wall").sum())})
    P = pd.DataFrame(pooled); Q = pd.DataFrame(per)
    p15 = P[P["h"] == 15]
    passed = bool(((p15["hi"] < 0) & (p15["diff"] <= -3)).all())
    return P, Q, passed


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("modes"); ap.add_argument("--plant", type=float, default=0.0)
    ap.add_argument("--plant-mode", default="base"); ap.add_argument("--tag", default=None)
    ap.add_argument("--seed", type=int, default=20261024)
    a = ap.parse_args()
    modes = set(a.modes.split(",")); pm = set(a.plant_mode.split(","))
    tag = a.tag or (a.modes.replace(",", "+") + (f"_plant{a.plant}@{a.plant_mode.replace(',', '+')}" if a.plant else ""))
    os.makedirs(OUT, exist_ok=True)
    t0 = time.time(); rng = np.random.default_rng(a.seed); plog = {}
    ev = pd.concat([run_pair(p, modes, a.plant, pm, rng, plog) for p in PAIRS], ignore_index=True)
    ev.to_parquet(f"{OUT}/events_{tag}.parquet")
    P, Q, passed = report(ev)
    print(f"== {tag}  ({time.time() - t0:.0f}s)  planted touches: {plog}")
    print(P.round(2).to_string(index=False))
    print(Q[Q["h"] == 15].round(1).to_string(index=False))
    print("PASS" if passed else "FAIL")
    json.dump({"tag": tag, "modes": sorted(modes), "plant": a.plant, "plant_mode": sorted(pm), "planted": plog,
               "pooled": P.to_dict("records"), "per_pair": Q.to_dict("records"), "PASS": passed,
               "rows": ev.groupby(["pair", "side", "kind"]).size().reset_index(name="n").to_dict("records")},
              open(f"{OUT}/result_{tag}.json", "w"), indent=1, default=float)
