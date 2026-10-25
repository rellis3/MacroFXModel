"""
dax-ifo-lookahead: does the IFO month-on-month sign predict the DAX with honest timing?

Prereg: forge/DAX_IFO_LOOKAHEAD_PREREG.md. Three timings:
  (A) original: s(M) earns month M's return (IFO(M) is published ~25th of M -> lookahead)
  (B) next month: s(M) earns month M+1's return
  (C) at release: s(M) earns close(release day of M) -> close(release day of M+1),
      release day = first DAX trading day on/after the 25th (sensitivity: 22nd, 27th)

Usage: python scripts/dax-ifo-lookahead/check.py
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "Dax Base IFO System" / "System" / "data"
OUT = ROOT / "analysis" / "output" / "dax-ifo-lookahead"
OUT.mkdir(parents=True, exist_ok=True)
SEED, B, BLOCK = 20261025, 10_000, 6


def load():
    ifo = pd.read_csv(SRC / "RAWDATA.csv")
    ifo.columns = ifo.columns.str.strip()
    ifo["Date"] = pd.to_datetime(ifo["Date"], format="%d/%m/%Y")
    ifo = ifo.rename(columns={"ISO BE": "ifo"})[["Date", "ifo"]]
    ifo["ym"] = ifo["Date"].dt.to_period("M")
    dax = pd.read_csv(SRC / "dax_raw.csv", encoding="utf-8-sig")
    dax.columns = dax.columns.str.strip()
    dax["Price"] = dax["Price"].str.replace(",", "").astype(float)
    dax["Date"] = pd.to_datetime(dax["Date"], format="%d/%m/%Y")
    dax = dax.sort_values("Date")[["Date", "Price"]].reset_index(drop=True)
    return ifo, dax


def stats(r, rf=0.0):
    """r: monthly-or-period returns in %, assumed ~12 per year."""
    r = np.asarray(r, float)
    eq = np.cumprod(1 + r / 100)
    yrs = len(r) / 12
    cagr = (eq[-1] ** (1 / yrs) - 1) * 100
    dd = ((eq - np.maximum.accumulate(eq)) / np.maximum.accumulate(eq)).min() * 100
    vol = r.std(ddof=1) * np.sqrt(12)
    return {"n": len(r), "mean": float(r.mean()), "t": float(r.mean() / (r.std(ddof=1) / np.sqrt(len(r)))),
            "cagr": float(cagr), "max_dd": float(dd), "sharpe_rf0": float((cagr - 0) / vol),
            "sharpe_rf3.8": float((cagr - 3.8) / vol), "win": float((r > 0).mean() * 100)}


def boot_mean(r, rng):
    r = np.asarray(r, float); n = len(r); p = 1 / BLOCK
    out = np.empty(B)
    for b in range(B):
        idx = np.empty(n, int); i = rng.integers(n)
        for k in range(n):
            if k and rng.random() < p:
                i = rng.integers(n)
            idx[k] = i; i = (i + 1) % n
        out[b] = r[idx].mean()
    sd = out.std()
    p_two = float((np.abs(out - out.mean()) >= abs(r.mean())).mean())
    return {"se": float(sd), "ci95": [float(r.mean() - 1.96 * sd), float(r.mean() + 1.96 * sd)], "p": p_two}


def main():
    rng = np.random.default_rng(SEED)
    ifo, dax = load()
    dax["ym"] = dax["Date"].dt.to_period("M")
    mend = dax.groupby("ym")["Price"].last()
    mret = mend.pct_change() * 100                          # return of month M (end M-1 -> end M)

    ifo = ifo.set_index("ym")["ifo"]
    sig = np.where(ifo.diff() > 0, 1, -1)
    sig = pd.Series(sig, index=ifo.index)[ifo.diff().notna()]

    res = {"seed": SEED, "B": B, "block_months": BLOCK}
    # (A) original
    a = pd.concat([sig.rename("s"), mret.rename("r")], axis=1, join="inner").dropna()
    res["A_original_same_month"] = stats(a["s"] * a["r"], ) | {"window": [str(a.index[0]), str(a.index[-1])]}
    res["A_buy_hold"] = stats(a["r"])
    # (B) next month
    bdf = pd.concat([sig.rename("s"), mret.shift(-1).rename("r")], axis=1, join="inner").dropna()
    bdf = bdf[bdf.index >= pd.Period("2005-03", "M")]
    res["B_next_month"] = stats(bdf["s"] * bdf["r"]) | boot_mean(bdf["s"] * bdf["r"], rng) | {"window": [str(bdf.index[0]), str(bdf.index[-1])]}
    res["B_long_flat"] = stats(bdf["s"].clip(lower=0) * bdf["r"])
    res["B_buy_hold"] = stats(bdf["r"])
    h = len(bdf) // 2
    res["B_halves"] = [float((bdf["s"] * bdf["r"]).iloc[:h].mean()), float((bdf["s"] * bdf["r"]).iloc[h:].mean())]
    flips = (bdf["s"].diff().fillna(0) != 0).astype(float)
    res["B_with_0.10pct_per_flip"] = stats(bdf["s"] * bdf["r"] - 0.10 * flips)

    # (C) at release
    for day in (25, 22, 27):
        rel = {}
        for ym in sig.index:
            d0 = pd.Timestamp(ym.year, ym.month, day)
            hit = dax[dax["Date"] >= d0]
            if len(hit) and hit["Date"].iloc[0].to_period("M") == ym:
                rel[ym] = hit.index[0]
        keys = sorted(rel)
        rows = []
        for k0, k1 in zip(keys[:-1], keys[1:]):
            if (k1 - k0).n != 1:
                continue
            p0, p1 = dax["Price"].iloc[rel[k0]], dax["Price"].iloc[rel[k1]]
            rows.append((k0, sig[k0], (p1 / p0 - 1) * 100))
        c = pd.DataFrame(rows, columns=["ym", "s", "r"]).set_index("ym")
        tag = f"C_release_day{day}"
        sr = c["s"] * c["r"]
        res[tag] = stats(sr) | ({**boot_mean(sr, rng), "halves": [float(sr.iloc[:len(sr)//2].mean()), float(sr.iloc[len(sr)//2:].mean())]} if day == 25 else {}) \
                   | {"window": [str(c.index[0]), str(c.index[-1])]}
        if day == 25:
            res["C_long_flat"] = stats(c["s"].clip(lower=0) * c["r"])
            res["C_buy_hold"] = stats(c["r"])

    # Holm over the two scored cells
    ps = [res["B_next_month"]["p"], res["C_release_day25"]["p"]]
    order = np.argsort(ps); adj = [0, 0]; run = 0
    for r_, i in enumerate(order):
        run = max(run, (2 - r_) * ps[i]); adj[i] = min(run, 1)
    res["holm_p"] = {"B": adj[0], "C": adj[1]}

    Bm, Cm = res["B_next_month"], res["C_release_day25"]
    gate = all(x["ci95"][0] > 0 for x in (Bm, Cm)) and max(adj) < 0.05 and min(res["B_halves"] + Cm["halves"]) > 0
    res["verdict"] = "VALIDATED" if gate else ("NULL" if Bm["ci95"][1] < 0.5 else "UNDERPOWERED")

    (OUT / "results.json").write_text(json.dumps(res, indent=2))
    for k, v in res.items():
        if isinstance(v, dict) and "cagr" in v:
            extra = f"  CI {v['ci95'][0]:+.2f}..{v['ci95'][1]:+.2f}" if "ci95" in v else ""
            print(f"{k:28s} n={v['n']:3d} mean {v['mean']:+.3f}%  t {v['t']:+.2f}  CAGR {v['cagr']:+.2f}%  DD {v['max_dd']:.1f}%  "
                  f"Sharpe(rf3.8) {v['sharpe_rf3.8']:+.2f}  (rf0) {v['sharpe_rf0']:+.2f}{extra}")
    print("halves B", res["B_halves"], "C", Cm["halves"], "holm", res["holm_p"], "->", res["verdict"])


if __name__ == "__main__":
    main()
