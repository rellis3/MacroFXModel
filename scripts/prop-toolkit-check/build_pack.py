"""Build the upload pack for checking our prop-toolkit replica against C.OG's real toolkit / EV modeler.

No new simulation: this only re-formats banked inputs and copies banked results into one comparison sheet.

Inputs (banked):
  analysis/output/overnight-hold-toolkit/toolkit_{nq,gold,combined}_net.csv   (exit date, 4 dp)
  analysis/output/overnight-hold-toolkit/page_trades.json                    (entry/exit dates per trade)
  analysis/output/overnight-hold-toolkit/results.json                        (our replica's numbers)
  analysis/output/portfolio-book-prop/toolkit_A.csv, results.json
Outputs:
  analysis/output/prop-toolkit-check/upload_*.csv   C.OG's spec: Date = ENTRY date, 2 decimals, Date,Return %,MAE %
  analysis/output/prop-toolkit-check/upload_*_ZERO_EDGE.csv   the same rows with the mean removed (luck only)
  analysis/output/prop-toolkit-check/ours.json      our numbers per upload, for the comparison sheet

Rounding to 2 dp changes the inputs by < 0.005% per row; the replica ran on unrounded values.
"""
import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OH = os.path.join(ROOT, "analysis/output/overnight-hold-toolkit")
PB = os.path.join(ROOT, "analysis/output/portfolio-book-prop")
OUT = os.path.join(ROOT, "analysis/output/prop-toolkit-check")


def read_rows(path):
    with open(path, newline="") as f:
        r = csv.reader(f)
        next(r)
        return [(d, float(a), float(b)) for d, a, b in r]


def write_rows(path, rows):
    with open(path, "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["Date", "Return %", "MAE %"])
        for d, a, b in rows:
            w.writerow([d, f"{a:.2f}", f"{min(b, 0.0):.2f}"])


def zero_edge(rows):
    """The prereg's mirror: the same rows with the sample mean subtracted from Return % and MAE % (same shape, no drift)."""
    m = sum(a for _, a, _ in rows) / len(rows)
    return [(d, a - m, b - m) for d, a, b in rows]


def main():
    os.makedirs(OUT, exist_ok=True)
    pt = json.load(open(os.path.join(OH, "page_trades.json")))["instruments"]
    exit_to_entry = {}
    for k in ("nq", "gold"):
        for e, x in zip(pt[k]["entry"], pt[k]["exit"]):
            prev = exit_to_entry.setdefault(x, e)
            if prev != e:
                raise SystemExit(f"exit {x} maps to two entries ({prev}, {e})")

    ours = {}
    res = json.load(open(os.path.join(OH, "results.json")))
    for book in ("nq", "gold", "combined"):
        rows = read_rows(os.path.join(OH, f"toolkit_{book}_net.csv"))
        missing = [d for d, _, _ in rows if d not in exit_to_entry]
        if missing:
            raise SystemExit(f"{book}: {len(missing)} exit dates without an entry, e.g. {missing[:3]}")
        rows = [(exit_to_entry[d], a, b) for d, a, b in rows]
        dates = [d for d, _, _ in rows]
        if len(set(dates)) != len(dates):
            raise SystemExit(f"{book}: duplicate entry dates")
        name = f"upload_overnight_{book}_net.csv"
        write_rows(os.path.join(OUT, name), rows)
        write_rows(os.path.join(OUT, name.replace(".csv", "_ZERO_EDGE.csv")), zero_edge(rows))
        net = res["books"][book]["net"]
        cell = net["ftmo"]["1"]
        zero = res["books"][book]["net_zero_edge"]["ftmo"]["1"]
        ours[name] = {
            "source": f"overnight-hold-toolkit, {book}, net, 1x",
            "rows": len(rows), "first": dates[0], "last": dates[-1],
            "funded": cell["funded"],
            "cleared_step1": cell["phases"][0]["pass"],
            "median_days_to_funded": cell["median_days_to_funded"],
            "payout_12m_pct_of_account": cell["payout_12m_pct_of_account"],
            "funded_blown_12m": cell["funded_blown_12m"],
            "breakeven_fee_pct_of_account": cell["breakeven_fee_pct_of_account"],
            "zero_edge_funded": zero["funded"],
        }

    rows = read_rows(os.path.join(PB, "toolkit_A.csv"))
    name = "upload_portfolio_book_A.csv"
    write_rows(os.path.join(OUT, name), rows)
    write_rows(os.path.join(OUT, name.replace(".csv", "_ZERO_EDGE.csv")), zero_edge(rows))
    g = json.load(open(os.path.join(PB, "results.json")))["books"]["A"]["grid"]["1"]
    ours[name] = {
        "source": "portfolio-book-prop, Book A, 1x",
        "rows": len(rows), "first": rows[0][0], "last": rows[-1][0],
        "funded": g["book"]["funded"], "median_days_to_funded": g["book"]["median_days"],
        "payout_12m_pct_of_account": g["book"]["payout12m"], "ev_pct_of_account_fee_0_54": g["book"]["ev"],
        "zero_edge_funded": g["zero"]["funded"], "zero_edge_ev": g["zero"]["ev"],
    }
    json.dump(ours, open(os.path.join(OUT, "ours.json"), "w"), indent=1)
    for k, v in ours.items():
        print(k, v["rows"], v["first"], v["last"], "funded", v["funded"], "zero", v.get("zero_edge_funded"))


if __name__ == "__main__":
    main()
