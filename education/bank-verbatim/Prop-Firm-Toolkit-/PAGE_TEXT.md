<!-- https://cog000.github.io/Prop-Firm-Toolkit-/ | Colez Trades — Prop Firm Toolkit -->
Colez Trades
Quantitative & Macro Insights
Prop Firm Toolkit
18:29:18 C.OG IDLE
Briefing
01Outcome
02Trade Model
03Sensitivity
04Funded Account
Trade Model
Sandbox active · **—** Adjust Exit
No model loaded
Upload your trade history, or start from an example model.
⇪ Upload trades CSV
accepted CSV formats & examples →
example models
Forecaster Portfolio Coming soon Coming soon
Source—
Frequency—
Scale k1.00×
—
▤ Edit dataset
Firm & Program
Prop Firm FTMOThe 5%ersAlpha Capital GroupFXIFYTopstepLucid TradingFundedNext
Program FTMO Challenge · 2-StepFTMO Challenge · 1-Step
⚙ Custom rules · build your own
S1S2Profit Target10%5%Min Days44Max Loss10% staticDaily Loss5% · of initial · hard
Rules: Trading Objectives · 1-Step Challenge
Simulation
Paths5,000
▶ RUN SIMULATION
Initialising…
⚗ Sandbox · synthetic edge
01OutcomeFTMO · FTMO Challenge · 2-Step — run to populate
Funded Rate
—
both phases cleared
Blown
—
hit max drawdown
Median Days → Funded
—
P10–P90 spread
Median Worst DD
—
median path · vs max-loss floor
MCP
Monte Carlo — Equity Path Distribution
—
—
[CANVAS chart]
⟋
Run simulation to render paths
Computing paths
P25–P75 band
P10–P90 band
Median (P50)
Mean
P10 / P90
Passed paths
Blown paths
DTPDays to Pass — Percentiles passing paths only
Step 1
—
P10 fast
—
Median
—
Mean
—
P90 slow
Step 2
—
P10 fast
—
Median
—
Mean
—
P90 slow
Step 3
—
P10 fast
—
Median
—
Mean
—
P90 slow
[CANVAS chart]
ODBOutcome Distribution
[CANVAS chart]
—
Funded
Fully funded—
Cleared Step 1 · failed later—
Blew Phase 1—
Read
02Trade Modelbootstrap from real trades
IMPImport Trade History no source
⇪
Drop a CSV of your trades here
or **click to browse** · accepts % returns, R-multiples, or P&L · view format examples
Load sample: Forecaster Portfolio Coming soon Coming soon CSV formats ▾ Paste data ▾
Parse pasted data
% returns preferred⤢
Date,Return %,MAE % 2025-01-02,-1.20,-1.40 2025-01-02,0.30,-0.10 2025-01-03,2.10,-0.20 2025-01-06,-0.50,-0.70 2025-01-06,1.00,-0.60 2025-01-07,0.65,-0.30

R-multiples⤢
date,R,MAE (R) 1/2/2025,2.4,-0.8 1/2/2025,-1,-1.3 1/3/2025,1.6,-0.4 1/3/2025,-1,-1.1

Currency P&L⤢
Trade Date,PnL ($),Risk ($) 2025-02-03,"$120.00",$50 2025-02-03,(50),50 2025-02-04,"1,000",500

MAPColumn Mapping auto-detected
Value column
Column represents % return (of equity) R-multiple (× risk → %) Profit / Loss (currency)
P&L → % via Normalize by average loss Risk-amount column Fixed risk per trade
Risk column
Fixed risk (currency)
Date / time column— none —
Intraday low (optional)— none —
Use historical trade frequency Avg trades/day (used when dates are off) Risk per 1R % of equity — converts R / P&L data —
EDGEmpirical Edge — From Your Trades —
Trades
—
sample size
Win Rate
—
—
Expectancy
—
per trade
Profit Factor
—
gross W ÷ L
Std Dev
—
% dispersion
Opt. Kelly
—
scale ×
Avg Win
—
winners
Avg Loss
—
losers
Largest Win
—
best %
Largest Loss
—
worst %
Max Loss Streak
—
consecutive
Skew
—
tail bias
RDSReturn Distribution — % of Equity —
[CANVAS chart]
EQRRealized Equity cumulative % · native
[CANVAS chart]
PRVParsed Trades — Preview first rows
| # | Raw Value | % Return | Outcome |

BSTBootstrap Method
i.i.d. resample Preserve streaks
Block length5
Plain resampling draws each simulated trade independently from your history. **Preserve streaks** draws contiguous blocks instead, retaining short-run autocorrelation — so real winning/losing clusters carry into the simulation and drawdowns are modelled more honestly. Applies on the next run.
Read
03Sensitivitywhat moves the funded rate
SNSParameter Sensitivity — Δ Funded Rate 1,000 paths each · win-rate · R:R · risk · frequency
[CANVAS chart]
Read Each bar is the change in **funded rate** when one parameter is shifted by a fixed delta, holding the rest at your current edge and the selected firm's rules fixed. Early steps carry the largest targets, so **win-rate** and **reward:risk** shifts usually move the funded rate most, while raising **risk-per-trade** mostly adds floor-breach exposure without speeding the pass.
04Funded Accountsurvival & sizing
ODDOverall Drawdown Buffer—
Soft Stop
—
Pause · review
Hard Stop
—
No further trades
DDDDaily Drawdown Buffer—
Daily Soft
—
Step back
Daily Hard
—
Done for the day
SRVFunded Account Survival Probability Cumulative monthly
[CANVAS chart]
SIZPosition Sizing — Monthly Blow Probability at your current edge
| Scale | Exp. Monthly Return | Monthly Blow Prob. | Profile |
| Run simulation first |

Read Buffer stops are anchored to your **5th-percentile drawdown sequences** across all simulated paths. Hold inside them and even an extended run of bad variance stays clear of the program's hard limits with margin to spare. The sizing table reads the same edge against five risk levels — the **marked row** is your current setting. For futures programs the funded stage differs structurally (e.g. Topstep's XFA trails from a $0 start) — treat this pane as an extrapolation of the evaluation's rules.
Custom Rules
runs on the exact engine behind every listed program
✕
Phases
1-step2-step3-step
min days must be **profitable** — at least % each
Max drawdown
%
Static Trailing · EOD Trailing · balance
trail lock
stops at initial never stops
Daily loss limit
%
of initialof day-start
hard breachpause day
Consistency rule
best day ≤
% of
phase targetnet profitpositive days
Apply & use these rules Cancel
✕
⚗Sandboxsynthetic edge ✕
Every manual input lives here — win rate, reward:risk, sizing, pacing — a hypothetical edge that never touches your loaded model. Runs use the selected firm's real rules and are labelled **parametric**.

Win Rate58%
Reward : Risk1 : 1.8
Risk / Trade0.50%
Trades / Day3
Edge is assumed stable trade-to-trade. Real edge drifts — treat these as a confident estimate.
Expectancy**+0.312%**Full Kelly**34.7%**
Close ▶ Run sandbox simulation
▶ RUN SIMULATION IDLE