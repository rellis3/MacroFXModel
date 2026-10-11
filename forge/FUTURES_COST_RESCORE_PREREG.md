# Futures-cost re-score of the line-touch fade (registered 2026-10-11, before the re-score is computed)

**Question (Q5):** does the one replicated gross effect turn net-positive at real futures costs? That effect is the line-touch fade at fresh intraday extremes: holdout gross +0.192R; it fails at 2× the CFD table (`analysis/output/line_touch_wide_scan/RESULTS.md`).

**No new model.**
- The 584 holdout trades are reconstructed exactly:
  - frozen predictions `preds_holdout.npz`;
  - frozen threshold c = 0.21754;
  - same filters and selection as `scripts/line_touch_wide/scan.py`.
- Only the cost per trade changes.

**Status of the data:**
- The holdout (2022-06-24 → 2026-08-20) has already been read gross, so this is **not an independent test**.
- **A pass qualifies the effect for a forward paper record on futures only, never for live trading.**
- The forward block is not read. No production change.

## Costs (round trip, in the CFD instrument's price units, per trade)
**Futures cost = spread + 1 tick of slippage on the exit + commission.**
- **Spread:**
  - the larger of 1 tick and the spread measured on the NT8 tick recording (2026-10-08, 14 minutes only);
  - ES 0.29 pt, NQ 0.74 pt, GC $0.28;
  - 1 tick elsewhere.
- **Commission:** $4 per round trip per standard contract. **This is an assumption; the Lucid rate is unconfirmed.**
  - Converted to price units through the contract's notional.
  - The inverse contracts (6J, 6S) are converted at the trade's level price.

| CFD | Future | Tick | Size |
|---|---|---|---|
| eurusd | 6E | 0.00005 | 125k EUR |
| gbpusd | 6B | 0.0001 | 62.5k GBP |
| audusd | 6A | 0.00005 | 100k AUD |
| usdjpy | 6J | 0.0000005 USD/JPY | 12.5M JPY |
| usdchf | 6S | 0.00005 USD/CHF | 125k CHF |
| gold | GC | 0.10 | 100 oz |
| nq | NQ | 0.25 | $20/pt |
| spx | ES | 0.25 | $50/pt |
| dow | YM | 1.0 | $5/pt |
| us2000 | RTY | 0.10 | $50/pt |
| de30 | FDAX | 0.5 | €25/pt (EUR→USD at 1.10) |
| uk100 | Z (FTSE) | 0.5 | £10/pt (GBP→USD at 1.27) |

**Crosses** (audjpy, cadjpy, chfjpy, euraud, eurchf) have no liquid future and are excluded.

**The VWAP-extension fade is excluded by arithmetic:** it fell 3–8× short of cost, and futures cut cost by at most about 2× on any instrument.

## Wider targets
Already tested: the cost-phase widths 0.20 and 0.30 (gross falls to +0.05R and −0.18R). The effect exists only at the tight 0.10 stop. **Not re-tested here.**

## Pass rule (all of these, on the 12 futures instruments)
1. Mean net R at futures cost > 0, and the 5-date-block bootstrap 95% lower bound > 0 (2,000 draws, dates resampled).
2. Both halves (split 2024-06-01) net > 0.
3. At least 60% of the traded instruments are net > 0.
4. It still holds at **1.5× the futures cost** (the cost model is thin).

**Pre-stated restriction:** if the rule fails overall but the six index futures alone pass items 1–4, that subset is reported as a **hypothesis for the forward paper record**, labelled post-hoc. It is not a pass.
