# The week, scored — every series against its own history, and the weeks that sat like this

*Registered 2026-09-20 before running. Built after the Colez Trades "Release
Map" teaser (cog000.github.io/Release-Map), which shows three things: every
macro series scored as a z of its weekly change against its full history; this
week's move placed in that series' distribution; and the nearest past weeks in
the space of those scores, with what followed at 4, 13 and 26 weeks. This desk
builds the same three, from free series, and adds the one thing the teaser does
not show: whether the analogues' outcomes are any better than a random ten
weeks. That test is registered here before it runs.*

## The panel (frozen)

Weekly (Friday close to Friday close, or the last print of the week for series
that publish weekly), from FRED without a key except where noted, OANDA for
prices:

| series | what is scored | history |
|---|---|---|
| policy (target, upper) | change, bp | 2008 → |
| 2-year, 10-year, 30-year | change, bp | 1976/1962/1977 → |
| 2s10s, 2s30s | change, bp | 1976 → |
| real 10y (TIPS), breakeven 10y | change, bp | 2003 → |
| term premium 10y (Kim–Wright) | change, bp | 1990 → |
| dollar (broad) | % change | 2006 → |
| VIX | change, points | 1990 → |
| HY OAS, IG OAS | change, bp | 1996 → (FRED key on the server; the keyless CSV is three years) |
| CP less bill (3m AA financial CP − 3m bill) | change, bp | 1997 → |
| bank credit | % change | 1973 → |
| reserves, net liquidity (balance sheet − TGA − RRP), RRP | % / $bn change | 2002 → |
| plumbing (SOFR − IORB) | change, bp | 2021 → (short; shown, not used in analogues) |
| oil (WTI) | % change | 1986 → |
| gold, copper/gold, S&P 500, EUR/USD | % change | 2005–2008 → (OANDA) |

**Score:** z = (this week's change − mean of all weekly changes) / sd of all
weekly changes, over the series' full history to date. Shown with the
histogram of every weekly change and this week's bar marked. Plain words:
|z| < 1 ordinary, 1–2 notable, 2–3 unusual, > 3 rare.

## The analogues (frozen)

- State vector: the z of every panel series with at least ten years of history,
  this week. Past weeks with a full vector are candidates.
- Distance: Euclidean in z. Nearest first. **Crowding rule:** once a week is
  chosen, any candidate within eight weeks of it is removed, so the ten nearest
  cannot all be last quarter.
- What followed: for S&P 500, EUR/USD, gold and the 10-year yield, the change
  over the next 4, 13 and 26 weeks from each analogue week — shown as ten dots
  and a median, against the unconditional distribution of all weeks.

## W1 — do the analogues carry information? (the test)

- Walk-forward over the last 400 weeks: at each week t, using only data to t,
  find the ten analogues (crowding rule applied), take the median of their
  13-week-forward S&P, EUR/USD and gold changes as the call, and score its sign
  against what happened at t+13.
- Baselines: (a) the unconditional sign frequency over the same 400 weeks;
  (b) 200 placebo draws of ten random past weeks per t (same crowding rule),
  scored the same way — the distribution of hit rates a "random ten weeks"
  produces.
- Also the size of the error: median |actual − analogue median| against
  median |actual − unconditional median|.
- **Pass:** hit rate above the 95th percentile of the placebo distribution on at
  least two of the three targets, and error smaller than unconditional.
- **Falsifier:** inside the placebo band, or error no better than the
  unconditional median. If it fails, the page still shows the analogues — with
  the placebo result printed under them, so "when did it sit like this before"
  is read as history, not as a forecast. The desk's prior on this: the Event
  Book's pre-event analogues scored 49.3% against a 51.5% placebo.

## What it changes

A new screen, `weekmap.html`, linked from The books. Nothing on today.html
changes except the books row. No lean, no trigger.

---
