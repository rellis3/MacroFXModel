# Podcast Insights: Running Log

## Purpose

Notes pulled from trading podcasts. The user pastes a transcript, and each episode gets an entry
under **Episode Log**. Ideas that come up again get an extra citation in the **Theme Index**
instead of a duplicate; repetition means the idea is central to how the speaker actually trades.
Anything concrete enough to check goes into the **Research Backlog**, and only after a search of
`plans/`, `forge/`, `js/deskEvidence.js` and `js/dataCatalogue.js` for prior work.

Always tag the speaker. The two hosts below often disagree, and the disagreement is useful.

Each idea is sorted into one of three groups:
- **PROCESS**: how they run the job (risk, journaling, invalidation, mindset). Can't be backtested;
  often the most valuable part.
- **TESTABLE**: a concrete rule we could check on our data.
- **ON FILE**: already tested here. Says what we found and what a new version would need to do.

Dated market calls go into **Calls to Score**, so we can see later whether their reads held
(same idea as the calibration loop).

### Speakers
| Tag | Who | Style |
|---|---|---|
| **BD** | Brent Donnelly, Spectra Markets; ex-bank FX market maker, PM, day trader; author of *Alpha Trader* and *The Art of Currency Trading* | Short-term FX, price action and positioning, journals every trade |
| **AP** | Alfonso Peccarelli, founder of The Macro Compass; ex-head of investments at a large European bank | Long horizon, weekly charts only, macro-data driven, portfolio construction |

Podcast: *The Macro Trading Floor*.

---

## Episode Log

### E01: "Nostradamus Donnelly", AI wobble, Fed credibility, good news / bad price for USD
Recorded around Fri 2026-10-16 (it mentions the French budget vote "next week on the 20th" and the
Moody's France review on Fri the 23rd).

**PROCESS**
- **BD: a 50-55% hit rate over 20 years of logged trades.** One public winner is "a die coming up
  4-5-6, so how excited should you get?" The skill is getting back to neutral quickly after wins and
  losses. Two takeaways: (a) he knows his number because he has *recorded every trade for 20 years*;
  (b) a career-grade trader is only a few points above a coin flip, so the edge is in sizing and
  exits, not in being right. For comparison, our direction-chip record is 47.6-48.3%
  (see `project_lean_record_corrected`); the gap to his number is small, and he gets paid from what
  he does *after* entry.
- **AP: set the invalidation in advance, on a weekly close at a structural level.** "If we get a
  weekly close well below 5% on the 10y, I have to assume I'm not seeing something." He doesn't
  invalidate on intraday noise or daily bars, because "for me daily charts don't make much sense".
  The rule: choose the timeframe that matches the thesis, and decide before the move what price
  would prove you wrong.
- **AP: when a scary headline repeats, go back to the slow data.** The "China can do it for free"
  AI headline "comes every few months". His check is whether anything has changed in nominal
  growth, credit or the equilibrium rate. If it hasn't, he treats it as a wobble, not a regime
  change.
- **BD: in a binary market, ride the narrative waves.** AI is a binary bet that rests on faith, so
  instead of predicting the outcome he trades the swings between confidence and panic ("we're in a
  brief wave of panic, like DeepSeek").
  **AP's alternative:** in a bubble, either trade only the tails (credit build-up, imbalances) or do
  the work to form an informed view. "You can't hide under the desk."
- **BD: a known pattern sets up a bigger miss.** Everyone knows Canadian September jobs data
  usually comes in strong (21 of the last 24 Septembers), so the market leans for a beat, and a miss
  hurts more. The general point: when a release has a well-known pattern, the risk is a miss
  against a crowded lean.
- **BD: once bad news is priced in, you need something new.** The French budget vote (likely fails)
  and the Moody's downgrade (expected) are "two bad-news events that are both expected and priced
  in", so he is watching how the euro *reacts*, not the news itself.
- **AP uses an LLM as an analyst** to bring the Fed Board's financial conditions index up to date
  (official version published monthly with a lag; the methodology is public).

**TESTABLE / ON FILE**: see Research Backlog items R1-R6.

**Their macro reads (opinion, not evidence)**
- *BD:* the US economy is a "one-legged stool": AI capex lifts stocks, the wealth effect lifts
  top-of-the-K consumers, and cross-ownership lifts Mag-7 earnings. That spending crowds out
  housing and everything else. It all rests on faith that AI pays back, it's binary, and there are
  small cracks (CoreWeave CDS, a cancelled Australian AI IPO, Character.ai's bankruptcy).
- *AP:* nominal core final sales to private domestic purchasers ran at about 6.5% annualised last
  quarter, the strongest since 1996. IG tech borrows at about 7% while growing earnings 20-30%. The
  Fed's own FCI is still accommodative on 1y and 3y lookbacks, and core PCE is heading for about
  3.1% y/y. Rates "have to go higher until equilibrium", which means higher yields and a higher
  dollar; equities can cope but high-beta easy money is done. If the Fed skips October, "the long
  end does the tightening for them".
- *Both:* Fed credibility is see-sawing (hawkish June, dovish July, hawkish Aug/Sep, dovish now).
  "Same old Fed."
- *AP on bonds:* bonds used to trade like energy (oil up, yields up) and now trade like the AI
  trade (AI sells off, bonds rally). That gives a little positive carry plus a hedge against
  equities, which is good for portfolio construction.

### E02: "6% yields": Brent shorts the Nasdaq, the search for a new bond equilibrium
Recorded around Thu 2026-10-09 ("happy Thanksgiving, Canada"), so it is **before E01**. This is the
episode where BD puts on the QQQ short that he takes profit on at the start of E01.

**PROCESS**
- **BD: if a trade is embarrassing to say out loud, that can be the signal.** His example: shorting
  AUD above parity in 2007 when sales told him "Aussie only goes up". It worked. If everyone feels
  the same, the trade is crowded the other way.
- **BD: trade both directions or don't trade it.** If you can never be long Tesla because you
  dislike Musk, don't trade Tesla, because the bias will cost you. He lives by this: E02 is long USD
  ("consolidate, then higher"), and a week later in E01 he's short USDCAD because the price action
  changed.
- **BD: index shorts are negative-Sharpe as a habit, so only do them tactically.** Systematically
  buying index puts loses money; *selling* index puts has been one of the best Sharpe strategies for
  30 years (with risk management). A tactical short needs a timing trigger and a hard stop ("out
  above 772.50 QQQ"). Don't keep re-shorting a rising index (2010-14 bear-rally believers).
- **BD: setup and trigger are separate.** His bearish conditions had been in place for two weeks;
  he waited until his "liquidity thermometers" (silver and Bitcoin) turned down before taking the
  shot. The conditions tell you to get ready; the trigger tells you to act.
- **BD repeats his bet shape** (Theme Index): he's after 55/45 or 60/40 bets, or 50/50 bets that pay
  2 to 1.
- **BD on overfitting, which matches this repo's rules almost exactly:**
  (a) The idea came from a conversation with a trader (PTIG), not from searching through variables.
  (b) **Perturb every parameter** (within 2/3/5/10% of the high; MOVE at the 70th/80th/90th
  percentile) and only trust it if the result holds across the range.
  (c) Be suspicious of over-parameterised "never before has X < 33 and Y < 56 and Z > 61..."
  stats, because you can find a bearish one any day of any year.
  (d) Signals **cluster** (2007, 2015, 2021), so the real number of independent episodes is small.
- **AP: write your biases down and fight them.** His are "always want to buy bonds and sell
  dollars", from starting his career in 2013-2020 (QE, zero inflation). Druckenmiller (long stocks,
  short long bonds as the hedge) made no sense to him until his own model agreed. "6% is not a
  magic number; it's fair, not cheap."
- **AP: a macro book caps equity beta.** He only goes outright short equities on macro *tails*
  (runaway inflation, recession). Otherwise he just becomes "more conservative": being underweight
  instead of short.
- **BD: a hard setup is a logical trend that's overbought and crowded.** He has no reason to be
  short USD, but USD tops his cross-asset RSI heatmap and his positioning gauge is "close to scary".
  His usual expectation is **consolidation** (time for the overbought reading to burn off and
  options to expire), then the trend resumes.
- **AP: the turn in the rate of change matters, not the level.** Capex doesn't have to fall; what
  matters is when its growth stops accelerating. **BD:** the place to hear it first is hyperscaler
  earnings calls, or a story that corporations are moving to open-source models to cut costs.
- **BD: some statements only get made at the highs.** "Returns on AI are infinite, so the cost of
  capital doesn't matter" = Howard Marks's "no price too high".
- **BD on fiscal stories:** the bad numbers have been true for years, and *when* the market decides
  to attack them is arbitrary. Either recognise it when it happens or put the catalysts (election,
  ratings reviews) on your calendar. **AP:** markets punish fiscal *loosening*, not a party; a Le Pen
  vote for a tight budget would help French spreads (like Meloni in Italy).

**Their macro reads (opinion)**
- *AP's equilibrium model:* stable core nominal GDP is running at about 6%; the 30y was at 5.62%,
  still about 40bp below it. US 30y yields have been below nominal GDP almost continuously since
  2012-13, and the rare times yields were above it were good times to overweight bonds. Fed neutral
  is 3.25%; the front end is now fairly priced; the long end needs more term premium (full
  employment plus a 3% primary deficit). On the other side: US private debt to GDP is at a 25-year
  low, and energy is 7% of nominal wages versus about 14% in 2011. **Fair value is about 5.5% for
  the 10y and 6% for the 30y.** Getting there "can get messy", so he's more conservative on stocks
  and prefers to be underweight anything except mega-caps.
- *BD:* there may be no big "buy the bond dip" trade, because yields could just settle into a new
  range (around 5.0-6.2%).
- *Both on what ends the trend:* the market deciding capex has peaked (an early hint came when an
  OpenAI revenue headline produced stocks down and bonds up), US fiscal tightening (unlikely), or
  higher rates eventually slowing nominal growth.

**TESTABLE / ON FILE**: R7-R9 below; R4 picks up a second mention.

---

## Theme Index

| Theme | Speaker | Episodes |
|---|---|---|
| Hit rate barely above 50%; bets shaped 55/45, 60/40 or 50/50 paying 2:1; journal every trade | BD | E01, E02 |
| Invalidation decided in advance (weekly close for AP; hard price stop for BD) | AP, BD | E01, E02 |
| Separate recurring headlines from regime change by checking slow data | AP | E01 |
| Good news, bad price: a failed reaction to favourable data is the signal | BD | E01 |
| A well-known release pattern sets up a crowded lean and a bigger miss | BD | E01 |
| Priced-in bad news: watch the reaction, not the event; fiscal-attack timing is arbitrary, so diary the catalysts | BD | E01, E02 |
| Stock-bond correlation regime decides whether bonds hedge (AI wobble = stocks down, bonds up) | AP, BD | E01, E02 |
| Fed credibility / financial conditions drive yields and the dollar ("dovish panic hikes") | AP, BD | E01, E02 |
| Overfitting hygiene: idea from a conversation, perturb parameters, distrust "never before" stats, count clusters | BD | E02 |
| Setup (conditions) is separate from trigger (liquidity gauges turning) | BD | E02 |
| Trade both directions; write down your biases and fight them | BD, AP | E02 |
| Crowded and overbought but logical trend → consolidation, then continuation | BD | E02 |
| Watch the turn in the rate of change (peak capex), not the level | AP | E02 |
| Yields vs nominal GDP as a long-run equilibrium | AP | E02 |

---

## Research Backlog

**R1. Good news, bad price (BD).** TESTABLE, not tried before (searched plans/forge/deskEvidence).
USD gets the best data it could hope for, rallies, fails at the same level twice (USDCAD 1.43), and
ends lower than before the data. BD reads that as "in trouble for the short term" and expects
another leg down next week.
- *Already on file:* direction after news is a coin flip **on average** (`event-impact-map`,
  next-day up-rate 50.5% over 558 rows). That's the unconditional case. **Conditioning on the
  failure** (a favourable surprise, then a close back through the pre-release price) has not been
  tested.
- *Possible spec:* top-tercile USD-favourable surprise → pair closes the release day on the
  wrong side of the pre-release price → next 1/3/5-day return in σ, against matched surprise days
  where the move held. Pool across pairs and releases to get n.
- *Data limits:* the surprise store has US actuals from FRED vintages only
  (`project_surprise_store_no_live_actuals`), which is fine for US releases. CAD/EUR releases would
  need another source for actuals.
- *Overlap:* "failed twice at the same level" is our range-edge work (edges cancel continuation,
  but the fade loses 0.11R net). The new part to test is the **news condition**, not the level.

**R2. Canada September jobs seasonal bias (BD).** TESTABLE but tiny: one release a year, so at
most about 24 data points. Worth checking "21 of 24 Septembers strong" against StatCan history plus
consensus as a calendar note. It isn't a strategy. The tradeable version is the general R1 pattern:
a known lean that misses.

**R3. Priced-in bad news: France budget vote 20 Oct, Moody's France 23 Oct (BD).** FORWARD
OBSERVATION, n=1. Moody's is today (2026-10-23). Note EURUSD and the French-German spread before
and after; BD expects a muted or euro-positive reaction. Score it in Calls to Score; one case
proves nothing.

**R4. Stock-bond correlation flip: bonds hedge again (AP, BD).** ON FILE, `stock-bond-flip`
(context): negative 20-day stock/yield correlation shows up in 71 episodes since 2008, median
**5 sessions**, p75 17. `project_spread_episodes` found the coupling varies a lot but **doesn't
persist** beyond what rate-vol clustering explains. So both hosts are calling a new regime, and our
data says these episodes usually last about a week. Treat it as a description, not a portfolio
rule. To be worth testing again, it needs a persistence claim (e.g. "episodes that start after a
stress shock last longer") with its own prereg and the constant-link null.

**R5. Fed Board financial conditions index brought up to date (AP).** DATA IDEA. We hold Chicago
**NFCI** (weekly; in `dataCatalogue.js` but never tested) but not the Fed Board's FCI-G. AP's move
(rebuild from the public method daily instead of waiting for the monthly print) fits the feed
review's plan to "test what we already hold, range-first" (`plans/FEED_REVIEW_2026-10-22.md`).
Context and range only; don't expect direction.

**R6. Core nominal final sales to private domestic purchasers (AP's growth gauge).** DATA IDEA.
Not in the catalogue. It's quarterly, so it's a backdrop for a country card or Atlas, not a
trading input. Cheap to add from FRED/BEA as context.

**R7. BD's "breadth bad at the highs while bonds are stressed" equity setup (from PTIG).** TESTABLE,
and the best-specified idea so far.
- *Conditions:* S&P within 5% of its high; MOVE in the top 20% of its 52-week range; high-yield
  underperforming Treasuries and below its 50-day average; NYSE net new highs < 0.
  *Trigger:* silver and BTC turn down. *Claim:* forward equity returns are worse than baseline.
  Clusters: 2007, 2015, 2021.
- *Data:* MOVE (`yahoo:^MOVE`, from 2002) ✓, HY OAS (`BAMLH0A0HYM2`) ✓ (his version is a
  total-return ratio; OAS is a fair proxy), S&P ✓, silver and BTC ✓. **NYSE net new highs is not
  held.** That's the one new feed needed (or an S&P-constituent proxy, with survivorship care).
- *Prior work:* `project_breadth_narrowing_null`: RSP-SPY narrowing alone was null on all four
  (35 episodes). This is a different, multi-condition claim, so the old null doesn't rule it out,
  but it's a warning that breadth on its own carried nothing.
- *Honest framing before running:* three clusters ≈ three independent episodes, so a forward-return
  number can't reach significance. House rule: test it as **distribution/size** (forward drawdown,
  range, P(−5%)), not direction. Use BD's own perturbation grid as the robustness section of the
  prereg; it *is* our method.

**R8. Crowded, overbought, logical trend → consolidation, then continuation (BD).** TESTABLE.
Condition: the pair is near the top of a cross-asset RSI ranking AND COT leveraged funds are stretched
in the trend's direction AND (judgement call) no fundamental reason to fade. Claim: the next 2-3
weeks have a *smaller range* than usual, then the trend resumes. *On file:* FX trend-following is
null (`project_trend_following_status`) and retail crowding is null (`project_squeeze_vol_null`),
but COT TFF leveraged-fund extremes are wired (`project_positioning_into_release`) and the
"consolidation" half is a **range** claim, which is where this desk's edges have actually been.
Test the range half first.

**R9. 30y yield vs core nominal GDP as a bond-value gauge (AP).** CONTEXT. Claim: when yields sit
*above* nominal GDP growth, that's a good time to overweight bonds. FRED has decades of `DGS30`/GDP,
but the claim is about rare regimes (none since 2012), so the episodes are few. It belongs as a
level on a country card or Atlas (with R6), not as a test.

---

## Calls to Score

| Date | Speaker | Call | Check by | Level at call | Outcome |
|---|---|---|---|---|---|
| ~2026-10-09 | BD | Short QQQ, stop above 772.50, target 710-715 | ~2 weeks | QQQ ≈ 753 | **Profit taken**, per BD at the start of E01 (exit level not stated) |
| ~2026-10-09 | BD | USD consolidates, then strengthens; EURUSD to 1.08-1.09 | rolling | | Changed his mind by E01 (constructive on EUR, short USDCAD) |
| ~2026-10-09 | AP | 10y fair ≈ 5.5%, 30y ≈ 6%; below that isn't equilibrium | rolling | 30y 5.62% | |
| ~2026-10-09 | AP | EUR lower, mainly because the ECB is hesitant | rolling | | |
| ~2026-10-09 | BD | French spread blow-off at 160 may be the top; now 138 | Moody's 10-23 | 138bp (E01 says 168 peak; the transcripts disagree) | |
| ~2026-10-16 | BD | Short USDCAD / USD "another leg lower next week" on good-news-bad-price | 2026-10-23 | USDCAD ≈ 1.4150, EURUSD ≈ 1.1260 | |
| ~2026-10-16 | BD | France news priced in; spreads peaked at 168 (two Fridays earlier) | 2026-10-30 | OAT-Bund 168 peak | |
| ~2026-10-16 | AP | Rates trend resumes higher; thesis wrong on a weekly close well below 5% US 10y | rolling | 10y just above 5% (peak 5.35%) | |
| ~2026-10-16 | AP | Fed likely skips October; if so the long end sells off | after Oct FOMC | Oct hike priced < 5-6bp | |
