"""STEP A — head-to-head of every daily forecast candidate on one yardstick (forge/FORECAST_PICK_PREREG.md).

Candidates P (plain), I (IV-adjusted form), H (HAR-800), S (persistence, live inputs), SI (persistence + IV). Same rows,
same walk-forward folds, widths refit per fold for every candidate, pinball / plain sigma, date-block intervals.

    PYTHONPATH=. python scripts/forecast_history/forecast_pick.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.argv.append("--live")                       # forecast_fix's live-computable inputs (the shipped definitions)
sys.path.insert(0, str(Path(__file__).parent))
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

import forecast_fix as F  # noqa: E402
from forecast_record import boot_weights, pinball  # noqa: E402

OUT = Path("analysis/output/forecast_pick")
HAR = Path("analysis/output/ladder_candidates/d1")
HAR_NAME = {"DOW": "US30"}
ARMS = ["P", "I", "H", "S", "SI"]
SIMPLE_ORDER = ["P", "S", "I", "SI", "H"]
LIVETYPE = "--livetype" in sys.argv     # variant 1: implied vol from the sources the live server reads
if LIVETYPE:
    OUT = OUT / "live_type"
FEATS = {"S": F.FB, "SI": F.FC, "I": ["iv_sig"]}


def load():
    X = F.load()
    parts = []
    for inst, g in X.groupby("inst"):
        h = pd.read_csv(HAR / f"{HAR_NAME.get(inst, inst)}_har800.csv")
        h["d"] = pd.to_datetime(h.date)
        g = g.copy()
        g["d"] = pd.to_datetime(g.date)
        m = pd.merge_asof(g.sort_values("d"), h[["d", "sig"]].sort_values("d"), on="d",
                          allow_exact_matches=False, direction="backward")            # last NY bar strictly before
        m["sig_H"] = m.sig / np.sqrt(252)
        parts.append(m.drop(columns=["sig", "d"]))
    X = pd.concat(parts, ignore_index=True)
    if LIVETYPE:
        from forge.export_iv_adjusted_params import IVFILE, ivd
        from forge.run_combined_range import asof_before, cboe
        src = {**{k: ivd(k) for k in IVFILE}, "GOLD": cboe("GVZ"), "NQ": cboe("VXN")}
        for k in ("SPX500", "DOW", "US2000", "DE30", "UK100"):
            src[k] = cboe("VIX")
        X["iv_sig"] = np.nan
        for inst, g in X.groupby("inst"):
            if inst in src:
                iv = asof_before(pd.to_datetime(g.date), src[inst])
                X.loc[g.index, "iv_sig"] = np.log(iv / (g.live_sig_daily.to_numpy() * np.sqrt(252)))
    return X.sort_values(["date", "inst"]).reset_index(drop=True)


def main():
    X = load()
    folds = sorted(X[X.oos == 1].fold.unique())
    rows = []
    for f in folds:
        te = X[(X.oos == 1) & (X.fold == f)].copy()
        prior = np.sort(X.loc[X.date < te.date.min(), "date"].unique())
        tr = X[X.date < prior[-F.EMBARGO]].copy()
        tr["sig_P"], te["sig_P"] = tr[F.BASE], te[F.BASE]
        tr["sig_Htr"] = tr.sig_H
        for arm, feats in FEATS.items():
            tr[f"sig_{arm}"] = np.nan
            te[f"sig_{arm}"] = np.nan
            for cls in sorted(X.klass.unique()):
                trc = tr[(tr.klass == cls) & tr[feats].notna().all(axis=1)]
                mk = (te.klass == cls) & te[feats].notna().all(axis=1)
                if len(trc) < 500 or not mk.any():
                    continue
                b, mu = F.fit_beta(trc, feats)
                tr.loc[trc.index, f"sig_{arm}"] = F.apply_beta(trc, feats, b, mu)
                te.loc[mk, f"sig_{arm}"] = F.apply_beta(te[mk], feats, b, mu)
        for arm in ARMS:
            col = f"sig_{arm}"
            ok = tr[col].notna() & (tr[col] > 0)
            w = F.widths(tr.loc[ok, col].to_numpy(), tr[ok])
            for q, r in F.CELLS:
                te[f"{arm}_{q}_{r}"] = te[col] * w[(q, r)].reindex(te.inst).to_numpy()
        print(f"fold {f}: train {len(tr):,}, test {len(te):,}", flush=True)
        rows.append(te)
    T = pd.concat(rows, ignore_index=True)
    T["regime_b"] = np.select([T.regime < np.log(0.85), T.regime > np.log(1.15)], ["quiet", "busy"], "normal")

    dates = np.sort(T.date.unique())
    di = pd.Series(np.arange(len(dates)), index=dates)[T.date].to_numpy()
    nd = len(dates)
    W = boot_weights(nd)
    sig = T[F.BASE].to_numpy()
    L = {}
    for arm in ARMS:
        tot = np.zeros(len(T))
        for q, r in F.CELLS:
            tot += pinball(T[F.Q[q]].to_numpy(), T[f"{arm}_{q}_{r}"].to_numpy(), F.R[r]) / sig
        L[arm] = tot

    def board(arms, mask):
        m = mask & np.all([np.isfinite(L[a]) for a in arms], axis=0)
        out = {"rows": int(m.sum()), "dates": int(len(set(di[m]))), "arms": {}}
        sP = np.bincount(di[m], weights=L["P"][m], minlength=nd)
        for a in arms:
            sa = np.bincount(di[m], weights=L[a][m], minlength=nd)
            reps = (W @ sa) / (W @ sP)
            ex = lambda g: float((T.r_hl[m & (T.regime_b == g).to_numpy()] > T[f"{a}_hl_p75"][m & (T.regime_b == g).to_numpy()]).mean())
            reg = {g: round(ex(g), 4) for g in ("quiet", "normal", "busy")}
            cls = {c: round(float(L[a][m & (T.klass == c).to_numpy()].sum() / L["P"][m & (T.klass == c).to_numpy()].sum()), 4)
                   for c in sorted(T.klass[m].unique())}
            out["arms"][a] = {"pinball_mean": round(float(L[a][m].mean()), 5),
                              "ratio_vs_P": [round(float(sa.sum() / sP.sum()), 4), *[round(float(x), 4) for x in np.percentile(reps, [2.5, 97.5])]],
                              "regime_hl_p75": reg, "regime_miss": round(max(abs(v - 0.25) for v in reg.values()), 4),
                              "by_class": cls,
                              "exceed_pooled": {f"{q}_{r}": round(float((T[F.Q[q]][m] > T[f"{a}_{q}_{r}"][m]).mean()), 4) for q, r in F.CELLS}}
        P = out["arms"]["P"]
        elig = []
        for a in arms:
            if a == "P":
                continue
            A = out["arms"][a]
            ok = A["ratio_vs_P"][2] < 1 and A["regime_miss"] <= P["regime_miss"] and all(v <= 1.005 for v in A["by_class"].values())
            A["eligible"] = ok
            if ok:
                elig.append(a)
        if not elig:
            out["pick"], out["pick_note"] = "P", "nothing eligible: plain stays"
            return out
        best = min(elig, key=lambda a: out["arms"][a]["pinball_mean"])
        pick = best
        for a in SIMPLE_ORDER:                                   # simplest eligible within 0.5% of the best wins
            if a in elig and out["arms"][a]["pinball_mean"] <= out["arms"][best]["pinball_mean"] * 1.005:
                pick = a
                break
        out["best"], out["pick"] = best, pick
        return out

    allm = np.ones(len(T), bool)
    iv13 = T.iv_sig.notna().to_numpy()
    if LIVETYPE:
        si = T.sig_SI.notna().to_numpy()
        res = {"iv13": board(["P", "S", "SI"], si)}
        A = res["iv13"]["arms"]
        gain = 1 - A["SI"]["pinball_mean"] / A["S"]["pinball_mean"]
        res["decision"] = {"SI_eligible": A["SI"].get("eligible"), "SI_vs_S_gain": round(gain, 4),
                           "ship": "SI for the IV instruments, S elsewhere" if (A["SI"].get("eligible") and gain > 0.005) else "S (persistence) for all 34"}
        res["by_inst_SI_vs_S"] = {i: round(float(L["SI"][si & (T.inst == i).to_numpy()].sum() / L["S"][si & (T.inst == i).to_numpy()].sum()), 4)
                                  for i in sorted(T.inst[si].unique())}
    else:
        res = {"all34": board(["P", "H", "S"], allm), "iv13": board(ARMS, iv13)}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(res, indent=1))
    write_md(res)


NAMES = {"P": "plain export", "I": "IV-adjusted", "H": "HAR-800", "S": "persistence", "SI": "persistence + IV"}


def write_md(res):
    md = ["# STEP A — pick ONE forecast (results)", "", "Pre-registration: `forge/FORECAST_PICK_PREREG.md`. Walk-forward folds "
          "0–5, out-of-sample 2020-08 → 2026-08; widths refit per fold for every candidate; pinball over 12 rungs ÷ plain σ; "
          "95% date-block intervals. Eligible = beats plain (interval below 1), regime miss no worse, no class worse by > 0.5%.", ""]
    if "decision" in res:
        md[0] += " — VARIANT 1, live-type implied vol"
        md += [f"**Decision (fixed in advance): {res['decision']['ship']}.** SI eligible: {res['decision']['SI_eligible']}; "
               f"SI better than S by {res['decision']['SI_vs_S_gain'] * 100:.2f}% (needs > 0.5%).", "",
               "SI ÷ S by instrument: " + ", ".join(f"{k} {v:.3f}" for k, v in res["by_inst_SI_vs_S"].items()), ""]
    for key, title in (("all34", "All 34 instruments"), ("iv13", "The 13 instruments with implied vol")):
        if key not in res:
            continue
        b = res[key]
        md += [f"## {title} ({b['rows']:,} instrument-sessions, {b['dates']:,} dates)", "",
               "| candidate | pinball ÷ plain [95%] | HL p75 quiet / normal / busy % | regime miss pp | worst class | eligible |",
               "|---|---|---|---|---|---|"]
        for a, A in b["arms"].items():
            r = A["ratio_vs_P"]
            reg = " / ".join(f"{v * 100:.1f}" for v in A["regime_hl_p75"].values())
            md.append(f"| {NAMES[a]} | {r[0]:.4f} [{r[1]:.4f}, {r[2]:.4f}] | {reg} | {A['regime_miss'] * 100:.1f} | "
                      f"{max(A['by_class'].values()):.4f} | {'—' if a == 'P' else ('yes' if A.get('eligible') else 'no')} |")
        md += ["", f"**Pick: {NAMES[b['pick']]}**" + (f" (lowest pinball: {NAMES[b['best']]})" if b.get("best") and b["best"] != b["pick"] else "")
               + (f" — {b['pick_note']}" if b.get("pick_note") else ""), ""]
    (OUT / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md))




def export_params():
    """The chosen forecast's shipped params (FORECAST_PICK variant 1): persistence (all) + persistence-with-IV (the IV
    instruments, live-type IV), fit on ALL sessions (ladder convention). Writes js/forecastLadderPersistParams.js."""
    from datetime import date
    assert LIVETYPE, "pass --livetype --export"
    X = load()
    from forecast_record import klass
    LIVE_NAME = {"DOW": "US30"}
    IV_SRC = {"EURUSD": "CME_ATM30", "GBPUSD": "CME_ATM30", "AUDUSD": "CME_ATM30", "USDJPY": "CME_ATM30",
              "USDCAD": "CME_ATM30", "USDCHF": "CME_ATM30", "GOLD": "GVZ", "NQ": "VXN", "SPX500": "VIX", "DOW": "VIX",
              "US2000": "VIX", "DE30": "VIX", "UK100": "VIX"}
    out = {"generated": str(date.today()), "prereg": "forge/FORECAST_FIX_PREREG.md v1 + forge/FORECAST_PICK_PREREG.md v1 (the pick)",
           "evidence": "analysis/output/forecast_pick/live_type/RESULTS.md", "fit": "all sessions 2016-2026 (in-sample, ladder convention)",
           "features": F.FB, "features_iv": F.FC, "regime_window": 250, "res_window": 5, "sigma_round_dp": 2,
           "classes": {}, "classes_iv": {}, "pairs": {}}
    for tag, feats, cls_key in (("S", F.FB, "classes"), ("SI", F.FC, "classes_iv")):
        D = X[X[feats].notna().all(axis=1)].copy()
        D["sig_new"] = np.nan
        for cls in sorted(D.klass.unique()):
            trc = D[D.klass == cls]
            if len(trc) < 500:
                continue
            b, means = F.fit_beta(trc, feats)
            out[cls_key][cls] = {"beta": dict(zip(feats, [round(float(v), 6) for v in b]))}
            D.loc[trc.index, "sig_new"] = F.apply_beta(trc, feats, b, means)
            for inst, m in means.iterrows():
                P = out["pairs"].setdefault(LIVE_NAME.get(inst, inst), {})
                tgt = P if tag == "S" else P.setdefault("iv", {"source": IV_SRC.get(inst)})
                tgt["mean"] = {k: round(float(v), 6) for k, v in m.items()}
        for inst, g in D[D.sig_new.notna()].groupby("inst"):
            P = out["pairs"][LIVE_NAME.get(inst, inst)]
            tgt = P if tag == "S" else P["iv"]
            tgt["width"] = {q: [round(float((g[col] / g.sig_new).quantile(t)), 4) for t in F.R.values()] for q, col in F.Q.items()}
            tgt["n"] = int(len(g))
            if tag == "S":
                P["class"] = klass(inst)
    js = ("/**\n * The chosen daily forecast's params: persistence-adjusted (all instruments) and persistence + implied vol\n"
          " * (`iv` block, the 13 instruments with implied vol). GENERATED — do not hand-edit.\n"
          " * Regenerate: PYTHONPATH=. python scripts/forecast_history/forecast_pick.py --livetype --export\n"
          " * Evidence: forge/FORECAST_FIX_PREREG.md variant 1, forge/FORECAST_PICK_PREREG.md variant 1 (the pick). Fit on all sessions.\n"
          " * sigma_new = sigma_used x exp(beta . (x - mean_instrument)); rung % = width x sigma_new %.\n */\n"
          "export const PERSIST_PARAMS = " + json.dumps(out) + ";\n")
    Path("js/forecastLadderPersistParams.js").write_text(js, encoding="utf-8")
    print("wrote js/forecastLadderPersistParams.js; iv instruments:", [k for k, v in out["pairs"].items() if "iv" in v])


if __name__ == "__main__":
    export_params() if "--export" in sys.argv else main()
