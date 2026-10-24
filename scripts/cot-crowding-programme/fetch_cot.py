"""COT history for cot-crowding-programme (read-only, CFTC Socrata, futures-only), 2006 ->.

Pulled by contract code (renames never truncate history). Same participant definitions as
/api/cot-extremes: spec = Leveraged Funds (TFF) / Managed Money (Disaggregated); commercial =
Asset Manager + Dealer (TFF) / Producer-Merchant (Disaggregated). Gross longs, shorts, open
interest and trader counts are kept so the measurement map can separate accumulation from
covering. JPY/CAD/CHF/MXN? -- only the yen, loonie and franc are quoted inverted in pair terms
(USDJPY, USDCAD, USDCHF); MXN is kept in futures terms (long MXN futures = short USDMXN), and so
is its price series (6M), so no flip is needed for it.

Output: analysis/output/cot-crowding-programme/cot_weekly.csv
  set = discovery (the 12 markets earlier COT studies here already used) | holdout (never used)
"""
import csv, json, os, sys, time, urllib.parse, urllib.request

PRE = "https://publicreporting.cftc.gov/resource"
TFF, DIS = "gpe5-46if", "72hh-3qpy"
# sym, set, dataset, code, flip(into pair terms)
MARKETS = [
    ("EUR", "discovery", TFF, "099741", False), ("GBP", "discovery", TFF, "096742", False),
    ("JPY", "discovery", TFF, "097741", True), ("AUD", "discovery", TFF, "232741", False),
    ("CAD", "discovery", TFF, "090741", True), ("CHF", "discovery", TFF, "092741", True),
    ("USD", "discovery", TFF, "098662", False), ("NQ", "discovery", TFF, "209742", False),
    ("ES", "discovery", TFF, "13874A", False), ("TY", "discovery", TFF, "043602", False),
    ("GOLD", "discovery", DIS, "088691", False), ("SILVER", "discovery", DIS, "084691", False),
    ("MXN", "holdout", TFF, "095741", False), ("NZD", "holdout", TFF, "112741", False),
    ("YM", "holdout", TFF, "124603", False), ("RTY", "holdout", TFF, "239742", False),
    ("US", "holdout", TFF, "020601", False), ("TU", "holdout", TFF, "042601", False),
    ("COPPER", "holdout", DIS, "085692", False), ("PLAT", "holdout", DIS, "076651", False),
    ("PALL", "holdout", DIS, "075651", False), ("WTI", "holdout", DIS, "067651", False),
    ("NATGAS", "holdout", DIS, "023651", False), ("RBOB", "holdout", DIS, "111659", False),
    ("CORN", "holdout", DIS, "002602", False), ("WHEAT", "holdout", DIS, "001602", False),
    ("SOYB", "holdout", DIS, "005602", False), ("SOYOIL", "holdout", DIS, "007601", False),
    ("SUGAR", "holdout", DIS, "080732", False), ("COFFEE", "holdout", DIS, "083731", False),
    ("COTTON", "holdout", DIS, "033661", False), ("COCOA", "holdout", DIS, "073732", False),
    ("CATTLE", "holdout", DIS, "057642", False), ("HOGS", "holdout", DIS, "054642", False),
]


def get(ds, code):
    q = urllib.parse.urlencode({"$where": f"cftc_contract_market_code='{code}' AND report_date_as_yyyy_mm_dd >= '2006-01-01T00:00:00.000'",
                                "$order": "report_date_as_yyyy_mm_dd ASC", "$limit": "5000"})
    for k in range(6):
        try:
            with urllib.request.urlopen(f"{PRE}/{ds}.json?{q}", timeout=90) as r:
                return json.load(r)
        except Exception as e:
            print("retry", code, e, file=sys.stderr); time.sleep(2 ** k)
    raise SystemExit("failed " + code)


def num(r, *names):
    for n in names:
        for v in (r.get(n + "_all"), r.get(n)):
            if v not in (None, ""):
                return float(v)
    return 0.0


def main():
    out = os.path.join(os.path.dirname(__file__), "../../analysis/output/cot-crowding-programme/cot_weekly.csv")
    rows = []
    for sym, st, ds, code, flip in MARKETS:
        seen = set()
        for r in get(ds, code):
            d = r["report_date_as_yyyy_mm_dd"][:10]
            if d in seen:
                continue
            seen.add(d)
            if ds == TFF:
                sl, ss = num(r, "lev_money_positions_long"), num(r, "lev_money_positions_short")
                cl = num(r, "asset_mgr_positions_long") + num(r, "dealer_positions_long")
                cs = num(r, "asset_mgr_positions_short") + num(r, "dealer_positions_short")
                tl, ts = num(r, "traders_lev_money_long"), num(r, "traders_lev_money_short")
            else:
                sl, ss = num(r, "m_money_positions_long"), num(r, "m_money_positions_short")
                cl, cs = num(r, "prod_merc_positions_long"), num(r, "prod_merc_positions_short")
                tl, ts = num(r, "traders_m_money_long"), num(r, "traders_m_money_short")
            if flip:   # into pair terms: long JPY futures = short USDJPY
                sl, ss, cl, cs, tl, ts = ss, sl, cs, cl, ts, tl
            rows.append({"sym": sym, "set": st, "report_date": d, "spec_long": sl, "spec_short": ss,
                         "comm_long": cl, "comm_short": cs, "oi": num(r, "open_interest"),
                         "traders_long": tl, "traders_short": ts})
        n = [x for x in rows if x["sym"] == sym]
        zero = sum(1 for x in n if x["spec_long"] == 0 and x["spec_short"] == 0)
        print(sym, st, len(n), n[0]["report_date"], n[-1]["report_date"], "zero-spec weeks:", zero)
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)


if __name__ == "__main__":
    main()
