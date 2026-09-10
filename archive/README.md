# Archive

Stale files moved out of the active set (kept for history/reference). Nothing
imports or links these.

| File | Was | Superseded by |
|---|---|---|
| `Range_Extension_Backtester_v5_2_ZSCORE.html` | manual export of an old z-score range backtester | `zscore-backtest.html` + `js/zscoreSpreadEngine.js` |
| `asia_range_backtest.py` | old EURUSD-only, deviation-based Asia backtest (pre-module era) | `asia-range-backtest.html` + `js/asiaRangeEngine.js` + `js/confluenceModules.js` |
| `todayv2.html.bak` | a full fork of `today.html`, uploaded via the GitHub web UI 2026-08-18 (`d674010`) and never linked from anywhere — not the Command Hub, not the Site Map, not `today.html` | `today.html` |
| `todayv2-iframe-shim.html` | the earlier V2 attempt: an iframe around `today.html` that restyled it from the outside, presentation only | `today.html` |
| `COG_oi_guide.html` | stray third-party "C.OG OI Dashboard" guide download that was sitting in `.claude/COG_OIdashboard/` | reference only — the repo's own OI work lives in `oi-dashboard.html` / `oi-zones.html` |

## Why `todayv2.html.bak` keeps its `.bak` suffix

It is the one file here that was actively harmful rather than merely stale. Nothing
linked to it, so nobody ever opened it -- but it still matched `*.html`, so
search-and-replace sweeps aimed at `today.html` kept landing in it. Two such edits
are in its history (`7ff0582`, `2568273`), which left it looking maintained in git
log while it drifted ~4,500 lines behind the real page. The suffix takes it out of
that glob for good. Restoring it means renaming it back, deliberately.
