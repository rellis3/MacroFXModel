"""post-release-drift-pooled — one entry point.

    python scripts/post-release-drift-pooled/run.py                 # events -> power -> score (real data, laptop)
    python scripts/post-release-drift-pooled/run.py --stage events  # event table + exact counts only
    python scripts/post-release-drift-pooled/run.py --stage power   # ... + placebo + power.json, stops before scoring
    python scripts/post-release-drift-pooled/run.py --stage score   # scores, requires the power.json written earlier
    python scripts/post-release-drift-pooled/run.py --selftest      # synthetic: planted drift must be found, null must not

Prereg: forge/POST_RELEASE_DRIFT_POOLED_PREREG.md. Seed 20261114. Lockbox: nothing after London date 2026-08-21.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

import events as EV                                     # noqa: E402
import pipeline as PL                                   # noqa: E402
import report as RP                                     # noqa: E402
from common import (BARS, HORIZONS, IDS, INSTRUMENTS, NEWYORK, NS_MIN, OUT, Params, Px, jdump,  # noqa: E402
                    lockbox_cut, px_from_m1, rng_for)

DEVIATIONS = [
    "Script layout: one entry point `run.py`; prereg §8's numbered files map to `events.py` (01), `sigma.mjs` (02), "
    "`pipeline.power_run` (03), `pipeline.score` (04), `report.py` (05). `fetch.sh` is not needed: the runner reads "
    "local files only.",
    "Positive control: 2,000 event sign flips per planted draw (the scored cells use 20,000).",
    "HAR σ: the last 800 NY-close bars, or every available bar (>= 250) where fewer than 800 exist (start of each "
    "M1 file, NQ's M15 era).",
    "Spot-check of 20 events against first prints: the runner writes the sample to DATA_AUDIT.md with an empty "
    "first-print column to fill by hand (no network access in the runner).",
    "Power run event set: scored events with placebo candidates (no outcome availability read). The scored cells use "
    "events with >= 3 instruments measured.",
    "Placebo-entry R: 200 placebo draws per event.",
    "Non-US mirror: legacy calendar file only (to 2026-07-02).",
]


def r2_guard(allow: bool):
    live = [k for k in ("R2_ACCESS_KEY", "R2_SECRET_KEY", "R2_BUCKET") if os.environ.get(k)]
    if live and not allow:
        sys.exit(f"Refusing to run with R2 credentials in the environment ({', '.join(live)}): data-rules forbids "
                 "local scoring with live R2 credentials. Unset them (this runner never touches R2) or pass --allow-r2-env.")


def mirror_rows(world, mirror: pd.DataFrame) -> pd.DataFrame:
    if mirror is None or not len(mirror):
        return pd.DataFrame()
    m = mirror.copy()
    m["eid"] = 1_000_000 + np.arange(len(m))
    m = m[m["s"] != 0]
    rows = PL.measure_events(world, m, None, mirror=True)
    rows = rows.merge(m[["eid", "s", "family"]], on="eid")
    for h in HORIZONS:
        raw = rows[f"lr_{h}"] / rows["sig"]
        rows[f"y_sig_{h}"] = rows["s"] * raw
        md = np.sign(rows["m"]).fillna(0)
        rows[f"y_mom_{h}"] = (md * raw).where(md != 0)
    return rows


def run_pipeline(world: PL.World, out_dir: Path, stage: str, coverage: list, selftest: bool = False) -> dict | None:
    p = world.params
    out_dir.mkdir(parents=True, exist_ok=True)
    ev = world.events
    assert (ev["t"].dt.tz_convert("Europe/London").dt.date.astype(str) <= p.lockbox_last_date).all(), "event after lockbox"
    scored = ev[ev["s"] != 0]
    keys, cand = PL.placebo_keys(world, scored)
    t0 = time.time()
    if stage in ("all", "power"):
        print(f"[placebo] measuring {len(keys)} placebo day-clocks x {len(INSTRUMENTS)} instruments ...", flush=True)
        P = PL.measure_placebo(world, keys)
        P.to_parquet(out_dir / "placebo.parquet")
        A = PL.placebo_arrays(P, len(keys))
        print(f"[power] placebo-based MDE + positive control ({time.time() - t0:.0f}s so far) ...", flush=True)
        power = PL.power_run(world, scored, cand, A)
        jdump(power, out_dir / "power.json")
        for k, v in power["cells"].items():
            print(f"  {k:38s} n={v['n_events']:4d} MDE={v['mde']:.3f} bar={v['bar']:.2f} {v['power_verdict']:12s} "
                  f"power@bar={v['power_at_bar']:.2f} null-rej={v['positive_control']['0xbar']['reject_0.05']:.3f} checks={v['checks']}")
        if stage == "power":
            print(f"[power] wrote {out_dir / 'power.json'}. Commit it, then run --stage score.")
            return None
    else:
        pj = out_dir / "power.json"
        if not pj.exists():
            sys.exit("power.json missing: run --stage power first (the power verdicts must exist before scoring).")
        power = json.loads(pj.read_text())
        P = pd.read_parquet(out_dir / "placebo.parquet")
    if power["events_sha"] != PL.events_sha(ev):
        sys.exit("events table changed since power.json was written; rerun --stage power.")
    print(f"[score] measuring {len(ev)} events x {len(INSTRUMENTS)} instruments ...", flush=True)
    rows = PL.measure_events(world, ev, [k for k, _ in INSTRUMENTS])
    rows.to_parquet(out_dir / "rows.parquet")
    mrows = mirror_rows(world, world.mirror)
    res = PL.score(world, rows, P, cand, power, mrows)
    ran_at = pd.Timestamp.now("UTC").strftime("%Y-%m-%dT%H:%M:%SZ")
    RP.write(out_dir, p, res, power, coverage, world.notes, DEVIATIONS, ran_at, selftest=selftest)
    for idn in IDS:
        print(f"[verdict] {idn}: {res['ids'][idn]['verdict']}  " + ", ".join(f"{h} {res['ids'][idn]['cell_verdicts'][h]}" for h in HORIZONS))
    print(f"[done] {out_dir / 'RESULTS.md'}  ({time.time() - t0:.0f}s)")
    return res


# ── synthetic self-test ─────────────────────────────────────────────────────────────────────────────────────────

SIG_TRUE = {"gold": 0.009, "eurusd": 0.006, "gbpusd": 0.006, "usdjpy": 0.006, "nq": 0.012}
RHO = {"gold": 0.6, "eurusd": 0.75, "gbpusd": 0.7, "usdjpy": 0.65, "nq": 0.25}


def synth_events(params: Params, rng) -> pd.DataFrame:
    rows = []
    for m in pd.date_range("2014-02-01", "2016-11-01", freq="MS"):
        fri = m + pd.offsets.Week(weekday=4) if m.dayofweek != 4 else m
        cpi = pd.Timestamp(m.year, m.month, 13)
        cpi = cpi + pd.offsets.BDay(0) if cpi.dayofweek < 5 else cpi + pd.offsets.BDay(1)
        ppi = cpi + pd.offsets.BDay(1)
        for fam, d, clock in (("NFP", fri, "08:30"), ("CPI", cpi, "08:30"), ("PPI", ppi, "08:30")):
            rows.append((fam, d, clock))
        if m.month in (1, 3, 4, 6, 7, 9, 10, 12):
            wed = m + pd.offsets.WeekOfMonth(week=2, weekday=2)
            rows.append(("FOMC", wed, "14:00"))
    ev = pd.DataFrame(rows, columns=["family", "d", "ny_clock"])
    ev["t"] = [pd.Timestamp(f"{d.date()} {c}").tz_localize(NEWYORK).tz_convert("UTC") for d, c in zip(ev["d"], ev["ny_clock"])]
    ev = ev.sort_values("t").drop_duplicates("t").reset_index(drop=True)
    n = len(ev)
    ev["s"] = rng.choice([-1, 1, 0], size=n, p=[0.43, 0.43, 0.14])
    ev["z"] = rng.normal(size=n)
    ev["tercile"] = rng.choice([1.0, 2.0, 3.0, np.nan], size=n)
    ev["agree"] = np.where(ev["family"] == "FOMC", np.nan, rng.choice([0.0, 1.0], size=n))
    ev["no_signal_reason"] = np.where(ev["s"] == 0, "in_line", "")
    ev["src"] = "synthetic"
    ev["eid"] = np.arange(n)
    ev["ny_date"] = ev["t"].dt.tz_convert(NEWYORK).dt.date
    return ev.drop(columns="d")


def synth_world(params: Params, ev: pd.DataFrame, delta: float, workdir: Path) -> PL.World:
    rng = rng_for(params, "synthetic-prices")             # same noise for the planted and the null world
    idx = pd.date_range("2013-01-01", "2017-01-06", freq="1min", tz="UTC", inclusive="left")
    idx = idx[idx.dayofweek < 5]
    T = idx.as_unit("ns").asi8
    n = len(T)
    f = rng.standard_normal(n)
    px = {}
    plant_ok = (ev["s"] != 0).to_numpy()
    for key, d in INSTRUMENTS:
        sm = SIG_TRUE[key] / np.sqrt(1440)
        r = sm * (RHO[key] * d * f + np.sqrt(1 - RHO[key] ** 2) * rng.standard_normal(n))
        # planted drift: from entry (t+15) a ramp over 60 min to delta*sigma in direction s*d, then held
        for s, t in zip(ev["s"].to_numpy()[plant_ok], ev["t"].to_numpy()[plant_ok]):
            k0 = np.searchsorted(T, pd.Timestamp(t).value + 15 * NS_MIN)
            r[k0:k0 + 60] += delta * SIG_TRUE[key] * s * d / 60.0
        c = 100.0 * np.exp(np.cumsum(r))
        o = np.r_[c[0], c[:-1]]
        wig = np.abs(rng.standard_normal(n)) * sm * 0.3
        h = np.maximum(o, c) * np.exp(wig)
        l = np.minimum(o, c) * np.exp(-wig)
        df = pd.DataFrame({"open": o, "high": h, "low": l, "close": c}, index=idx)
        df = lockbox_cut(df, params, key)
        sp = df["close"].to_numpy() * 8e-5
        px[key] = px_from_m1(key, df, (df.index.as_unit("ns").asi8, sp, sp))
    yidx = pd.date_range("2013-01-01", "2017-01-06", freq="15min", tz="UTC", inclusive="left")
    yidx = yidx[yidx.dayofweek < 5]
    y2 = pd.Series(100 * np.exp(np.cumsum(0.0003 * rng.standard_normal(len(yidx)))), index=yidx)
    mir = pd.DataFrame({"family": "MIRROR_UK", "t": ev["t"].iloc[::4].to_numpy() + pd.Timedelta(hours=-6),
                        "s": rng.choice([-1, 1], size=len(ev.iloc[::4])), "inst": "gbpusd"})
    mir["ny_clock"] = mir["t"].dt.tz_convert(NEWYORK).dt.strftime("%H:%M")
    mir["ny_date"] = mir["t"].dt.tz_convert(NEWYORK).dt.date
    return PL.finish_world(params, px, ev, mir, y2, [f"SYNTHETIC world, planted delta = {delta}σ"], workdir=workdir)


def unit_checks(params: Params):
    # price_at conventions on a toy start-stamped M1 series
    t0 = pd.Timestamp("2015-03-02 13:00", tz="UTC").value
    t = t0 + np.arange(10) * NS_MIN
    c = np.arange(10, dtype=float) + 100
    px = Px("toy", t, c - 0.5, c + 1, c - 1, c, np.full(10, NS_MIN))
    assert px.entry(t0 + 3 * NS_MIN)[0] == c[3] - 0.5                     # open of the bar stamped T
    assert px.exit(t0 + 3 * NS_MIN)[0] == c[2]                            # close of the bar ending at T
    assert np.isnan(px.exit(t0 + 30 * NS_MIN)[0])                         # older than 5 min -> missing
    # lockbox: rows after the lockbox London date are cut, and the assert holds
    df = pd.DataFrame({"close": 1.0}, index=pd.date_range("2016-12-29", "2017-01-04", freq="1h", tz="UTC"))
    cut = lockbox_cut(df, params, "toy")
    assert str(cut.index[-1].tz_convert("Europe/London").date()) <= params.lockbox_last_date
    # NY-close key: a 22:30 UTC bar in EDT belongs to the next NY session
    from common import ny_key
    assert str(ny_key(pd.Timestamp("2015-06-01 22:30", tz="UTC")).date()) == "2015-06-02"
    assert str(ny_key(pd.Timestamp("2015-06-01 20:30", tz="UTC")).date()) == "2015-06-01"
    # point-in-time data surprise: z uses only earlier events
    e = pd.DataFrame({"family": ["CPI"] * 14, "t": pd.date_range("2014-01-15", periods=14, freq="MS", tz="UTC"),
                      "a_core": [0.2] * 13 + [5.0], "c_core": [0.1, 0.3] * 6 + [0.2, 0.2], "src": "x"})
    s = EV.surprises(e)
    assert s["s_data"].iat[-1] == 1 and np.isfinite(s["z_core"].iat[-1]) and np.isnan(s["z_core"].iat[11])
    # file loaders on the research schema (`time` column, bid/ask AFTER time) and the NQ M15 -> M1 splice
    from common import load_close_m15, load_ohlc, load_spread
    tmp = Path(tempfile.mkdtemp(prefix="prdp_unit_"))
    ti = pd.date_range("2016-12-29 10:00", periods=300, freq="1min")          # naive UTC, as the research cache
    m1 = pd.DataFrame({"open": 1.0, "high": 1.1, "low": 0.9, "close": 1.05, "volume": 1, "time": ti,
                       "bid_o": 1.0, "bid_h": 1.0, "bid_l": 1.0, "bid_c": 1.0, "ask_o": 1.0002, "ask_h": 1.0, "ask_l": 1.0, "ask_c": 1.0003})
    m1.to_parquet(tmp / "x_m1.parquet")
    o = load_ohlc(tmp / "x_m1.parquet", params, "x")
    st, so, sc = load_spread(tmp / "x_m1.parquet", params, "x")
    assert len(o) == 300 and abs(so[0] - 0.0002) < 1e-12 and abs(sc[0] - 0.0003) < 1e-12
    pd.DataFrame({"close": np.linspace(1, 2, 40)}, index=pd.date_range("2016-12-29 00:00", periods=40, freq="15min", tz="UTC")).to_parquet(tmp / "m15.parquet")
    m15 = load_close_m15(tmp / "m15.parquet", params, "m15")
    spl = px_from_m1("nq", o, None, m15_before=m15)
    assert spl.barlen[0] == 15 * NS_MIN and spl.barlen[-1] == NS_MIN and np.all(np.diff(spl.end) >= 0)
    t_m15 = pd.Timestamp("2016-12-29 03:00", tz="UTC").value
    assert spl.entry(t_m15)[2] == 15 * NS_MIN and spl.exit(t_m15 + 15 * NS_MIN)[0] == m15.iloc[12]
    bad = m1.assign(time=pd.Timestamp("1970-01-01") + pd.to_timedelta(np.arange(300), "s"))
    bad.to_parquet(tmp / "bad_m1.parquet")
    try:
        load_ohlc(tmp / "bad_m1.parquet", params, "bad")
        raise AssertionError("1970 stamps were not rejected")
    except ValueError:
        pass
    print("[selftest] unit checks passed (price clocks, lockbox cut, NY-close key, point-in-time z)")


def selftest(args):
    params = Params(lockbox_last_date="2016-12-30", half_split="2015-07-01", last3_from="2016-01-01", B=300,
                    n_flip=4000, n_flip_posctrl=1000, n_placebo=300, n_posctrl=100, n_power_reps=4)
    unit_checks(params)
    base = Path(args.out) if args.out else Path(tempfile.mkdtemp(prefix="prdp_selftest_"))
    ev = synth_events(params, rng_for(params, "synthetic-events"))
    print(f"[selftest] {len(ev)} synthetic events ({int((ev['s'] != 0).sum())} with a sign); output under {base}")
    cov = EV.coverage_text(ev.assign(r2=np.nan), None)
    failures = []
    for name, delta in (("planted", 0.30), ("null", 0.0)):
        print(f"\n[selftest] === {name} world (delta = {delta}σ) ===", flush=True)
        world = synth_world(params, ev, delta, base / name)
        res = run_pipeline(world, base / name, "all", cov, selftest=True)
        sig = res["ids"][IDS[0]]
        mom = res["ids"][IDS[1]]
        for h in HORIZONS:
            st = sig["cells"][h]
            tol = 3 * st["se"] + 0.25 * delta
            print(f"  {name} sig {h}: est {st['est']:+.3f} [{st['lo']:+.3f}, {st['hi']:+.3f}] holm p {st['p_holm']:.4f} "
                  f"gate-cont {st['gate']['continuation']['all']}  | mom est {mom['cells'][h]['est']:+.3f} holm p {mom['cells'][h]['p_holm']:.4f}")
            if abs(st["est"] - delta) > tol:
                failures.append(f"{name} {h}: estimate {st['est']:+.3f} not within {tol:.3f} of planted {delta}")
        if name == "planted":
            for h in ("h1", "h2"):
                if not sig["cells"][h]["gate"]["continuation"]["c1_holm"]:
                    failures.append(f"planted {h}: Holm did not flag the planted drift")
            if sig["verdict"] != "VALIDATED":
                failures.append(f"planted: verdict {sig['verdict']} (expected VALIDATED)")
        else:
            if any(sig["cells"][h]["gate"][s]["c1_holm"] for h in HORIZONS for s in ("continuation", "reversal")):
                failures.append("null: a cell was flagged by Holm with nothing planted")
            if sig["verdict"] in ("VALIDATED", "CONTEXT"):
                failures.append(f"null: verdict {sig['verdict']}")
        if mom["verdict"] == "VALIDATED":
            failures.append(f"{name}: momentum id VALIDATED though the first-move sign carries no planted drift")
        pw = json.loads((base / name / "power.json").read_text())
        for h in ("h1", "h2"):
            c = pw["cells"][f"{IDS[0]}|{h}"]
            if not c["checks"]["recovery_within_0.25bar"] or not c["checks"]["null_rejection_le_8pct"]:
                failures.append(f"{name}: positive control on placebo failed for {h}: {c['checks']}")
    print("\n[selftest] " + ("PASS" if not failures else "FAIL:\n  - " + "\n  - ".join(failures)))
    sys.exit(0 if not failures else 1)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stage", choices=("all", "events", "power", "score"), default="all")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--out", default=None, help="selftest output dir (default: a new temp dir)")
    ap.add_argument("--allow-r2-env", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return selftest(args)
    r2_guard(args.allow_r2_env)
    params = Params()
    t0 = time.time()
    ev, mirror, audit = EV.build(params, write=True)
    cov = EV.coverage_text(ev, mirror)
    print("\n".join(cov))
    print(f"[events] wrote {OUT / 'events.parquet'} and DATA_AUDIT.md ({time.time() - t0:.0f}s)")
    if args.stage == "events":
        return
    print("[load] reading M1 / bid-ask parquet (lockbox-truncated) and building HAR sigma via node ...", flush=True)
    world = PL.load_real_world(params, ev, mirror)
    for n in world.notes:
        print("  " + n)
    run_pipeline(world, OUT, args.stage, cov)


if __name__ == "__main__":
    main()
