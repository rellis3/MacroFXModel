# OI Recon — survey before pipeline

**Status: recon only. Built 2026-07-29. Wired into nothing.** It writes files to
`oi_recon/out/` and nowhere else — not the repo, not localStorage, not KV, not
the dashboard. Deleting `out/` undoes it entirely.

## The question it answers

The OI module currently runs on hand-pasted tables. A refresh for one instrument
needs three things, per `js/fixtures/`:

| Table | Carries |
|---|---|
| Term-structure settlements | expiry code, DTE, expiry date, future price, straddle, IV, call/put OI + chg |
| Per-strike chain (one expiry) | strike, IV, call OI, put OI — this drives max pain and the walls |
| Heatmap matrix | OI across strike × expiry |

Recon asks: **which source gives all of that, for all 11 CME-listed instruments,
without a human in the loop?** It does not build the fetcher. Getting a wrong
answer here and building on it is how you end up with a pipeline that quietly
serves the wrong expiry — the exact failure `js/oiPasteContract.test.mjs` exists
to catch.

## Run order

```
pip install -r requirements.txt && playwright install chromium

python recon.py --probe --limit 1      # is anything reachable with no login at all?
python recon.py --login                # opens Chrome; YOU sign in; session persists
python recon.py --browse --only "EUR/USD"
python recon.py --diff                 # grades the captures against the fixtures
```

Or `run_recon.bat probe|login|browse|diff`.

Start with **one** instrument. If EUR/USD doesn't yield a complete strike ladder,
the other ten won't either, and there's no point crawling them.

## How discovery works

`--browse` does not parse the page for known URLs. It opens the real page in your
logged-in Chrome and **records every JSON response the page fetches itself**,
scoring each by how many of the seven required fields it contains. The output is
what today's endpoints actually are, including their POST bodies — not what a
URL was called last year. It also dumps every rendered table (all frames, so
QuikStrike's iframe is included) as **tab-separated text**, which is precisely
what `parseOIMatrix` / `parseIVSettlement` already consume.

That last point is the design constraint worth keeping: whatever ends up
fetching this data should emit the same TSV the textarea accepts and write the
same KV key the paste path writes. Then the source is swappable, manual paste
stays as the override, and the vendor-oracle test keeps guarding the result.

## Reading the verdict

A dumped table replaces a manual paste **only** if it has every strike (not the
~20-row visible window), both call and put OI, and the expiry code. A partial
ladder is worse than no automation: max pain and the walls would move, plausibly,
and silently.

## Legal / practical position

cmegroup.com's Data Terms of Use prohibit automated retrieval. Verified
2026-07-29: scripted requests from a flagged IP get a 403 whose body reads *"This
IP address is blocked due to suspected web scraping activity… Use of scripts,
software, spiders, robots… is strictly prohibited."* So:

- This tool is single-pass, serialised, delayed, and makes **no** attempt to
  evade detection — no UA rotation, no proxies, no stealth patches.
- It does **not** defeat the login. You sign in by hand in a visible window; the
  script reuses the session Chrome stores in `.chrome-profile/` (gitignored — it
  holds live cookies; never commit or share it).
- The durable answer is a sanctioned source: CME's published end-of-day
  settlement/bulletin files, CME DataMine, or a broker/vendor API (IBKR,
  Databento). `--probe` tests the free-file routes first for exactly that reason.

## The overnight pipeline (built 2026-07-29)

Recon answered its question, so there is now a fetch path that does not scrape any
rendered table:

```
CME settlement JSON  ->  matrix_build.py  ->  *_matrix.tsv  ->  validate_capture.mjs
   (per-strike,           (synthesises the      (paste-format      (gate: real parser,
    named fields)          exact TSV js/oi.js    text)              non-zero OI, no
                           already parses)                          truncation)
```

```
python fetch_oi.py --selftest                 offline, no network - proves synthesis
python fetch_oi.py --discover                 learn product ids (once, ~11 page loads)
python fetch_oi.py --fetch --pair "EUR/USD"   one instrument
python fetch_oi.py --fetch --headless         the overnight run
```

**Why JSON, not the widget.** Verified 2026-07-29: a QuikStrike settlements table
copied under a non-Standard `Report:` setting carries extra Basis-Point and
Black-Scholes volatility groups. It parses to 67 strikes with correct strikes and
correct IV and **zero open interest**, silently, because the positional OI columns
land on vol figures. The JSON has named fields, so there is no column to misread.
`validate_capture.mjs` exists to catch exactly that class of failure and refuses
any table whose OI is zero, fractional, or truncated.

**Two expiries minimum.** `js/oi.js` locates the matrix header by scanning for a
row of >=4 cells that are all `C` or `P`. A single-expiry matrix emits only `C`,`P`,
the header is never found, and `parseOIMatrix` returns null. `build_matrix_tsv`
raises rather than writing a file that looks fine and parses to nothing.

**DTE comes from a seed file.** The settlements payload has no expiry date, so
`code_dates/<SYM>.tsv` (a Settlements term table captured once via
`recon.py --record`) supplies code -> expiry date. Missing seed = DTE labels and
column ordering omitted, never guessed: walls are chosen by near-money OI, not by
column position, so the levels stay correct and only the labels degrade.

### What is NOT built yet

The fetch produces `rawOI` and `rawVol`. To be genuinely "ingested ready for the
morning" still needs, in order:

1. **`buildOIEntry` extracted from `oiAnalyse`** (`js/oi.js`). `oiAnalyse` is
   DOM-bound, so nothing headless can currently produce the ~45-field derived
   entry (`maxPain`, `exposures`, `gexProfile`, `gammaFlip`, `refMove`, …). The
   pure core wants lifting out so the modal AND a Node ingest both call it. Do NOT
   reimplement that math in Python — that is the drift failure `TRADABILITY_REVIEW.md`
   documents.
2. **KV write** to a shadow key (`oi_store_py`), added to `isAllowedKVKey` +
   `_CF_EXACT`, deliberately left OUT of `PERMANENT_KEYS` so the test key expires
   on its own. `pylego/kv.py`'s `KvClient.put_json` already speaks `/api/kv/set` —
   no new endpoint needed.
3. **Paste-vs-fetch comparison** on that shadow key before anything writes
   `oi_store`.
4. **Scheduling** — after CME's evening publish (`updateTime` in the payload was
   23:55 UK on the captured day).

Also missing: the **OI-change matrix** (`rawChg`). It needs the prior trade date
fetched and differenced — cheap to add, doubles the request count, not done yet.
And **implied vol**: not in the JSON at all. Per-strike IV still requires the
QuikStrike chain (`Report: Standard`) or a Black-76 inversion off `settle`, which
would not be bit-identical to CME's published Volatility column and would need
validating against the fixtures first.

## Scope note

`products.py` covers 11 instruments, not the 13 in `OI_CME_PAIRS`. **DE30/FDAX
options are Eurex** and **UK100/FTSE100 options are ICE** — no cmegroup.com URL
will ever return them. They need their own sources, and are marked out of scope
here rather than reported as failures.

Three FX pairs are CME-inverse (`USD/JPY`, `USD/CAD`, `USD/CHF` list as JPY/USD,
CAD/USD, CHF/USD). Strikes must be inverted before they mean anything against an
OANDA pair — a trap that only bites once a fetcher exists, flagged in the
registry now so it isn't discovered later.
