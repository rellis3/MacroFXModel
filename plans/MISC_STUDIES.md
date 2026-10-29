# Misc studies

Studies that belong to no programme (not C.OG, not the OI book, not rates): retail playbooks from videos, one-off
desk questions. Each row points at its register row in `plans/RESEARCH_REGISTER.md`, which stays the source of
truth for status; this file is the index for the misc family, so later tests can find earlier ones and reuse their
components. Add a row when you claim a misc study; update the verdict and reusable components when it is banked.

| ID | Source | Question (short) | Verdict | Reusable components found | Prereg |
|---|---|---|---|---|---|
| daily-open-fib-retest | YouTube @Jay-ColezTrades, "My Daily Open Strategy Explained" (owner, 2026-10-27) | Gold: after an impulse off the 18:00 NY open, sell/buy the return to the fib 1, stop 1.2, target 0 (5R), BE at 1R | **NULL** (2026-10-28): bid/ask −0.72R/trade [−0.82, −0.63]; mid gross −0.05R, 14 of 28 shifted opens | gold none; EURUSD and NQ, see below | `forge/DAILY_OPEN_FIB_RETEST_PREREG.md` | `forge/DAILY_OPEN_FIB_RETEST_PREREG.md` |
| daily-open-fib-tracker | owner, 2026-10-29 | Forward record of the same rule, every night, 20 instruments, bid/ask (`daily-open-fib.html`) | display only (verdict stays NULL) | — | none |

Related earlier work on the same playbook family (not in the register): `DailyOpenResearch/` (FINDINGS.md: the 23:00 UK
open across gold, NQ, EURUSD: profile, ORB, fib pullbacks, swing retests, VWAP, Asia range).

## Reusable components found

Inputs for later preregs, never results. Each beat both the random walk and the 28 shifted opens, on the same side in both halves, after BH q 0.10 (`analysis/output/daily-open-fib-retest/RESULTS.md` §4).

| From | Instrument | Component | Numbers (real vs shifted-open mean) | Use |
|---|---|---|---|---|
| daily-open-fib-retest | EURUSD | After an impulse off the 18:00 NY open, the first return to the opening extreme **holds better than chance** | P(sweep to 1.618 before the 0) 0.51 vs 0.60; P(the 0 before the 1.2) 0.188 vs 0.159; primary gross +0.09R [−0.01, +0.20], beats all 28 shifts | a location/rejection fact; unaffordable at a 0.2-leg stop (cost ~0.8R); test with wider legs or as context for other EURUSD entries |
| daily-open-fib-retest | NQ | After the same retest, price **stalls**: fewer runs far past the 1 and fewer runs to the 0 | P(1.618 first) 0.55 vs 0.61; P(0 before 1.2) 0.127 vs 0.144 | a compression/range fact at the reopen, not a direction; candidate input for range or time-exit studies |
| daily-open-fib-retest | Gold | none: return, sweep and depth all match the shifted opens | e.g. P(0 before 1.2) 0.151 vs 0.153 | — |
