#!/usr/bin/env python3
"""Export each historical trading day's near-dated EUR/USD option chain in the
exact simple paste format js/oi.js's oiParseTable()/buildOIEntry() already
parse ("strike\\tcallOI\\tputOI" per line) -- so the real production bot logic
(buildOIEntry -> buildOIZones, called from Node in 08_bot_backtest.mjs) can be
fed genuine history instead of a Python re-implementation of its math.

Near-dated expiry selection mirrors pickNearExpiry's intent (js/oi.js): the
nearest expiry with real near-money open interest -- approximated here as the
smallest positive-DTE expiry with combined OI >= MIN_NEAR_OI that day. Not
byte-identical to pickNearExpiry's band-fraction weighting, but the same
"skip a technically-nearer but empty expiry" idea.

Output: oi_research_book/data/bot_backtest/daily_chain.jsonl, one JSON object
per trading day: {date, spot, dte, rawOI, rawChg}.
"""
import json
import os
import numpy as np
import pandas as pd

DATA = "oi_research_book/data"
OUT_DIR = f"{DATA}/bot_backtest"
MIN_NEAR_OI = 500


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    contracts = pd.read_parquet(f"{DATA}/cache/contract_level_ffilled.parquet")
    contracts = contracts[contracts["effective_oi"].notna()].copy()
    d1 = pd.read_parquet(f"{DATA}/daily_master_all.parquet")[["date", "close"]].rename(columns={"close": "spot"})

    contracts["dte"] = (contracts["expiry"] - contracts["date"]).dt.days
    contracts = contracts[contracts["dte"] > 0]

    n_written = 0
    n_no_expiry = 0
    with open(f"{OUT_DIR}/daily_chain.jsonl", "w") as f:
        for date, day_rows in contracts.groupby("date"):
            spot_row = d1.loc[d1["date"] == date, "spot"]
            if spot_row.empty:
                continue
            spot = float(spot_row.values[0])

            # total OI per expiry that day -> nearest expiry clearing the liquidity floor
            per_exp = day_rows.groupby("expiry").agg(total_oi=("effective_oi", "sum"), dte=("dte", "first"))
            per_exp = per_exp[per_exp["total_oi"] >= MIN_NEAR_OI]
            if per_exp.empty:
                n_no_expiry += 1
                continue
            near_expiry = per_exp["dte"].idxmin()
            dte = int(per_exp.loc[near_expiry, "dte"])

            chain = day_rows[day_rows["expiry"] == near_expiry]
            piv_oi = chain.pivot_table(index="strike", columns="right", values="effective_oi",
                                        aggfunc="sum", fill_value=0.0)
            piv_chg = chain.pivot_table(index="strike", columns="right", values="oi_chg_computed",
                                         aggfunc="sum", fill_value=0.0)
            call_oi = piv_oi.get("C", pd.Series(dtype=float))
            put_oi = piv_oi.get("P", pd.Series(dtype=float))
            call_chg = piv_chg.get("C", pd.Series(dtype=float))
            put_chg = piv_chg.get("P", pd.Series(dtype=float))
            strikes = sorted(set(call_oi.index) | set(put_oi.index))

            raw_lines = []
            chg_lines = []
            for k in strikes:
                c, p = call_oi.get(k, 0.0), put_oi.get(k, 0.0)
                if c <= 0 and p <= 0:
                    continue
                raw_lines.append(f"{k}\t{int(round(c))}\t{int(round(p))}")
                cc, pc = call_chg.get(k, np.nan), put_chg.get(k, np.nan)
                if pd.notna(cc) or pd.notna(pc):
                    chg_lines.append(f"{k}\t{int(round(cc)) if pd.notna(cc) else 0}\t{int(round(pc)) if pd.notna(pc) else 0}")

            if len(raw_lines) < 2:
                continue
            rec = {
                "date": date.strftime("%Y-%m-%d"), "spot": spot, "dte": dte,
                "rawOI": "\n".join(raw_lines),
                "rawChg": "\n".join(chg_lines) if len(chg_lines) == len(raw_lines) else "",
            }
            f.write(json.dumps(rec) + "\n")
            n_written += 1

    print(f"Wrote {n_written} daily chains to {OUT_DIR}/daily_chain.jsonl "
          f"({n_no_expiry} days skipped: no expiry cleared the {MIN_NEAR_OI} combined-OI floor)")


if __name__ == "__main__":
    main()
