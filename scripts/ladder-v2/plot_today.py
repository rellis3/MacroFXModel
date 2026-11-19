"""Render today's session with the shadow ladder + exhaustion zones (for eyeballing before pasting into TradingView).

    python scripts/ladder-v2/plot_today.py     -> analysis/output/ladder-v2-shadow/<date>_today.png
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SH = ROOT / "analysis/output/ladder-v2-shadow"
DATA = ROOT / "analysis/output/ladder-v2-data"
BUCKET_EDGES = (7, 12, 16)


def parse(path):
    out, cur = {}, None
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        m = re.match(r"──── (\w+)", line)
        if m:
            cur = m.group(1); out[cur] = {}; continue
        if cur is None or ":" not in line:
            continue
        k, v = [x.strip() for x in line.split(":", 1)]
        nums = [float(x) for x in re.findall(r"-?\d+\.?\d*", re.sub(r"\d+th", "", v).replace("σ", ""))]
        out[cur][k] = (v, nums)
    return out


def main():
    sess = pd.Timestamp.now(tz="Europe/London").normalize()
    tag = f"{sess:%Y-%m-%d}"
    F, X = parse(SH / f"{tag}_cfd.txt"), parse(SH / f"{tag}_exhaustion_cfd.txt")
    now_l = pd.Timestamp.now(tz="Europe/London")
    b = int(np.searchsorted(BUCKET_EDGES, now_l.hour, side="right"))
    fig, axes = plt.subplots(3, 1, figsize=(13, 15))
    for ax, sym in zip(axes, ("GOLD", "NQ", "EURUSD")):
        m = pd.read_parquet(DATA / f"{sym}_m5_recent.parquet")
        m = m[m.index >= sess.tz_convert("UTC")]
        m = m[m.index < (sess + pd.Timedelta(hours=22)).tz_convert("UTC")]
        t = m.index.tz_convert("Europe/London")
        o = float(m["open"].iloc[0])
        x = (t - sess).total_seconds() / 3600
        ax.fill_between(x, m["low"], m["high"], color="#9aa4b1", alpha=0.6, lw=0, step="post")
        ax.plot(x, m["close"], color="#2b3440", lw=0.9)
        ax.axhline(o, color="#777", lw=0.8, ls="--")
        ax.text(22.05, o, " open", va="center", fontsize=8, color="#555")
        z50 = X[sym]["Zone past line"][1][0]; z75 = X[sym]["Zone past line"][1][1]
        for side, sgn, col in (("OH", 1, "#c96a00"), ("OL", -1, "#b3261e")):
            for p in (50, 75, 90):
                pct = F[sym][f"Open {'High (upside)' if side == 'OH' else 'Low  (downside)'}"][1][[0, 1, 2][[50, 75, 90].index(p)]]
                lvl = o * (1 + sgn * pct / 100)
                inner = o * (1 + sgn * (pct + z50) / 100); outer = o * (1 + sgn * (pct + z75) / 100)
                ax.axhspan(min(lvl, inner), max(lvl, inner), color=col, alpha=0.18, lw=0)
                ax.axhspan(min(inner, outer), max(inner, outer), color=col, alpha=0.07, lw=0)
                ax.axhline(lvl, color=col, lw=1.4 if p == 75 else 1.0)
                row = X[sym][f"{side} p{p}"]
                odds = row[1][-4 + b] if len(row[1]) >= 5 else float("nan")
                word = "next" if p < 90 else "+0.25σ"
                ax.text(22.05, lvl, f" {side} p{p} {pct:.2f}%  {word} {odds:.0f}% now", va="center", fontsize=8, color=col)
        hi, lo = m["high"].max(), m["low"].min()
        ax.set_title(f"{sym}  {tag}  London 00:00 → {t[-1]:%H:%M}   high {100 * (hi / o - 1):+.2f}%   low {100 * (lo / o - 1):+.2f}%   "
                     f"(zones: line → +{z50:.3f}% median run-past, lighter to +{z75:.3f}%)", fontsize=10, loc="left")
        ax.set_xlim(0, 22); ax.set_xticks(range(0, 23, 2)); ax.set_xticklabels([f"{h:02d}:00" for h in range(0, 23, 2)], fontsize=8)
        for e in BUCKET_EDGES:
            ax.axvline(e, color="#ccc", lw=0.6, ls=":")
        ax.axvline(x[-1], color="#2b6cb0", lw=0.8)
        span = max(abs(hi - o), abs(lo - o), o * F[sym]["Open High (upside)"][1][1] / 100) * 1.35
        ax.set_ylim(o - span, o + span)
        ax.tick_params(axis="y", labelsize=8)
        ax.grid(axis="y", color="#eee")
    fig.suptitle("Shadow ladder-v2 + exhaustion zones (not live) — OANDA mid, 5-minute", fontsize=12)
    fig.subplots_adjust(left=0.06, right=0.82, top=0.95, bottom=0.03, hspace=0.25)
    out = SH / f"{tag}_today.png"
    fig.savefig(out, dpi=110)
    print(out)


if __name__ == "__main__":
    main()
