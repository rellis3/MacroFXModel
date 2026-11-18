# Desk Terminal consolidation plan (2026-11-18)

Source: three read-only code audits of every tab, sub-tab, header widget and linked page (commit ef690de9). Facts below come from those audits; "not checked" items are listed at the end.

## The finding in one paragraph
The terminal has 23 tab buttons, about 11 Insight pills, 6 Macro sub-tabs, 5 Overview pills and 5 Correlation views. Most of the content is unique. The problem is that the same few numbers are **drawn by separate hand-written renderers in several places**: the per-market desk call is drawn four times, policy rate / hawkishness / real yield three times, option walls three times, bank credit three times, risk flags three times, currency strength three times, the calendar five times. Where a second copy adds nothing, it is clutter. Where it adds something (Pair adds the candle chart), it should be the *same* card with a bigger view, not a rewrite.

## Principles
1. **One home per question.** Everything else is a one-line link, not a second drawing (the Overview "promo" pattern already does this for gold, reach, flags, fx matrix).
2. **One renderer per card.** A card's code lives once; other tabs mount it.
3. **Organise by the job the owner is doing**, not by where the data came from.
4. **Surface ids never change.** The registry, hide rules, viewer access, saved layouts and the Layout editor all key on `data-surface` ids. Moving a panel means changing which tab mounts it, never renaming it. That keeps access rules and saved layouts valid.
5. Every move ships with: a redirect for old `#tab` hashes, a `commandHub.js` shortcut check, a `resolveLayout` migration for saved nav layouts, and the terminal test suite green.

## Proposed structure (23 tabs → 9)

| New tab | Absorbs | Why |
|---|---|---|
| **Today** (Overview) | Overview 5 pills, Changed, Trader's read headline | "What is the state and what changed since I last looked". Changed is a diff of the same book. |
| **Markets** | Assets, Pair, Deep dive, Insight: Gold / Level reach / Sector rotation / Momentum / Spreads, Charts (seasonality) | One master-detail page: the Assets card list becomes the left rail, picking a market fills the Pair page on the right. Deep dive's 4 sections become Pair sections. No separate Assets/Pair/Deep tabs. |
| **Currencies** | Currencies, Insight: Currency matrix, Overview currency strength cards | One home for "which currency is strong". |
| **Macro** | Macro 6 sub-tabs, Insight: Economies, Bank credit, Risk flags context, Bias engine sub-tab moves out | Rates, policy, economy, credit, markets/FX. Walls, skew history go to Options; coupling/connected go to Correlations; trendbasket and range-coverage go to Analytics. |
| **Options & Positioning** | Options, Positioning (COT + retail), Macro "who is positioned" | Both answer "what is the market positioned for". Sub-tabs: Options / COT & retail. |
| **Events** | Calendar, News, Today "week ahead", Overview releases, earnings, release reactions | One timeline: scheduled events, the wire, earnings, surprises, reactions. |
| **Chain & Read** | Today (the chain graph) + Trader's read | Same 9+ feeds loaded twice today; Read becomes a sub-view of Chain. |
| **Correlations & Risk** | Correlations (5 views), Insight: Cross-asset matrix, Risk flags, world stress detail, Macro coupling/connected | Relationships and stress in one place. |
| **Time & Record** | Replay, History (Charts), Analytics (the desk's record), Time machine entry | Looking backwards: replay a day, the book's record, calibration. |

Owner/internal, kept apart from the desk tabs: **Bias** (Bias process + the bias-engine views, one home for the three bias sources: process, morning run, engine), Workspace, Monitor, K-chart (preview), Info map, Desk Office, Research (link out to research.html).

## The overlaps, and what happens to each

| # | Same thing drawn in | Keep as home | Others become |
|---|---|---|---|
| 1 | Per-market desk call: Assets card, Pair header (hand-written copy), Overview playbook card, dead modal path | One shared `deskCall` renderer used by the Markets rail card and the Pair header; Overview playbook uses it with a sparkline option | Delete the Pair reimplementation and the dead `assetCard(full)` modal path |
| 2 | Currency bias ranking: Overview strip, week section, Currencies cards, modal, Changed bars | Currencies tab | Overview keeps a compact strip that links in |
| 3 | Policy rate / hawkishness / real 10y: Macro cbcards, Currency modal `rateBars`, Pair Rates card, Bias engine column | Macro Policy | Pair Rates card shrinks to one line + link |
| 4 | Option walls/gamma: Macro walls, Options lines, Pair opt card | Options | Macro walls moves to Options; Pair card stays but is the Options module (already shared) |
| 5 | Bank credit: Macro table, Insight heat strip (just redrawn as lines), Overview map layer, bank-credit.html | Macro | Insight copy removed; the line chart becomes the Macro card |
| 6 | Risk flags: Overview Risk state, Insight Risk flags, world-stress strip, ribbons | Strip in header + Correlations & Risk | Overview Risk state becomes a link |
| 7 | Currency strength: Overview glance, ccystrength, Insight matrix, Macro live layer, Replay strength | Currencies | Others link |
| 8 | Calendar/releases: Calendar tab, Today week ahead, Overview releases, ticker, Macro releases, Pair surprises | Events | Others link or filter the same list |
| 9 | Global Read, Day Read, Precedent: Chain tab all-markets table vs Pair/Deep per-market slice | Chain | Pair keeps a one-market slice mounted from the same module |
| 10 | Behaviour boards: Assets slot (autocorrelation, lead-lag, session heat) vs Deep ac/ll/hours | Markets (board view + per-market view in the same tab) | One module, two views |
| 11 | Chain feeds loaded twice (Chain, Trader's read) | One shared loader | Read is a sub-view |
| 12 | Candle charts: Pair chart vs K-chart tab | Pair chart gains K-chart's indicators and option walls | K-chart tab retires after parity |
| 13 | Time views: Replay, Time machine, Changed, Since-last (all on desk-snapshots) | Time & Record, one explainer line saying which does what | Merge Since-last into Changed |
| 14 | Cross-asset correlation: Corr matrix vs Insight cross-asset | Corr tab | Insight copy removed (note: different feeds, check the numbers agree first) |
| 15 | Economies: Insight tiles vs world-economies.html | Macro Economy | Insight copy removed |
| 16 | Research: orphan terminal section, research.html | research.html | Delete the orphan section (no button, no registry id) |

## Sequence (each step ships on its own)
**Phase 0, delete the dead (low risk, no visible change):** the orphan `#research` section, the dead `assetCard(full)` modal path, the duplicate chain loader.
**Phase 1, one renderer per card (no layout change):** `deskCall`, `rateBars`, global-read/precedent slices, calendar list. Output must be byte-identical before and after (render snapshot tests).
**Phase 2, move panels between tabs without renaming** (surface ids fixed): Insight pills to their homes, Macro misplaced blocks to Options/Correlations/Analytics, Positioning into Options.
**Phase 3, merge tabs:** Assets+Pair+Deep into Markets (master-detail), Calendar+News into Events, Chain+Read, Replay/History/Analytics into Time & Record. Old hashes redirect.
**Phase 4, retire:** Insight tab shell, K-chart tab, Deep dive tab, once their content has a home.
Each phase: registry updated, `commandHub.js` shortcuts, nav `resolveLayout` migration, viewer access check, 800+ terminal tests, deploy precheck.

## Decisions I'd make by default (change any of them)
- Markets as one master-detail page (the Assets-card-to-Pair loop you pointed out).
- Positioning folds into Options.
- Insight dissolves; none of its boards are unique enough to need their own tab.
- Bias stays owner-only and becomes one home for its three sources.

## Not checked
Overview pill code, map layers, whether `/api/releases-board` and `/api/drill-series` share numbers, whether Insight cross-asset and Corr matrix numbers agree, today.html Site Map, the Null and Retired menus of commandHub, the ~270 standalone pages (only the terminal's own overlap with economies, bank credit and ccy-strength was checked).

## Status (2026-11-18)
- Safety mark: tag `pre-terminal-consolidation-2026-11-18` and branch `backup/pre-terminal-consolidation` on origin, at c326221b (the terminal exactly as it was, 23 tabs). To go back: `git revert` the consolidation commits, or branch from the tag.
- DONE, Phase 0: orphan Research section removed (Pair's research link now opens research.html).
- DONE, navigation merge: 23 tab buttons now show as 9 nav buttons + Tools, with a pill row for merged tabs (js/terminal/tabGroups.js, tabGroupsCore.js, test guards that no tab is left out). It drives the original tab strip, so deep links, access rules, saved choices and every module that finds a tab by data-t are unchanged. Groups: Today [overview, changed], Markets [assets, pair, deep, monitor, kchart], Currencies, Macro, Options & positioning [options, pos], Events [cal, news], Chain & read [today, read], Correlations [corr, insight], Time & record [replay, charts, ana], Tools [bprocess, workspace, infomap].
- NOT DONE yet (changes what is on screen, do with the owner looking): one renderer per card (Phase 1), moving individual panels between tabs (Phase 2), the Assets+Pair master-detail page, retiring Insight/K-chart/Deep shells (Phase 4).
