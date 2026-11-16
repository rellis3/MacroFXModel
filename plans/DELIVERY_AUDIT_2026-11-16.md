# Delivery audit, 13 to 16 November 2026

Hand-kept. Written 2026-11-16 about 14:00 UTC against origin/main `b925e89e`. Read-only: no behaviour code was changed.
Why it exists: the owner thought the ghost walk was done overnight and it only landed today, so "reported as shipped" and "what the owner can actually see" need checking item by item.

How each column was checked:
- **Commits**: `git log origin/main`.
- **Visible to the desk login**: the live `/api/desk-access` as an unauthenticated session (that is what a desk login gets: the registry defaults overridden by the owner's saved switches). The owner always sees every preview.
- **Live on Railway**: probes of routes that only exist in recent commits. There is no build SHA route (`/api/version` returns only a version name and the process start time), and the static JS and HTML are behind the login, so the exact commit that is live cannot be proven from outside. Railway restarted at about 13:41 UTC today (snapshot `bootedAt`), which fits a deploy of the 13:34 push, so the newest commits are probably live. UNVERIFIED.
- **Verified how**: "owner screenshot" = the owner showed it rendered; "headless" = a fork drove real Chromium against live data as a stand-in owner; "tests" = node tests over a stand-in page (proves wiring, not looks); "nothing" = not run.

## 1. Headlines

1. **Live and seen by the owner:** command box, linked chip, alerts button, the Chart tab (KLineChart), the Insight tab (Unusual now and Gold were screenshotted), the closed-market chip, the Pair "What drives this" panel, the world-stress strip.
2. **Live but only ever tested over a stand-in page:** Workspace, Monitor, News saved searches, Calendar drills, favourites, Deep dive and the tab regrouping, Back button, the terrain live line, alerts, export (CSV and PNG partly headless), the as-of docked bar (headless only).
3. **The desk login can already see six preview surfaces** (listed in section 4). Someone switched them on. The other eight previews are hidden from it.
4. **CI on main is red.** Only one of the last 30 Tests runs on main passed (`469792b`). Both jobs fail (section 3). One cause is new today: the gold ETF issuer hosts are not in the feed registry.
5. **Daily and brief issues open with no login and print trade plan wording** (entry zone, invalidation, size). Confirmed live today. The v2 terminal edition is hidden correctly. Owner decision pending.
6. **Not delivered, though talked about:** event replay, dense monitor mode, "what changed since I last looked", slim "What drives this" on Pair, the risk-flag history strip, OI drills, the BIS strip, consensus feed, ECB/BoE/BoJ probabilities, sector heat map. Full list in section 5.

## 2. Deployment evidence (Railway, probed 13:41 to 13:50 UTC)

| Probe | Result | What it proves |
|---|---|---|
| `/api/replay/ghosts` | 400 "unknown market" (no parameters) | the ghost walk route (a382dbe5, 13:07) is deployed |
| `/api/replay/curve` | 200, 90 days of frames | replay step 1 deployed |
| `/api/gold-etf-flow` | 200, one dollar point ($188.27bn as of 2026-11-13) plus a tonnes block | the issuer fallback (5c6b67d9) is deployed and works from Railway |
| `/api/ccy-strength` | 1H, 4H, 1D, 1W all available; 1D from 2026-11-13 22:00Z | the Monday 1D fix (434202af) is live |
| `/api/desk-snapshots/status` | capturing every 5 minutes, 20 of 20 feeds, no failures, R2 archive on | snapshot capture is healthy |
| `/api/desk-snapshots/index` | 3 core days, 3 full days | the time machine has about 2.5 days of record |
| `/api/vol-clock`, `/api/live-layer`, `/api/fed-path`, `/api/desk-bars?inst=GOLD` | 200 | earlier boards still served |
| `/api/fed-path` | `fetchedAt 2026-11-13T20:44Z`, `asOf 2026-11-12` | the laptop Fed pull has not refreshed since Friday evening (UNVERIFIED whether Monday's nightly run is due) |
| `/api/desk-alert-rules` | 401 "sign in first" | alert routes closed to anonymous |
| `/api/newsletter/archive` | 200 with no login, 78 issues, kinds daily, desk, desk-brief, desk-picto, desk-terminal, desk-evening, weekly | open archive; `desk-terminal2` is correctly absent |
| `/api/newsletter/issue?id=desk-terminal-2026-11-16` | 200, 298 KB, contains "entry zone", "invalidation", many "size 0.x" | classic terminal edition is open and prints trade plans |
| `/api/newsletter/issue?id=desk-brief-2026-11-16` | 200, contains "SIZE 0." and "Wrong if" | the brief is open and prints trade wording |
| `/api/newsletter/issue?id=daily-2026-11-16` | 200, none of those words | the daily is clean on those words |

## 3. CI on main (public GitHub Actions API)

Latest completed Tests run, `db1d469d` (13:36): both jobs red. The run on `b925e89e` was still in progress when checked.

| Job | Failing check | Cause | Fix |
|---|---|---|---|
| javascript | `js/dataFeeds.test.mjs` "the server fetches from no host that the registry does not describe" | the gold ETF fallback fetches `api.spdrgoldshares.com`, `www.spdrgoldshares.com`, `www.ishares.com` (and a test placeholder `x.invalid`) and no feed in `js/dataFeeds.js` lists them. Reproduced locally at HEAD. Red since 5c6b67d9 (09:37). | add the hosts to the gold ETF feed's `hosts` (or IGNORE_HOSTS for `x.invalid`) |
| javascript | `js/infoMap.test.mjs` "1 problem" on `db1d469d` | the generated Info map went stale again (a parallel push landed between regeneration and push). The same test passes at HEAD `b925e89e` locally, so it may already be fixed. | the standing fix: have CI or the test regenerate it |
| python | `forge.verdict_gate_test::test_banked_vol_layer_studies_have_passing_proofs` | `vol-layer-rule-a-confirm-s1: no checks.json` (five banked ids have no proof run) | owner decision: run the proofs the proper way, or move those ids |

## 4. Matrix: what was reported shipped, where it is, who sees it

"Desk login" is the live `/api/desk-access` answer. Items marked ON are already visible to the desk login; OFF are owner-only until switched on (Access page, or the Preview features panel at the top of the Info map tab).

| Item | Commits | Where the owner finds it | Desk login | Live | Verified how | Gaps and "said done, only partly" |
|---|---|---|---|---|---|---|
| Command line and top-bar box | 03da9ef8, b10c76e5 | "Command /" box in the top bar, or `/`, backtick, Ctrl+K | ON (`widget.cmdline`) | yes | owner screenshot, tests | none known |
| Linked selection and its ? help | 03da9ef8, a4053e82 | the "Linked: ..." chip in the top bar | OFF (`widget.linked`) | yes | owner screenshot, headless popover | Currencies and Charts tabs not wired |
| Workspace | 0a1e9d89 | Workspace tab | ON (`tab.workspace`) | yes | tests only | never dragged in a browser; Insight panels cannot be tiles; KV key desk_workspaces_v1 |
| Alerts (bell) | d89a6e0f, 99594ce6 | bell button, `ALERT` commands | OFF (`widget.alerts`) | yes | tests only | no live Telegram send ever made; owner-only writes now enforced server-side |
| Chart tab (KLineChart) | aabe7363, 6f271fc1 | Chart tab | OFF (`tab.kchart`) | yes | owner screenshot (before the settings popover) | the new indicator settings popover and KLine accepting the new numbers: not seen |
| Monitor | d3ce111d | Monitor tab | ON (`tab.monitor`) | yes | tests, headless layout only | live feed shapes read from code, not checked; dashes if they differ |
| News saved searches, keyword alerts | 0d88660d, 99594ce6 | News tab bar | OFF (`panel.news.saved`) | yes | tests only | attaches on first visit to the News tab; per-browser for a desk login; no live alert sent |
| Export (CSV, PNG) | 39357efc, 8ebef683 | card headers on Monitor, Insight, Calendar, Currencies | OFF (`widget.export`) | yes | headless (mounts, CSV); PNG fixed in a382dbe5 | PNG on most boards untested |
| Calendar drills | 08dc7b47 | top of the Calendar tab, a drill button per release | OFF (`panel.cal.drills`) | yes | tests, headless layout only | release small multiples not built; scorecards only appear 30 to 60 minutes after a print |
| Insight tab: Unusual now, Cross-asset, Sector rotation, Currency matrix, Gold, Level reach, Risk flags, Economies | 11364634, 90baa045, 10ffd831, 848f945b, b9e3737f, 0013e19c, 8ab440fe | Insight tab pills | ON (`tab.insight`) | yes | owner screenshots (two boards, found the overflow bugs); headless 0 overflow after the fix | risk-flag history strip not built; level reach has no "by tomorrow"; Economies and flags not on Overview or Currencies; gold tonnes history is days long |
| Pair favourites, Assets favourites | 161e8f61, a8e1ef97 | stars on the Pair page and Assets cards, `FAV` | ON (`panel.pair.favourites`, `panel.asset.favourites`) | yes | tests only | star placement on the card header unchecked in a browser |
| Flow review 2 to 6: card opens Pair, Back button, History rename, Deep dive, tab strip | e42e00c1, 2c10a383, 0e9747c8, 8dc165ef, af5efa7e | Pair page, History tab, Deep dive tab, the grouped tab row | Deep dive OFF (`tab.deep`); the rest ON | yes | tests only | slim "What drives this" not done; F7 to F10 not done; group hiding in the strip reads computed styles (most likely to need a click-through) |
| Terrain live price line | 89c8d290 | Options tab OI terrain, OI Lab | ON (`widget.terrainlive`) | yes | stand-in canvases, smoke on real entries | real render never seen; tag may collide with the left curves |
| Replay on a visualisation (6 visuals) | 7b6fca2e, a6c5f9e7, c47887bf, 93ff617e, 438aebd7, 4acf6009, e6f7a039 | "Replay" button on: Overview strength board ("1H window" heading), Macro > Rates & curve > curve through time and Atlanta Fed window odds, Insight cross-asset, regime card, Assets vol clock | ON (`widget.replayviz`) | yes | headless found 3 mount points (strength, curve, Fed odds, vol clock); regime and Insight buttons not opened in a browser | the owner could not find the buttons at first; the Preview features panel now says where they are |
| Ghost walk | a382dbe5, a68c994c, a67c4331 | "Ghost walk" button on the OI terrain card (Options tab); `GHOST NQ` | ON (`widget.ghostwalk`) | route live | headless against a local copy; route probed live | first real call needs about 90 days of OANDA bars (slow first open); only NQ measured for usable days (50); event-day filter not built |
| Time machine (as-of clock) and docked time bar | b2dfe51a, b925e89e | "Time machine" in the top bar, the bar at the bottom, `ASOF` | OFF (`widget.asof`) | probably (13:34 push) | headless, nine states | 3 days of record only; setting a time reloads the page; lazily built tabs while playing; real touch drag |
| Terminal newsletter v2, pictogram, Atlas buttons, Telegram send | afc0a8ab, c14872a2, 7c68d5c6, ae5a30f3, 144bfb14 | Atlas page, Newsletter panel, "Terminal edition v2" | owner only by design | yes | headless Chrome print | a real Atlas click, Telegram send and Discord preview never done; the build list says the setups panel and the archive decision are open |
| Gold ETF fallback and cache fix | 1b9ffcbc, 5c6b67d9 | Insight > Gold, `/api/gold-etf-flow` | follows Insight | yes, working | live probe | CI red because the hosts are unregistered; IAU has one read so far |
| Monday 1D strength window | 434202af | Overview price read, Currency matrix | n/a | yes | live probe | none |
| Overflow fixes (Insight pills, gold card, stress strip) | 8ab440fe, 952a7000 | Insight tab, every tab at phone width | n/a | yes | headless 1440, 1100, 390 in three themes | the Overview page is still wider than the viewport (1477 on 1440, 414 on 390); a fork was assigned, no commit at HEAD |
| Pair chart colour fix | 59786c66 | Pair page chart | viewer-visible | yes | tests | the candle-size pills (4c1b84cc) were broken on this chart from 13 Nov until this fix; not re-seen in a browser by the owner |
| Fed path to yields board | 85d86534 | Macro > Rates & curve | viewer | yes | not re-checked | Fed pull stale since Friday evening (above) |
| Six earlier boards (credit and liquidity, curve through time, regime, releases and positioned, strength sigma, fear complex) | edb38083, f7419269, 61b46e8e, b89656b3, others | Macro sections, Overview | viewer | yes | partly owner-seen | the 1H and 4H strength windows are empty for the first hours after the Sunday open |
| Snapshot capture | e550c8de | `/api/desk-snapshots/*` | n/a | yes, healthy | live probe | 2.5 days of history only |
| Closed-market display | e29e0ca9, 48a69380 | "CLOSED, AS AT FRI 22:00 UTC" chip | viewer | yes | owner screenshot | none |
| Intraday live layer | f6c42a7e | boards on Overview | viewer | yes | live probe | wider-market tiles unverified with an open market |
| Macro five sections | 33f159b9 | Macro pills | viewer | yes | tests | lazily built; not checked with a login |
| Replay tab | 03f69c4c, 4c6e6cc3, d311fbbf | Replay tab | viewer | yes | tests | owner said it was not what they imagined; never reworked |
| Candle size pills | 4c1b84cc | Pair and asset card chart | viewer | yes | tests | see Pair chart fix |
| Human "What drives this" | 77263cbf | Pair page | viewer | yes | owner screenshot | not slimmed; reasons still long |
| Tone timelines, vol clock, macro strip | 1f2b326f, 47d131ca, 5339cfef | central-bank tiles, Assets, Currency cards | viewer | yes | partly owner-seen | none new |
| Bias engine v1 and "one desk bias" | 27875db7, e1572e23, f6246adb | other session | unknown | unknown | not audited | out of scope here; touches the cards, so the owner should confirm what it changed |
| Other CI fixes | cfc4cb04, e28a7834, 47cea0c4 | workflows | n/a | yes | CI | Python gate and the new dataFeeds failure (section 3) |

## 5. Reported or promised but not done

Terminal features:
- Event replay (build list section 6, row 2).
- Ghost walk: event-day filter (no per-day event calendar stored).
- Dense monitor mode; "what changed since I last looked" feed.
- Slim "What drives this" on Pair; F7 Overview at a glance; F8 one home for strength; F9 Analytics split; F10 spread Insight boards.
- Risk-flag history strip (flags are in the snapshot archive, nothing reads it); OI drills; BIS heat strip; Daily Read tags; weekmap strip.
- Release small multiples; release detail with consensus (paid feed, owner decision); ECB, BoE and BoJ probabilities (laptop task or a free site whose terms are unchecked); sector heat map (source decision; free tiers may be non-display).
- Replay tab rework (the owner's original intent is now covered by the visual replays, ghost walk and the time machine, but the tab itself is unchanged).
- Data rows still TODO: cross-currency basis and swap spreads as boards, CDS or sovereign spreads, CFTC board (check the catalogue; the Gold board already shows CFTC).

Newsletter and delivery:
- Setups panel on the pictogram (decision), "desk's own book" section (decision), delete the classic edition, server-side PNG, email, a live Telegram send, a Discord preview.
- Archive access: the daily, brief and classic terminal issues open with no login and the brief and classic print entry, invalidation and size (confirmed today). Owner decision.

Plumbing:
- Python proof gate; dataFeeds hosts; Info map self-regeneration; a build SHA route so "is it deployed" can be answered.
- Move the Atlanta Fed pull to Railway; a laptop task for central-bank futures and skew (none is scheduled).
- Vertical split into its own URL and repo: parked by the owner (memory project_terminal_scope_noncommercial).

Unverified everywhere: a real owner login, phone, the Amber, Green console, Colour-blind and High-contrast themes, a live open market, lazily built tabs while playing.

## 6. What the owner may think is delivered but a desk login cannot see

Hidden from the desk login right now (switch names, flip in the Preview features panel or the Access page): `tab.deep`, `widget.export`, `panel.cal.drills`, `panel.news.saved`, `tab.kchart`, `widget.asof`, `widget.alerts`, `widget.linked`.

Already ON for the desk login per the live list: `widget.cmdline`, `tab.monitor`, `tab.workspace`, `tab.insight`, `widget.replayviz`, `widget.ghostwalk`. Check this is deliberate: ghost walk only existed from 13:07 today, and Workspace and Monitor were never seen in a browser.

Owner-only by design, not switches: the Atlas v2 newsletter buttons and archive kind, alert writes, the Preview features panel.

## 7. What else could we build (ranked)

Each is from data and papers already held. "Decision" means it needs an answer from the owner first. Data depth marked UNVERIFIED was not measured.

| # | Idea | Value | Effort | Decision? |
|---|---|---|---|---|
| 1 | Event replay: pick a release or meeting, replay the terminal from one hour before to two hours after, the last five of the same type as ghosts | high: timing and size are what the tests support | M | no |
| 2 | OI terrain replay day by day: the expiry ladder (8, 7, 6 ... days to expiry) moves up as time passes, walls shift, price walks across them, touches counted with the chance rate. Builds on the ghost walk core and 89 stored OI dates for 11 markets | high | M | no |
| 3 | Call and put OI speedometer replay: the gauge grows and shrinks day by day, with price | medium | S to M | no |
| 4 | IV smile and surface replay by day. Depth UNVERIFIED: the Cboe 15-minute log started 2026-11-01 for SPX, NDX, SPY, QQQ only; CME skew archive start not measured | medium | M | no |
| 5 | Bias engine and macro scorecard over time (bias strip only since 2026-11-14; macro scorecard history exists, exact key unverified): a replay of how the lean and scores changed through the day and across days | medium; improves daily as days accrue | M | no |
| 6 | Ghost walk for FX pairs and gold with the session and strength overlays; event-day filter once an event calendar is stored | medium | M | no |
| 7 | Build SHA and deploy time shown in the terminal footer and `/api/version` | removes the "is it deployed" doubt | S | no |
| 8 | Risk-flag history strip and "what changed since I last looked", both from the snapshot store (need more days first) | medium | S to M | no |
| 9 | Dense monitor mode; Pair "What drives this" short form | medium | S | no |
| 10 | Sector treemap, ECB/BoE/BoJ probabilities, consensus column | high but blocked | M | yes: source and terms |

Housekeeping before any of this: register the gold ETF hosts (turns the JS job green), settle the Python gate, make the Info map self-regenerate, decide the archive access.
