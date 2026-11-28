"""Bank cboe-vol-indices-range: one js/deskEvidence.js entry + POWER row per map x horizon, from results.json.
Idempotent: skips ids already present."""
from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
R = json.loads((REPO / "analysis/output/cboe-vol-indices-range/results.json").read_text())
EV = REPO / "js/deskEvidence.js"
src = EV.read_text(encoding="utf-8")
crlf = "\r\n" in src
s = src.replace("\r\n", "\n")
prim = {(c["index"], c["inst"], c["h"], c["variant"]): c for c in R["cells"] if c["role"] == "primary"}
DATE = R["ranAt"][:10]
INSTR = {"WTI": "WTI", "BRENT": "BRENT", "SILVER": "SILVER", "ZB": "ZB", "ZN": "ZN", "US2000": "US2000", "US30": "US30",
         "SPX500": "SPX500", "NQ": "NQ", "GOLD": "GOLD", "AUDUSD": "AUDUSD", "USDCAD": "USDCAD"}


def esc(t):
    return t.replace("\\", "\\\\").replace("'", "\\'")


def cell_txt(c):
    h = c["halves"]
    hv = " / ".join("—" if v is None else f"{v:.3f}" for v in h.values())
    rep = "" if c.get("repl_ratio") is None else f", {('futures' if c['track'] == 'C' else 'CFD')} track {c['repl_ratio']:.3f}"
    return (f"{c['variant']} {c['ratio']:.3f} [{c['lo']:.3f}, {c['hi']:.3f}], Holm {'yes' if c['holm'] else 'no'}, MDE {c['mde']:.3f}, "
            f"halves {hv}, placebo median {c['placebo']['median']:.3f} ({c['placebo']['n'] - c['placebo']['n_below_real']}/20 worse){rep} -> {c['verdict']}")


entries, powers = [], []
for m in R["maps"]:
    if f"id: '{m['id']}'" in s:
        continue
    cs = [prim[(m["index"], m["inst"], m["h"], v)] for v in ("Lin", "Ext") if (m["index"], m["inst"], m["h"], v) in prim]
    c0 = cs[0]
    bench = c0["bench_arm"] + (f" x {c0['own_iv']} own-IV layer" if c0["own_iv"] else "")
    hz = "next London session" if m["h"] == 1 else "next 5 London sessions"
    claim = (f"{m['index']} (Cboe close before the open: level vs the forecast, 1d/5d change, or its decile extremes) improves the "
             f"{m['inst']} {hz} high-low range forecast beyond the ladder-v2 benchmark ({bench})")
    fam = "direct underlying" if m["family"] == "A" else "cross-asset proxy"
    result = (f"Pre-registered ({fam} family, Holm over {32 if m['family'] == 'A' else 28} cells). {c0['n']} test sessions "
              f"{c0['dates'][0]} to {c0['dates'][1]}, walk-forward by year, H-L pinball tau 0.50/0.75/0.90, loss ratio layer / benchmark, "
              f"63-session blocks, B 2000, pass bar 0.985. " + "; ".join(cell_txt(c) for c in cs) + ".")
    v = m["verdict"].lower()
    if v == "validated":
        use = (f"{m['inst']} range lines may carry an optional {m['index']} layer (off by default, side by side with the ladder-v2 shadow, "
               f"owner sign-off first). Range size only: says nothing about which side of the range or direction.")
    elif v == "null":
        use = f"Do not add {m['index']} to the {m['inst']} range forecast at this horizon: a 1.5% pinball gain is ruled out. Range size only."
    elif v == "context":
        use = f"{m['index']} may show as context beside {m['inst']} ranges; no line change. Range size only."
    else:
        use = (f"Unanswered at this power: do not add {m['index']} to {m['inst']} ranges and do not call it useless. "
               f"Needs a longer or forward record. Range size only.")
    e = (f"  {{\n    id: '{m['id']}', domain: 'volatility', verdict: '{v}', date: '{DATE}', doc: 'forge/CBOE_VOL_INDICES_RANGE_PREREG.md', "
         f"also: ['analysis/output/cboe-vol-indices-range/RESULTS.md'],\n    claim: '{esc(claim)}',\n    result: '{esc(result)}',\n"
         f"    use: '{esc(use)}',\n    instruments: ['{INSTR[m['inst']]}'],\n  }},")
    entries.append(e)
    best = min(cs, key=lambda c: c["mde"])
    powers.append(f"  '{m['id']}': {{ n: '{c0['n']} test sessions (~{c0['n'] // 63} 63-session blocks)', "
                  f"note: 'MDE {best['mde']:.3f} (best variant) vs bar 0.015 on the loss ratio' }},")

if entries:
    i = s.index("\n];\n", s.index("export const DESK_EVIDENCE"))
    s = s[:i] + "\n" + "\n".join(entries) + s[i:]
    j = s.index("\n};\n", s.index("const POWER = {"))
    s = s[:j] + "\n" + "\n".join(powers) + s[j:]
    EV.write_text(s.replace("\n", "\r\n") if crlf else s, encoding="utf-8", newline="")
print(f"added {len(entries)} entries")
