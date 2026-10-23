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

---

## Theme Index

| Theme | Speaker | Episodes |
|---|---|---|
| Hit rate barely above 50%; edge comes from sizing/exits; journal every trade | BD | E01 |
| Invalidation decided in advance at weekly-close structural levels | AP | E01 |
| Separate recurring headlines from regime change by checking slow data | AP | E01 |
| Good news, bad price: a failed reaction to favourable data is the signal | BD | E01 |
| A well-known release pattern sets up a crowded lean and a bigger miss | BD | E01 |
| Priced-in bad news: watch the reaction, not the event | BD | E01 |
| Stock-bond correlation regime decides whether bonds hedge | AP, BD | E01 |
| Fed credibility / financial conditions drive yields and the dollar | AP, BD | E01 |

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

---

## Calls to Score

| Date | Speaker | Call | Check by | Level at call | Outcome |
|---|---|---|---|---|---|
| ~2026-10-16 | BD | Short USDCAD / USD "another leg lower next week" on good-news-bad-price | 2026-10-23 | USDCAD ≈ 1.4150, EURUSD ≈ 1.1260 | |
| ~2026-10-16 | BD | France news priced in; spreads peaked at 168 (two Fridays earlier) | 2026-10-30 | OAT-Bund 168 peak | |
| ~2026-10-16 | AP | Rates trend resumes higher; thesis wrong on a weekly close well below 5% US 10y | rolling | 10y just above 5% (peak 5.35%) | |
| ~2026-10-16 | AP | Fed likely skips October; if so the long end sells off | after Oct FOMC | Oct hike priced < 5-6bp | |
