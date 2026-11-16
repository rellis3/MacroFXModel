"""Proof pack for vol-layer-rule-a-confirm: planted edges, shuffles, power and reproduction, for the five scored cells.

    python -X utf8 scripts/vol-layer-rule-a-confirm/proof.py             # real data: needs the confirm trades.parquet and the M1 bid/ask files (laptop)
    python -X utf8 scripts/vol-layer-rule-a-confirm/proof.py --selftest  # synthetic data, runs anywhere, proves the harness only

What it does (see PROOF_README.md for the copy-paste run):
  1. Loads the confirm run's own trade table (analysis/output/vol-layer-rule-a-confirm/confirm/trades.parquet, written by run.py)
     and rebuilds the 943 book days from the M1 session days.
  2. Re-runs run.py's own `analyse` on that table and checks it reproduces the banked results.json (every scored cell, the CI ends and
     K1's random-skip p). If it does not, it STOPS: nothing is written.
  3. For each cell builds the inputs forge/verdict_gate.py needs: the estimate and 95% interval, the minimum effect, diagnostics
     (parity of the bid/ask re-run with the registered grid, reproduction of the banked numbers), a planted LARGE and a planted
     MINIMUM-size edge, a shuffle, and the rows used.
  4. Lets verdict_gate.decide pick the word, compares it with the banked verdict in js/deskEvidence.js, and only if every cell agrees
     writes analysis/output/vol-layer-rule-a-confirm/checks.json. A disagreement (or an INVALID/INCOMPLETE cell) writes
     checks_MISMATCH_do_not_commit.json instead and exits 2: the proof never rewrites a verdict.

What the planted and shuffle checks test (stated honestly):
  * They act on the trade table AFTER the bid/ask simulation, like the other Vol-Layer proofs act on their event tables. They prove that
    the book aggregation and the date-block bootstrap see an edge of a known size and see nothing when the paired arm/B0 outcomes
    are randomly swapped. They do not re-test the stop simulator; `--selftest` tests sim() on hand-built bar paths, and the study's
    own parity check (1,135 of 1,135 trades match the registered mid grid) is carried as the diagnostic.
  * dSharpe cells (S1, S2, S3, Z1): planted = add a fixed R to every trade of the arm, sized by bisection so the arm's book Sharpe rises
    by exactly the stated amount (large 0.50, minimum = the prereg's SESOI 0.15). Recovery = the measured dSharpe moves by at least half.
    Shuffle = swap each paired arm/B0 trade outcome with probability 1/2 (true dSharpe is then zero), 20 times; the pooled interval must
    include zero.
  * K1: the prereg judges K1 against a random skip of the same count per day. Estimate = K1's CVaR5 minus the mean CVaR5 of the 500 random
    skips; interval = K1's CVaR5 minus the 97.5th / 2.5th percentile of those draws; minimum effect = the gain over the random mean that the
    registered p < 0.05 needs (95th percentile minus mean). Planted = add a loss to the trades K1 skips until the noise-free gap equals the
    stated size, then re-measure with fresh random draws. Shuffle = a random skip of the same count standing in for K1.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "scripts/forecast_history")]
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from forge import verdict_gate as G  # noqa: E402

_spec = importlib.util.spec_from_file_location("rac_run", ROOT / "scripts/vol-layer-rule-a-confirm/run.py")
RAC = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(RAC)  # run.py is import-safe (main() is guarded)

SLUG = "vol-layer-rule-a-confirm"
OUT = ROOT / "analysis/output" / SLUG
CELLS = {"s1": ("S1_1.0", "S1"), "s2": ("S2_0.5", "S2"), "s3": ("S3", "S3"), "z1": ("Z1_0.2", "Z1")}
KEY = ["inst", "date", "em", "line"]
LARGE, SESOI = 0.50, RAC.SESOI           # planted dSharpe sizes: large, and the prereg's minimum worth having
N_SHUF = 20
KEEP_C = 2                               # K1's registered base cap
BANKED_WORD = {"underpowered": "UNDERPOWERED", "null": "NULL", "validated": "VALIDATED", "context": "CONTEXT"}
TOL = 1.5e-3                             # results.json stores 4 dp


# ----------------------------------------------------------------------------------------------- small helpers
def r4(x):
    return None if x is None or not np.isfinite(x) else round(float(x), 4)


def book_of(sub, pos, nd):
    return np.bincount(pos[sub.date].to_numpy(), weights=sub.net.to_numpy(), minlength=nd)


def delta_ci(xa, xb, W):
    d = RAC.sharpe_reps(W, xa) - RAC.sharpe_reps(W, xb)
    lo, hi = np.nanpercentile(d, [2.5, 97.5])
    return float(RAC.sharpe(xa) - RAC.sharpe(xb)), float(lo), float(hi)


def bisect(f, target, lo=0.0, hi=50.0, it=60):
    """Smallest x in [lo, hi] with f(x) >= target, f nondecreasing. Returns None if even hi falls short."""
    if f(hi) < target:
        return None
    for _ in range(it):
        mid = (lo + hi) / 2
        if f(mid) >= target:
            hi = mid
        else:
            lo = mid
    return hi


def banked_words():
    ev = (ROOT / "js/deskEvidence.js").read_text(encoding="utf-8")
    out = {}
    for m in re.finditer(r"id: 'vol-layer-rule-a-confirm-(s1|s2|s3|z1|k1)', domain: '[^']*', verdict: '(\w+)'", ev):
        out[m.group(1)] = BANKED_WORD[m.group(2)]
    assert set(out) == {"s1", "s2", "s3", "z1", "k1"}, f"banked verdicts not found in js/deskEvidence.js: {out}"
    return out


# ----------------------------------------------------------------------------------------------- K1 random-skip benchmark
def k1_draws(B0, keep, rng, n, pos, nd):
    """The prereg's benchmark, written as run.py writes it: n random skips with the same number of skipped trades on each day."""
    skipped = ~keep
    n_skip_day = B0[skipped].groupby("date").size()
    cols = {d: np.flatnonzero((B0.date == d).to_numpy()) for d in n_skip_day.index}
    net = B0.net.to_numpy()
    dpos = pos[B0.date].to_numpy()
    cv = np.empty(n)
    for k in range(n):
        kk = np.ones(len(B0), bool)
        for d, m in n_skip_day.items():
            kk[rng.choice(cols[d], size=m, replace=False)] = False
        cv[k] = RAC.cvar5(np.bincount(dpos[kk], weights=net[kk], minlength=nd))
    return cv


# ----------------------------------------------------------------------------------------------- the proof
def build_checks(R, bdays, banked=None, log=print, seed=RAC.SEED):
    """Returns (questions for verdict_gate, the analyse() output). banked = results.json of the run being proven (or None in the selftest)."""
    import line_reaction as LR
    days = np.array(sorted(set(bdays)))
    nd = len(days)
    pos = pd.Series(np.arange(nd), index=days)
    W = LR.Boot(days).W
    t0 = time.time()
    A = RAC.analyse(R, bdays, "confirm", np.random.default_rng(seed))
    log(f"analyse re-run in {time.time() - t0:.0f}s: B0 net {A['B0']['net_R']}R, sharpe {A['B0']['sharpe']}, {A['book_days']} book days")
    reproduced, repro_notes = True, []
    if banked is not None:
        def same(a, b):
            return a is None or b is None or abs(a - b) <= TOL

        for arm in [v[0] for v in CELLS.values()] + ["K1_2"]:
            for f in ("d_sharpe", "p"):
                if not same(A["arms"][arm][f], banked["arms"][arm][f]):
                    reproduced = False
                    repro_notes.append(f"{arm}.{f}: re-run {A['arms'][arm][f]} vs banked {banked['arms'][arm][f]}")
            for j in (0, 1):
                if not same(A["arms"][arm]["d_sharpe_ci"][j], banked["arms"][arm]["d_sharpe_ci"][j]):
                    reproduced = False
                    repro_notes.append(f"{arm}.d_sharpe_ci[{j}]: re-run {A['arms'][arm]['d_sharpe_ci'][j]} vs banked {banked['arms'][arm]['d_sharpe_ci'][j]}")
        for f in ("p_cvar_vs_random", "rand_cvar5_mean", "d_cvar5"):
            if not same(A["arms"]["K1_2"][f], banked["arms"]["K1_2"][f]):
                reproduced = False
                repro_notes.append(f"K1_2.{f}: re-run {A['arms']['K1_2'][f]} vs banked {banked['arms']['K1_2'][f]}")
        if A["book_days"] != banked["book_days"] or A["n_trades_B0"] != banked["n_trades_B0"]:
            reproduced = False
            repro_notes.append(f"book days / B0 trades: re-run {A['book_days']}/{A['n_trades_B0']} vs banked {banked['book_days']}/{banked['n_trades_B0']}")
    log("reproduction of the banked numbers: " + ("OK" if reproduced else "FAILED: " + "; ".join(repro_notes)))

    B0 = R[R.arm == "B0"].reset_index(drop=True)
    b0 = book_of(B0, pos, nd)
    par = A["parity"]
    parity_ok = par["n"] > 0 and (par["abs_diff_lt_0p1"] or 0) >= 0.99
    miss = sum(sum(v.values()) for v in ((banked or {}).get("missing") or {}).values())
    rng = np.random.default_rng(seed + 1)
    q = {}

    # ---- the four dSharpe cells
    for qid, (arm, label) in CELLS.items():
        sub = R[R.arm == arm].reset_index(drop=True)
        xa = book_of(sub, pos, nd)
        cnt = np.bincount(pos[sub.date].to_numpy(), minlength=nd).astype(float)
        est, lo, hi = delta_ci(xa, b0, W)
        reg_lo, reg_hi = A["arms"][arm]["d_sharpe_ci"]

        def planted(target):
            f = lambda g: RAC.sharpe(xa + g * cnt) - RAC.sharpe(xa)
            g = bisect(f, target)
            if g is None:
                return {"injected": target, "shift": 0.0, "how": "could not size an edge this large on this book"}, False
            e2, l2, h2 = delta_ci(xa + g * cnt, b0, W)
            return {"injected": target, "shift": e2 - est, "added_R_per_trade": g, "lo_after": l2,
                    "how": f"added {g:.3f}R to every {label} trade, which lifts the arm's book Sharpe by exactly {target:.2f}; shift = how far the measured dSharpe moved"}, (l2 > 0 if target >= LARGE else True)

        pl, det = planted(LARGE)
        pm, _ = planted(SESOI)
        # shuffle: swap each paired arm/B0 outcome with probability 1/2, 20 times
        mg = B0[KEY + ["net"]].merge(sub[KEY + ["net"]], on=KEY, suffixes=("_b", "_a"))
        only_a = sub.merge(B0[KEY], on=KEY, how="left", indicator=True).query("_merge == 'left_only'")
        only_b = B0.merge(sub[KEY], on=KEY, how="left", indicator=True).query("_merge == 'left_only'")
        dpos = pos[mg.date].to_numpy()
        sh_est, sh_lo, sh_hi = [], [], []
        for _ in range(N_SHUF):
            sw = rng.random(len(mg)) < 0.5
            a_ = np.where(sw, mg.net_b, mg.net_a)
            b_ = np.where(sw, mg.net_a, mg.net_b)
            xa_ = np.bincount(dpos, weights=a_, minlength=nd) + book_of(only_a, pos, nd)
            xb_ = np.bincount(dpos, weights=b_, minlength=nd) + book_of(only_b, pos, nd)
            e_, l_, h_ = delta_ci(xa_, xb_, W)
            sh_est.append(e_)
            sh_lo.append(l_)
            sh_hi.append(h_)
        shuf = {"effect": float(np.mean(sh_est)), "lo": float(np.mean(sh_lo)), "hi": float(np.mean(sh_hi)), "each": [r4(v) for v in sh_est],
                "how": f"swapped each paired {label}/B0 trade outcome with probability 1/2, {N_SHUF} times (true dSharpe is then zero)"}
        ok = bool(reproduced and parity_ok and det)
        q[qid] = dict(
            effect=est, lo=lo, hi=hi, min_effect=SESOI,
            diagnostics={"ok": ok, "why": None if ok else "; ".join(x for x in [None if reproduced else "re-run did not reproduce the banked numbers", None if parity_ok else "bid/ask parity below 99%", None if det else "a large planted edge was not detected"] if x),
                         "note": f"bid/ask re-run matches the registered mid grid on {par['n']} trades (|diff| < 0.1R on {par['abs_diff_lt_0p1']}); re-run of run.py's analyse "
                                 f"{'matches' if reproduced else 'DOES NOT match'} the banked cell; banked interval [{reg_lo}, {reg_hi}]",
                         "mde_80pct": r4(2.8 * RAC_se(xa, b0, W))},
            planted_large=pl, planted_min=pm, shuffle=shuf,
            rows={"used": int(len(sub)), "dropped": int(miss), "note": "trades the bid/ask re-run could not place (no bar / no day) are counted in dropped; book days " + str(nd)})
        log(f"{qid}: dSharpe {est:+.3f} [{lo:+.3f}, {hi:+.3f}]  planted large shift {pl['shift']:+.3f} min {pm['shift']:+.3f}  shuffle [{shuf['lo']:+.3f}, {shuf['hi']:+.3f}]")

    # ---- K1 against the random skip
    keep = RAC.dollar_cap(B0, KEEP_C)
    sub_k = B0[keep]
    cv_k = RAC.cvar5(book_of(sub_k, pos, nd))
    # reproduce run.py's draw stream exactly: K1_1, K1_2, K1_3 in order, 500 draws each, from default_rng(SEED)
    rng0 = np.random.default_rng(seed)
    draws = None
    for c in RAC.K1_C:
        kc = RAC.dollar_cap(B0, c)
        d_ = k1_draws(B0, kc, rng0, 500, pos, nd)
        if c == KEEP_C:
            draws = d_
    p_rand = float((1 + (draws >= cv_k).sum()) / (1 + len(draws)))
    k1_repro = banked is None or abs(p_rand - banked["arms"]["K1_2"]["p_cvar_vs_random"]) <= 1e-9
    log(f"K1: CVaR5 {cv_k:.3f}R, random-skip mean {draws.mean():.3f}R, p {p_rand:.4f}  stream reproduces the banked p: {'yes' if k1_repro else 'NO'}")
    mean_r = float(draws.mean())
    min_k1 = float(np.percentile(draws, 95) - mean_r)
    est_k = cv_k - mean_r
    lo_k, hi_k = cv_k - float(np.percentile(draws, 97.5)), cv_k - float(np.percentile(draws, 2.5))
    skipped_idx = np.flatnonzero(~keep)
    net0 = B0.net.to_numpy().copy()

    def k1_gap(loss, n, sd):
        Bp = B0.copy()
        net = net0.copy()
        net[skipped_idx] -= loss
        Bp["net"] = net
        r_ = np.random.default_rng(sd)
        dr = k1_draws(Bp, keep, r_, n, pos, nd)
        return RAC.cvar5(book_of(Bp[keep], pos, nd)) - float(dr.mean())

    def k1_plant(target):
        base60 = k1_gap(0.0, 60, 777)
        loss = bisect(lambda L: k1_gap(L, 60, 777) - base60, target, hi=10.0, it=14)
        if loss is None:
            return {"injected": target, "shift": 0.0, "how": "could not size a harm this large on the skipped trades"}
        shift = k1_gap(loss, 300, 4242) - k1_gap(0.0, 300, 4242)
        return {"injected": target, "shift": float(shift), "added_loss_R": loss,
                "how": f"added a {loss:.2f}R loss to each of the {len(skipped_idx)} trades K1 skips (sized so K1 beats a random skip by {target:.2f}R), then re-measured with fresh random draws"}

    pl_k, pm_k = k1_plant(3 * min_k1), k1_plant(min_k1)
    rng_s = np.random.default_rng(seed + 9)
    sh_e, sh_l, sh_h = [], [], []
    skip_per_day = B0[~keep].groupby("date").size()
    for _ in range(N_SHUF):
        kk = np.ones(len(B0), bool)
        for d, m in skip_per_day.items():
            kk[rng_s.choice(np.flatnonzero((B0.date == d).to_numpy()), size=m, replace=False)] = False
        c_ = RAC.cvar5(book_of(B0[kk], pos, nd))
        sh_e.append(c_ - mean_r)
        sh_l.append(c_ - float(np.percentile(draws, 97.5)))
        sh_h.append(c_ - float(np.percentile(draws, 2.5)))
    shuf_k = {"effect": float(np.mean(sh_e)), "lo": float(np.mean(sh_l)), "hi": float(np.mean(sh_h)), "each": [r4(v) for v in sh_e],
              "how": f"a random skip with the same count per day stands in for K1, {N_SHUF} times"}
    ok_k = bool(k1_repro and reproduced and parity_ok)
    q["k1"] = dict(
        effect=est_k, lo=lo_k, hi=hi_k, min_effect=min_k1,
        diagnostics={"ok": ok_k, "why": None if ok_k else "re-run or the random-skip stream did not reproduce the banked numbers",
                     "note": f"K1 (c = {KEEP_C}) skips {len(skipped_idx)} of {len(B0)} B0 trades. Estimate = K1 CVaR5 ({cv_k:.2f}R) minus the mean of 500 random same-count skips "
                             f"({mean_r:.2f}R). Minimum effect = the gain over that mean that p < 0.05 needs ({min_k1:.2f}R): the prereg registers no SESOI for K1, so the registered pass "
                             f"rule is turned into a size. Random-skip p = {p_rand:.3f} (banked {None if banked is None else round(banked['arms']['K1_2']['p_cvar_vs_random'], 3)}). "
                             "Prereg amendment A1: the registered NULL clause cannot be met by any rule that skips trades; the random-skip benchmark decides.",
                     "dSharpe_vs_B0": A["arms"]["K1_2"]["d_sharpe"], "dCVaR5_vs_B0": A["arms"]["K1_2"]["d_cvar5"]},
        planted_large=pl_k, planted_min=pm_k, shuffle=shuf_k,
        rows={"used": int(len(sub_k)), "dropped": int(len(skipped_idx)), "note": "dropped = trades K1 skips; 500 random same-count skips as the benchmark"})
    log(f"k1: effect {est_k:+.3f} [{lo_k:+.3f}, {hi_k:+.3f}] min {min_k1:.3f}  planted large {pl_k['shift']:+.3f} min {pm_k['shift']:+.3f}  shuffle [{shuf_k['lo']:+.3f}, {shuf_k['hi']:+.3f}]")
    return q, A


def RAC_se(xa, xb, W):
    d = RAC.sharpe_reps(W, xa) - RAC.sharpe_reps(W, xb)
    return float(np.nanstd(d))


def judge(q, expected, root, log=print):
    """decide() every cell, compare with the banked words, write checks.json only if all agree."""
    res = {k: {**c, **G.decide(c)} for k, c in q.items()}
    bad = []
    for k, r in res.items():
        word = r["verdict"]
        flag = "" if (expected is None or word == expected[k]) else f"   <-- banked {expected[k]}"
        log(f"  {k}: {word:13s} power {r['power'] if r['power'] is None else round(r['power'], 2)}  {r['reasons'][0]}{flag}")
        if word in ("INVALID", "INCOMPLETE") or (expected is not None and word != expected[k]):
            bad.append(k)
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    if bad:
        p = root / "checks_MISMATCH_do_not_commit.json"
        p.write_text(json.dumps(res, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
        return False, bad, p
    p = root / "checks.json"
    p.write_text(json.dumps(res, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    return True, [], p


# ----------------------------------------------------------------------------------------------- real data
def session_days(sym, a, b):
    """The London weekdays that have at least one in-session M1 bar, from the time column alone (same rule as run.py's load_ba)."""
    t = pd.DatetimeIndex(pd.to_datetime(pd.read_parquet(RAC.BA / f"{RAC.BA_KEY.get(sym, sym.lower())}_m1.parquet", columns=["time"])["time"], utc=True))
    lo = pd.Timestamp(a).tz_localize(RAC.LON).tz_convert("UTC")
    hi = (pd.Timestamp(b) + pd.Timedelta(days=1)).tz_localize(RAC.LON).tz_convert("UTC")
    t = t[np.asarray((t >= lo) & (t < hi))]
    loc = t.tz_convert(RAC.LON).tz_localize(None)
    m = np.asarray(loc.hour * 60 + loc.minute)
    ok = np.asarray(loc.dayofweek < 5) & (m < RAC.CLOSE)
    return set(np.asarray(loc.strftime("%Y-%m-%d"))[ok])


def real_run():
    import gzip
    a, b = RAC.WINDOWS["confirm"]
    tp = OUT / "confirm/trades.parquet"
    if not tp.exists():
        sys.exit(f"{tp} not found: this must be run where run.py --window confirm was run (the laptop with data/m1_bidask).")
    banked = json.loads((OUT / "confirm/results.json").read_text())
    R = pd.read_parquet(tp)
    bdays = set()
    for sym in RAC.NAMES:
        r = json.load(gzip.open(RAC.RULEA / f"{sym}.json.gz", "rt"))
        have = session_days(sym, a, b)
        bdays |= {d["d"] for d in r["days"] if a <= d["d"] <= b and d["d"] in have}
        print(sym, "book days so far", len(bdays), flush=True)
    return R, bdays, banked


# ----------------------------------------------------------------------------------------------- selftest
def synth(seed, days_n=110, edge=0.0):
    """A small synthetic trade table with the columns run.py writes: arms are paired noisy copies of B0; `edge` is added to S3 and Z1."""
    rng = np.random.default_rng(seed)
    dts = [d.strftime("%Y-%m-%d") for d in pd.bdate_range("2023-01-02", periods=days_n)]
    rows = []
    for d in dts:
        for k in range(rng.integers(2, 6)):
            inst = RAC.NAMES[rng.integers(0, 7)]
            em = 30 + k * 100 + int(rng.integers(0, 90))
            side = int(rng.choice([-1, 1]))
            line = f"L{k % 2}"
            win = rng.random() < 0.21
            b0 = float(rng.uniform(2.5, 5.0)) if win else -float(rng.uniform(0.6, 1.1))   # continuous, so which trade a skip removes matters
            base = {"inst": inst, "date": d, "em": em, "side": side, "line": line, "sig": 0.5, "reg_gross": b0 * 0.9, "usd": RAC.USD.get(inst, 0) * side}
            for arm in ["B0", "S1_0.5", "S1_1.0", "S1_1.5", "S1_lag", "S2_0.25", "S2_0.5", "S2_0.75", "S3", "Z1_0.1", "Z1_0.2", "Z1_0.3", "Z1_lag"]:
                net = b0 if arm == "B0" else b0 + rng.normal(0, 0.15)
                if arm in ("S3", "Z1_0.2"):
                    net += edge
                rows.append({**base, "arm": arm, "net": net, "gross": b0 * 0.9, "exit_m": min(1319, em + int(rng.integers(20, 700))),
                             "reason": "stop" if b0 < 0 else "target", "risk": 0.01, "spread_R": 0.02})
    return pd.DataFrame(rows), set(dts)


def sim_unit_tests():
    """sim() on hand-built bid/ask paths: stop fill, gap fill, target, time exit, entry-bar stop, and a mid path that agrees."""
    def bars(rows):
        a = np.array(rows, float)   # columns: mid o,h,l,c ; bid o,h,l,c ; ask o,h,l,c  (spread 0.2 around mid)
        return {"o": a[:, 0], "h": a[:, 1], "l": a[:, 2], "c": a[:, 3], "bo": a[:, 0] - 0.1, "bh": a[:, 1] - 0.1, "bl": a[:, 2] - 0.1, "bc": a[:, 3] - 0.1,
                "ao": a[:, 0] + 0.1, "ah": a[:, 1] + 0.1, "al": a[:, 2] + 0.1, "ac": a[:, 3] + 0.1, "m": np.arange(len(a)) * 1.0}
    flat = [100, 100.5, 99.5, 100]
    # long, entry 100.1 (offer), stop 99 -> risk 1.1; bar 2 trades down to 98.9 mid (bid 98.8) -> stopped at 99
    A = bars([flat, flat, [99.5, 99.6, 98.9, 99.0], flat])
    r = RAC.sim(A, 0, 3, +1, 99.0)
    assert r["reason"] == "stop" and abs(r["net"] - (99.0 - 100.1) / 1.1) < 1e-9, r
    # gap: bar 1 opens below the stop -> fills at the bid open, worse than the stop
    A = bars([flat, [98.0, 98.5, 97.5, 98.0]])
    r = RAC.sim(A, 0, 1, +1, 99.0)
    assert r["reason"] == "stop" and abs(r["net"] - ((97.9 - 100.1) / 1.1)) < 1e-9, r
    # target: 5 x risk above the offer fill, hit on the bid high
    A = bars([flat, [100, 110, 100, 105]])
    r = RAC.sim(A, 0, 1, +1, 99.0)
    assert r["reason"] == "target" and abs(r["net"] - 5.0) < 1e-9, r
    # time exit at the last bar's bid close
    A = bars([flat, [100, 100.4, 99.6, 100.2]])
    r = RAC.sim(A, 0, 1, +1, 99.0)
    assert r["reason"] == "time" and abs(r["net"] - ((100.1 - 100.1) / 1.1)) < 1e-9, r
    # short mirrors: entry at the bid (99.9), stop 101, stop hit on the ask high
    A = bars([flat, [100.5, 101.5, 100.4, 101.0]])
    r = RAC.sim(A, 0, 1, -1, 101.0)
    assert r["reason"] == "stop" and r["net"] < 0, r
    # an entry already beyond the stop returns None
    assert RAC.sim(bars([flat, flat]), 0, 1, +1, 100.5) is None
    return True


def selftest():
    t0 = time.time()
    print("sim() unit tests:", sim_unit_tests())
    tmp = Path(tempfile.mkdtemp(prefix="rac_proof_selftest_"))
    # 1. null world: every cell must come out NULL or UNDERPOWERED and the planted / shuffle checks must pass
    R, bd = synth(1, edge=0.0)
    q, A = build_checks(R, bd, banked=None, log=lambda *a: print("  [null world]", *a))
    ok, bad, p = judge(q, None, tmp / "null")
    assert ok, f"null world produced INVALID/INCOMPLETE in {bad}: see {p}"
    words = {k: G.decide(c)["verdict"] for k, c in q.items()}
    assert all(w in ("NULL", "UNDERPOWERED") for w in words.values()), words
    for k, c in q.items():
        assert G.planted_ok(c["planted_large"]) and G.planted_ok(c["planted_min"]) and G.shuffle_ok(c["shuffle"]), k
    print("null world verdicts:", words)
    # 2. a world where S3 and Z1 carry a real +0.6R edge: they must come out VALIDATED (the harness can say yes)
    R2, bd2 = synth(2, edge=0.6)
    q2, _ = build_checks(R2, bd2, banked=None, log=lambda *a: print("  [edge world]", *a))
    w2 = {k: G.decide(c)["verdict"] for k, c in q2.items()}
    print("edge world verdicts:", w2)
    assert w2["s3"] == "VALIDATED" and w2["z1"] == "VALIDATED", w2
    # 3. the mismatch rule: a banked verdict that disagrees with the computed one must refuse to write checks.json
    ok3, bad3, p3 = judge(q, {"s1": "VALIDATED", "s2": "NULL", "s3": "NULL", "z1": "NULL", "k1": "NULL"}, tmp / "mismatch")
    assert (not ok3) and p3.name == "checks_MISMATCH_do_not_commit.json" and not (tmp / "mismatch/checks.json").exists(), (ok3, bad3)
    print(f"selftest OK in {time.time() - t0:.0f}s (outputs in {tmp}); real checks.json NOT written")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        selftest()
        return
    t0 = time.time()
    R, bdays, banked = real_run()
    q, _ = build_checks(R, bdays, banked=banked)
    expected = banked_words()
    print("verdicts against the banked words in js/deskEvidence.js:")
    ok, bad, p = judge(q, expected, OUT)
    if not ok:
        print(f"\nSTOP: {bad} disagree with the banked verdict (or are INVALID/INCOMPLETE). Wrote {p}. checks.json was NOT written. "
              "Report this: a proof that contradicts a banked verdict must be looked at, not edited.")
        sys.exit(2)
    print(f"\nPASS: wrote {p} ({time.time() - t0:.0f}s). Next: python scripts/run_py_tests.py")


if __name__ == "__main__":
    main()
