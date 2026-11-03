# Review lens: how C.OG looks at a system or a result

Used by `/cog review …`. Built from his pinned messages, DMs and course pages. Each check cites where it comes from.
Go through these in order and keep only the ones that bite for the thing being reviewed.

| # | Check | His words / source |
|---|---|---|
| 1 | **Is there a baseline system, and is this adding a function to it?** If so, ask whether a *new* system run at portfolio level would do more. | DM 18/08: "an even better option would be to instead spread out into new system construction and then run everything at a portfolio level … the risk diversification benefit is very real" (`cog-snippets.md` §7) |
| 2 | **Map the trade distribution first**: full MFE and MAE before any stop, filter or tweak. Engineer to the distribution; don't bolt on a rule. | §5: "First what I would map out before anything is your actual current trade distribution … full mfe and mae analysis"; §1: "none of the above … model and test … what changes does actual yield any predictive power" |
| 3 | **Losses are part of the distribution.** A change whose aim is removing losing trades overfits. | Pin: "Rather than thinking okay how do I now completely remove the losses( this will never work and you'll overfit and end up killing the model)" (§10) |
| 4 | **Is the equity curve an artifact?** Simulate many paths from the system's distribution: are they consistent, tight, with structurally positive drift? Where does the realised drawdown sit among them? | progression-path transcript; case study LESSON_01 |
| 5 | **Does it beat buy-and-hold** after costs, and is the risk worth it? | progression-path: "if it's not outperforming buy and hold, then you don't want to be taking unnecessary risks" |
| 6 | **Gross vs net, side by side.** Strong gross and flat net is a finding, not a failure. | Overnight-Buy-Hold page |
| 7 | **Where does the signal come from?** If it is read off the instrument's own chart, look for an external factor with a mechanism. | DM 18/08 ("external factor … open interest"); macro video ("overfitting in hindsight") |
| 8 | **Knowable when?** No look-ahead: stamp at confirmation, not at the print. | macro video ("couldn't actually characterise that until 4:45") |
| 9 | **Single instrument or basket?** Breadth raises the chance of success and is easy to expand. | DM 28/07: "target a basket of equities rather than Nasdaq alone" (§6) |
| 10 | **Sizing vs its theoretical ceiling**, and whether better sizing would also close the max drawdown. | VIP: "how close the position sizing is to the theoretical ceiling … close in that max dd" (§9) |
| 11 | **Forward vs backtest.** Do paper or forward results fall in the same distribution as the backtest? If not, the backtest is the suspect. | progression-path ("falling into the same distributions") |
| 12 | **Would it survive the rules** (prop-firm or account rules), as a separate question from profitability? | Overnight-Buy-Hold page |
| 13 | **How many variations were tried, and where are they?** | micro-learning-bank evidence.md |

Bring in the wider evidence where it bites (e.g. what the literature says about backtest overfitting, deflated
Sharpe, or the specific signal family), with sources. Then add the repo's own checks where they apply (`research-protocol` → `stats-defaults.md` lessons, `data-rules`
checklist). The usual ones: placebo distribution, return/drawdown confound, costs measured not assumed, concentration
by year.

Write the styled reply as he would in a DM: two or three of the most important points, briefly, encouraging, with one
concrete first step. Put the full checklist results in a table under it.
