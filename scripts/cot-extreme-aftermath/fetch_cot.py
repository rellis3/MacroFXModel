"""Fetch weekly COT history for cot-extreme-aftermath (read-only, CFTC Socrata).

Pulled by CFTC contract code, not market name, so the 2022 renames (e.g. "BRITISH POUND
STERLING" -> "BRITISH POUND") don't truncate history the way the page's name lookup can.
Spec definition matches /api/cot-extremes: Leveraged Funds (TFF) for financials, Managed
Money (Disaggregated) for metals; JPY/CAD/CHF flipped into pair terms (long JPY futures =
short USD/JPY). Futures-only datasets, same as the page.

Output: analysis/output/cot-extreme-aftermath/cot_weekly.csv (default), or
  python fetch_cot.py <start YYYY-MM-DD> <out.csv>   (cot-extreme-duration uses 2006 ->)
"""
import csv, json, os, sys, time, urllib.parse, urllib.request

PRE = "https://publicreporting.cftc.gov/resource"
# sym, dataset, contract code, flip, spec field prefix
MARKETS = [
    ("EUR",    "gpe5-46if", "099741", False, "lev_money"),
    ("GBP",    "gpe5-46if", "096742", False, "lev_money"),
    ("JPY",    "gpe5-46if", "097741", True,  "lev_money"),
    ("AUD",    "gpe5-46if", "232741", False, "lev_money"),
    ("CAD",    "gpe5-46if", "090741", True,  "lev_money"),
    ("CHF",    "gpe5-46if", "092741", True,  "lev_money"),
    ("NZD",    "gpe5-46if", "112741", False, "lev_money"),
    ("USD",    "gpe5-46if", "098662", False, "lev_money"),   # ICE dollar index
    ("NQ",     "gpe5-46if", "209742", False, "lev_money"),
    ("ES",     "gpe5-46if", "13874A", False, "lev_money"),
    ("TY",     "gpe5-46if", "043602", False, "lev_money"),
    ("GOLD",   "72hh-3qpy", "088691", False, "m_money"),
    ("SILVER", "72hh-3qpy", "084691", False, "m_money"),
]
START = (sys.argv[1] if len(sys.argv) > 1 else "2014-01-01") + "T00:00:00.000"


def get(ds, code):
    q = urllib.parse.urlencode({
        "$where": f"cftc_contract_market_code='{code}' AND report_date_as_yyyy_mm_dd >= '{START}'",
        "$order": "report_date_as_yyyy_mm_dd ASC", "$limit": "5000"})
    for k in range(5):
        try:
            with urllib.request.urlopen(f"{PRE}/{ds}.json?{q}", timeout=60) as r:
                return json.load(r)
        except Exception as e:  # network hiccup: back off and retry
            print("retry", code, e, file=sys.stderr); time.sleep(2 ** k)
    raise SystemExit(f"failed {code}")


def main():
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "../../analysis/output/cot-extreme-aftermath/cot_weekly.csv")
    rows = []
    for sym, ds, code, flip, pre in MARKETS:
        data = get(ds, code)
        seen = set()
        for r in data:
            d = r["report_date_as_yyyy_mm_dd"][:10]
            if d in seen:
                continue
            seen.add(d)
            # TFF names the field without "_all", Disaggregated with it (the worker tries both too)
            L = int(float(r.get(f"{pre}_positions_long_all") or r.get(f"{pre}_positions_long") or 0))
            S = int(float(r.get(f"{pre}_positions_short_all") or r.get(f"{pre}_positions_short") or 0))
            oi = int(float(r.get("open_interest_all") or 0))
            net = (S - L) if flip else (L - S)
            rows.append({"sym": sym, "report_date": d, "spec_long": L, "spec_short": S,
                         "spec_net": net, "oi": oi})
        zero = sum(1 for x in rows if x["sym"] == sym and x["spec_long"] == 0 and x["spec_short"] == 0)
        if zero:
            raise SystemExit(f"{sym}: {zero} weeks with no spec position parsed -- field names changed?")
        print(sym, len(seen), min(seen), max(seen))
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader(); w.writerows(rows)


if __name__ == "__main__":
    main()
