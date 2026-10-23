# vvix-nasdaq-ratio — When the ratio of how VVIX (or VIX) and Nasdaq price information is at an extreme, what happens next?

**Pre-registered 2026-10-23, before any outcome was computed.**

Features (`analysis/output/vvix-nasdaq-ratio/FEATURES.md`) and a planted-signal power check (`power.json`) were computed
first. They never read a return after the signal.

| | |
|---|---|
| ID / ledger id | `vvix-nasdaq-ratio`; scored questions `vvix-ratio-direction` (Nasdaq returns) and `vvix-ratio-range` (Nasdaq realised vs implied vol, VIX change) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `vvix-nasdaq-ratio` |
| Data | Daily closes 2009-09-14 → 2026-08-21 (lockbox). CBOE VVIX, VIX, VXN, VIX3M, VIX9D (`analysis/surfaces/cboe/`); Nasdaq-100 (FRED NASDAQ100). 4,259 sessions |
| Seed | `20261023` |
| Uncertainty | OLS with Newey–West (lag = horizon); 200 shifted-ratio placebos for the selection-aware check |
| Scripts / outputs | `scripts/vvix-nasdaq-ratio/` → `analysis/output/vvix-nasdaq-ratio/` |
| Harness | own scripts |

## 1. The claim (required)

C.OG, Discord, 2026-10-23 (recorded verbatim in `education/cog-snippets.md` §3):

> Take a look at the ratio between how vvix and Nasdaq are pricing in information
> So model it as a ratio and say for every % Nasdaq prices in what is the relative priced in % of vix all per unit time
> and then you want to create a time series of that ratio and see how it looks over time and when that ratio is at an extreme
> What then happens

He did not say whether "priced in" means realised or implied, VVIX or VIX, the unit of time, what "extreme" is, or
what to look at afterwards. **The operationalisations below are ours.**

## 2. Why it is not already settled (required)

The nearest ledger entries are all on implied-vol *levels or term structure*, not this ratio:

- `vix-inversion`, `mv-vixterm-range`, `vol-curve-front` (validated: range);
- `iv-over-rv-wider` (validated);
- `rates-vol-gap-*` (MOVE vs VXN: null / underpowered);
- `vol-crush-drift` (null).

No entry tests vol-of-vol (VVIX) at all, and none tests the sensitivity of a vol index to Nasdaq. The validated VIX
effects are put in as **controls**, so a pass has to be information beyond them.

## 3. Definitions, fixed in advance (required)

**Constructions** (computed at the close of day d):

| | Definition | Reading |
|---|---|---|
| **R_a** (realised, VVIX) | sd(Δln VVIX) ÷ sd(Δln NDX) over the last 20 sessions | % VVIX moves per % Nasdaq moves; "per unit time" cancels in the ratio |
| **R_b** (realised, VIX) | the same with VIX | C.OG names VVIX, then writes "vix" |
| **R_c** (implied) | VVIX ÷ VXN | vol-of-vol priced per unit of Nasdaq implied vol |

**Extreme:** the ratio's percentile within its last 252 sessions (including d; causal). Top decile = `hi`, bottom
decile = `lo`.

**Timing:** the CBOE indices close at 16:15 ET, after Nasdaq's 16:00 close. Outcomes therefore start at the close of
**d+1**, so no 15-minute look-ahead is possible.

**Outcomes** (each standardised by its own full-sample SD for reporting; t-stats are scale-free):

| | Measure | Question |
|---|---|---|
| `ret5` | ln NDX(d+6 / d+1) | direction |
| `ret20` | ln NDX(d+21 / d+1) | direction |
| `range20` | ln( realised vol of daily NDX returns over d+2..d+21, annualised ÷ VXN at d ) | does the market run wider or calmer than implied? |
| `dvix20` | ln VIX(d+21 / d+1) | what VIX does next |

**Regression** (all days):

> outcome ~ 1 + hi + lo + controls

The controls are all known at d: the VIX percentile, VIX > VIX3M, VIX9D/VIX, the NDX 20-day return, and NDX rv20/VXN.
Newey–West lag is the horizon (5 or 20). The coefficient on `hi` (and on `lo`) is the effect *beyond* the known
VIX-state effects.

**Splits** (stability): discover 2009-09 → 2015 (1,585 sessions), validate 2016–2020 (1,259), test 2021 → 2026-08-21
(1,415). The model is fitted separately in each.

**Descriptive (not scored):**

- the ratio's time series;
- the event study around *entries* into each tail (first tail day after ≥ 20 sessions outside): mean NDX, VIX and
  VVIX paths −20…+20 sessions.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | `hi` / `lo` shift Nasdaq's next 5 / 20 sessions beyond the VIX-state controls | **Null** (no direction effect from vol states in the ledger) |
| b | `hi` / `lo` shift realised vs implied range or VIX's next move beyond the controls | **Possible**: vol-of-vol carries information about vol, not direction. Sign not predicted |
| | **THE GATE, per cell (24 scored)** | All three: pooled 2009–2026 Newey–West t passes Holm α 0.05 across the 24 cells; the same sign in discover, validate and test (each fitted separately); \|t\| above the p95 of 200 shifted-ratio placebos (the ratio series rolled ≥ 252 sessions, flags and fit recomputed) |
| | **THE MIRROR** | `lo` is scored as its own cell; a reversal sign passes by the same gate |
| | **Tradable** | Only for passing direction cells: a daily rule from the flag, net of NQ costs. Range and VIX cells feed the range lines as context, if they pass |

## 5. Power (required; measured on this panel before registering, `power.json`)

Synthetic h-day outcomes (fat-tailed daily shocks summed over h, so they overlap like the real ones), with a planted
shift of β outcome-SDs on top-decile days. The detection rate for the registered regression:

| construction, horizon | β = 0.1 / 0.2 / 0.3 / 0.5 at p < 0.05 | under the Holm-24 bar |
|---|---|---|
| R_a, 5 d | 0.27 / 0.65 / 0.92 / 1.00 | 0.04 / 0.22 / 0.60 / 0.99 |
| R_a, 20 d | 0.15 / 0.34 / 0.62 / 0.94 | 0.02 / 0.07 / 0.23 / 0.64 |
| R_c, 5 d | 0.29 / 0.64 / 0.95 / 1.00 | 0.05 / 0.29 / 0.74 / 0.99 |
| R_c, 20 d | 0.17 / 0.44 / 0.68 / 0.95 | 0.03 / 0.09 / 0.29 / 0.74 |

80% power under the full bar needs β ≈ 0.35 SD at 5 days and ≈ 0.6 SD at 20 days. **Pass bar (economic): 0.2 SD.**

Every cell is UNDERPOWERED by design for effects near 0.2 SD. A cell whose 95% interval excludes ±0.2 SD is recorded
as NULL; otherwise it is UNDERPOWERED. In Nasdaq terms, 0.35 SD at 5 days is about 1% and 0.6 SD at 20 days about 3.5%,
so only large directional effects are findable.

## 6. Multiplicity (required)

- **Scored:** 3 constructions × 2 tails × 4 outcomes = **24 cells**. Holm α 0.05, plus the conjunctive period
  condition and the selection-aware placebo.
- **Descriptive:** the event-study paths and the ratio time series.
- Nothing is promoted without |t| ≥ 3 and a forward record.

## 7. What this does NOT test (required)

- Intraday ratios (1–15 min). The intraday VVIX and VXN legs are now pulled (cog-chart, 2026-10-23), but history is
  60 days, so forward only.
- Whether this is C.OG's exact construction (unknown).
- Other vol-of-vol measures (VIX options skew, VVIX term structure).
- Cause.

## 8. What each verdict changes (required)

- **Pass (range / VIX):** a context flag on the vol and range pages, and a candidate input to the NQ range lines,
  research-only until |t| ≥ 3 or a forward record.
- **Pass (direction):** its own costed prereg.
- **Null / underpowered:** recorded. The ratio is added as a chart leg for context, and the reply to C.OG states the
  numbers.

## Amendments

(none)

## RESULTS

See `analysis/output/vvix-nasdaq-ratio/RESULTS.md`.
