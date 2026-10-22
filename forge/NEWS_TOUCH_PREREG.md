# News at the vol lines — pre-registration

Committed 2026-10-01 before any number below was computed. Follows forge/FLOW_COLUMNS_PREREG.md, where touches within
60 min of a Major release continued +3.4pp and touches aligned with the surprise +7.4pp (aligned follows −0.009R;
against-surprise fades +0.049R with split halves). That result has been SEEN, so this test is built to stand on data
that has not been: Moderate-impact releases, a 2-hour window, and the indices.

## Events
`calendar_events.csv` (UTC times, USD/EUR/GBP, 2014 → 2026-07-02). Major and Moderate releases with numeric actual
and consensus. Surprise z = (actual − consensus) ÷ SD of that event's past surprises (≥ 12 prior releases, past only).

## Rows
For each instrument, the FIRST pass of each vol line in the 120 minutes after a release in one of its currencies
(instrumentCurrencies), counted from the release (a line passed before the release and again after counts once, after).
If several releases qualify, the most recent Major, else the most recent Moderate. Book races, R net of spread.

## Two alignment definitions
- **S — surprise sign** (FX and gold): the surprise pushes the instrument the way the touch is going (base-currency
  surprise up = up; quote-currency up = down; gold = USD quote), |z| ≥ 0.5. Against = |z| ≥ 0.5 the other way.
- **R — the market's first reaction** (all instruments, indices included): price move from the release minute's open
  to the close 5 minutes later, in σ; aligned = ≥ 0.1σ the way the touch is going, against = ≥ 0.1σ the other way.
  Only touches at least 5 minutes after the release use R.

## Instruments
The 16 FX/gold book instruments (S and R) and the indices NQ, SPX, DOW, US2000, DE30, UK100 (R only).

## Tests (fixed)
- **T1:** within-cell (line family × London hour × range used) continue difference, aligned vs against; day-bootstrap
  95% CI; reported for S and R, Major and Moderate separately, and by |z| (0.5–1, 1–2, > 2) for S.
- **T2:** aligned → FOLLOW net R; against → FADE net R. Benjamini–Hochberg 10% over {S, R} × {FX, indices where
  applicable} × {Major, Moderate} × {follow aligned, fade against}.
- **PASS** (a trade worth building): net R > 0 in 2016–22 AND 2023–26, survives BH, AND holds on the **Moderate-only**
  set (unseen) with net R > 0 in both halves. For R, it must also be > 0 on the indices.
- Self-check: release-time inputs use only bars up to release + 5 min, and the touch features only bars before the
  touch; future-scramble from the bar after the touch must leave the row unchanged.
