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

## Findings — run 2026-09-21

Crack history 1986-06 → 2026-09-15 (7,760 sessions). The 3-2-1 crack is
**$64.2/bbl** on the last print, against a median of $19.4 since 2010
(quartiles $14.9–$25.8, 90th percentile $35.9) — Crown's "$70 against a
normal $15–25" is right. Four blow-outs this year alone (March, April, June,
August: +$13 to +$19 in 20 sessions, z 2.2–2.9); 61 episodes since 1996.

**C1 — range.** *Null.* After the first session of a blow-out (n=24–25 usable
with OANDA history) the next 20 sessions' mean daily range: WTI 1.16 ATR vs
1.03 control, +0.13 [−0.02, +0.16] — leaning wider but the interval touches
zero and the episode count is small; USD/CAD −0.03 [−0.06, +0.04]; gold
−0.06 [−0.09, −0.002], a hair *narrower*. No range trigger.

**C2 — the inflation channel.** *Real.* Over all 20-session windows since
2003 (n=5,700), Δbreakeven correlates 0.40 with Δcrude and 0.19 with Δcrack;
the crack's partial correlation after removing crude is **0.185 [0.10, 0.27]**
— the crack adds to inflation pricing beyond crude. The disagreement cut says
the same thing in plainer terms: in windows where crude fell ≥5% but the
crack rose ≥$5, breakevens moved −4bp (median, n=165); where both fell,
−14bp (n=198); difference **+15bp [+4, +32]**. So when crude sells off but
products stay tight, the bond market does not take the inflation relief.
Crown's mechanism holds on this data.

**C3 — "the crack tells the truth".** Crude was higher 20 sessions after a
disagreement window 62% of the time [48–75] (n=45), after an agreement window
49% [33–65] (n=33), after any −5% crude window 55% [47–62], unconditional
52% [47–57]. Leans his way; the interval holds the coin. A base rate.

## What goes on the page

- A **Crude & the crack** card: WTI (live vs FRED), gasoline, heating oil,
  the 3-2-1 crack with its normal band and percentile word, the 20-day
  change, and the three verdicts in one line each.
- A chain node **Crack spread** with the link **crack → inflation pricing**
  (+1), judged like every other link; the card carries the C2 figure.
- No range trigger; C3 written as the base rate.
