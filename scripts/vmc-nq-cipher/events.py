"""vmc-nq-cipher event catalogue. Reads ONLY causal feature columns; computes no outcome.

Every event is stamped on the bar at whose close it is first knowable (fractal pivots: pivot + 2), with a direction s
(+1 implies up, -1 down) as the brief's hypothesis states it. Families (forge/VMC_NQ_CIPHER_PREREG.md section 3):

  F1a WT cross, all              F1b cross after an extreme (wt2 beyond +-53 within the previous 10 bars)
  F1c cross mid-range (|wt1| < 20)
  F3w wave weakening: WT2 leg amplitude < 0.75 x the previous same-direction leg -> s against that leg
  F3s wave strengthening: ratio > 1.333 -> s with that leg (continuation)
  F3wL weakening AND price made the lower low (higher high) at the pivot
  F4 divergences, Pine f_findDivs: reg/hid x {wt2 (gated), spread, mf, vwapd}
  F5 WT2 vs Money Flow divergence at consecutive WT2 pivots
  F6z MF zero cross              F6w MF weakening after a >= 30-bar same-sign run (first slope flip against it)
  F7f full alignment (4 of 4: spread, wt1, mf, price-VWAP signs), sampled every 12 bars
  F7p partial alignment (3 of 4), sampled every 12 bars
  F7x failed alignment: a 4/4 state that breaks within 6 bars before price moved 0.5 sigma its way -> s reversed
  F8a LTF cross with the HTF spread and MF signs both agreeing   F8o ... both opposing
  F9 WT cross preceded by a same-direction MF zero cross within 10 bars (MF first)
  F9n WT cross with MF on the opposite side (MF not confirming)

De-clustering: within a family cell, an event is dropped if the previous kept event of that cell is < 12 bars earlier.
"""
import numpy as np
import pandas as pd

import vmcds

REACH = 2
HTF = {1: 15, 3: 30, 5: 60, 15: 240, 30: 240, 60: "D"}
GAP = 12


def fractal(osc, high):
    n = osc.size
    ok = np.ones(n, dtype=bool)
    ok[:REACH] = ok[n - REACH:] = False
    c = osc[REACH:n - REACH]
    for j in range(1, REACH + 1):
        a, z = osc[REACH - j:n - REACH - j], osc[REACH + j:n - REACH + j]
        ok[REACH:n - REACH] &= (c > a) & (c > z) if high else (c < a) & (c < z)
    return np.where(ok & np.isfinite(osc))[0]


def _ev(idx, s, fam, **attr):
    d = pd.DataFrame({"i": np.asarray(idx, dtype=np.int64), "s": np.asarray(s, dtype=np.int8)})
    d["family"] = fam
    for k, v in attr.items():
        d[k] = v
    return d


def build(tf, f, htf=None):
    """f: the timeframe's feature table (explore split). htf: aligned HTF columns for F8 (or None)."""
    n = len(f)
    out = []
    wt1, wt2, spr = f.wt1.to_numpy(float), f.wt2.to_numpy(float), f.wt_spread.to_numpy(float)
    mf, vwd, cl, hi, lo = f.mf.to_numpy(float), f.vwap_dist.to_numpy(float), f.close.to_numpy(float), f.high.to_numpy(float), f.low.to_numpy(float)
    sig = f.sigma.to_numpy(float)
    cross = f.cross_dir.to_numpy()

    # F1 crosses
    ci = np.where(cross != 0)[0]
    cs = cross[ci]
    speed = np.abs(spr[ci] - spr[np.maximum(ci - 1, 0)])
    level = np.abs(wt1[ci])
    out.append(_ev(ci, cs, "F1a", speed=speed, level=level))
    w = pd.Series(wt2)
    mn, mx = w.rolling(10, min_periods=1).min().shift(1).to_numpy(), w.rolling(10, min_periods=1).max().shift(1).to_numpy()
    ext = ((cs > 0) & (mn[ci] <= -53)) | ((cs < 0) & (mx[ci] >= 53))
    out.append(_ev(ci[ext], cs[ext], "F1b"))
    mid = np.abs(wt1[ci]) < 20
    out.append(_ev(ci[mid], cs[mid], "F1c"))

    # F3 waves on WT2 fractals
    tops, bots = fractal(wt2, True), fractal(wt2, False)
    piv = np.r_[tops, bots]
    kind = np.r_[np.ones(len(tops), np.int8), -np.ones(len(bots), np.int8)]
    o = np.argsort(piv, kind="stable")
    piv, kind = piv[o], kind[o]
    rows = []
    # single pass: the latest pivot of each kind before this one, and for each pivot the opposite pivot before it
    last = {1: None, -1: None}
    prev_opp = {}
    for k in range(len(piv)):
        r, kr = piv[k], int(kind[k])
        pk, r2i = last[-kr], last[kr]
        prev_opp[k] = pk
        last[kr] = k
        if pk is None or r2i is None or prev_opp.get(r2i) is None:
            continue
        p, r2, p2 = piv[pk], piv[r2i], piv[prev_opp[r2i]]
        if not (p2 < r2 < p < r):
            continue
        amp, amp2 = abs(wt2[r] - wt2[p]), abs(wt2[r2] - wt2[p2])
        if amp2 <= 0:
            continue
        ratio = amp / amp2
        # kr = -1 trough (leg was down): weakening -> up (+1); kr = +1 peak (leg was up): weakening -> down (-1)
        new_ext = (lo[r] < lo[r2]) if kr < 0 else (hi[r] > hi[r2])
        rows.append((r + REACH, int(kr), ratio, r - p, amp, new_ext))
    if rows:
        a = np.array(rows, dtype=float)
        st, kr, ratio, dur, amp, newx = a[:, 0].astype(int), a[:, 1].astype(int), a[:, 2], a[:, 3], a[:, 4], a[:, 5].astype(bool)
        ok = st < n
        st, kr, ratio, dur, amp, newx = st[ok], kr[ok], ratio[ok], dur[ok], amp[ok], newx[ok]
        wk, sg = ratio < 0.75, ratio > 1 / 0.75
        out.append(_ev(st[wk], -kr[wk], "F3w", ratio=ratio[wk], dur=dur[wk], amp=amp[wk]))
        out.append(_ev(st[sg], kr[sg], "F3s", ratio=ratio[sg], dur=dur[sg], amp=amp[sg]))
        wl = wk & newx
        out.append(_ev(st[wl], -kr[wl], "F3wL", ratio=ratio[wl]))

    # F4 divergences (already stamped at confirmation in the feature table)
    for name in ("wt2", "spread", "mf", "vwapd"):
        code = f[f"div_{name}"].to_numpy()
        for kd, kk in (("reg", 1), ("hid", 2)):
            j = np.where(np.abs(code) == kk)[0]
            out.append(_ev(j, np.sign(code[j]), f"F4{kd}_{name}", gap=f[f"div_{name}_gap"].to_numpy()[j],
                           dpx=f[f"div_{name}_dpx"].to_numpy()[j]))

    # F5 WT2 vs MF at consecutive WT2 pivots (ungated)
    ev5 = []
    for p_, r_ in zip(tops[:-1], tops[1:]):
        if wt2[r_] > wt2[p_] and mf[r_] < mf[p_]:
            ev5.append((r_ + REACH, -1))
    for p_, r_ in zip(bots[:-1], bots[1:]):
        if wt2[r_] < wt2[p_] and mf[r_] > mf[p_]:
            ev5.append((r_ + REACH, 1))
    if ev5:
        a = np.array(sorted(ev5))
        a = a[a[:, 0] < n]
        out.append(_ev(a[:, 0], a[:, 1], "F5"))

    # F6 money flow
    msg = np.sign(np.nan_to_num(mf))
    zc = np.where((msg != 0) & (np.r_[0, msg[:-1]] != msg) & (np.r_[0, msg[:-1]] != 0))[0]
    out.append(_ev(zc, msg[zc], "F6z"))
    run = f.mf_run.to_numpy()
    sl = np.sign(np.nan_to_num(f.mf_slope.to_numpy(float)))
    flip = np.where((np.r_[0, run[:-1]] >= 30) & (sl == -msg) & (np.r_[0, sl[:-1]] == np.r_[0, msg[:-1]]) & (msg != 0))[0]
    out.append(_ev(flip, -msg[flip], "F6w"))

    # F7 alignment
    comp = np.c_[np.sign(spr), np.sign(wt1), msg, np.sign(np.nan_to_num(vwd))]
    tot = comp.sum(axis=1)
    samp = np.arange(0, n, GAP)
    full = samp[np.abs(tot[samp]) == 4]
    out.append(_ev(full, np.sign(tot[full]), "F7f"))
    part = samp[np.abs(tot[samp]) == 2]                                  # 3 of 4 agree, one against
    out.append(_ev(part, np.sign(tot[part]), "F7p"))
    is4 = np.abs(tot) == 4
    ent = np.where(is4 & ~np.r_[False, is4[:-1]])[0]
    fx = []
    for e in ent:
        d0 = np.sign(tot[e])
        for b in range(e + 1, min(e + 7, n)):
            if not (is4[b] and np.sign(tot[b]) == d0):
                if np.isfinite(sig[e]) and d0 * (cl[b] - cl[e]) < 0.5 * sig[e] * cl[e]:
                    fx.append((b, -d0))
                break
    if fx:
        a = np.array(fx)
        out.append(_ev(a[:, 0], a[:, 1], "F7x"))

    # F8 multi-timeframe context for LTF crosses
    if htf is not None:
        hs, hm = np.sign(htf["h_wt_spread"].to_numpy(float)), np.sign(htf["h_mf"].to_numpy(float))
        al = (hs[ci] == cs) & (hm[ci] == cs)
        op = (hs[ci] == -cs) & (hm[ci] == -cs)
        out.append(_ev(ci[al], cs[al], "F8a"))
        out.append(_ev(ci[op], cs[op], "F8o"))

    # F9 sequencing: MF crossed first (within 10 bars, same direction) vs MF on the other side
    last_zc = np.full(n, -10**9)
    last_zc[zc] = zc
    last_zc = np.maximum.accumulate(last_zc)
    first = (ci - last_zc[ci] <= 10) & (msg[ci] == cs)
    out.append(_ev(ci[first], cs[first], "F9", lead=(ci - last_zc[ci])[first]))
    nconf = msg[ci] == -cs
    out.append(_ev(ci[nconf], cs[nconf], "F9n"))

    ev = pd.concat(out, ignore_index=True)
    ev = ev[(ev.i >= 0) & (ev.i < n) & (ev.s != 0)]
    ev = ev.sort_values(["family", "i"]).reset_index(drop=True)
    keep = []
    for fam, g in ev.groupby("family", sort=False):
        last = -10**9
        for ix, i in zip(g.index, g.i.to_numpy()):
            if i - last >= GAP:
                keep.append(ix)
                last = i
    ev = ev.loc[sorted(keep)].reset_index(drop=True)
    ev["tf"] = str(tf)
    ev["t_close"] = f.t_close.to_numpy()[ev.i]
    ev["trade_date"] = f.trade_date.to_numpy()[ev.i]
    return ev


FEATS = ["t_close", "trade_date", "close", "high", "low", "wt1", "wt2", "wt_spread", "mf", "vwap_dist", "sigma",
         "cross_dir", "mf_run", "mf_slope", "div_wt2", "div_wt2_gap", "div_wt2_dpx", "div_spread", "div_spread_gap",
         "div_spread_dpx", "div_mf", "div_mf_gap", "div_mf_dpx", "div_vwapd", "div_vwapd_gap", "div_vwapd_dpx"]


def build_tf(tf, loader=vmcds.load):
    f = loader(tf, columns=FEATS)
    htf = None
    if tf in HTF:
        h = loader(HTF[tf], columns=["t_close", "wt_spread", "mf"])
        htf = vmcds.align(f, h, ["wt_spread", "mf"], "h")
    return build(tf, f, htf), f
