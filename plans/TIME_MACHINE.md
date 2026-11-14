# The Desk Terminal time machine: data layer

*2026-11-14. Status: capture, storage and read API built and pushed; no UI yet. Nothing here has been seen running on Railway (see "Not verified").*

The idea (owner, 2026-11-14): play any terminal board back and forward in time, to see whether a currency bias, a credit reading or a rate moves stronger, weaker or jumps. That needs the values as they were published at the time. Most of them cannot be rebuilt later (the desk's morning book, the stress tiles, the Fed-path strip, the regime read), so this layer saves them as the day goes. The scrubber and the board redraws are a separate build on top.

Code: `js/deskSnapshot.js` (pure: what is kept, how it is shaped), `js/deskSnapshotStore.js` (capture, KV and R2 writes, reads), wiring in `server.js` (search `Desk Terminal time machine`), tests `js/deskSnapshot.test.mjs` and `js/deskSnapshotStore.test.mjs`, fixtures `js/deskSnapshot.fixtures.mjs`.

## Two tiers

| | CORE | FULL |
|---|---|---|
| What | one compact point of only the parts that move or cannot be rebuilt from stored prices: 20 sections (list below) | every terminal feed in full, except the exclusions below |
| When | every 5 min while the FX week is open (Sun 21:00 to Fri 22:00 UTC), every 30 min otherwise | once a London day, from 10:00 London |
| Size, measured 2026-11-14 on the live routes | **11.0 KB raw, 3.6 KB gzipped** (budget 8 KB gz; 40 KB raw is the trim threshold) | **520 KB raw, 114 KB gzipped** (153 KB as base64 in KV), 48 of 53 feeds answering |
| KV | one gzipped chunk per UTC hour, `desk_snap_core_<YYYY-MM-DDTHH>`, 16-day expiry | `desk_snap_full_<London date>`, 20-day expiry |
| R2 (permanent) | each finished UTC day, `archive/desk_core/<year>/<date>.json` | each day, `archive/desk_full/<year>/<date>.json` |

A day of CORE is at most 288 points, about 1 MB gzipped if every point were compressed alone, and far less in hour chunks because consecutive points are nearly identical.

### Why KV and R2 both

The owner asked for KV, and KV holds the rolling window. KV is the wrong place for permanence: every key expires (16 days here, so nothing has to prune it), and the repo's own comments put the Cloudflare free plan at about 1,000 writes a day, which is why a point is not written on its own. Points wait in memory and each hour's chunk is rewritten about every 20 minutes, so the capture costs roughly 72 to 96 KV writes a day (an hour that has just turned is also flushed), about 7 to 10 percent of that limit, plus one FULL write. R2 has no such limit and nothing in it is ever deleted, so each finished day is copied there once and the history keeps growing after KV forgets it. Reads use R2 for finished days (one object a day) and KV for today.

Which plan the Cloudflare account is on was not checked here. If it is the paid plan the budget is not a worry; the design still holds.

## How a capture works

- **Source: this server's own routes over loopback** (`http://127.0.0.1`), through the same `_dpFetchFeed` the Desk Pack uses. The brief asked for in-process builders. The terminal's feeds are route handlers inside a 47,000-line `server.js` with no shared builder to call, and rewriting about 20 of them to expose one would risk the live routes. Loopback costs no egress, the routes are cached, and a capture of 20 feeds took 6 seconds against production. Four feeds are fetched at a time.
- **Light on the server.** Feeds that move slowly are fetched every 10, 15, 30 minutes and carried in between (`every` in `CORE_FEEDS`). The desk book is fetched every 30 minutes, not every 5. A carried section keeps its original `asOf` and is marked `src: "carried"`, so a stale input stays visibly stale.
- **A failure is a gap, never a silent fill.** A feed that fails is listed in `gaps` with the reason (`timeout`, `HTTP 502`, `empty`, `not ok: ...`). If an older good section exists it is shown with its own asOf, marked carried, and the failure is listed beside it. A feed that has never answered leaves a hole. A capture where fewer than half the due feeds answer still records its point, counts as failed, and raises the health row.
- **Single-flight.** One capture at a time; the tick, the owner's manual capture and the flush each cannot overlap themselves.
- **Size guard.** A point over 40 KB raw loses whole sections cheapest first (`TRIM_ORDER`), records what it dropped in `trimmed`, and logs. The desk book, stress tiles, strength, Fed path and regime are never dropped. A chunk over 900 KB base64 is thinned and logged.
- **Never a blind write.** Before an hour chunk is rewritten it is read with `getStrict` (a backend failure throws, it does not read as empty) and merged by timestamp. After every write it is read back; a write that does not read back is reported as a flush error, because `kv.put` quietly falls to a local file when Cloudflare fails and that file dies with the next deploy. Unflushed points stay in memory and merge when KV answers again.
- **Redeploys.** Railway redeploys about 16 times a day. Unflushed points are written on SIGTERM (the shutdown handler calls `_deskSnapFlush`), a first capture runs 150 seconds after boot, and FULL asks KV whether today's exists before taking it, so a deploy does not take it twice. A deploy can still cost the points between the last flush and the kill if the flush does not finish in the 4-second shutdown window.
- **Switch.** Service id `deskSnapshot` (default on, not in the lean profile). `SVC_DESKSNAPSHOT=0` stops it; history already stored stays.
- **Pre-existing key trap.** `kv.js _noteWrite` records every write in the write-time ledger. 24 hour-chunk keys a day would grow that ledger for ever, so chunk writes are recorded under one name, `desk_snap_core_*`.

## The CORE point

```
{ v: 1, ts: <UTC ms>, ld: "2026-11-16" (London date), open: true|false (FX week),
  inputs: { desk: { asOf: "2026-11-13T06:57:38Z", src: "carried" }, stress: { asOf: ..., src: "live" }, ... },
  gaps:   [ { id: "fed", why: "HTTP 502" }, { id: "cb", why: "timeout", carried: true } ],
  trimmed?: [ "em" ],
  d: { <section>: ... } }
```

Sections (feed in brackets, how often it is really fetched):

| Section | From | Fetched | Holds |
|---|---|---|---|
| `stress` | world-stress | every capture | overall, score, each tile's level |
| `risk` | risk-flags | every | level, each flag `[on, value]`, the move index |
| `strength` | ccy-strength | every | per horizon (1H, 4H, 1D, 1W): scores per currency, leader, laggard, spread, flat flag |
| `desk` | desk-run | 30 min | the morning book: tone, currency biases, per market rating, conviction, size, exposure after caps, data-quality decision |
| `deskLive` | desk-update | 10 min | the session updates' ratings, when there are any |
| `watch` | desk-watch | 5 min | which watches are firing, gauge stages |
| `em` | em-gauges | 5 min | EM stress level, per pair last, 1-day change, z |
| `yields` | global-yields | 15 min | per country 2y, 10y, slope, gap to US, asOf |
| `credit` | credit-liquidity | 30 min | Credit Stress Index with components, Baa-10Y, G4 liquidity, net liquidity, gate z-scores |
| `creditBoard` | credit-board | 15 min | each ICE BofA OAS, z, 20-day change |
| `liquidity` | liquidity-board | 30 min | net liquidity, TGA, RRP, reserves with percentiles |
| `fed` | fed-path | 10 min | priced move per meeting (bp, probability, thin flag), Atlanta window odds, both asOf stamps |
| `regime` | regime-board | 10 min | quadrant, conformity, correlation regime, risk level, vol hot/cold counts, HMM quiet/active counts |
| `cb` | cb-board | 30 min | per bank: statement score, regime word, date, change, next meeting |
| `macro` | macro-scorecard | 30 min | composite per currency, the pair the scorecard picks, the driving factor |
| `releases` | releases-board | 10 min | COT crowding per currency, releases ahead, front-end rate changes |
| `curve` | curve-board | 30 min | 2s10s, 2s30s, ... in bp with changes and percentile; the curve move word |
| `vol` | vol-board | 10 min | VIX, VVIX, SKEW, MOVE ... last, percentile, z; VIX term ratio |
| `market` | wider-market | 10 min | the market-state name, broken links, lagging boards |
| `termprem` | term-premium | 30 min | ACM term premium, change, percentile |

`desk` holds ratings, convictions and sizes only; no plan, zone, invalidation, entry, stop, target or text (a test walks every section for trade keys).

### FULL: what is left out

`rates` (about 230 KB of FRED history, already in R2 `archive/series/fred`), `fx-fair-value` (85 KB; keeps its own forward record), `release-reactions` (200 KB; in `release_reaction_log_v1`), `lead-lag` and `autocorrelation` (recomputed from stored prices), `desk-news` (75 KB window; each headline and reaction is in `desk_news_record_v1`), `state` (350 KB; archived by the state engine) and `desk-run` (275 KB; already kept for good as `desk_run_<date>`; CORE carries its ratings). The reasons are in `FULL_EXCLUDED`. A test reads `desk-terminal.html` and fails if the page loads a route that is neither captured nor excluded, so a route added to the terminal cannot slip past.

Measured gaps in the first FULL: `desk-quality` and `pair-select` (404 on the open API: owner-gated), `desk-weekly` (the strategist writes Sunday afternoons), `desk-dayfc` (written after the full morning run), `xccy-basis` (the laptop pull is missing).

## Point-in-time rules

1. A point is the value as the feed published it at `ts`. A figure the source later revises is not rewritten in an old point; the later point carries the revision.
2. `inputs.<id>.asOf` is the source's own data stamp, never the capture time. A replay must show data age beside every value: a credit reading with `asOf` three days before `ts` is three days old.
3. A feed that failed is a `gap`. A reader must treat a hole as "unknown", not "unchanged". Where a carried section exists it says so (`src: "carried"`).
4. Sessions follow the London calendar (`ld`), the chunk and the R2 day follow the UTC calendar (`ts`). Do not join them as if they were the same day.
5. The values are descriptive. A replay shows what the desk said and saw; nothing in it is a signal, and the Evidence Book still says no direction cell has forward evidence.

## Read API

All GET, no model call, no upstream fetch. Open to a desk viewer (the viewer copy is described below).

- `GET /api/desk-snapshots?from=&to=&fields=desk,strength&step=15&max=300` : CORE points. `from`/`to` ISO or epoch ms (default the last 24 hours; at most 31 days). `fields` section ids (default all). `step` minutes; the step is widened so the answer holds at most `max` points (default 300, cap 2,000) and about 6 MB. Response `{ ok, from, to, stepMin, n, fields, sources: { "<date>": "r2" | "kv" | "kv+memory" }, widened?, note?, points: [...] }`. Today's points not yet flushed are included.
- `GET /api/desk-snapshots/full?date=YYYY-MM-DD[&feeds=risk-flags,fed-path]` : one London day's FULL snapshot, `{ ok, source: "kv" | "r2", snapshot: { v, ts, ld, deskRunDate, n, okN, gaps, ownerOnly, excluded, feeds: { "<route>": { ok, ms, json } } } }`.
- `GET /api/desk-snapshots/index` : `{ coreDays: [...], fullDays: [...] }`.
- `GET /api/desk-snapshots/status` : the service's own counters (last capture, failures, flush, archive, FULL).
- `POST /api/desk-snapshots/capture[?full=1]` : owner only (a POST is refused to a viewer): take a point now, or the day's FULL.

### Access

A desk viewer gets the stored data with the trade-level fields removed, by the same denylist as `js/deskViewerView.js` (`sanitizeSnapshot`): `size` is removed everywhere (a series of sizes reads as a trade-sizing record), plan and invalidation keys and trade sentences go, and the FULL snapshot loses `trade-watch`, `pair-select`, `desk-alerts`, `desk-score/record` and `desk-quality` unless the owner has switched the surface behind each on in the admin panel. The owner sees everything. Ratings, convictions, biases, exposure and every market reading stay.

## Health

Four rows in `/api/data-health` (Data Map): CORE capture, KV write, R2 archive of finished days, FULL daily snapshot. Each is judged on the last time that step worked. A step that has never worked is stamped 1970 after 20 minutes of uptime, so it reads dead, not "waiting". An error message is in the row's label.

## What can replay from what

- **From snapshots (cannot be rebuilt):** the desk's ratings, convictions and currency biases, exposure, the stress tiles, risk flags, regime stack, central-bank stance, the priced Fed path, positioning crowding, watch firings, macro composites, the data-quality decision. Snapshots begin on the day this is switched on; there is no backfill, and the Fed-path strip archive in `analysis/output/stir/` is the only older source for the path.
- **Rebuild from stored prices and series (no snapshot needed, but the snapshot is a cross-check):** currency strength (σ) from OANDA bars, the yield curve through time (the curve board already holds 36 month-ends), credit OAS (FRED, archived in R2), liquidity, term premium, global yields, the correlation matrix, VIX and the vol gauges, COT, BIS credit. For these the replay should read the series and use the snapshot only for what the page said at the time.
- **Live only (nothing to replay):** the news wire, the live chain window, the live strength tick, calendar countdowns. The full text of each morning's analysis is already kept one day at a time as `desk_run_<date>`; a replay can open it by date.

## Live candidates (read-only audit, 2026-11-14)

Feeds whose source moves intraday but which the terminal shows from a daily bar, a long cache or the dawn run. The terminal itself reloads every 5 minutes while visible (`desk-terminal.html` `setInterval(load, 5 min)`), so the slowness is in the server caches and the data's own cadence, not in the page. Cache times read from `server.js`. No code was changed.

| Feed | Today | Why it is not live | Candidate |
|---|---|---|---|
| Desk bias and ratings (`desk-run`) | the dawn read; `desk-update` re-reads at 08:05 London and 14:35 New York | an analyst read, scored once; between slots it is frozen | a price-based intraday read from candles, shown beside "was" (the owner's idea). Size M. Needs its own label: price-based, live. |
| EM gauges (`em-gauges`) | OANDA daily bars, cached 2 h | `last` is the last daily close | live price from OANDA, as the strength board does. Size S. |
| Wider market (`wider-market`) | daily closes, cached 60 min, board dated yesterday | built from daily series | intraday for the index and FX tiles from OANDA. Size M. |
| Global yields (`global-yields`) | official daily prints, cached 4 h | FRED and the Bundesbank publish once a day | implied intraday US 2/5/10/30y and Bund 10y from CFD prices (`js/yieldLegs.js`, already used by the Chain Live window). Size M. |
| Curve board (`curve-board`) | FRED daily, cached 1 h | same | the same implied intraday yields for the US curve slopes. Size M. |
| Correlation regime and HMM counts (`regime-board`) | corr rebuilt about every 6 hours (`hedge-alerts` stamped 14:47 on a Saturday), HMM and vol hot/cold on daily data, board cached 10 min | daily inputs | correlation from M15/H1 bars is cheap. The intraday HMM jobs are switched off (`hmm5m`, `hmm1h`, `hmm30m`, `hmm2h` default off since 2026-09-16), so an intraday regime would be a new, unvalidated read: label it descriptive. Size M. |
| Vol gauges (`vol-board`) | VIX, VVIX, SKEW, MOVE from daily closes in the state document (10-minute cache) | daily | an intraday VIX is available from Yahoo (the ^TNX capture proves intraday access); VVIX and SKEW are daily from Cboe. Size S for VIX only. |
| Session heat (`session-heat`) | cached 24 h, built from stored hourly history | a profile, not a live reading | today's range so far against the normal for this hour. Size M. |
| Fed path (`fed-path` zq) | the laptop pulls ZQ nightly (`run_zq.bat`, about 22:30 UK) | IBKR needs the laptop; the 30-minute rate-line job covers SOFR and Euribor only | ZQ on the same 30-minute job. Size S, but laptop-bound. |
| FX options skew (`options-skew`) | the laptop's IBKR pull, 222 hours old when the vol board was built | laptop-fed, irregular | run the pull on a schedule. Size S, laptop-bound. |
| Dealer gamma and OI (`hedging-summary`, options tab) | CME settlements, nightly | CME serves one settle a day | the Cboe 15-minute SPX/NDX/SPY/QQQ option log already exists (the "Day drift" card, 05e); show intraday gamma for the indices only. Size M. |
| Credit board, liquidity, term premium, macro scorecard, COT, BIS credit, nowcasts | daily, weekly or monthly sources | **nothing to gain**: the sources do not move intraday | none. Faster polling would only show the same number. |
| Currency strength, the Chain live window, calendar actuals, news wire, release reactions, desk watch (15 min) | already live or event-driven | nothing stale | none |

`risk-flags` and `world-stress` recompute on request; which of their inputs are intraday was not traced (a mix of daily FRED series and the VIX).

## Not verified

- Nothing has run on Railway. The capture, the KV and R2 writes, the SIGTERM flush and the routes were tested with fakes and against copies of live payloads, not on the deployed server.
- The sizes above are from one read of the live routes on a Saturday, with the market shut. A busy Monday has more flags on and more changing values; the 40 KB trim threshold is about 3.6 times the measured point.
- A real redeploy has not been watched to see whether the shutdown flush finishes inside the 4-second window.
- Whether the Cloudflare account is the free plan (1,000 writes a day) was not checked.
- The loopback load of a capture on a busy server is not measured. It reads cached routes, but the first capture after a boot can trigger a cold build of `credit-liquidity` and `curve-board` (about 20 seconds on a cold server).
- The desk run is off by default (`SVC_DESKRUN`), so a morning book may not exist on a given day; then `desk` carries the last one with its own asOf and a failing `desk-run` shows as a gap.
- Chain verdicts per window are computed in the browser from price legs (`js/macroChain.js`), not on the server, so they are not captured. The `watch` section carries the desk-watch states, which is what the Changed tab's "chain links that broke" reads.
