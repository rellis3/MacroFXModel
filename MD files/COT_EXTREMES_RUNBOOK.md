# COT Extremes — Weekly Runbook
*Last updated: June 2026*

---

## What is automated vs. what needs a manual run

| Task | Automated? | Frequency |
|------|-----------|-----------|
| COT data fetch from CFTC | **Yes** — on demand via `/api/cot-extremes` | On page load, cached 7 days in KV |
| COT KV cache refresh | **Yes** — expires after 7 days, refetches automatically | Every Friday after CFTC release |
| Correlations history update | **No** — must run Python script manually | Weekly (after new OANDA bars are available) |
| Volatility data | **Yes** — KV-backed | Auto |

**Bottom line: the COT Extremes page is fully self-serve.** The only manual step in the weekly workflow is refreshing the correlations data.

---

## Weekly workflow (Friday evening or Saturday)

CFTC publishes COT data every **Friday at ~15:30 ET**. The sequence:

1. **Open the COT Extremes page** — it auto-fetches from CFTC and populates. If the data was cached from earlier in the week the refresh button in the top-right will force a new fetch (clears localStorage cache and re-hits the API).

2. **Run the correlations refresh script** (takes ~3–5 minutes):

```bash
cd /path/to/MacroFXModel
pip install -r requirements.txt   # only needed first time
python scripts/build_corr_history.py
```

   This pulls 4H OANDA bars for all 17 instruments, computes rolling Pearson correlations and OLS betas to DXY/Rates/VIX proxies, and writes the output to `data/corr_history.json`.

3. **Verify** the correlation data loaded correctly by opening `correlations.html` — the last-updated timestamp in the header should show today's date.

---

## Debug / verification

### Check that CFTC data is live and parsing correctly

Hit the debug endpoint in a browser or curl:

```
https://your-worker.workers.dev/api/cot-extremes?debug=1
```

(In local dev via server.js: `http://localhost:3000/api/cot-extremes?debug=1`)

**What it returns:**
```json
{
  "debug": true,
  "disagg": {
    "count": 2850,
    "fieldNames": ["market_and_exchange_names", "report_date_as_yyyy_mm_dd", ...],
    "sampleRow": { ... }
  },
  "tff": {
    "count": 2496,
    "fieldNames": ["market_and_exchange_names", ...],
    "sampleRow": { ... }
  },
  "parsed": {
    "count": 35,
    "instruments": [ ... ]
  }
}
```

**What to check:**
- `disagg.count` and `tff.count` should both be in the thousands (3 years × ~52 weeks × N instruments)
- `parsed.count` should be 35
- `sampleRow` — inspect `fieldNames` to verify the API is returning the expected column names. If `parsed.count` is 0 but `disagg.count` > 0, the field names differ from what the worker expects (see `COT_INTEGRATION_NOTES.md` for known alternatives)
- Each instrument in `parsed.instruments` should have a `reportDate` from the most recent Friday

### Check for stale data

If the page shows a report date older than 10 days, the CFTC may have changed their URL or the KV cache is serving stale data. To force a full refresh:

1. Delete the KV key `cot_extremes_v2` via the Cloudflare dashboard (Workers → KV → FX_SCORES)
2. Reload the page — it will refetch from CFTC

---

## What each column means on the COT Extremes page

| Display | Meaning |
|---------|---------|
| Blue circle position | Spec (Managed Money / Leveraged Funds) net position as a % rank of 3-year history |
| Tan square position | Commercial (Producer/Merchant for commodities; Asset Manager + Dealer for FX/equities) net position % rank |
| Green dot + ring | Position is ≥90th percentile — bullish extreme (3-year high area) |
| Red dot | Position is ≤10th percentile — bearish extreme |
| `CROWDED >3.5×` pill | Spec longs are 3.5× their shorts — one-sided positioning, unwind risk |
| `▲` OI arrow | Open interest is in the top 30% of 3-year range — elevated participation |
| `▼` OI arrow | Open interest in bottom 30% — thin/declining participation, signals less conviction |

---

## Signal interpretation guide

### The classic reversal setup

**BEARISH EXTREME** (in the extreme signals table):
- Specs ≥90% (maximally long) AND commercials ≤10% (maximally short/hedged against them)
- Smart money is on the other side of retail/leveraged spec money
- Not a timing signal on its own — can persist for weeks — but defines the risk environment

**BULLISH EXTREME:**
- Specs ≤10% (capitulated / maximally short) AND commercials ≥90%
- Institutionals loaded up while specs gave up

### Confirmation checklist before trading an extreme

1. COT extreme confirmed (spec ≥90% or ≤10%)
2. Commercial on opposite side (≥20pp gap between spec and comm percentiles)
3. Gross ratio crowded in same direction as spec (>3.5× or <0.3×)
4. Open interest elevated (▲) — conviction behind the positioning
5. Cross-reference correlations page: does the pair have a high beta to the relevant macro driver that would explain the COT positioning?

---

## Instruments covered

### FX (TFF report — Leveraged Funds)
EUR, GBP, JPY*, AUD, CAD*, CHF*, NZD, MXN  
*Flipped: CME quotes as USD/currency so net sign is inverted to match standard convention

### Equities (TFF report)
NQ (Nasdaq 100), ES (S&P 500), YM (Dow), RTY (Russell 2000)

### Rates (TFF report)
TY (10Y Treasury), US (30Y Bond), TU (2Y Treasury)

### Metals (Disaggregated report — Managed Money)
Gold, Silver, Copper, Platinum, Palladium

### Energy (Disaggregated)
WTI Crude, Brent Crude, Natural Gas, Gasoline (RBOB)

### Grains (Disaggregated)
Corn, Wheat, Soybeans, Soy Oil

### Softs (Disaggregated)
Sugar, Coffee, Cotton, Cocoa

### Livestock (Disaggregated)
Live Cattle, Lean Hogs

### Crypto (TFF report)
Bitcoin

---

## CFTC API details (if you need to debug the data source)

| Dataset | Socrata ID | Report type |
|---------|-----------|------------|
| Disaggregated | `72hh-3qpy` | Metals, energy, grains, softs, livestock |
| TFF | `gpe5-46if` | FX, equities, rates, crypto |
| Combined Fut+Options | `kh3c-gbw2` | Future enhancement — adds options OI to positioning |

Base URL: `https://publicreporting.cftc.gov/resource/{id}.json`  
No API token required (CFTC PRE is a public Socrata instance).  
Release schedule: data as of Tuesday close, published Friday ~15:30 ET.

---

## Correlations script dependencies

```
pandas
numpy
requests
oandapyV20
scipy
```

Required environment variables for `build_corr_history.py`:
- `OANDA_API_KEY` — your OANDA v20 API token
- `OANDA_ACCOUNT_ID` — your OANDA account ID
- `OANDA_ENV` — `practice` or `live`

These should already be set in your shell profile or `.env` file if the script was running before.

---

## Files involved

| File | Purpose |
|------|---------|
| `_worker.js` | Cloudflare Worker — `/api/cot-extremes` endpoint |
| `cot-extremes.html` | Standalone visualization page |
| `correlations.html` | Correlation matrix page (nav link to COT Extremes added) |
| `scripts/build_corr_history.py` | Python script to refresh `data/corr_history.json` |
| `data/corr_history.json` | Output of Python script, served by correlations page |
| `MD files/COT_INTEGRATION_NOTES.md` | Detailed technical notes on CFTC data format |
