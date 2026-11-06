"""
gex-range-gold: does the G2 gamma-range effect appear on gold, with honest timing and bars?

Pre-registration: oi_research_book/GEX_RANGE_GOLD_PREREG.md (pushed BEFORE this script read any
gold outcome). Q1 = gold (CME OG standard monthlies). Q2 = NQ re-scored on the SAME code path,
REFERENCE ONLY: it must reproduce the banked gex-range-es NQ number and is never scored.

This is scripts/27_gex_range_es.py with: the instrument table (GOLD, NQ), the seed, the paths, a
per-question window start, the all-shift placebo gate, and gold-only scoring (one cell, no Holm).
Sessions, frames, estimators, bootstrap and the harness are unchanged.

Scored version (ladder step c):
  sessions   New York-close, built from OANDA M1 by 27a_nyclose_sessions.py
  setup      near-surface net_gex_sum for CME trade date D, sign only (short = < 0)
  target     session S(D+2): OI(D) is published ~15-16 UTC on D+1, inside S(D+1)
  DR         ln(H/L) of S(D+2) / (sigma * sqrt(8/pi)), sigma = 20-session stdev of
             NY-close log returns ending S(D+1)
  headline   vol-matched dDR (script 21's estimator: sigma quintiles, size-weighted,
             strata with < 10 per arm skipped)
Descriptive ladder: (a) original UTC-D1 pipeline, OI(D) -> next row; (b) NY-close,
OI(D) -> S(D+1); (c) scored.

Inputs (built beforehand, see RESULTS.md for the commands):
  data/gex_range_gold/{nyc,utc}/daily_master_{near,all}_xau_usd.parquet  (01_build_daily_dataset.py)
  data/gex_range_gold/xauusd_nyclose_d1.parquet                           (27a)
  NQ reuses data/gex_range_es/ (built for gex-range-es) and data/results/gex_range_es.json (the banked number)

Usage: python oi_research_book/scripts/34_gex_range_gold.py
"""
import json
import importlib.util
import numpy as np
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
WORK = DATA / "gex_range_gold"
WORK_ES = DATA / "gex_range_es"      # the NQ reference reuses the inputs built for gex-range-es
OUT = DATA / "results"
OUT.mkdir(parents=True, exist_ok=True)

_s = importlib.util.spec_from_file_location("s18", Path(__file__).with_name("18_gex_range_brownian.py"))
s18 = importlib.util.module_from_spec(_s)
_s.loader.exec_module(s18)

SEED = 20261106
N_BOOT = 10_000
BM = s18.BM_RANGE_CONST
LOCKBOX_END = pd.Timestamp("2026-08-21")
MIN_SESSIONS, MIN_ARM = 400, 60
GATE_DELTA, OPERATIONAL = 0.05, 0.10
PLACEBO_SHIFT, PLACEBO_MAX = 125, 0.03

INSTR = {
    "GOLD": {"pair": "xau_usd", "px": "xauusd", "work": WORK},
    "NQ": {"pair": "nas100_usd", "px": "nas100", "work": WORK_ES},     # reference only (prereg Q2)
}
NQ_REPRO_TOL = 0.005      # NQ must reproduce the banked vol-matched dDR to this (same code, same window)


# ---------------------------------------------------------------- sessions
def sessions(px, work):
    s = pd.read_parquet(work / f"{px}_nyclose_d1.parquet").sort_index()
    s.index = pd.to_datetime(s.index).tz_localize(None)
    s = s[s.index <= LOCKBOX_END]
    s["ret"] = np.log(s["close"] / s["close"].shift(1))
    s["sig"] = s["ret"].rolling(20).std()                       # daily sigma, ends at the session
    s["atr_sig"] = ((s["high"] - s["low"]) / s["close"]).rolling(14).mean() / BM
    s["lrange"] = np.log(s["high"] / s["low"])
    return s


def first_date(name):
    """GOLD: its own first OI date. NQ reference: the window gex-range-es used (the later of ES's and NQ's first OI
    dates), so the NQ number is comparable with the banked one to the last digit."""
    if name == "GOLD":
        dm = pd.read_parquet(WORK / "nyc" / f"daily_master_near_{INSTR['GOLD']['pair']}.parquet")
        return pd.to_datetime(dm["date"]).min()
    return max(pd.to_datetime(pd.read_parquet(WORK_ES / "nyc" / f"daily_master_near_{p}.parquet")["date"]).min()
               for p in ("spx500_usd", "nas100_usd"))


# ---------------------------------------------------------------- frames
def frame(name, surface, step, start):
    """One instrument x surface x ladder step. Returns rows with dr, dr_atr, sig, is_short."""
    k = INSTR[name]
    counts = {}
    if step == "a":
        src = k["work"] / "utc" / f"daily_master_{surface}_{k['pair']}.parquet"
        dm = pd.read_parquet(src)
        dm["date"] = pd.to_datetime(dm["date"])
        dm = dm[dm["date"] >= start]
        counts["raw_rows"] = len(dm)
        sig = dm["rv20_ann"] / np.sqrt(252.0)
        df = pd.DataFrame({
            "date": dm["date"],
            "dr": np.log(dm["fwd_hi_1d"] / dm["fwd_lo_1d"]) / (sig * BM),
            "dr_atr": np.log(dm["fwd_hi_1d"] / dm["fwd_lo_1d"]) / ((dm["atr14"] / dm["close"])),
            "sig": sig, "is_short": dm["net_gex_sum"] < 0, "gex": dm["net_gex_sum"],
        })
        # the original pipeline's target can be past the lockbox; cut by the date itself
        df = df[df["date"] < LOCKBOX_END]
    else:
        s = sessions(k["px"], k["work"])
        dm = pd.read_parquet(k["work"] / "nyc" / f"daily_master_{surface}_{k['pair']}.parquet")
        dm["date"] = pd.to_datetime(dm["date"])
        dm = dm[dm["date"] >= start].sort_values("date")
        counts["raw_rows"] = len(dm)
        pos = s.index.get_indexer(dm["date"])
        not_session = pos < 0
        counts["oi_date_not_a_session"] = int(not_session.sum())
        dm, pos = dm[~not_session], pos[~not_session]
        lag = 2 if step == "c" else 1          # target session offset
        tgt, sig_at = pos + lag, pos + lag - 1  # sigma ends the session before the target
        ok = tgt < len(s)
        counts["target_past_end"] = int((~ok).sum())
        dm, tgt, sig_at = dm[ok], tgt[ok], sig_at[ok]
        # publication check: target session starts 17:00 New York on the label date of
        # S(tgt-1), which must be at/after D+1 16:00 UTC (OI(D) public) for step c
        if step == "c":
            start_ny = (s.index[sig_at] + pd.Timedelta(hours=17)).tz_localize("America/New_York")
            pub = (dm["date"].values + pd.Timedelta(days=1, hours=16))
            assert (start_ny.tz_convert("UTC").tz_localize(None) >= pub).all(), "target opens before OI(D) is public"
        sig = s["sig"].to_numpy()[sig_at]
        lr = s["lrange"].to_numpy()[tgt]
        df = pd.DataFrame({
            "date": dm["date"].to_numpy(),
            "tgt": s.index[tgt],
            "dr": lr / (sig * BM),
            "dr_atr": lr / (s["atr_sig"].to_numpy()[sig_at] * BM),
            "sig": sig, "is_short": (dm["net_gex_sum"] < 0).to_numpy(), "gex": dm["net_gex_sum"].to_numpy(),
        })
    keep = (np.isfinite(df["dr"]) & np.isfinite(df["dr_atr"]) & np.isfinite(df["sig"])
            & (df["sig"] > 0) & df["gex"].notna())
    counts["dropped_nonfinite"] = int((~keep).sum())
    df = df[keep].sort_values("date").reset_index(drop=True)
    counts["used"] = len(df)
    return df, counts


# ---------------------------------------------------------------- estimators
def strata(sig, n=5):
    return pd.qcut(sig, n, labels=False, duplicates="drop").to_numpy()


def vm_delta(dr, sh, st, idx=None):
    """Script 21's vol-matched estimator; optional bootstrap index rows (vectorised)."""
    if idx is None:
        idx = np.arange(len(dr))[None, :]
    d, s, t = dr[idx], sh[idx], st[idx]
    num = np.zeros(idx.shape[0]); den = np.zeros(idx.shape[0])
    for k in np.unique(st):
        mk = t == k
        a, b = mk & s, mk & ~s
        na, nb = a.sum(1), b.sum(1)
        with np.errstate(invalid="ignore", divide="ignore"):
            diff = np.where(a, d, 0).sum(1) / na - np.where(b, d, 0).sum(1) / nb
        use = (na >= 10) & (nb >= 10)
        num += np.where(use, diff * mk.sum(1), 0); den += np.where(use, mk.sum(1), 0)
    with np.errstate(invalid="ignore", divide="ignore"):
        return num / den


def boot_vm(dr, sh, st, rng):
    obs = float(vm_delta(dr, sh, st)[0])
    stats = []
    for ix in s18._boot_stats(len(dr), N_BOOT, rng, chunk=500):
        stats.append(vm_delta(dr, sh, st, ix))
    stats = np.concatenate(stats); stats = stats[np.isfinite(stats)]
    sd = float(stats.std())
    p = float((np.abs(stats - stats.mean()) >= abs(obs)).mean())
    return obs, p, sd, [obs - 1.96 * sd, obs + 1.96 * sd]


def cell(df, rng, use_atr=False, boot=True):
    dr = df["dr_atr" if use_atr else "dr"].to_numpy()
    sh = df["is_short"].to_numpy(); st = strata(df["sig"])
    out = {"n": len(df), "n_short": int(sh.sum()), "n_long": int((~sh).sum()),
           "dDR_raw": float(dr[sh].mean() - dr[~sh].mean()),
           "DR_short": float(dr[sh].mean()), "DR_long": float(dr[~sh].mean())}
    if boot:
        obs, p, sd, ci = boot_vm(dr, sh, st, rng)
        out.update({"dDR_vm": obs, "p_vm": p, "se_vm": sd, "ci95_vm": ci})
        lm, lp = s18.boot_mean_p(dr[~sh], 1.0, n_boot=N_BOOT, rng=rng)
        out.update({"DR_long_vs1_p": lp})
    else:
        out["dDR_vm"] = float(vm_delta(dr, sh, st)[0])
    return out


# ---------------------------------------------------------------- harness
def harness(df, rng):
    dr = df["dr"].to_numpy(); sh = df["is_short"].to_numpy(); st = strata(df["sig"])
    plc = float(vm_delta(dr, np.roll(sh, PLACEBO_SHIFT), st)[0])
    inj = dr + np.where(sh, 0.15, 0.0)
    base = float(vm_delta(dr, sh, st)[0]); got = float(vm_delta(inj, sh, st)[0])
    # DESCRIPTIVE, added after the NQ debug run showed the +125 placebo at +0.125 vm (POST-HOC):
    # every circular shift from 60 to n-60 rows, raw and vm, to see where the real value sits
    # in the distribution of label-timing placebos. Carries no verdict weight.
    shifts = range(60, len(dr) - 60, 5)
    pv = np.array([vm_delta(dr, np.roll(sh, k), st)[0] for k in shifts])
    pr = np.array([dr[np.roll(sh, k)].mean() - dr[~np.roll(sh, k)].mean() for k in shifts])
    raw = float(dr[sh].mean() - dr[~sh].mean())
    # PREREG GATE (replaces the ES single +125 shift): the real vm dDR must exceed the 95th percentile of the all-shift placebo
    pv95 = float(np.nanpercentile(pv, 95))
    return {"placebo_shift125_dDR_vm": plc, "placebo_pass": bool(base > pv95), "placebo_95th_pctile_vm": pv95,
            "placebo_shift125_dDR_raw": float(dr[np.roll(sh, PLACEBO_SHIFT)].mean() - dr[~np.roll(sh, PLACEBO_SHIFT)].mean()),
            "injection_0.15_recovered": got - base, "injection_pass": abs((got - base) - 0.15) < 0.01,
            "descriptive_all_shifts": {
                "n_shifts": len(pv),
                "vm_mean": float(np.nanmean(pv)), "vm_sd": float(np.nanstd(pv)),
                "vm_real_pctile": float((pv < base).mean()),
                "raw_mean": float(pr.mean()), "raw_sd": float(pr.std()),
                "raw_real_pctile": float((pr < raw).mean()),
                "vm_minus_placebo_mean": float(base - np.nanmean(pv)),
                "raw_minus_placebo_mean": float(raw - pr.mean())}}


def no_lookahead_check(name, start):
    """Perturb every session after a sampled target: that row's DR must not move."""
    k = INSTR[name]
    df, _ = frame(name, "near", "c", start)
    row = df.iloc[len(df) // 2]
    s = sessions(k["px"], k["work"])
    p = s.copy()
    after = p.index > row["tgt"]
    p.loc[after, ["high", "low", "close"]] *= 1.37
    p["ret"] = np.log(p["close"] / p["close"].shift(1)); p["sig"] = p["ret"].rolling(20).std()
    i = p.index.get_loc(row["tgt"])
    dr2 = np.log(p["high"].iloc[i] / p["low"].iloc[i]) / (p["sig"].iloc[i - 1] * BM)
    return bool(np.isclose(dr2, row["dr"]))


def holm(pvals):
    order = np.argsort(pvals); m = len(pvals); adj = np.empty(m); run = 0.0
    for r, i in enumerate(order):
        run = max(run, (m - r) * pvals[i]); adj[i] = min(run, 1.0)
    return adj


# ---------------------------------------------------------------- main
def main():
    rng = np.random.default_rng(SEED)
    banked_nq = json.loads((OUT / "gex_range_es.json").read_text())["instruments"]["NQ"]["cells"]["near/rv20"]["dDR_vm"]
    res = {"seed": SEED, "prereg": "oi_research_book/GEX_RANGE_GOLD_PREREG.md", "banked_nq_dDR_vm": banked_nq,
           "lockbox_end": str(LOCKBOX_END.date()), "instruments": {}}

    for name in INSTR:
        start = first_date(name)
        print(f"{name}: OI dates from {start.date()}, targets <= {LOCKBOX_END.date()}")
        r = {"window_start": str(start.date()), "counts": {}, "cells": {}, "ladder": {}}
        for surface in ("near", "all"):
            df, c = frame(name, surface, "c", start)
            r["counts"][surface] = c
            for norm in ("rv20", "atr14"):
                r["cells"][f"{surface}/{norm}"] = cell(df, rng, use_atr=(norm == "atr14"),
                                                      boot=(surface == "near" and norm == "rv20"))
            if surface == "near":
                prim = df
        for step in ("a", "b", "c"):
            d, c = frame(name, "near", step, start)
            r["ladder"][step] = {**cell(d, rng, boot=False), "counts": c}
        h = len(prim) // 2
        r["halves"] = {"first": cell(prim.iloc[:h], rng, boot=False),
                       "second": cell(prim.iloc[h:], rng, boot=False),
                       "split_date": str(prim["date"].iloc[h].date())}
        r["harness"] = harness(prim, rng)
        r["harness"]["no_lookahead_pass"] = no_lookahead_check(name, start)
        res["instruments"][name] = r

    names = list(INSTR)
    # Scoring. Q1 (GOLD) only: ONE scored cell, so no Holm adjustment (prereg section 6). Q2 (NQ) is a reference.
    for n in names:
        r = res["instruments"][n]; P = r["cells"]["near/rv20"]
        signs = all(c["dDR_vm"] > 0 for c in r["cells"].values())
        hz = r["harness"]
        believed = hz["placebo_pass"] and hz["injection_pass"] and hz["no_lookahead_pass"]
        powered = P["n"] >= MIN_SESSIONS and P["n_short"] >= MIN_ARM and P["n_long"] >= MIN_ARM
        if n == "NQ":
            r["role"] = "reference (prereg Q2): pipeline check only, never scored"
            r["pipeline_check"] = {"banked_vm": banked_nq, "got_vm": P["dDR_vm"], "tolerance": NQ_REPRO_TOL,
                                   "pass": bool(abs(P["dDR_vm"] - banked_nq) <= NQ_REPRO_TOL)}
            r["verdict"] = "REFERENCE (not scored)"
            continue
        gate = P["dDR_vm"] >= GATE_DELTA and P["p_vm"] < 0.05 and signs and believed
        if not powered:
            v = "UNDERPOWERED"
        elif gate:
            v = "VALIDATED"
        elif P["ci95_vm"][1] < OPERATIONAL:
            v = "NULL"
        else:
            v = "UNDERPOWERED"
        r["verdict"] = v
        r["gate_parts"] = {"dDR_vm>=0.05": P["dDR_vm"] >= GATE_DELTA, "p<0.05": bool(P["p_vm"] < 0.05),
                           "4/4_signs": signs, "harness_believed": believed, "powered": powered}
    g, nqc = res["instruments"]["GOLD"], res["instruments"]["NQ"]["pipeline_check"]
    if not nqc["pass"] and g["verdict"] == "VALIDATED":        # a failed pipeline check means the run is not believed (prereg section 4)
        g["verdict"] = "UNDERPOWERED"; g["note"] = "NQ pipeline check failed: the script does not reproduce the banked NQ number; not believed"

    # ------------- print
    for n in names:
        r = res["instruments"][n]; P = r["cells"]["near/rv20"]
        print(f"\n===== {n}  ({'Q1' if n == 'GOLD' else 'Q2 reference'})  verdict: {r['verdict']}")
        print(f"  counts: {r['counts']}")
        print(f"  PRIMARY near/rv20: n={P['n']} S{P['n_short']}/L{P['n_long']}  vm dDR {P['dDR_vm']:+.4f} "
              f"[{P['ci95_vm'][0]:+.3f}, {P['ci95_vm'][1]:+.3f}]  p {P['p_vm']:.4f}  "
              f"raw {P['dDR_raw']:+.4f}  DR_long {P['DR_long']:.3f} (vs 1 p {P['DR_long_vs1_p']:.4f})  DR_short {P['DR_short']:.3f}")
        for k, c in r["cells"].items():
            print(f"    cell {k:11s} n={c['n']:5d}  vm {c['dDR_vm']:+.4f}  raw {c['dDR_raw']:+.4f}")
        for k, c in r["ladder"].items():
            print(f"    ladder {k}: n={c['n']:5d}  vm {c['dDR_vm']:+.4f}  raw {c['dDR_raw']:+.4f}")
        print(f"    halves (split {r['halves']['split_date']}): {r['halves']['first']['dDR_vm']:+.4f} / {r['halves']['second']['dDR_vm']:+.4f}")
        print(f"    harness: {r['harness']}")
        print(f"    gate: {r.get('gate_parts')}  pipeline: {r.get('pipeline_check')}")

    def clean(o):
        if isinstance(o, dict): return {k: clean(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)): return [clean(v) for v in o]
        if isinstance(o, (np.floating,)): return round(float(o), 5)
        if isinstance(o, float): return round(o, 5)
        if isinstance(o, (np.integer,)): return int(o)
        if isinstance(o, (np.bool_,)): return bool(o)
        return o
    res["generated"] = pd.Timestamp.now("UTC").isoformat()
    (OUT / "gex_range_gold.json").write_text(json.dumps(clean(res), indent=2))
    print(f"\nwrote {OUT / 'gex_range_gold.json'}")


if __name__ == "__main__":
    main()
