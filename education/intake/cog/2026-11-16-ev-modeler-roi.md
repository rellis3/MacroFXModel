# EV modeler: short-term ROI from prop challenges, long-term robust systems

| | |
|---|---|
| Lane / source | cog / C.OG video (course walkthrough) |
| Speaker(s) | C.OG throughout (no members speak) |
| URL | none: the owner pasted the transcript in a session, 2026-11-15 |
| ReelScribe id | n/a (pasted). Raw text: `education/intake/raw/cog/2026-11-16-ev-modeler-roi.txt` (gitignored) |
| Recorded | unknown; after the overnight buy-and-hold task and the upgraded Prop Firm Toolkit (Nov 2026) |
| Processed | 2026-11-16 |
| Companion notes | `education/progression-path-breakdown-notes.md` (same funnel, earlier video), `education/micro learning bank.md` (Risk of Ruin) |

## Lesson

C.OG splits the work into a **long-term aim**, a validated robust system that can scale even at about 2% a month, and a
**short-term aim**, "EV modeling" against retail prop firms (FTMO, FundedNext). A challenge is bought for a fee and
traded on simulated capital. If a system with "the right shape distribution" passes often enough, the payouts exceed
the fees: "five challenges, four we lose, the fifth pays $1,000, fees $500, net +$500". His upgraded toolkit takes the
journal's prop-firm CSV, Monte-Carlo-simulates the system under a firm's real rules, and now goes past the pass rate to
**expected profit, the chance of any withdrawal, the days from pass to first withdrawal, the payout distribution by
week and the EV per challenge bought**. The point is to know all of this "before we even have a single penny at risk",
and to use prop payouts as short-term capital for data and for the long-term system, not as a destination ("they profit
from the losers").

## Transcript fixes

| Transcript | Fixed | Note |
|---|---|---|
| "Tino" | Sortino | listed with Sharpe as risk-adjusted metrics |
| "prop firm talker" / "this talker" | prop firm **toolkit** | the tool is "Prop Firm Toolkit" (`education/bank-verbatim/Prop-Firm-Toolkit-/PAGE_TEXT.md`). The second read suggested "tracker"; disputed |
| "if the fees were funded with the first payout" | **refunded** with the first payout | a toggle in the modeler |
| "the path a pass" | the path to a pass | |
| "at your play now" | at your disposal now | |
| "full distribution leg" | full distribution range [?] | P10 to P90 |
| "longer-term product" | longer-term process [?] | |
| "Quen", "Kimmy", "deep seek", "Funded Next" | Qwen, Kimi, DeepSeek, FundedNext | names |
| "export to the and upgrade to the uh software" | export to the upgraded software | |

## Segments (no timestamps; order in the talk)

1. **Where you stand** (teaching). Long-term aim = robust system; education (micro learning, education bank) and
   software (new terminal) push towards it. 2% a month with good drawdown and Sharpe/Sortino "scales insanely".
2. **LLMs** (teaching). "You never want to be dependent on an LLM", but they break the coding barrier. Pipeline: idea
   (education, papers, own hypothesis) → validate → LLM helps code → output in the software's format.
3. **EV modeling defined** (teaching). Retail prop firms, simulated capital; the $100 × 5 example; "the right shape
   distribution"; "two months of solid work … many people could have a positive EV system".
4. **The overnight buy-and-hold task** (task). "The important part is the validation process", even if the idea fails.
5. **Terminal walkthrough** (software demo). Import template ("standard with prices") → upload → year-by-year
   consistency, losing months, distributions, basic t-stats and p-values ("will be expanded"), example 173% over the
   period, 2026 example $100k → +$31,600. Journal → "prop firm CSV" export.
6. **Toolkit → EV modeler** (software demo). Monte Carlo on the system's volatility under firms' rules ("pulled from
   the internet") or custom 1/2/3-step rules. Example: 81% pass. "This is not an expected value." New outputs: expected
   profit, P(withdraw anything), median days from pass to withdrawal eligibility, balance fan P10–P90 with nothing
   withdrawn, payout by week (week 6: 11.78%, lower quartile 4.92%), EV per challenge bought, 81% reach funded, **78%
   cover their fee**, dry spells, account sizes / max allocation, fee input, fee-refund toggle, instant accounts
   ("we'll talk about how to model around that"), firm switching.
7. **Why props, and why only short term** (teaching). Conflict of interest: firms earn from failures; nearly everyone
   skips the data side. Use them to fund data and capital for the long-term system.
8. **Tasks** (task). Redo the overnight buy-and-hold → load into the terminal (drawdowns, MAE/MFE, filter by asset) →
   export → upload to the upgraded toolkit → read funded rates, EV, expected balances over time.

## Framework map

Process and risk, not the market gates: this is C.OG's progression path (idea → validation → paper → burn-in →
deployment; `progression-path-breakdown-notes.md`) with the prop funnel as stage 7, now extended from pass rate to
EV. It links to Risk of Ruin (sizing is set so the floor is never reached) and snippet §9 (sizing against the
theoretical ceiling). Nothing here touches G1–G3, OI or the vol lines.

## Claims

| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | Prop EV: "although we could lose some accounts … from the ones we do pass, the return is greater than the costs" (C.OG) | method | ON FILE: `overnight-hold-toolkit` CONTEXT (net funded 39–56% at 1×, EV positive), `portfolio-book-prop` CONTEXT (+1.52% of account per attempt at 1×, edge part +1.40%). **Differs:** we found a **zero-edge** copy also clears the FTMO fee (break-even fee ~1.0–1.2% vs a ~0.54% fee), so a positive EV per challenge does not by itself show an edge. He shows no zero-edge baseline |
| 2 | "81% chance of passing … this is not an expected value" (C.OG) | method | ON FILE (we agree): both studies report EV separately from the funded rate |
| 3 | "78% actually cover the fee"; "if this was 0% … back to the drawing board" (C.OG) | method | UNTESTED: we never computed P(payouts ≥ fee) per attempt. Our closest is the break-even fee |
| 4 | Payout by week: week 6 11.78%, lower quartile 4.92% (C.OG, example system) | example | UNTESTED: our replica pays month-end only, over 12 months; no weekly payout curve, no days-to-first-withdrawal |
| 5 | Fees refunded with the first payout (toggle) (C.OG) | method | UNTESTED: our EV takes the fee as lost |
| 6 | "Two months of solid work … many people could have a positive EV system" (C.OG) | trading | PARTLY: our two attempts give positive EV, but most of it is the prop structure, and the funded median is **8–10 months** at 1× (`overnight-hold-toolkit`), so the payouts arrive late |
| 7 | "Validate as many ideas as possible until you can see one that works or at least has positive expectancy" (C.OG) | method | **Conflicts** with our multiple-testing rule (data-rules; trial ledger): the more ideas tried, the more "positive expectancy" appears by chance. It works only with every attempt logged and the winner corrected for the count (Holm/BH) |
| 8 | "Even if it doesn't work out, the important part is the validation process" (C.OG) | method | ON FILE (agree): verdict words and NULL banking |
| 9 | Year-on-year: "a fairly stable and consistent positive return" (C.OG) | method | ON FILE: stability by year / halves in `stats-defaults` |
| 10 | A system averaging 2% a month "is achievable"; scalability "insane" (C.OG) | claim | UNTESTED as a claim; no system of ours reaches it net of costs (Portfolio Book CFD-only CAGR 1.7%) |
| 11 | Retail props: simulated capital, "they profit from the losers", conflict of interest, short term only (C.OG) | context | ON FILE: `progression-path-breakdown-notes.md` (same point; we add counterparty risk: rule changes, denied payouts) |
| 12 | "You never want to be dependent on an LLM" (C.OG) | method | ALREADY DO: check-the-catalogue rule, learn-intake step 4 |
| 13 | Basic t-stats and p-values as the start of a validation suite (C.OG) | method | ON FILE: ours is wider (bootstrap CIs, power/MDE, lockbox, Holm) |
| 14 | The toolkit models "the system's volatility" (C.OG) | method | PARTLY: our replica block-bootstraps the actual daily rows (block 5, check at 21), which keeps fat tails and streaks; a vol-only parametric model would not. Unknown which his uses for the EV stage |
| 15 | Members "already doing this and having a lot of success" (C.OG) | anecdote | not testable (survivorship; see method lesson on outcome-selected populations) |

## Contradictions with our verdicts

- **EV > 0 is the wrong bar.** His decision rule is "positive EV per challenge / fee covered > 0%". Ours: compare with
  the **zero-edge copy under the same rules**, because the fee caps the downside and paid wins are kept. Under FTMO 2-step
  the zero-edge copy already has positive EV in our replica. The strategy's contribution is the gap (about +1.4% of
  account per attempt for the Portfolio Book, about 2% for the overnight hold).
- **Speed.** His example shows payouts from week 6; ours at 1× needs a median 160–260 trading days just to be funded.
  Sizing up to go faster breaks the 5% daily limit (both studies). The difference is the input system, so his example
  can't be checked until we run our files through his tool (`analysis/output/prop-toolkit-check/`).
- **"Validate many until one works."** See claim 7. It needs the trial count.

## What we could learn

- **Funded-stage outputs** (P(withdraw anything), P(cover fee), days from pass to first withdrawal, weekly payout
  quantiles, fee refund): DON'T DO. Our replica stops at a 12-month payout total and a break-even fee. Carded (Q2).
- **The decision rule written as EV per challenge bought, before money is at risk**: ALREADY DO (break-even fee,
  edge EV), but we add the zero-edge baseline he lacks. Method lesson #28.
- **Several accounts on one system are one bet**: neither he nor we model it. Method lesson #29, card Q3.
- **The live guard must be in the simulation**: neither models daily-loss stops, max trades or news blocks changing
  which trades are taken. Card Q4.

## Research ideas

New agenda `research-director/agendas/prop-ev.md`:
- **Q1** replica vs his toolkit on the same files (owner-run; pack built).
- **Q2** funded-stage EV in his outputs (P(cover fee), days to first withdrawal, weekly payout quantiles, refund), each
  against the zero-edge copy.
- **Q3** correlated accounts: N simultaneous attempts on one system vs staggered starts vs different systems.
- **Q4** guard-adjusted pass rate: simulate with the live risk guard's rules applied to the trade stream.

## Second read

Fresh subagent on the raw text only: 92 items. **Added from it:** the Sortino fix, 2026 example (+$31,600 on
$100k), "dry spells", "max allocation", instant accounts, the LLM-dependence rule, the 173% example. **Disputed 1:**
"talker" → it suggested tracker/calculator; the tool is the Prop Firm Toolkit, so "toolkit". No numbers differed.

## Quotes

- "Short-term aim, and this is massive, EV modeling."
- "We're saying if we have a system with the right shape distribution, we can potentially EV model to where although
  we could lose some accounts … the return is greater than the costs to reach that point."
- "We have an 81% chance of passing … However, this is not an expected value."
- "81% of the accounts we buy with this example system will reach the funded stage. 78% actually cover the fee."
- "So they profit from the losers, which is a direct conflict of interest. So we know that in the long term, this is
  not the best place to be."
