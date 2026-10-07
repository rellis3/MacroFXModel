"""S4 (post-FOMC dollar drift at C.OG's lines) and S5 (US-DE 2y momentum: at the lines + multi-day hold).
forge/POLICY_DIRECTION_PREREG.md

    python scripts/policy_direction/score.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

D = Path("analysis/output/policy_direction")
B, SEED = 2000, 20261008
rng = np.random.default_rng(SEED)
T = pd.read_csv("analysis/output/cog_yield_dir/trades.csv")
f = lambda c: f"{c[0]:+.3f} [{c[1]:+.3f}, {c[2]:+.3f}]"


def ci(reps, pt):
    lo, hi = np.nanpercentile(reps, [2.5, 97.5])
    return [round(float(pt), 4), round(float(lo), 4), round(float(hi), 4)]


def boot_groups(df, key, other=None):
    """Mean R (minus other's mean R) resampling whole groups (events or months)."""
    keys = sorted(set(df[key]) | (set(other[key]) if other is not None else set()))
    ga = {k: g.R.to_numpy() for k, g in df.groupby(key)}
    gb = {k: g.R.to_numpy() for k, g in other.groupby(key)} if other is not None else None
    reps = []
    for _ in range(B):
        pick = rng.choice(keys, len(keys))
        a = np.concatenate([ga.get(k, np.empty(0)) for k in pick]); v = a.mean() if len(a) else np.nan
        if gb is not None:
            b = np.concatenate([gb.get(k, np.empty(0)) for k in pick]); v -= b.mean() if len(b) else np.nan
        reps.append(v)
    return ci(reps, df.R.mean() - (other.R.mean() if other is not None else 0))


md = ["# Slow policy direction at C.OG's lines (results)", "", "Pre-registration: `forge/POLICY_DIRECTION_PREREG.md`. R = net result ÷ stop, after costs.", ""]
res = {}

# ---------------- S4 ----------------
ev = sorted(pd.read_csv("analysis/fomc_event_study/stage1_events.csv").date.tolist() + ["2026-06-17", "2026-07-29"])
bd = pd.bdate_range("2015-12-01", "2026-12-31").strftime("%Y-%m-%d").tolist()
win = {}
for e in ev:
    i = bd.index(e) if e in bd else None
    if i is None: continue
    for d in bd[i + 1:i + 6]: win[d] = e
X = T[T.ins.isin(["EURUSD", "GOLD"])].copy()
X["event"] = X.date.map(win)
X = X[X.event.notna()]
W, A_ = X[X.side == -1], X[X.side == 1]
s4 = {"n_events": int(X.event.nunique()), "with": dict(n=int(len(W)), meanR=boot_groups(W, "event")),
      "against": dict(n=int(len(A_)), meanR=round(float(A_.R.mean()), 4)),
      "with_minus_against": boot_groups(W, "event", A_),
      "halves_with": [round(float(W[W.date < "2021"].R.mean()), 4), round(float(W[W.date >= "2021"].R.mean()), 4)],
      "by_setup_ins": {f"{s}|{i}": [round(float(g[g.side == -1].R.mean()), 4), round(float(g[g.side == 1].R.mean()), 4)]
                       for (s, i), g in X.groupby(["setup", "ins"])}}
s4["pass"] = bool(s4["with"]["meanR"][1] > 0 and s4["with_minus_against"][1] > 0 and min(s4["halves_with"]) > 0)
res["S4"] = s4
md += ["## S4 — post-FOMC dollar drift (sessions D+1…D+5), dollar-up side at his lines", "",
       f"**{'PASS' if s4['pass'] else 'FAIL'}** · {s4['n_events']} FOMC events",
       f"- With the drift (short EURUSD / short gold): {f(s4['with']['meanR'])} (n {s4['with']['n']})",
       f"- Against (long): {s4['against']['meanR']:+.3f} (n {s4['against']['n']})",
       f"- With minus against: {f(s4['with_minus_against'])}",
       f"- With, halves 2016–20 / 2021–26: {s4['halves_with'][0]:+.3f} / {s4['halves_with'][1]:+.3f}",
       "- By setup|instrument [with, against]: " + "; ".join(f"{k} {v[0]:+.3f}/{v[1]:+.3f}" for k, v in s4["by_setup_ins"].items()), ""]

# ---------------- S5 ----------------
us = pd.read_csv("analysis/output/cog_yield_dir/fred/DGS2.csv"); us.columns = ["date", "v"]; us["v"] = pd.to_numeric(us.v, errors="coerce")
de = pd.read_csv(D / "DE2Y.csv")
d = us.dropna().merge(de.dropna(), on="date").assign(spread=lambda x: x.v - x.value).set_index("date").spread.sort_index()
chg = d.diff(63)
idx = d.index.to_numpy()


def sig_at(day):
    """Sign of the 63-obs change, using observations dated on or before 2 business days before `day`."""
    cut = (pd.Timestamp(day) - pd.offsets.BDay(2)).strftime("%Y-%m-%d")
    j = np.searchsorted(idx, cut, side="right") - 1
    v = chg.iloc[j] if j >= 0 else np.nan
    return 0 if not np.isfinite(v) or v == 0 else int(np.sign(v))


E = T[T.ins == "EURUSD"].copy()
E["sig"] = [sig_at(x) for x in E.date]
E["month"] = E.date.str[:7]
K = E[(E.sig != 0) & (E.side == -E.sig)]          # widening -> USD up -> short EURUSD
s5a = {"with": dict(n=int(len(K)), meanR=boot_groups(K, "month")), "minus_all": boot_groups(K, "month", E),
       "against": round(float(E[(E.sig != 0) & (E.side == E.sig)].R.mean()), 4),
       "halves": [round(float(K[K.date < "2021-09"].R.mean()), 4), round(float(K[K.date >= "2021-09"].R.mean()), 4)],
       "by_setup": {s: [round(float(K[K.setup == s].R.mean()), 4), round(float(E[E.setup == s].R.mean()), 4)] for s in ("A", "C")}}
s5a["pass"] = bool(s5a["with"]["meanR"][1] > 0 and s5a["minus_all"][1] > 0 and min(s5a["halves"]) > 0)

fx = pd.read_csv(D / "DEXUSEU.csv"); fx.columns = ["date", "p"]; fx["p"] = pd.to_numeric(fx.p, errors="coerce")
fx = fx.dropna().reset_index(drop=True)
fx = fx[fx.date >= "2000-01-01"].reset_index(drop=True)
hold = {}
for H in (5, 20):
    rows = []
    for i in range(0, len(fx) - H, H):
        s = sig_at(fx.date[i])
        if s == 0: continue
        rows.append((fx.date[i], -s * np.log(fx.p[i + H] / fx.p[i]) - 0.00008))
    h = pd.DataFrame(rows, columns=["date", "R"])
    h["blk"] = np.arange(len(h)) // 20
    hold[H] = dict(n=int(len(h)), mean_bp=[round(x * 1e4, 2) for x in boot_groups(h, "blk")], hit=round(float((h.R > 0).mean()), 4),
                   halves_bp=[round(float(h[h.date < "2013"].R.mean() * 1e4), 2), round(float(h[h.date >= "2013"].R.mean() * 1e4), 2)],
                   ann_sharpe=round(float(h.R.mean() / h.R.std() * np.sqrt(252 / H)), 3))
s5b = hold[5]
s5b_pass = bool(s5b["mean_bp"][1] > 0 and min(s5b["halves_bp"]) > 0)
res["S5"] = {"at_lines": s5a, "hold": hold, "hold_pass": s5b_pass}
md += ["## S5 — US-minus-German 2y, 63-day change (widening → dollar up)", "",
       f"### (a) At his lines (EURUSD): **{'PASS' if s5a['pass'] else 'FAIL'}**",
       f"- With the signal: {f(s5a['with']['meanR'])} (n {s5a['with']['n']}); against {s5a['against']:+.3f}",
       f"- With minus all EURUSD line trades: {f(s5a['minus_all'])}",
       f"- Halves: {s5a['halves'][0]:+.3f} / {s5a['halves'][1]:+.3f}; by setup [with, all]: " +
       "; ".join(f"{k} {v[0]:+.3f}/{v[1]:+.3f}" for k, v in s5a["by_setup"].items()), "",
       f"### (b) Multi-day hold, EURUSD 2000–2026: **{'PASS' if s5b_pass else 'FAIL'}** (5-day primary)"]
for H, h in hold.items():
    md.append(f"- {H}-day: mean {h['mean_bp'][0]:+.1f} bp [{h['mean_bp'][1]:+.1f}, {h['mean_bp'][2]:+.1f}] per trade (n {h['n']}), hit {h['hit'] * 100:.1f}%, "
              f"halves {h['halves_bp'][0]:+.1f} / {h['halves_bp'][1]:+.1f} bp, annualised Sharpe {h['ann_sharpe']:+.2f}")
(D / "results.json").write_text(json.dumps(res, indent=1))
(D / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print("\n".join(md).encode("ascii", "replace").decode())
