"""
gex-split-book: on the days NQ's and ES's dealer books disagree, does the NQ-ES range spread lean toward the
short book, beyond relative falls?

Pre-registration: oi_research_book/GEX_SPLIT_BOOK_PREREG.md (commit 264d7df5, pushed BEFORE this script read any
disagreement-day outcome). Agenda Q1 in .claude/skills/research-director/agendas/gex-range.md.

  frames     script 27's frame(name, "near", "c", first_date): NY-close sessions, OI(D) -> S(D+2), lockbox cut
  join       NQ and ES by (date, tgt), never by row
  S          DR_NQ - DR_ES (each on its own sigma)
  g          short_NQ - short_ES in {-1, 0, +1}
  controls   NQ minus ES: r5, r20, dd60 at S(D+1) (as 27b), and ln(sigma_NQ / sigma_ES)
  beta       OLS of S on [1, 1{g=+1}, 1{g=-1}, controls]; beta = (b_plus - b_minus) / 2
  gate       beta >= 0.05, bootstrap CI95 lower > 0, real beta above 95% of all-shift placebos,
             b_plus > 0 and b_minus < 0, >= 40 days in each disagreement state
Descriptive: raw dS, halves, agreement split, horizon family h = 0, 2, 4, planted-signal check (amendment A1).

Usage: python oi_research_book/scripts/31_gex_split_book.py
"""
import json
import importlib.util
import numpy as np
import pandas as pd
from pathlib import Path

_s = importlib.util.spec_from_file_location("m27", Path(__file__).with_name("27_gex_range_es.py"))
m = importlib.util.module_from_spec(_s)
_s.loader.exec_module(m)

SEED = 20261103
N_BOOT = 10_000
GATE, OPERATIONAL, MIN_STATE = 0.05, 0.10, 40
PLANT = 0.15
OUT = Path(__file__).resolve().parents[1] / "data" / "results" / "gex_split_book.json"


def instrument(name, start):
    """Script 27's scored frame plus 27b's controls and the horizon-family windows."""
    d, counts = m.frame(name, "near", "c", start)
    S = m.sessions(m.INSTR[name]["px"])
    tpos = S.index.get_indexer(d["tgt"])
    assert (tpos >= 0).all(), "target session missing from the session file"
    pos = tpos - 1                                               # S(D+1): last session known before the target
    c, hi, lo = S["close"].to_numpy(), S["high"].to_numpy(), S["low"].to_numpy()
    d["r5"] = np.log(c[pos] / c[pos - 5])
    d["r20"] = np.log(c[pos] / c[pos - 20])
    d["dd60"] = np.log(c[pos] / pd.Series(c).rolling(60).max().to_numpy()[pos])
    for h in (2, 4):                                             # range over S(D+2) .. S(D+2+h) vs Brownian for h+1 sessions
        ok = tpos + h < len(S)
        w = np.full(len(d), np.nan)
        for i in np.where(ok)[0]:
            a, b = tpos[i], tpos[i] + h + 1
            w[i] = np.log(hi[a:b].max() / lo[a:b].min())
        d[f"dr_h{h}"] = w / (d["sig"].to_numpy() * np.sqrt(h + 1) * m.BM)
    return d, counts


def design(j, g):
    X = np.column_stack([np.ones(len(j)), (g == 1).astype(float), (g == -1).astype(float),
                         j["dr5"], j["dr20"], j["ddd60"], j["lsig"]])
    return X


def fit(X, y):
    b = np.linalg.lstsq(X, y, rcond=None)[0]
    return (b[1] - b[2]) / 2, b[1], b[2]


def run(j, y, g, rng, boot=True):
    X = design(j, g)
    beta, bp, bm = fit(X, y)
    out = {"beta": float(beta), "b_plus": float(bp), "b_minus": float(bm)}
    if boot:
        bs = []
        for ch in m.s18._boot_stats(len(y), N_BOOT, rng, chunk=500):
            for ix in ch:
                bs.append(fit(X[ix], y[ix])[0])
        bs = np.array(bs); bs = bs[np.isfinite(bs)]
        se = float(bs.std())
        out.update({"se": se, "ci95": [beta - 1.96 * se, beta + 1.96 * se], "t": beta / se})
    return out


def placebo(j, y, g):
    shifts = range(60, len(y) - 60, 5)
    pl = np.array([fit(design(j, np.roll(g, k)), y)[0] for k in shifts])
    return pl


def main():
    rng = np.random.default_rng(SEED)
    start = m.first_date(None)
    nq, cnq = instrument("NQ", start)
    es, ces = instrument("ES", start)
    j = nq.merge(es, on=["date", "tgt"], suffixes=("_nq", "_es")).sort_values("date").reset_index(drop=True)
    join = {"nq_rows": len(nq), "es_rows": len(es), "joined": len(j)}
    j["S"] = j["dr_nq"] - j["dr_es"]
    for k in ("r5", "r20", "dd60"):
        j["d" + k] = j[f"{k}_nq"] - j[f"{k}_es"]
    j["lsig"] = np.log(j["sig_nq"] / j["sig_es"])
    g = j["is_short_nq"].astype(int).to_numpy() - j["is_short_es"].astype(int).to_numpy()
    keep = np.isfinite(j[["S", "dr5", "dr20", "ddd60", "lsig"]]).all(1).to_numpy()
    join["dropped_nonfinite"] = int((~keep).sum())
    j, g = j[keep].reset_index(drop=True), g[keep]
    y = j["S"].to_numpy()
    n_plus, n_minus, n_agree = int((g == 1).sum()), int((g == -1).sum()), int((g == 0).sum())

    primary = run(j, y, g, rng)
    pl = placebo(j, y, g)
    primary["placebo"] = {"n_shifts": len(pl), "mean": float(pl.mean()), "sd": float(pl.std()),
                          "real_above_share": float((pl < primary["beta"]).mean())}

    # ---- verdict (registered rules)
    gate = {
        "beta_ge_0.05": primary["beta"] >= GATE,
        "ci_lower_gt_0": primary["ci95"][0] > 0,
        "placebo_above_95pct": primary["placebo"]["real_above_share"] >= 0.95,
        "mirror_b_plus_gt_0": primary["b_plus"] > 0,
        "mirror_b_minus_lt_0": primary["b_minus"] < 0,
        "min_state_n": min(n_plus, n_minus) >= MIN_STATE,
    }
    placebo_too_noisy = primary["placebo"]["sd"] > GATE
    if all(gate.values()) and not placebo_too_noisy:
        verdict = "VALIDATED"
    elif (not all(gate.values())) and primary["ci95"][1] < OPERATIONAL and gate["min_state_n"]:
        verdict = "NULL"
    else:
        verdict = "UNDERPOWERED"

    # ---- descriptive
    desc = {
        "raw_dS": float(y[g == 1].mean() - y[g == -1].mean()),
        "mean_S": {"nq_only_short": float(y[g == 1].mean()), "es_only_short": float(y[g == -1].mean()),
                   "both_short": float(y[(g == 0) & j["is_short_nq"].to_numpy()].mean()),
                   "both_long": float(y[(g == 0) & ~j["is_short_nq"].to_numpy()].mean())},
        "uncontrolled_beta": None,
    }
    Xu = np.column_stack([np.ones(len(y)), (g == 1), (g == -1)]).astype(float)
    desc["uncontrolled_beta"] = float(fit(Xu, y)[0])
    half = len(y) // 2
    desc["halves"] = {k: run(j.iloc[sl].reset_index(drop=True), y[sl], g[sl], rng, boot=False)["beta"]
                      for k, sl in (("first", slice(0, half)), ("second", slice(half, None)))}
    hz = {}
    for h in (2, 4):
        yh = (j[f"dr_h{h}_nq"] - j[f"dr_h{h}_es"]).to_numpy()
        ok = np.isfinite(yh)
        hz[f"h{h}"] = run(j[ok].reset_index(drop=True), yh[ok], g[ok], rng, boot=False)["beta"]
    desc["horizon_family"] = {"h0": primary["beta"], **hz}

    # ---- amendment A1: planted-signal check (pipeline must recover a known book effect)
    yp = y + PLANT * (g == 1) - PLANT * (g == -1)       # each short book +0.15 on its own DR
    planted = run(j, yp, g, np.random.default_rng(SEED), boot=False)["beta"]
    desc["planted_check"] = {"planted_beta": PLANT, "recovered_beta_minus_real": float(planted - primary["beta"])}

    res = {"seed": SEED, "prereg": "oi_research_book/GEX_SPLIT_BOOK_PREREG.md", "prereg_commit": "264d7df5",
           "ranAt": pd.Timestamp.now("UTC").isoformat(), "window": [str(j["date"].min().date()), str(j["tgt"].max().date())],
           "counts": {"NQ": cnq, "ES": ces, "join": join, "nq_only_short": n_plus, "es_only_short": n_minus,
                      "agree": n_agree},
           "primary": primary, "gate": gate, "placebo_too_noisy": placebo_too_noisy, "verdict": verdict,
           "descriptive": desc}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(res, indent=2, default=str))
    print(json.dumps(res, indent=2, default=str))


if __name__ == "__main__":
    main()
