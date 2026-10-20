# bank-credit-dollar — results

Prereg: `forge/BANK_CREDIT_DOLLAR_PREREG.md` (committed in `18258679`, 2026-10-20). Run 2026-10-20, seed 20261020, B = 2000.
Branch `main`. Ledger ids: `bank-credit-dollar-dxy`, `bank-credit-dollar-nasdaq`.

## Verdict: UNDERPOWERED (dxy) · CONTEXT (nasdaq)

The signal is 4-quarter FX-adjusted growth in cross-border US-dollar bank claims (BIS LBS), treated as known two quarters after the quarter it describes. It was correlated with the next quarter's log return.

**dxy.** r = −0.10, 95% CI [−0.24, +0.02]. The gate fails: the CI includes 0 and the result is inside the placebo band. The CI still includes −0.15, so the cell is UNDERPOWERED, not NULL.

**nasdaq.** r = −0.16 [−0.28, −0.06], Holm p 0.008, the same sign in both halves (−0.12 / −0.25), and outside the placebo band [−0.12, +0.17]. That meets the two-sided gate as written. It is banked as CONTEXT by amendment A2 for three reasons. The sign is the opposite of hypothesis (b). The result disappears once the two credit-boom busts are removed. It turns positive in the last decade.

## Scored cells

| Cell | n | r | 95% CI | MDE | Useful bar | Holm p | Cell verdict |
|---|---|---|---|---|---|---|---|
| dxy | 165 (1985-Q2 → 2026-Q2) | −0.104 | [−0.241, +0.017] | 0.24 | 0.15 | 0.114 | UNDERPOWERED |
| nasdaq | 165 | −0.162 | [−0.280, −0.059] | 0.24 | 0.15 | 0.008 | CONTEXT (gate met; demoted, A2) |

Slopes: Nasdaq −0.28% per quarter for each +1 pp of credit growth; DXY −0.07%.

## Controls

- **Placebo** (circular shifts of at least 12 quarters, 142 shifts): dxy band [−0.16, +0.16]; nasdaq band [−0.12, +0.17]. Both bands are centred near 0, so the design is not biased.
- **Time shift** (descriptive). Nasdaq r at lags 0–7: −0.13, −0.11, −0.15, −0.16, −0.15, −0.08, −0.06, −0.03. The curve is smooth and fades, as a slow regime variable would. It is not a spike at the chosen lag. DXY sits between −0.03 and −0.10 at every lag.
- **Concentration** (`concentration.json`), nasdaq:

| Slice | n | r |
|---|---|---|
| all | 165 | −0.16 |
| excluding 1998–2002 | 145 | −0.17 |
| excluding 2007–2009 | 153 | −0.09 |
| excluding both | 133 | −0.07 |
| excluding the top 3% of absolute returns | 160 | −0.12 |
| 1980s / 1990s / 2000s / 2010s / 2020s | 19/40/40/40/26 | −0.21 / −0.18 / −0.11 / −0.04 / +0.12 |
| last 10 years | 42 | +0.09 |

- **Terciles** (nasdaq, mean next-quarter log return): credit growth below 2.7% → +4.6%; 2.7–7.6% → +4.1%; above 7.6% → −0.5%. The latest reading (2026-Q1) is 12.2%, in the top tercile.

## Deviations from the prereg

- A1: the sample starts in 1985-Q2 (where Yahoo's monthly history begins), not 1980-Q3. MDE 0.24.
- A2: nasdaq demoted from VALIDATED to CONTEXT (post-hoc, demote only).
- The signal uses the latest BIS vintage, so it carries revision lookahead (as the prereg said in §3).

## Descriptive (not part of the verdict)

- Other signals at lag 3. EUR credit growth: dxy −0.13, nasdaq −0.08. All-currency credit growth: −0.10 / −0.13. Dollar lending to non-bank financials (44 quarters only): −0.03 / +0.00.

## What this changes

- No page or bot may present BIS credit growth as a forecast of the dollar or Nasdaq. It is shown as a **credit regime** (context): high growth was the backdrop to both of the large Nasdaq busts in this sample, 2000 and 2008. In the 2020s it has not been followed by weak returns.
- A forward record starts with the next BIS release, at one observation per quarter. This is slow by nature, and nothing sizes on it.
- What would reopen it: a point-in-time (vintage) BIS series, which removes the revision lookahead, or a cross-country panel (each borrower country's credit growth against its own equity or FX return), which gives far more independent observations than one global series.
