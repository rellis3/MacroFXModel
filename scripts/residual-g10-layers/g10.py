"""residual-g10-layers (EXPLORATORY, not pre-registered). Follow-up to residual-fx8-paper-layers.

Owner 2026-11-27: add NOK and SEK so the model is the full G10, and rerun the paper layers.

Fixed in this header before any result was computed:

DATA   Federal Reserve H.10 noon New York buying rates from FRED, all 9 USD pairs from the same
       source and clock (OANDA, the source of the FX8 study, returns 403 from the sandbox):
       DEXUSEU DEXUSUK DEXUSAL DEXUSNZ (USD per unit) and DEXJPUS DEXCAUS DEXSZUS DEXNOUS DEXSDUS
       (units per USD). Rows: days with all 9 published, 2016-01-04 -> 2026-08-20 (lockbox untouched).
       Fetched by scripts/residual-g10-layers/fetch_fred.py into analysis/output/residual-g10-layers/fred/.
       Rates: OECD 3m interbank, monthly, month M used from day 1 of M+2; NOK = IR3TIB01NOM156N,
       SEK = IR3TIB01SEM156N, the other 8 as in the FX8 study.
COSTS  House round-trip table for the 8 (tags.COST); NOK and SEK 0.035% each (USDNOK / USDSEK
       retail spreads are roughly 3-4x EURUSD in % terms). Fixed here, never tuned.
MODEL  Unchanged from residual-fx8-paper-layers (layers.py): window 120, K by the frozen noise-band
       rule on the first half (re-run for each universe, as the rule says), enter |z| >= 1.5,
       exit at z = 0, the same six layers and three stacks, momentum guard = top 2 / bottom 2 of
       the universe. Same seed 20261123, block 21, B 2000, same "better / worse" bar.
RUNS   (1) fx8_h10: FX8 on H.10 noon closes. Source check only: how far is it from the OANDA
           17:00 result (0.432 / 0.378)? Any gap there is the data source and clock, not G10.
       (2) g10:     the 10 currencies on H.10. Compare with (1), not with the OANDA run.
"""
import json
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "residual-fx8-paper-layers"))
sys.path.insert(0, os.path.join(HERE, "..", "residual-pca-family"))
import layers as Ly  # noqa: E402
import tags as T  # noqa: E402

OUT = os.path.join(T.ROOT, "analysis/output/residual-g10-layers")
FRED = os.path.join(OUT, "fred")
START, END = pd.Timestamp("2016-01-04"), pd.Timestamp("2026-08-20")
# currency: (FRED id, +1 if quoted USD per unit (XXXUSD), -1 if units per USD (USDXXX))
H10 = {"EUR": ("DEXUSEU", 1), "GBP": ("DEXUSUK", 1), "AUD": ("DEXUSAL", 1), "NZD": ("DEXUSNZ", 1),
       "JPY": ("DEXJPUS", -1), "CAD": ("DEXCAUS", -1), "CHF": ("DEXSZUS", -1),
       "NOK": ("DEXNOUS", -1), "SEK": ("DEXSDUS", -1)}
COST = dict(T.COST, NOK=0.035, SEK=0.035)
RATE_PATHS = dict({c: os.path.join(Ly.RATE_DIR, f"macro_IR3TIB01{k}M156N.csv") for c, k in Ly.RATE_IDS.items()},
                  NOK=os.path.join(FRED, "IR3TIB01NOM156N.csv"), SEK=os.path.join(FRED, "IR3TIB01SEM156N.csv"))


def fred_series(sid):
    d = pd.read_csv(os.path.join(FRED, f"{sid}.csv"))
    d.columns = ["date", "v"]
    return pd.Series(pd.to_numeric(d.v, errors="coerce").values, index=pd.to_datetime(d.date))


def panel():
    p = pd.DataFrame({c: fred_series(sid) for c, (sid, _) in H10.items()})
    p = p[(p.index >= START) & (p.index <= END) & (p.index.dayofweek < 5)]
    full = p.dropna()
    audit = {"calendar_weekdays": int(len(p)), "rows_all_9": int(len(full)),
             "missing_any": int(len(p) - len(full)), "first": str(full.index[0].date()), "last": str(full.index[-1].date())}
    return full, audit


def config(ccys, name, universe):
    p, audit = panel()
    lr = np.log(p).diff().dropna()
    r = pd.DataFrame(0.0, index=lr.index, columns=["USD"] + ccys)
    for c in ccys:
        r[c] = H10[c][1] * lr[c]
    return {"r": r, "pair_lr": lr[ccys], "cost": COST, "rate_paths": {c: RATE_PATHS[c] for c in ["USD"] + ccys},
            "out": os.path.join(OUT, name), "universe": universe, "repro": None}, audit


def main():
    fx8 = ["EUR", "GBP", "AUD", "NZD", "JPY", "CAD", "CHF"]
    runs = {}
    for name, ccys, uni in [("fx8_h10", fx8, "FX8 on Fed H.10 noon NY (source check)"),
                            ("g10", fx8 + ["NOK", "SEK"], "G10 on Fed H.10 noon NY")]:
        cfg, audit = config(ccys, name, uni)
        print(f"== {name}: {uni}  {audit}")
        res = Ly.main(cfg)
        runs[name] = {"audit": audit, "base_net": res["base"]["net"], "base_net_carry": res["base"]["net_carry"]}
    json.dump(runs, open(os.path.join(OUT, "runs_summary.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
