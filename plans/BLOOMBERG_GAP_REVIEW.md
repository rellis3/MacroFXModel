# Bloomberg Terminal against the Desk Terminal: gap review

Dated 2026-11-15. Hand-kept. Written for the owner. Read-only review of the repo (surface registry, Info map, data catalogue,
build list, the News and Calendar code) set against what Bloomberg's analysis functions are described as doing.

How sure is this? The Bloomberg side comes from university guides, course handouts and a few Bloomberg articles, not from a
Terminal. Function codes below are the ones those sources agree on. Anything they disagreed on or did not cover is marked
UNVERIFIED and no code was filled in from memory. Our side was checked in the repo.

Rules that apply to every item: analysis only for the desk viewer (no trades, cost or private tooling); direction claims keep
their evidence chip and are never turned into signals; range, timing and size claims can validate; a null is shown as a null.

## 1. Area by area

Gap: none, partial or missing. Effort: S is days, M about a week, L more. "Held" means the data is already in the repo or its
stores.

| Area | Bloomberg gives (function) | We have (surface, status) | Gap | Effort | Data | Evidence note and viewer fit |
|---|---|---|---|---|---|---|
| FX rates grid | A matrix of every currency rate (FXC), a ranker of currencies (WCRS), a forward calculator (FRD) | Currency strength sigma board with 1H/4H/1D/1W pills, 28 pairs (panel.ov.ccystrength, DRAWN); no cross-rate grid | partial | S | Held (28 OANDA pairs) | Strength is a ranking, not a signal. Fits the viewer. |
| FX forecast | FX rate forecast model: a bell curve of implied volatility with a probability calculator (FXFM); analyst forecast composite (FXFC) | Vol clock (IV against forecast), range forecast with calibration, option walls in expected moves (panel.asset.volclock, panel.macro.walls, DRAWN); no "chance of reaching level X by date" calculator | partial | M | Held (IV, calibrated range forecast, reach calibration) | Reach and range validate; direction does not. Fits the viewer. FXFC needs paid analyst data (see section 5). |
| Rates and curves | Government yield curves and curve history (GC is listed by sources but not described: UNVERIFIED), US Treasury and money markets monitor (BTMM), swap manager (SWPM) | Curve through time, global yields, term premium, 5y5y, JGB card, xccy basis, auctions (panel.macro.curve, globalyields, termprem, inflation, jgb, xccy, DRAWN) | none for curves; partial for money markets | M | Held (FRED, MoF, Treasury, laptop IBKR for SOFR) | Context only. Swap pricing is not wanted. |
| Rate expectations | World interest rate probabilities from futures and options (WIRP), described by one critic as depending on an assumption about where the effective rate averages | Fed path per meeting from ZQ, priced policy path pair by pair, central-bank futures (panel.macro.fedyields, pathdiff, cbfutures, DRAWN, laptop-fed) | partial (Fed deep; other banks thinner) | M | Held but laptop-dependent, so it can go stale | Market pricing is context. Stale guard exists (data-age chip). SF Fed publishes a free rate distribution to cross-check. |
| Economics and releases | Economic calendar (ECO), country statistics (ECST) with economist estimates history, per-release consensus | Calendar with expectations against reality, release surprises, nowcasts, eight macro engines, scorecard (tab.cal, panel.macro.engines, scorecard, nowcasts, DRAWN) | partial: no per-release history strip, estimate range or country statistics browser | M | Surprise store is US vintages only (ALFRED); calendar forecast held | Surprise SIZE validates for range (surprise-size VALIDATED); direction null. |
| Central banks | Meeting and policy analysis pages by bank (sources do not name the codes: UNVERIFIED) | Tone timeline per bank, statement diffs, Beige Book, speakers, speech drift, FOMC day clock (panel.macro.cbboard, cbcards, speechdrift, fomcstrip, DRAWN) | none | none | Held | Tone is context only (cb-tone-direction NULL). Ahead of Bloomberg in showing that. |
| Equity index and options | Option pricing (OVME), market map by sector (IMAP: sources disagree what it shows, UNVERIFIED), earnings and analyst recommendations (ANR, equities only) | Options tab, OI walls, dealer gamma, vol clock for NQ, SPX, ES (tab.options, panel.macro.walls, DRAWN); earnings feed exists but only analysts read it (earnings-ahead, PACK); no sector map | partial | S for earnings chips, M for a sector map | Earnings held; sector data needs a feed (Yahoo sector ETFs) | Earnings chips are context. Option pricing is not wanted for a viewer. |
| Volatility | FX volatility surface and risk reversals (OVDV; sources agree it shows the surface from ATM, RR and BF inputs) | VIX complex, SKEW, MOVE, OVX, GVZ, 1m risk reversal, 3D surfaces on a separate page (panel.macro.vol, skewhist, tab.options, DRAWN) | partial: the FX vol surface is on a separate page, not in the terminal | M | Held (laptop IBKR, own archive since 2026) | Skew has no forward edge (skew-fade NULL); say so on the board. |
| Commodities | Commodity monitor (CMDT is listed but not described: UNVERIFIED) | Commodity currencies against exports, copper against fear, gold ETF flows (panel.macro.commodfx, copper, DRAWN; gold-etf-flows PACK) | partial: no gold board and no curve or term structure | S to M | Held except futures curves | Gold flow is context. |
| Credit | CDS creation and pricing (CDSW), credit curves | Credit spreads, stress index, bank credit, plumbing, Fed liquidity (panel.macro.creditspreads, bankcredit, plumbing, fedliq, DRAWN) | partial: no sovereign CDS | L | Must source (paid) | Free substitute: option-adjusted spreads from FRED, BIS data. |
| Positioning | COT (function not found in the sources: UNVERIFIED) | CFTC COT heatmap of 35 futures, retail positioning, positioning into releases, crowding (tab.pos, DRAWN) | none | none | Held | cot-crowding-p5 VALIDATED. |
| News | Top stories (TOP), news menu (N), keyword search with proximity operators (NSE: sources disagree on the name), saved-search alerts (NLRT) | The wire (tab.news, DRAWN): 72 hours, tiers 1 to 3, a market filter that tags each headline to the markets it touches, the first-move arrow a headline implies, support or against the day's card, text search, and a Telegram share channel | partial: no saved searches or keyword alerts; story topic codes are not copied | S to M | Held | news-asymmetry is NULL, so the arrows must carry a context-only chip (UNVERIFIED that they do today). |
| Charting | Price graph with technical studies (GP; sources conflict on its exact description), intraday market charts | Chart tab with KLineChart: candles, 5m to 4h, indicators with settings, our levels as overlays (tab.kchart, preview); glow charts elsewhere | none for the core; no multi-chart | S | Held | Preview only. Drawing tools were removed on purpose. |
| Alerts and monitors | Price and event alerts (ALRT), custom market monitors (sources point to NW for building one; MON not found: UNVERIFIED) | Alerts bell (5 rules, Telegram), workspaces, linked selection (widget.alerts, tab.workspace, widget.linked, preview) | partial: no user-built monitor with columns | M | Held | Alerts describe a number, never a trade. |
| Workflow | Command line, linked panels, export to Excel, messaging (IB chat) | Command line, top-bar box, linked selection, workspaces exported as a file (preview) | partial: no table or chart export; no messaging | S for export | n/a | IB chat is a network of people and cannot be copied. |

## 2. Where we are ahead

- Evidence grades on every claim, and nulls shown as nulls. None of the Bloomberg material found describes a function that
  grades its own outputs. Ours shows effect, interval, power and a verdict word.
- A calibrated range forecast with a forward record against 25 percent by design, and the vol clock built on it.
- Point-in-time replay and a stored time machine (snapshots every 5 minutes while the FX week is open), so a past day can be
  re-read as it looked then.
- Plain-English drivers on the Pair page and rule-built sentences, with the working shown and the gaps named.
- Data-age chips on every laptop-fed tile, and a closed-market state that shows the last close instead of an empty board.
- An honest scoreboard for the desk's own reads (analyst scorecard, thesis against reality, paper record).

## 3. Bloomberg conventions already matched (phases 1 and 2)

| Convention | Ours | Status |
|---|---|---|
| Command line | Slash, backtick, Ctrl+K and the top-bar box; every command has help text | preview, pushed |
| Linked panels | Shared market selection across cards, vol clock, Pair, Replay | preview, pushed |
| Saved layouts | Workspace tab with named layouts saved on the server and file export | preview, pushed |
| Alerts | Bell with five rules through Telegram | preview, pushed; first live send unverified |
| Technical chart | KLineChart with indicators and our level overlays | preview, pushed |
| Dense monitor | Not yet (dense mode on the build list) | TODO |
| Export | Layouts only; no table or chart export | TODO |

## 4. Top 10, ranked for your use (daily macro read, FX and NQ, gold)

| Rank | Improvement | Why | Effort | Needs from you |
|---|---|---|---|---|
| 1 | What is unusual right now: every series ranked by how extreme it is against its own history | The fastest daily read; the biggest thing a Bloomberg screen does that ours cannot yet; no new data | S to M | Nothing |
| 2 | Chance-of-reaching-a-level calculator on our own vol and calibrated range (FXFM-style) | Plays to our strongest evidence (range and reach validate); nothing like it is free elsewhere | M | Nothing |
| 3 | Release detail on the calendar: actual, forecast, prior, revision, a strip of that release's own surprise history | ECO and ECST are the most used macro functions; surprise size is validated | M | Whether a paid consensus feed is wanted (US vintages only today) |
| 4 | Gold board: ETF flows, real yields, dollar, COT and the gold vol read in one place | Gold is a core market and the flow data is held but only analysts read it | S to M | Nothing |
| 5 | Currency rates matrix with strength rank and change by timeframe (FXC and WCRS style) | The most recognisable Bloomberg FX screen; 28 pairs already held | S | Nothing |
| 6 | Monitors: a list of markets you choose, with live columns (last, change, range used, bias, IV over sigma, next event) | The dense monitor the owner asked for; every column already exists | M | Nothing |
| 7 | News saved searches and keyword alerts, plus a context-only chip on the arrows | Reuses the alerts and the wire; keeps news-asymmetry NULL honest | S to M | Nothing |
| 8 | Rate probabilities for the ECB, BoE and BoJ as deep as the Fed's (WIRP style) | Fed is deep, others thin; it is laptop-fed so needs the stale guard | M | Laptop task for the bank futures (none exists today) |
| 9 | Earnings chips on the Calendar and a sector heat map for NQ and SPX | Earnings feed exists; sector map needs sector ETFs | S then M | A source decision for sector data |
| 10 | Export: CSV for any table, PNG for any chart | Small, expected from a terminal, and workspace export already exists | S | Nothing |

## 5. What cannot be copied without paid data, and the free substitute

| Bloomberg capability | Why not | Free substitute |
|---|---|---|
| Real-time economist consensus and survey (ECO, ANR) | Proprietary surveys | Calendar forecast field, nowcasts (Cleveland, Atlanta), FRED vintages for US |
| Analyst FX forecast composite (FXFC) | Proprietary contributor data | Our own calibrated range forecast and scorecard |
| Sovereign and corporate CDS (CDSW) | Dealer data | FRED option-adjusted spreads, BIS credit, our credit stress index |
| Dealer quotes and live market depth (ALLQ is cited in a Bloomberg deck, UNVERIFIED as a function) | Dealer network | OANDA mid bars and the retail book |
| Instant messaging (IB chat) | The network is the product | None |
| Real-time tick equities and futures | Exchange fees | NT8 and IBKR delayed feeds already held |
| Bloomberg Intelligence research | Proprietary | The desk's own analysts and Evidence Book |

## 6. Unverified

- Every Bloomberg detail above rests on third-party guides; function descriptions may have changed since they were written.
- CMDT, GC, MON, CTM and the COT function were not described by any source found, so nothing is claimed about them.
- Whether the News tab arrows carry a context-only chip was not checked in the rendered page.
- Whether a table or chart export exists anywhere in the terminal was checked by search only.

## 7. Sources

- Bloomberg functions list, University of Delaware: https://lerner.udel.edu/seeing-opportunity/bloomberg-functions-list/
- Bloomberg Pro Tips, predicted global interest rates (WIRP): https://www.bloomberg.com/professional/insights/markets/bloomberg-pro-tips-explore-predicted-global-interest-rates-with-the-bloomberg-terminal
- Marc to Market on WIRP: https://www.marctomarket.com/2015/09/why-i-dont-use-bloombergs-wirp-function.html
- SF Fed interest rate probability distributions: https://www.frbsf.org/research-and-insights/data-and-indicators/interest-rate-probability-distributions/
- Bloomberg Terminal Essentials, functions for FX: https://www.bloomberg.com/professional/insights/technology/bloomberg-terminal-essentials-functions-for-fx
- Tools for foreign exchange cheat sheet: https://cbpm.wku.edu.cn/sites/business.prod.dpmgr.wku.edu.cn/files/2023-07/tools_for_foreign_exchange_market_cheat_sheet_0.pdf
- Xavier University economic analysis guide: https://www.xavier.edu/fifth-third-trading-center/bloomberg/guides/08_economicanalysis.pdf
- Top newsroom functions, Ohio University: https://sites.ohio.edu/korte/wp-content/uploads/2024/03/Top%20Newsroom%20Functions%20for%20the%20Terminal.pdf
