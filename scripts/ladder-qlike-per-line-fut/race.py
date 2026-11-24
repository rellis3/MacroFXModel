"""ladder-qlike-per-line-fut (forge/LADDER_QLIKE_PER_LINE_FUT_PREREG.md, pushed a232d8b0): per-line QLIKE race on the
NT8 futures, each contract x line its own calc.

    python scripts/ladder-qlike-per-line-fut/race.py  -> analysis/output/ladder-qlike-per-line-fut/

Same scoring as scripts/ladder-qlike-per-line-cfd/race.py (imported), track "F", realised from the futures' own M1.
"""
from __future__ import annotations

import glob
import importlib.util
import json
import os
import sys
import warnings
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts/ladder-v2"))
import ladder as L  # noqa: E402

_spec = importlib.util.spec_from_file_location("cfd_race", ROOT / "scripts/ladder-qlike-per-line-cfd/race.py")
RC = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(RC)

OUT = ROOT / "analysis/output/ladder-qlike-per-line-fut"
RC.OUT = OUT                                    # RC.bootstrap reads loss files from here
LINES, CORE = RC.LINES, RC.CORE
BUILD_DIR = {"NQ": "analysis/output/ladder-per-line/build/nq", "GOLD": "analysis/output/ladder-per-line/build/gold",
             "EURUSD": "analysis/output/ladder-per-line/build/eurusd"}
ON_SITE = {"NQ", "GOLD", "EURUSD", "USDJPY"}


def wf_pick(T, Q, pool, mask, q):
    """RC.wf_pick, but training sessions where NO arm has a QLIKE yet (short histories: RTY starts 2017-07, so 2019 has
    no fitted scale) are left out of the 2%-missing check. Prereg A1 (implementation fault: as run first, every arm was
    rejected every year on US2000 and the contract was never scored)."""
    have = np.zeros(len(T), bool)
    for a in pool:
        have |= np.isfinite(Q[(a, q)])
    return RC.wf_pick(T, Q, pool, mask & have, q)


def bdir(sym):
    return BUILD_DIR.get(sym, f"analysis/output/ladder-v2-{sym.lower()}")


def syms():
    out = []
    for p in sorted(glob.glob(str(ROOT / "analysis/output/ladder-v2-*/rows_F.parquet"))):
        s = Path(p).parent.name[len("ladder-v2-"):].upper()
        if s in L.SYMS:
            out.append(s)
    return out


def realised_f(sym):
    m = L.load_m1(sym, "F", "unadj")                  # inverted contracts already flipped to the CFD orientation
    lt = m.index.tz_convert("Europe/London")
    x = m[(lt.hour < 22) & (lt.dayofweek < 5)].copy()
    x["date"] = x.index.tz_convert("Europe/London").tz_localize(None).normalize()
    g = x.groupby("date")
    s = pd.DataFrame({"o": g["open"].first(), "h": g["high"].max(), "l": g["low"].min(), "c": g["close"].last(), "n": g.size()})
    s = s[(s["n"] >= 600) & (s.index <= L.LOCK)]
    o = s["o"]
    return pd.DataFrame({"hl": (s["h"] - s["l"]) / o * 100, "oh": (s["h"] - o) / o * 100, "ol": (o - s["l"]) / o * 100,
                         "soc": (s["c"] - o) / o * 100})


def run(sym):
    os.environ["LADDER_OUT"] = bdir(sym)
    L.TAUS = (50, 75, 90)
    S = pd.read_parquet(ROOT / os.environ["LADDER_OUT"] / "rows_F.parquet")
    S["rel"] = S["A0"] / S["A0"].rolling(250, min_periods=60).median().shift(1)
    arms = list(L.arms_for(sym))
    T = L.walk_forward(S, sym, "F", arms, quiet=True).sort_values("date").reset_index(drop=True)
    T = T[T["date"] <= L.LOCK].reset_index(drop=True)
    R = realised_f(sym).reindex(pd.to_datetime(T["date"]))
    c1 = float(np.mean([np.mean(np.abs(R[q].to_numpy() - T[q].to_numpy()) < 1e-6) for q in CORE]
                       + [np.mean(np.abs(np.abs(R["soc"].to_numpy()) - T["oc"].to_numpy()) < 1e-6)]) * 100)
    A0b = S.set_index("date")["A0"].reindex(pd.to_datetime(T["date"])).to_numpy()
    c2 = float(np.nanmax(np.abs(A0b - T["A0"].to_numpy())))
    so = R["soc"].to_numpy()
    T["cup"] = np.where(so > 0, so, np.nan)
    T["cdn"] = np.where(so < 0, -so, np.nan)
    ok = np.ones(len(T), bool)
    for q in CORE:
        ok &= T[q].to_numpy() > 0
    masks = {"hl": ok, "oh": ok, "ol": ok, "oc": ok & (T["oc"].to_numpy() > 0), "cup": ok & (so > 0), "cdn": ok & (so < 0)}
    yrs = T["year"].to_numpy()
    Q = {}
    for a in arms:
        s = T[a].to_numpy(float)
        for q in LINES:
            Q[(a, q)] = RC.qlike(T, RC.h_series(T, s, q, masks[q]), q, masks[q])
    site = [a for a in arms if a not in RC.NO_SITE]
    board, picks, sel_site = [], {}, {}
    for q in LINES:
        test = masks[q] & (yrs >= 2020)
        sc = {a: float(np.nanmean(Q[(a, q)][test])) for a in arms if np.isnan(Q[(a, q)][test]).mean() < 0.02}
        rk = sorted(sc, key=sc.get)
        for i, a in enumerate(rk, 1):
            board.append(dict(sym=sym, line=q, arm=a, qlike=sc[a], rank=i, n=len(rk), site=a not in RC.NO_SITE,
                              days=int(test.sum())))
        sel_site[q], pk_s = wf_pick(T, Q, site, masks[q], q)
        _, pk_a = wf_pick(T, Q, arms, masks[q], q)
        final = next(a for a in rk if a not in RC.NO_SITE)
        picks[q] = {"wf_site": pk_s, "wf_all": pk_a, "final_site": final, "best": rk[0],
                    "final_qlike": sc[final], "a0_qlike": sc.get("A0")}
    test = ok & (yrs >= 2020)
    loss = {"date": T["date"].dt.strftime("%Y-%m-%d").to_numpy()[test]}
    for q in CORE:
        loss[f"site_{q}"] = RC.pv(Q, sel_site[q], q, len(T))[test]
        loss[f"a0_{q}"] = Q[("A0", q)][test]
    pd.DataFrame(loss).to_parquet(OUT / f"loss_{sym}.parquet")
    msg = (f"{sym} ({L.SYMS[sym]['f']}): {len(T)} sessions, control 1 {c1:.2f}%, control 2 A0 max diff {c2:.2e}; "
           + ", ".join(f"{q} {picks[q]['final_site']}" for q in LINES))
    return dict(sym=sym, c1=c1, c2=c2, board=board, picks=picks, msg=msg)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    S = syms()
    print(f"{len(S)} futures: {' '.join(S)}", flush=True)
    res = []
    with ProcessPoolExecutor(max_workers=4) as ex:
        for r in ex.map(run, S):
            print(r["msg"], flush=True)
            res.append(r)
    bad = [r["sym"] for r in res if r["c1"] < 99]
    ok = [r["sym"] for r in res if r["c1"] >= 99]
    pd.DataFrame([b for r in res for b in r["board"]]).to_csv(OUT / "leaderboard.csv", index=False)
    rng = np.random.default_rng(RC.SEED)
    h1, per_sym = RC.bootstrap(ok, rng)
    a = h1["all|all"]
    v = ("VALIDATED" if a[1][1] < 0 and all(h1[f"all|{h}"][1][1] < 0 for h in RC.HALVES)
         else "NULL" if a[1][0] > -0.5 else "UNDERPOWERED")
    old = json.loads((ROOT / "js/ladderV2QlikeParams.json").read_text())["instruments"]
    lines = [f"controls: {len(ok)} pass, dropped (control 1 < 99%): {bad}", "",
             "H1: SITE per-line picks vs live A0, summed QLIKE HL+OH+OL (% change, negative = per-line better), date-aligned bootstrap"]
    lines += [f"  {k:14s} {pt:+.2f}% [{ci[0]:+.2f}, {ci[1]:+.2f}]" for k, (pt, ci) in h1.items()]
    lines += [f"  VERDICT: {v}", "",
              "per contract (HL+OH+OL vs A0): " + "  ".join(f"{s} {d:+.1f}%" for s, d in sorted(per_sym.items(), key=lambda x: x[1])),
              "", "site picks per line (final, best site-computable 2020-2026.08):"]
    for r in sorted(res, key=lambda r: r["sym"]):
        lines.append(f"  {r['sym']:9s} {L.SYMS[r['sym']]['f']:5s} " + "  ".join(f"{q}:{r['picks'][q]['final_site']}" for q in LINES))
    lines += ["", "already on the site (kept untouched) - existing pick vs this run:"]
    for s in sorted(ON_SITE & {r['sym'] for r in res}):
        r = next(x for x in res if x["sym"] == s)
        lines.append(f"  {s:9s} " + "  ".join(f"{q}:{old[s]['lines'].get(q, {}).get('arm')}/{r['picks'][q]['final_site']}" for q in LINES))
    txt = "\n".join(lines)
    print(txt, flush=True)
    (OUT / "report.txt").write_text("\n".join(r["msg"] for r in res) + "\n\n" + txt, encoding="utf-8")
    (OUT / "results.json").write_text(json.dumps(dict(seed=RC.SEED, verdict=v, h1=h1, per_sym=per_sym, dropped=bad,
                                                      controls={r["sym"]: [r["c1"], r["c2"]] for r in res},
                                                      picks={r["sym"]: r["picks"] for r in res}), indent=1, default=str))


if __name__ == "__main__":
    if len(sys.argv) > 1:
        OUT.mkdir(parents=True, exist_ok=True)
        for s in sys.argv[1:]:
            print(run(s)["msg"], flush=True)
    else:
        main()
