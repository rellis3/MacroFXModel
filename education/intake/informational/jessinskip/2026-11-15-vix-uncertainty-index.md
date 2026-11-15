# The VIX is an "uncertainty index", not a fear gauge

| | |
|---|---|
| Lane / source | informational / jessinskip |
| Speaker(s) | JS = Jessinskip |
| URL | https://www.facebook.com/share/v/1czwyU4DLF/ |
| ReelScribe id | j578bhgdc20z4djq6r8n9mfjw58j8jz2 · 2 min |
| Recorded | 2026-09-08 (posted) |
| Processed | 2026-11-15 (research hub drop box) |

## Lesson
The VIX is built from 30-day S&P 500 option prices on both the call and put side, so it measures how much movement the
market is paying for, in either direction. A rising VIX means more uncertainty, not necessarily a fall; it can rise with
the market. Because people pay more for downside protection (puts), it usually leans to the downside.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | VIX = 30-day SPX options, calls and puts, "a normalization or variance of the premiums" (JS) | mechanism | Right in spirit: it is the 30-day variance-swap rate from out-of-the-money option prices across strikes (puts below, calls above the forward). Desk: `vix-calculus.html`, `iv-forecast` |
| 2 | "Just because the VIX is spiking, it doesn't mean the market's about to go down" (JS) | understanding | **ON FILE** (forward): `stress-filter-hold` (memory): stressed (high-VIX) days are no worse going forward; standing aside only cuts exposure. **Same day it is the other way**: VIX and SPX moves are strongly negatively correlated, so a VIX spike usually *coincides* with a fall |
| 3 | VIX can be up with the market up (JS) | understanding | True, uncommon; the CROWN_WATCH 2026-10-18 entry (VIXEQ − VIX, dispersion) covers when single-stock vol rises with index calm |
| 4 | People pay more for downside: "think of it like insurance" (JS) | mechanism | ON FILE: put skew; `vrp-forecast` FAIL (premium about one bid-ask wide), rich-vol rule (`model-audits` Q7) |

## What we could learn
Nothing new for method. A clean way to say it on a page: **"VIX = how much move is priced, not which way."** That's the
same line as the desk's "forecast = how much, not which way" (memory `lessons-on-track`). ALREADY DO.

## Research ideas
None carded (claims 2–4 on file). Display nugget, optional: a "spot up, vol up" day counter on the VIX page, as context.

## Quotes
- "I like to refer to it as the uncertainty index." (1:24)
- "Just because the VIX is spiking, it doesn't mean that the market's about to go down." (1:39)
