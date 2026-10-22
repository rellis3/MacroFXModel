# The exhaustion playbook on EURUSD — pre-registration

Committed 2026-09-30 before any number was computed.

## Source
A summary of this repo's earlier exhaustion research (volatilityExhaustion/README.md Phases 3, 7, 11,
Trade_Decision_Engine/FIT_FINDINGS.md Result 5, education/FORECASTER_WALKTHROUGH_NOTES.md Part 4) gives a
playbook: at a forecast line, the default is continuation; fade only when the multi-timeframe WaveTrend is
stretched, preferably with the USD trend, after a candle closes back inside the line; lean continuation on
expansion days. Each piece was measured on its own, with other geometry. This tests them as the playbook
says to use them, on EURUSD, inside the touch book's framework.

## Rows
Every non-same-bar pass of every export line (OH/OL, Close, dynamic Proj H/L) — the sequence book's
31,024 EURUSD passes, 2016-03 → 2026-08. Train 2016–2022, test 2023–2026-08.

## Conditions (known before the decision)
- **WT stretched (Phase 11):** WaveTrend 9/12/3 (js/vumanchuState.js), wt1 of the last COMPLETED M15 bar
  AND the last completed H1 bar ≥ +53 for an up-line touch (≤ −53 for a down-line).
- **USD-aligned fade (Result 5):** USD trend = mean over GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD of
  each pair's 10-NY-day log return, signed so + = USD stronger, from NY closes before the London open.
  A fade is aligned if it sells EURUSD at an up-line when the USD trend > 0, or buys at a down-line when < 0.
- **Expansion day (Phase 3):** the previous London day's range ≥ its hl p75, OR today's σ > 1.10 × the
  mean σ of the previous 5 days.

## Entries (the touch book's race: fade target = the line behind, stop = the next line out)
- **Fade at the touch** (entry at the line), and **follow at the touch** (target next line, stop line behind).
- **Confirmed fade (Part 4):** after the pass, wait for the first COMPLETED M15 bar that closes back inside
  the line; enter at the next bar's open, target the line behind, stop at the next line out. No trade if the
  next line out or the line behind is reached before confirmation, or no confirmation by the day end.
All net of `costForPair`; R = the trade's own stop distance; unresolved closes at the London day end.

## The playbook (the rule under test)
- **FADE (confirmed entry)** when WT stretched AND USD-aligned;
- **FOLLOW at the touch** when NOT WT stretched AND expansion day;
- otherwise no trade.

## Pass
Playbook net R > 0 with t ≥ 2.0 over the full period AND > 0 in both halves. Also reported, not pass
criteria: each component alone (WT-stretched fade at the touch / confirmed; USD-aligned fade; not-stretched
follow; expansion-day follow) and the playbook by line family. This is roughly the 13th level test on these
lines; any pass is reported with that count.

## Causality
The builder aborts unless sampled passes' WT, USD-trend and expansion flags are identical when EURUSD and
the six USD pairs are replaced with a different random walk from the pass bar onward.
