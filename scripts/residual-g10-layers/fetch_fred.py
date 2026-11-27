"""residual-g10-layers, stage 0: fetch the inputs from FRED (public CSV, no key, read-only).

Spot: Federal Reserve H.10 noon New York buying rates, daily, for all 9 USD pairs (one source,
one clock). Rates: OECD 3-month interbank for NOK and SEK (the other 8 are already in
analysis/output/cot-crowding-programme/macro_IR3TIB01*).

    python scripts/residual-g10-layers/fetch_fred.py
Output: analysis/output/residual-g10-layers/fred/<id>.csv (date,value as published)
"""
import os
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "analysis/output/residual-g10-layers/fred")
IDS = ["DEXUSEU", "DEXUSUK", "DEXUSAL", "DEXUSNZ", "DEXJPUS", "DEXCAUS", "DEXSZUS", "DEXNOUS", "DEXSDUS",
       "IR3TIB01NOM156N", "IR3TIB01SEM156N"]


def main():
    os.makedirs(OUT, exist_ok=True)
    for s in IDS:
        with urllib.request.urlopen(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={s}", timeout=60) as r:
            body = r.read().decode()
        with open(os.path.join(OUT, f"{s}.csv"), "w") as f:
            f.write(body)
        lines = body.strip().split("\n")
        print(s, len(lines) - 1, lines[1].split(",")[0], "->", lines[-1])


if __name__ == "__main__":
    main()
