"""vmc-nq-cipher scoring (forge/VMC_NQ_CIPHER_PREREG.md sections 3-6).

    python -I scripts/vmc-nq-cipher/score.py screen  [--data DIR] [--tag real]     discovery screen, one history
    python -I scripts/vmc-nq-cipher/score.py validate                               frozen survivors, validation period

Outcomes on each timeframe's own bars from the event bar's close (R_3/12/48, race at 12, V_12, MFE/MAE), a matched
baseline (NY hour x sigma tercile x signed prior-return bin, cutpoints from discovery), effect = mean(outcome - baseline),
trade-date block bootstrap (20-date blocks). Outcome windows never cross the discovery/validation boundary or the end
of the exploratory data.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats as sps

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import vmcds  # noqa: E402

SEED = 20261030
ROOT = HERE.parents[1]
OUT = ROOT / "analysis/output/vmc-nq-cipher"
HS = (3, 12, 48)
H = 12
TICK = 0.25
BLOCK = 20
MATERIAL = {"R12": 0.03, "race": 0.02, "V12": 0.05}
HALF_SPLIT = pd.Timestamp("2019-12-31")


def outcomes(f, period_of):
    c, hi, lo, sg = (f[k].to_numpy(float) for k in ("close", "high", "low", "sigma"))
    n = len(c)
    per = period_of.to_numpy()
    unit = sg * c
    o = {}

    def fwd(a, h):
        return np.r_[a[h:], np.full(h, np.nan)]

    def same_period(h):
        p2 = np.r_[per[h:], np.full(h, "")]
        return p2 == per
    for h in HS:
        r = (fwd(c, h) - c) / (unit * np.sqrt(h))
        r[~same_period(h)] = np.nan
        o[f"R{h}"] = r
    up, dn = c + unit * np.sqrt(H), c - unit * np.sqrt(H)
    race = np.full(n, np.nan)
    done = np.zeros(n, bool)
    ties = np.zeros(n, bool)
    mx, mn = np.full(n, -np.inf), np.full(n, np.inf)
    for j in range(1, H + 1):
        hj, lj = fwd(hi, j), fwd(lo, j)
        mx, mn = np.fmax(mx, hj), np.fmin(mn, lj)
        u, d = (hj >= up) & ~done, (lj <= dn) & ~done
        race[u & ~d] = 1.0
        race[d & ~u] = 0.0
        ties |= u & d
        done |= u | d
    ok = same_period(H)
    race[~ok | ties] = np.nan
    tick = TICK * c / f.raw_close.to_numpy(float)
    v = np.log((mx - mn + tick) / (unit * np.sqrt(H)))
    v[~ok | ~np.isfinite(mx)] = np.nan
    o["race"], o["V12"], o["tie"] = race, v, ties & ok
    o["MFE_up"], o["MAE_up"] = (mx - c) / (unit * np.sqrt(H)), (c - mn) / (unit * np.sqrt(H))
    prior = (c - np.r_[np.full(H, np.nan), c[:-H]]) / (unit * np.sqrt(H))
    o["prior"] = prior
    return pd.DataFrame(o)


def strata(f, o, disc):
    hr = pd.to_datetime(f.t_close.to_numpy() - 60, unit="s", utc=True).tz_convert("America/New_York").hour.to_numpy()
    sg = f.sigma.to_numpy(float)
    q = np.nanquantile(sg[disc], [1 / 3, 2 / 3])
    st = np.searchsorted(q, sg)
    ap = np.abs(o.prior.to_numpy())
    qq = np.nanquantile(ap[disc], [0.2, 0.4, 0.6, 0.8])
    pb = np.searchsorted(qq, ap) * np.where(o.prior.to_numpy() >= 0, 1, -1) + np.where(o.prior.to_numpy() >= 0, 5, 4)
    key = hr * 100 + st * 10 + pb
    key = np.where(np.isfinite(sg) & np.isfinite(o.prior.to_numpy()), key, -1)
    return key


def baseline_means(key, o, mask):
    d = pd.DataFrame({"k": key[mask], "R12": o.R12.to_numpy()[mask], "R3": o.R3.to_numpy()[mask],
                      "R48": o.R48.to_numpy()[mask], "race": o.race.to_numpy()[mask], "V12": o.V12.to_numpy()[mask]})
    return d.groupby("k").mean()


class Boot:
    """Trade-date block bootstrap with a fixed draw per period."""

    def __init__(self, dates, B, seed):
        u = np.array(sorted(set(dates)))
        self.blk = {d: i // BLOCK for i, d in enumerate(u)}
        nb = len(u) // BLOCK + 1
        rng = np.random.default_rng(seed)
        self.W = np.stack([np.bincount(rng.integers(0, nb, nb), minlength=nb) for _ in range(B)]).astype(float)
        self.nb = nb

    def stat(self, dates, x):
        ok = np.isfinite(x)
        if ok.sum() < 20:
            return None
        b = np.array([self.blk[d] for d in dates[ok]])
        s = np.bincount(b, weights=x[ok], minlength=self.nb)
        n = np.bincount(b, minlength=self.nb).astype(float)
        est = s.sum() / n.sum()
        bs = (self.W @ s) / np.maximum(self.W @ n, 1)
        se = bs.std(ddof=1)
        lo, hi = np.percentile(bs, [2.5, 97.5])
        t = est / se if se > 0 else 0.0
        return {"est": float(est), "se": float(se), "lo": float(lo), "hi": float(hi), "t": float(t),
                "p": float(2 * sps.norm.sf(abs(t))), "n": int(ok.sum())}


def prepare(tf, loader, events_mod):
    ev, f = events_mod.build_tf(tf, loader=loader)
    f = f.reset_index(drop=True)
    extra = loader(tf, columns=["raw_close", "t_open"])
    f["raw_close"], f["t_open"] = extra.raw_close.to_numpy(), extra.t_open.to_numpy()
    td = pd.to_datetime(f.trade_date)
    period = pd.Series(np.where(td <= vmcds.DISCOVERY_END, "disc", "val"), index=f.index)
    o = outcomes(f, period)
    disc = (period == "disc").to_numpy()
    key = strata(f, o, disc)
    return ev, f, o, key, period


def cell_rows(tf, ev, f, o, key, period, which, boot, tag):
    mask = (period == which).to_numpy() & (key >= 0)
    mu = baseline_means(key, o, mask)
    td = f.trade_date.astype(str).to_numpy()
    rows = []
    ev = ev[(period.to_numpy()[ev.i.to_numpy()] == which)]
    for fam, g in ev.groupby("family"):
        i, s = g.i.to_numpy(), g.s.to_numpy().astype(float)
        k = key[i]
        okk = k >= 0
        i, s, k = i[okk], s[okk], k[okk]
        if len(i) < 20:
            continue
        m = mu.reindex(k)
        dts = td[i]
        res = {"tag": tag, "tf": str(tf), "family": fam, "period": which, "n": int(len(i))}
        outs = {
            "R12": s * o.R12.to_numpy()[i] - s * m.R12.to_numpy(),
            "R3": s * o.R3.to_numpy()[i] - s * m.R3.to_numpy(),
            "R48": s * o.R48.to_numpy()[i] - s * m.R48.to_numpy(),
            "race": np.where(s > 0, o.race.to_numpy()[i], 1 - o.race.to_numpy()[i]) - np.where(s > 0, m.race.to_numpy(), 1 - m.race.to_numpy()),
            "V12": o.V12.to_numpy()[i] - m.V12.to_numpy(),
        }
        yr = pd.to_datetime(dts)
        for name, x in outs.items():
            st = boot.stat(dts, x)
            if st is None:
                continue
            for kk, v in st.items():
                res[f"{name}_{kk}"] = v
            for lab, sel in (("h1", yr <= HALF_SPLIT), ("h2", yr > HALF_SPLIT), ("bull", s > 0), ("bear", s < 0)):
                xs = x[np.asarray(sel)]
                res[f"{name}_{lab}"] = float(np.nanmean(xs)) if np.isfinite(xs).sum() >= 10 else np.nan
        res["ties"] = int(o.tie.to_numpy()[i].sum())
        res["race_unresolved"] = int(np.isnan(o.race.to_numpy()[i]).sum())
        res["MFE"] = float(np.nanmedian(np.where(s > 0, o.MFE_up.to_numpy()[i], o.MAE_up.to_numpy()[i])))
        res["MAE"] = float(np.nanmedian(np.where(s > 0, o.MAE_up.to_numpy()[i], o.MFE_up.to_numpy()[i])))
        if fam == "F1a" and "speed" in g:
            y = s * o.R12.to_numpy()[i]
            sp, lv = g.speed.to_numpy()[okk], g.level.to_numpy()[okk]
            ok = np.isfinite(y) & np.isfinite(sp) & np.isfinite(lv)
            res["H4_partial_speed"] = partial(sp[ok], y[ok], lv[ok])
            res["H4_partial_level"] = partial(lv[ok], y[ok], sp[ok])
            res["H4_n"] = int(ok.sum())
        rows.append(res)
    return rows


def partial(x, y, z):
    rx, ry, rz = (sps.rankdata(v) for v in (x, y, z))
    A = np.c_[np.ones_like(rz), rz]
    ex = rx - A @ np.linalg.lstsq(A, rx, rcond=None)[0]
    ey = ry - A @ np.linalg.lstsq(A, ry, rcond=None)[0]
    return float(np.corrcoef(ex, ey)[0, 1])


def seq_share(f, period, which):
    """Sequencing gate statistic: share of WT crosses preceded within 10 bars by a same-direction MF zero cross."""
    m = (period == which).to_numpy()
    cross = f.cross_dir.to_numpy()
    mf = np.sign(np.nan_to_num(f.mf.to_numpy(float)))
    zc = np.where((mf != 0) & (np.r_[0, mf[:-1]] != mf) & (np.r_[0, mf[:-1]] != 0))[0]
    last = np.full(len(mf), -10**9)
    last[zc] = zc
    last = np.maximum.accumulate(last)
    ci = np.where((cross != 0) & m)[0]
    if not len(ci):
        return None
    lead = ci - last[ci]
    return float(np.mean((lead <= 10) & (mf[ci] == cross[ci])))


def screen(data_dir, tag, which="disc", B=2000, tfs=vmcds.TFS):
    os.environ["VMC_DATA"] = str(data_dir)
    vmcds.DATA = Path(data_dir)
    import events as ev_mod
    rows, seq = [], {}
    for tf in tfs:
        t0 = time.time()
        ev, f, o, key, period = prepare(tf, vmcds.load, ev_mod)
        dts = f.trade_date.astype(str).to_numpy()[(period == which).to_numpy()]
        boot = Boot(dts, B, SEED)
        rows += cell_rows(tf, ev, f, o, key, period, which, boot, tag)
        if tf in (1, 5, 15, 60):
            seq[str(tf)] = seq_share(f, period, which)
        print(tag, which, tf, f"{time.time() - t0:.0f}s", flush=True)
    return pd.DataFrame(rows), seq


def bh(p, q=0.10):
    p = np.asarray(p, float)
    n = np.isfinite(p).sum()
    o = np.argsort(np.where(np.isfinite(p), p, 2))
    passed = np.zeros(len(p), bool)
    thr = q * np.arange(1, len(p) + 1) / max(n, 1)
    ok = np.where(np.where(np.isfinite(p[o]), p[o], 2) <= thr)[0]
    if len(ok):
        passed[o[:ok.max() + 1]] = True
    return passed


def survivors(real, synth_t, synth_counts=None):
    """Apply THE GATE (prereg section 4) to the real discovery table. synth_t: dict cellkey -> list of |t| (20 histories)."""
    out = []
    for name in ("R12", "race", "V12"):
        d = real[["tf", "family", f"{name}_est", f"{name}_p", f"{name}_t", f"{name}_h1", f"{name}_h2"]].copy()
        d["bh"] = bh(d[f"{name}_p"].to_numpy())
        d["material"] = d[f"{name}_est"].abs() >= MATERIAL[name]
        d["halves"] = np.sign(d[f"{name}_h1"]) == np.sign(d[f"{name}_h2"])
        d["synth95"] = [np.nanpercentile(synth_t.get((name, a, b), [np.inf]), 95) if synth_t.get((name, a, b)) else np.inf
                        for a, b in zip(d.tf, d.family)]
        d["beats_shuffle"] = d[f"{name}_t"].abs() > d.synth95
        d["survivor"] = d.bh & d.material & d.halves & d.beats_shuffle
        d["outcome"] = name
        out.append(d.rename(columns={f"{name}_{k}": k for k in ("est", "p", "t", "h1", "h2")}))
    return pd.concat(out, ignore_index=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["screen"])
    ap.add_argument("--data", default=str(vmcds.DATA))
    ap.add_argument("--tag", default="real")
    ap.add_argument("--B", type=int, default=2000)
    ap.add_argument("--period", default="disc")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    d, seq = screen(a.data, a.tag, a.period, a.B)
    out = Path(a.out) if a.out else OUT / "runs"
    out.mkdir(parents=True, exist_ok=True)
    d.to_parquet(out / f"screen_{a.tag}_{a.period}.parquet", index=False)
    (out / f"seq_{a.tag}_{a.period}.json").write_text(json.dumps(seq))
    print("cells", len(d))
