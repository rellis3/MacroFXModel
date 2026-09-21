# The crack spread — crude and fuel as two markets

*Pre-registered 2026-09-21, before any data was pulled. Prompted by a Crown
Macro piece: refiners buy crude and sell gasoline and diesel; the 3-2-1 crack
(three barrels of crude in, two of gasoline and one of diesel out) is their
margin per barrel; it traded ~$70 against a normal $15–25; and "when crude and
gasoline disagree, the crack spread is what's telling the truth" — a crude
sell-off with the crack blowing out is not a resolved conflict, and tight
products feed the pump price and so the inflation prints. This desk trades
FX, gold and indices, so the questions are what the crack carries for those,
and for crude's own path.*

## Data (all FRED, daily, no key; EIA spot prices, ~a week behind)

| series | id | unit |
|---|---|---|
| WTI Cushing | DCOILWTICO | $/bbl |
| NY Harbor conventional gasoline | DGASNYH | $/gal |
| NY Harbor No. 2 heating oil (the diesel proxy) | DHOILNYH | $/gal |
| 10-year breakeven | T10YIE | % |
| OANDA D1 (London day) for ranges: WTICO_USD, USD_CAD, XAU_USD | | |

**3-2-1 crack, $/bbl** = ((2 × gasoline + 1 × heating oil) × 42 − 3 × WTI) / 3.
History from 1986. Windows are 20 sessions, matching the chain.

## Definitions, frozen

- **Crack blow-out**: the 20-session change in the crack is at or above +2 z
  of its own trailing 10-year distribution of 20-session changes.
- **Disagreement**: over 20 sessions crude fell ≥ 5% while the crack rose ≥ $5.
  Its mirror: crude fell ≥ 5% and the crack fell ≥ $5 ("agreement").
- Controls are the desk's standard: matched windows (same weekday/regime not
  required; a block bootstrap over non-event windows, 1000 reps, blocks of 20).

## Claims

**C1 — range (the desk's standard).** After the first session of a crack
blow-out, the next 20 sessions' realised range (sum of daily high−low over
close, in ATR terms) for WTI, USD/CAD and gold, against the ordinary-window
control. Real only if the difference's interval excludes zero.

**C2 — the inflation channel (same window, explanatory).** Does the crack add
to breakevens beyond crude? Over all 20-session windows, the partial
correlation of Δbreakeven with Δcrack after removing Δcrude, with a block
bootstrap interval. And the disagreement cut: in disagreement windows, the
median Δbreakeven against agreement windows. Real only if the partial
correlation's interval excludes zero *and* the disagreement cut sits the same
way.

**C3 — "the crack tells the truth" (direction, base rate).** After a
disagreement window, the share of the next 20 sessions in which crude ended
higher, with its interval, against the same after an agreement window and
unconditional. Reported whatever it says; a base rate, not a claim.

## What each verdict does to the page

- The crack spread appears as a reading regardless (the level, its normal
  band, its z) — that is description, not a claim.
- C1 real → a Desk Watch range trigger; C1 null → none.
- C2 real → a chain link `crack → inflation pricing` with the tested figure;
  C2 null → no link, and the card says crude alone carries the channel.
- C3 → the base rate written on the card either way.

Harness: `analysis/crack_spread_study.mjs`. Output: `analysis/output/crack_spread.json`.

## Findings

*(to be filled after the run)*
