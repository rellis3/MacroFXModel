# Desk Terminal flow review

Dated 2026-11-16. Hand-kept. Written for the owner. Read-only review of origin/main: the tab bar in desk-terminal.html, the surface registry (js/terminal/tabRegistry.js, 106 panel rows) and each tab's render code. I could not open a browser, so anything about how it looks or feels is UNVERIFIED and needs an owner click-through (listed at the end).

## The short version

1. The terminal has 21 tabs in one strip (4 previews and 2 owner tabs are hidden from a desk login, so a desk login should see 15; UNVERIFIED in a viewer session). On a phone the strip wraps to three rows. The order is the order things were built, not the order you read in.
2. The Assets modal and the Pair page are two near-identical deep views of one market. Both draw the chart, the plan, the bias engine block and "What drives this". The Pair page then adds 13 more cards underneath. That second half is the part that should become its own tab.
3. Many things are drawn in two to five places: currency strength (5 places), positioning (4), options (3), fair value and rates (Pair and Macro), seasonality (Pair and Charts).
4. Navigation from the overview to the detail is patchy: an Assets card opens a modal, not the Pair page, and I found no "open the pair page" link in the modal markup (UNVERIFIED in the render). The Pair page uses replaceState for its hash, so the browser Back button does not return you to where you came from.
5. Two names collide: "Charts" (history, regime, seasonality, positioning history) is not a chart tab, and the new "Chart" (candles) is. Rename the first.

## Per tab, in on-screen order

For each tab: what is on it in order, then the verdict on flow, duplication, navigation, weight, what cannot work, and viewer versus owner.

### 1. Overview (tab.overview)
Blocks in order: the globe and map, today's book, book intelligence, market regime, currency strength, bias engine currency ranking, net currency exposure, the desk's record, this week, best pairs, the day's shape, trade watch, playbooks, then "News, releases and risks" (the wire, releases ahead, risk warnings). Header strips above it: world stress, emerging markets, price-based strength, analyst read against price read, desk alerts.
- Flow: the map is a good opener, but 16 blocks in a column is a long page. The things a reader wants first (what changed, risk state, regime, strength) sit in the middle; trade-like blocks (book, exposure, trade watch, playbooks) are owner-only and sit between them.
- Duplication: strength appears here twice (the older strength card and the price-based one) and again on Currencies, Analytics and Insight. Regime appears here and on Macro (Markets and FX).
- Navigation: tiles open the right detail in most cases (UNVERIFIED which ones).
- Weight: long. Suggest a "today at a glance" first screen and fold the rest.
- Viewer versus owner: trade-like panels are hidden from a desk login, so a viewer sees a shorter page than the owner. The owner cannot see what a viewer sees without a switch (the Access page).

### 2. Currencies (tab.ccy)
Blocks: the currency map, then a grid of eight currency cards (bias, drivers, macro picture, tone timeline). A card opens a modal (key drivers, best expressions, what would flip it, on the wire).
- Flow: good. Card then modal is the right pattern.
- Duplication: the modal's "best expressions" and the Overview best pairs list overlap.
- Navigation: modal has no link into the Strength matrix or the Macro sections for that currency (UNVERIFIED).

### 3. Assets (tab.assets)
Blocks: group filter buttons (All, FX majors and so on), then a three-column grid of market cards sorted by strength of view. Each card shows group chip, name, grade chip, "Analysis of X", rating chip and bias engine chips, a score bar, the thesis quote, key drivers, source chips, size, the level ladder and the latest news line. A click opens a full modal. The vol clock (preview) sits with it.
- Flow: good cards, but the modal is the problem: it holds the chart with candle pills, the plan, the full bias engine block, the desk view, the analyse box and "What drives this". That is the Pair page.
- Duplication: modal against the Pair page (see section on the restructure).
- Navigation: the card opens the modal. I found no link from the modal or the card to the Pair page in the markup (UNVERIFIED in the render). Pair is reached from tables, the Monitor, Insight, the command line and the Pair tab itself.
- Missing: no star or Favourites filter here, which is where cards are. The favourites we built sit on the Pair dropdown.
- Viewer versus owner: the size, entry, target and invalidation lines are owner-only; a viewer sees the read and the ladder.

### 4. Macro (tab.macro)
Five pills (Policy, Rates and curve, Economy, Credit and liquidity, Markets and FX) and 46 registered blocks. Only the open section is built.
- Flow: the best-organised tab. Summary-to-detail inside each section is sensible.
- Duplication: rates gap, fair value and carry here are repeated per market on the Pair page. The central-bank cards here and on Currencies overlap (the tone timeline is on both by design).
- Weight: 46 blocks is a lot, but lazy loading keeps it cheap.
- Navigation: deep links work (#macro/rates/fedyields) and the command line reaches every board.

### 5. Positioning (tab.pos)
Blocks: speculators across 35 futures (CFTC grid), futures positioning, options positioning (headings read from code; the blocks were not inspected one by one).
- Duplication: positioning history lives on Charts, the per-market positioning card on Pair, and the gold positioning in Insight. Four places.
- Weight: small. Should absorb "Positioning history" from Charts.
- Cannot work: CFTC gold data was 12 days old on 2026-11-15 (the card flags it).

### 6. Calendar (tab.cal)
Blocks: live surprises, events, expectations against reality, plus the preview drills (earnings by day, release scorecards, a drill per release row).
- Flow: fine. Drills are additive.
- Duplication: release reactions are also on Analytics; "when markets move" and central-bank speakers are enrichment blocks on Macro and Calendar (UNVERIFIED which tab owns which).

### 7. Analytics (tab.ana)
Ten blocks: correlation web of the book, currency strength over time, the desk's track, which layer earned it, vol forecast against what happened, the desk's days, release reactions, analyst scorecard, factor risk and scenarios, scenario map.
- Flow: this is a book and track-record tab, not a market-analysis tab. The mix of "how the market behaves" (vol forecast, release reactions) and "how the desk did" (track, days, scorecard) is why it feels unfocused.
- Duplication: strength over time (also Overview, Insight), release reactions (also Calendar).
- Viewer versus owner: the track-record blocks are performance-style; whether a desk login sees them depends on the surface rows (UNVERIFIED; check the Access page).
- Suggest: split in two groups with a pill row like Macro: "Market behaviour" and "The desk's record".

### 8. Charts (tab.charts)
Blocks: macro regime, data surprises, positioning history, seasonality, how today's book was built, currency ranking against realised.
- Naming: "Charts" is a history tab. Rename to "History" (or "Regime and history").
- Duplication: positioning history belongs on Positioning; seasonality is on the Pair page (hours card); regime is on Overview and Macro.

### 9. Chain (tab.today)
The macro chain (Live, 1D, 5D, 20D) with desk watch and precedent (what followed days like today).
- Flow: a stand-alone narrative tab. The name "Chain" means nothing to a new reader. Candidate: "The chain" with a one-line subtitle, or "Macro chain".
- Duplication: precedent appears again on the Pair page ("precedent and the chain").

### 10. Trader's read (tab.read, owner only)
The owner's own read and trade mark-up. Hidden from desk logins, so no viewer impact. Fine where it is; group it with the owner tools.

### 11. Pair (tab.pair)
Order on the page: market row (dropdown, star, Favourites pill, quick chips) then the header card (group and name chips, bias, thesis, drivers, candle pills and chart, ladder and plan), "What drives this", bias engine pair score, then a two-column grid of 13 cards: Global Read, Rates, Fair value, Short-term fair value, Positioning, Carry and options, Session hours and seasonality, Autocorrelation, Lead-lag, Options, News, Precedent and chain, Research.
- Flow: the top half is a fine "one page per market". The bottom 13 cards are reference material, all the same weight, in no priority order, loaded with 13 requests.
- Duplication: nearly every bottom card has a home elsewhere: Rates and Fair value (Macro Rates and Markets), Positioning (Positioning tab), Carry and Options (Macro, Options tab), Hours (Charts), Options (Options tab), News (News tab), Autocorrelation (Correlations). Lead-lag and Research are probably unique to this page.
- Navigation: the 13 cards have no surface ids, so the Access page cannot switch them one by one (only panel.pair.engine, panel.pair.favourites and panel.asset.plan exist). Back button: openPair uses replaceState, so Back does not return you.
- Weight: the heaviest page in the terminal.
- Viewer versus owner: ordering uses strength of view for a viewer and size for the owner; plan lines are owner-only.

### 12. Changed (tab.changed)
Blocks: card flips, thesis against reality, paper trades.
- Flow: this is "what changed since I last looked". It should sit right next to Overview, not after Pair.
- Viewer versus owner: thesis check and paper record are separate switches.

### 13. Replay (tab.replay)
Candles with the option levels as published then, touches, strength and the desk book as of the moment. You said it is not what you imagined; the per-visual replay buttons (preview) and event replay are the planned answer. Sits best beside Chart.

### 14 to 17. Previews: Monitor, Workspace, Chart, Insight (owner only for now)
- Monitor belongs next to Assets (it is a table version of the same markets).
- Workspace is an owner tool; group with Info map.
- Chart (candles with indicators) is the real chart tab; once "Charts" is renamed the pair is clear.
- Insight is a set of boards under one pill row (8 registered panels): unusual now, cross-asset, sector rotation, currency matrix, gold, level reach, risk flags and economies. When promoted, spread them: "Unusual now" to Overview or Changed, matrices to a Markets group, Gold to Assets, Level reach to Chart. Keeping Insight as a named home is also fine; the cost is one more tab.

### 18. Options (tab.options)
Blocks: an options market bar with its own market selector, the smile, the ladder, the path, positioning, dealer hedging, skew, the VIX term, latest news for that market.
- Duplication: its own market dropdown is a third market picker (Pair, Options, Chart). Linked selection should drive it (UNVERIFIED if it is wired).
- Duplication: the Pair page's Options and Carry-and-options cards repeat part of this.

### 19. News (tab.news)
The wire with its reads; saved searches and keyword alerts (preview). Fine. The Pair "news" card duplicates it for one market.

### 20. Correlations and hedges (tab.corr)
Matrix, rolling, factors, regimes, the hedge finder (separate switch). Fine. The Insight cross-asset correlation matrix overlaps; keep both only if the Insight one stays a "what changed" view.

### 21. Info map (tab.infomap, owner only)
An owner inventory of the data. Fine; keep at the end with Workspace.

## The restructure I propose

### Pair becomes a slim page
Keep on Pair: the market row (dropdown, star, Favourites pill, quick chips), the header card (rating, thesis, chart with candle pills, plan), the bias engine pair score, and "What drives this" in its short form (the summary line and the section takeaways, with the detail collapsed). End with a row of links: "Rates and value", "Positioning and options", "How it behaves", "News and context", each opening the new tab at that section for the same market.

### The new tab for the other 13 cards
Candidate names, in plain English:
1. **Deep dive** (recommended): says what it is, and "dive deeper from the Pair page" reads naturally.
2. **Pair file**: a dossier on one market.
3. **Under the hood**: friendly but vague about what is inside.

Layout: a pill row like Macro's, so it stays light and only the open section loads.
- Rates and value: Rates, Fair value, Short-term fair value, Carry.
- Positioning and options: Positioning, Options, Carry and options.
- How it behaves: Session hours and seasonality, Autocorrelation, Lead-lag.
- Context: Global Read, News, Precedent and the chain, Research.
Market chosen by linked selection (the same selection the Pair page uses), so switching market on either page carries over. Hash: keep #pair=GOLD as it is and add #deep=GOLD (or #deep=GOLD/rates).

### Assets cards
Show the read, the ladder, the news line (as today). Add a star and a Favourites pill beside the group filters, using the same favourites store the Pair tab already uses (so one list, two places). Card click: open the Pair page for that market directly, or keep a slim modal with "Open pair page" and "Deep dive" buttons. The current full modal is the duplicate.

### Favourites
You asked whether the Pair favourites are still needed. My view: keep them (they cost nothing, they use the same store, and the Pair dropdown holds around 50 markets), but the Assets cards are where a star belongs first. When the Assets star lands, the Pair chip row should default to the starred markets when any exist.

### Other merges and renames
- Rename Charts to History. Move "Positioning history" to Positioning and "Seasonality" to the Deep dive.
- Move Changed next to Overview. Move Monitor next to Assets. Move Replay next to Chart. Put Trader's read, Workspace and Info map at the end as owner tools.
- Group the tab strip (see the ranked list, item 5) so it fits a phone.
- Give Chain a plain name.
- Currency strength: pick one home (the Insight matrix, once promoted) and make the other four compact views that link to it.

## Ranked changes

Effort: S under a day, M a day or two, L several days. Risk is what could break.

| # | Change | Effort | Risk |
|---|---|---|---|
| 1 | Star and Favourites pill on Assets cards, sharing the Pair favourites store | S | Low. Same store and tests as Pair (js/terminal/favourites.js and its test). |
| 2 | Asset card goes to the Pair page; add "Open pair page" in whatever modal stays | S | Low. Linked selection follows openPairPage. |
| 3 | Browser Back works for Pair and the new tab (pushState instead of replaceState) | S | Medium. linkedSelection.js writes the hash and could loop; needs its test extended. |
| 4 | Rename Charts to History; move Positioning history to Positioning | S | Low. tabRegistry labels, tests naming the tab label. |
| 5 | Slim Pair and add the Deep dive tab (preview first, owner only, then promote) | M to L | Medium. Tests naming tt-p ids and panel.pair rows (favourites.test, linkedSelection.test, tabRegistry.test); the 13 cards have no surface ids so add panel.deep.* rows (a new row per card); hash links (#pair=GOLD must keep working); command line (add DEEP); linked selection must include the new tab. |
| 6 | Reorder and group the tab strip (Today, Markets, Macro, Research, Tools) | M | Medium. tabRegistry order and the tests that assert it; every tab keeps its surface id, so the Access switches are safe. No saved layout seems to govern this strip (the nav-layout store is the site menu in commandHub.js, a different thing; UNVERIFIED). |
| 7 | Overview: a "today at a glance" first screen, fold the rest | M | Medium. Panel ids stay; moves change order only. |
| 8 | Currency strength: one home, four compact views linking to it | M | Medium. Five places read it; keep their ids. |
| 9 | Analytics split into "Market behaviour" and "The desk's record" pills | S to M | Low. Same pattern as Macro. |
| 10 | Spread the Insight boards when promoted (Unusual now to Overview, Gold to Assets, Level reach to Chart) | M | Low to medium. |

## Decisions needed from you
1. The new tab name: Deep dive (recommended), Pair file or Under the hood.
2. Asset card click: go straight to the Pair page (recommended, then the modal can go) or keep a slim modal with links.
3. Ship the Deep dive as an owner-only preview first (recommended, so desk logins see no change until you are happy) or straight to everyone.
4. How far to take the tab strip: only the renames and moves (items 4 and part of 6), or full grouping on a two-level strip.
5. Keep the Pair favourites alongside the Assets ones (recommended) or drop them.

## What I could not check (needs an owner click-through)
- Everything about how it looks: spacing, phone width, the six themes, the tab strip wrapping.
- Whether the Assets modal and card truly have no link to the Pair page (read from the markup, not seen rendered).
- Which blocks a desk login sees on Analytics and Overview (depends on the Access page switches; viewer mode not rendered).
- Whether the Options tab's market picker follows linked selection.
- Positioning, Calendar, Chain, News, Options, Changed and Correlations: blocks were read from headings and registry rows, not inspected one by one in code.
- Whether any saved per-user state reorders the terminal tab strip.
