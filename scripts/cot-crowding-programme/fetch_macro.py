"""Macro drivers for cot-crowding-programme (FRED fredgraph CSV, no key, read-only).

Monthly OECD 3-month interbank rates for the FX legs (rate differentials), US 10y real yield
(gold) and US 2y yield (Treasury futures), daily. Point-in-time use is handled in the analysis:
a monthly value is usable 45 days after its month starts' month-end, and is treated as missing
once it is more than 4 months stale (EZ and GB series end 2026-01).

Output: analysis/output/cot-crowding-programme/macro_<id>.csv (date,value)
"""
import os, sys, time, urllib.request

SERIES = ["IR3TIB01USM156N", "IR3TIB01EZM156N", "IR3TIB01GBM156N", "IR3TIB01JPM156N", "IR3TIB01AUM156N",
          "IR3TIB01CAM156N", "IR3TIB01CHM156N", "IR3TIB01NZM156N", "IR3TIB01MXM156N", "DFII10", "DGS2"]
OUT = os.path.join(os.path.dirname(__file__), "../../analysis/output/cot-crowding-programme")

for s in SERIES:
    for k in range(5):
        try:
            with urllib.request.urlopen(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={s}", timeout=60) as r:
                txt = r.read().decode()
            break
        except Exception as e:
            print("retry", s, e, file=sys.stderr); time.sleep(2 ** k)
    lines = [l for l in txt.strip().splitlines()[1:] if l.split(",")[1] not in ("", ".")]
    with open(os.path.join(OUT, f"macro_{s}.csv"), "w") as f:
        f.write("date,value\n" + "\n".join(lines) + "\n")
    print(s, len(lines), lines[0].split(",")[0], lines[-1].split(",")[0])
