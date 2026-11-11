# level-local-gamma — when price first touches a level, does the dealer gamma repriced AT that level predict whether it holds or breaks?

**Pre-registered 2026-11-11, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `level-local-gamma` (primary, NQ + ES: P1-P3). `level-local-gamma-fxgold` (secondary sample, gold + FX: S1-S2). |
| Branch | `main` (pushed via a temporary worktree; shared checkout) |
| Register row | `plans/RESEARCH_REGISTER.md` → `level-local-gamma` |
| Data | Options books: Databento CME settlement/OI chains, `OI Data/NAS100_USD.csv` (NQ options, 2020-09-04 →), `OI Data/SPX500_USD.csv` (ES options, 2020-10-19 →), `oi_recon/databento_oi/XAU_USD.csv` (OG gold, 2022-11-04 → 2026-04-15), `OI Data/{EUR,GBP,AUD}_USD.csv` and `{USD_JPY,USD_CAD,USD_CHF}.csv` (2020-09-04 →). Path: OANDA CFD M1 `Oanda Parquet Files/{nas100_usd,spx500,xauusd,<fx>}_m1.parquet` (mid). Window: sessions from the first book date + warm-up through **2026-08-21** (lockbox; nothing later is scored). London sessions 00:00-22:00, weekdays. |
| Seed | `20261111` (every script in this study) |
| Uncertainty | cluster bootstrap by (instrument, ISO week), B = 2,000; BH FDR q = 0.10 on the primary family P1-P3 and separately on the secondary family |
| Scripts / outputs | `scripts/level-local-gamma/` → `analysis/output/level-local-gamma/` |
| Harness | own Python scripts (the per-contract repricing at the touch minute is not something `runStudy.mjs` or `study.mjs` can do) |

## 1. The claim

Dealer-hedging theory (and every gamma page on the desk) says: where dealers are **short gamma** their hedging chases
price, so a level gives way; where they are **long gamma** they lean against price, so a level holds. The desk has only
ever tested the **whole-book sign at the open** (gamma-regime-trades, NULL) or **walls vs neighbouring strikes**
(wall-placebo, NULL). Neither measures the gamma that applies at the moment of the touch.

The variable here is **local gamma, repriced**: the net dealer gamma the book would carry if spot sat on the level at
the minute price arrives there, with each contract's own implied vol and the time left at that minute:

LG(L, t) = Σ_k s_k × Γ_k(F_k(L), τ_k(t), IV_k) × OI_k × mult × F_k(L)² × 0.01

(s_k = +1 calls, −1 puts: the repo's dealers-long-calls / short-puts convention; Γ = Black-76 gamma; F_k(L) = the level
translated into contract k's underlying future (basis handled, §3); OI point-in-time.) At a touch, spot is on the
level, so LG is the book's gamma at the touch, not at the open.

**Prediction from the literature** (library review, titles only: Baltussen, Da, Lammers & Martens "Hedging demand and
market intraday momentum"; Popovici "Do Gamma-Exposure Walls Exhibit Strike-Local Effects?"; Chilingarian "The Sign of
Dealer Gamma"; Ni-Pearson-Poteshman pinning, as cited): **LG < 0 → breaks more**, by a few pp, growing with |LG|;
**LG > 0 → holds more** (theory only; no paper gives an empirical intraday hold estimate). Popovici's SPY null compares
walls with *other gamma strikes*, never with random prices; whether gamma at a price matters at all, and whether it
matters more at a real level than at a random price, is open.

## 2. Why it is not already settled (prior art, grep'd 2026-11-11: forge/, oi_research_book/, js/deskEvidence.js, register)

| Prior | What it tested | Why this is different |
|---|---|---|
| `wall-placebo` (NULL; audited 2026-10-24) | OI walls vs neighbouring listed strikes, pooled, break rate within ±2.1pp. Audit: walls were compared with CFD prices **without the futures-CFD basis** (NQ ~+100 pts) and calls/puts not swapped on inverted pairs | Here every book price is translated into CFD space with a daily measured basis (§3), inverted pairs are handled in CME units, and the variable is gamma at the level, not "is a wall" |
| `gamma-regime-trades` / `-fx` (NULL) | whole-book gamma sign at the open as a fade/follow switch at forecast lines, as a costed trade | that is the open-time book sign; this is the repriced gamma at the touch minute, scored as a hit rate, no costs |
| `gex-range` / `gex-range-es` (VALIDATED) | short gamma (book sign) → wider next-day range; ~half is recent falls | size, not hold/break at a level |
| `hedge-flow` / `hedge-flow-side` (NULL / UNDERPOWERED) | hedge-flow schedule size and side vs range | daily range, not the touch |
| flow columns (dealer GEX sign null at vol lines; `directional-rescore`) | GEX sign as a column at export lines | open-time sign again |
| `wall-dte-style` (REGISTERED, **being run now by another session**, `oi_research_book/scripts/30_*`) | strong walls by own DTE bucket × book gamma sign × strength × hour vs grid-neighbour placebo; includes a descriptive local-gamma cut at walls | walls only, book sign at the open. This study: levels of every kind including random prices and forecast-ladder lines, and the repriced local variable. No file, script or register row of `wall-dte-style` is touched |
| `oi-level-map` (EXPLORATORY) | ~35 nightly captures, many line types vs random lines | 35 days; pointers only |
| `nq-line-touch-hold-to-close`, `day-recon-*` (M3-M7) | forecast lines vs phantom ladders: no line beats a phantom on direction | no gamma conditioning |
| Popovici (library, SPY) | walls vs rank 2-5 GEX strikes: breach −2.0pp [−6.9, +2.9], holdout −3.1pp [−8.5, +2.4] | never vs random prices; SPY not CME |

## 3. Definitions (frozen)

**Instruments and samples.** Primary: NQ (NAS100 CFD path, CME NQ options book) and ES (SPX500 CFD path, CME ES options
book). Secondary, never pooled with the primary: gold (XAUUSD path, CME OG book, 2022-11 → 2026-04-15) and six FX pairs
(EUR, GBP, AUD, JPY, CAD, CHF; CME FX options). **Coverage caveat, stated up front:** the CME NQ book is ~5% of Nasdaq
dealer gamma and the ES book a similarly small slice of S&P gamma (SPX/SPY/QQQ options are not in the archive), and
the CME equity-index books here are quarterlies (median nearest expiry ~45 days; no 0DTE/weeklies). LG measures the
CME book's gamma only.

**Sessions and σ.** London date, path 00:00-22:00 London from the CFD M1 mid. Open = first bar at/after 00:00 London.
σ = standard deviation of the last 20 NY-close (17:00 New York) daily log returns built from the same M1, all closing
before the session opens (data-rules item 2). Band b = 0.25 × σ × open (price units).

**Point-in-time book for session S.**
- OI: the latest book date D whose **next** trading date is strictly before S (OI(D) is public mid D+1, so it is known
  before S opens). OI per contract (expiry, strike, right); a missing OI print is forward-filled from that contract's
  previous print for at most 3 book dates.
- IV and basis: the settlement prices of the latest book date P < S (settlements are public the evening of P, before
  00:00 London S). Per-contract IV by Black-76 inversion of the settlement on contract k's own forward F_k(P) (put-call
  parity on the strikes nearest the money of that expiry); OTM side used per strike (call above F_k, put below); missing
  or failed inversions filled by linear interpolation in strike within the expiry, flat beyond the ends; an expiry with
  < 3 valid IVs uses its ATM IV, else the front ATM IV.
- **Basis (the wall-placebo audit fix).** C(P) = the CFD mid at the CME settlement minute on P (equity index 15:00
  Chicago; gold 13:30 New York; FX 14:00 Chicago). A CFD price X maps into contract k's future as
  F_k(X) = X × F_k(P) / C(P). Inverted FX pairs (USDJPY, USDCAD, USDCHF) are handled entirely in CME units: the path is
  transformed to 1/price (high and low swapped) before anything else, so a level, a touch and a race are the same events
  in either quoting; the basis ratio is applied the same way in CME units.
- Strikes are kept within ±15% of F_k(P) (FX ±6%); contracts with OI ≤ 0 are dropped.

**Local gamma at the touch.** For an event at level L touched on M1 bar t:
τ_k = (expiry_k − t) in years (365.25 days), contracts with τ_k ≤ 0 dropped, τ floored at 10 minutes;
LG(L,t) as in §1 with F_k(L) from the basis map and mult = the contract multiplier in `oi_research_book/scripts/pair_config.py`.
**Scale-free form used for every test: LGs = LG(L,t) / GG_open(S)**, where GG_open(S) = the trailing median, over the
prior 60 sessions, of the book's **gross** dollar gamma Σ |Γ_k| × OI_k × mult × F² × 0.01 at the session open. Only
past sessions enter, so LGs is point-in-time.

**Terciles.** Per instrument, LGs tercile cut points come from the LGs of **all events of that instrument in prior
sessions** (expanding window, at least 60 sessions of events; earlier events are warm-up and not scored). Bottom
tercile = "LG low (negative side)", top = "LG high (positive side)". The pure sign split (LGs < 0 vs > 0) is secondary.

**Levels.**
1. **Random levels (the main sample).** Per session, 10 prices at signed distance d × σ × open from the open, with
   |d| ~ Uniform(0.10, 2.00) and a fair coin for the side, drawn with the study seed (one generator, instruments and
   sessions in a fixed order).
2. **Forecast ladder lines (NQ, gold, EURUSD only).** The archived static OH / OL p50 / p75 / p90 levels from
   `analysis/output/day-reconstruction/archive/<NAME>_days.parquet` (`lvl_OH_p50` …; production `buildLadder`, point-in-time
   folds from 2020-08-21). ES and the other FX pairs have no archived ladder and get none (no ladder is built for this
   study).
3. **OI walls.** From the session's PIT book: the two strikes with the largest call OI above F_front(P) and the two
   with the largest put OI below (all expiries summed per strike), mapped to CFD space by the basis.
Any level within 0.05 σ of the open is dropped (no approach side). Real levels = ladder + walls.

**Event.** The first touch of each level in the session from its approach side: a level above the open is touched by
the first bar whose high ≥ L, a level below by the first bar whose low ≤ L. Touches with < 30 minutes before 22:00
London are dropped (counted).

**Outcome (primary).** The 0.25σ race from the touch: BREAK if price reaches L + b beyond the level (in the approach
direction) before L − b back; HOLD (bounce) if the reverse; by 22:00 London. On the touch bar only the break side is
checked (the bar came from the approach side); a later bar that reaches both is **ambiguous** (dropped, counted).
Neither by 22:00 = **unresolved**: dropped from the primary rate, share reported per cell (a cell dropping > 20% is
flagged), and a sensitivity counts unresolved as HOLD.
**Secondary outcomes:** signed return in σ units at 15 / 60 / 240 minutes after the touch bar close, signed so + = in
the break direction (continuation through the level), truncated at 22:00 London (missing if the horizon passes it).

**Hour cut.** Minutes to the cash close of the market where the hedging happens: NQ/ES 16:00 New York; gold 13:30 New
York (COMEX settle); FX 16:00 London (WM fix). Windows: last 60 minutes and last 30 minutes before that close.

**DTE split.** LG computed from the contracts with ≤ 1, 2-5 and > 5 days to expiry at the touch, separately.

**Secondary variables.** (a) Local share = |net GEX of strikes within ±0.25 σ of F_k(L)| / gross |GEX| of the book,
at the touch. (b) Gamma slope beyond = LGs(L + b in the approach direction) − LGs(L), same minute.
(c) Open-sign control: the whole-book sign of LG at the session open price and open time.

**Estimator.** Within each instrument the events are put in strata = approach direction (up/down) × |distance of L
from the open| bin (0.05-0.25, 0.25-0.5, 0.5-1.0, > 1.0 σ) × London block of the touch (00-07, 07-12, 12-16:30,
16:30-22). D = Σ_strata w_s × (break rate bottom tercile − break rate top tercile), w_s = stratum event count, strata
with < 10 events in either arm skipped. Pooled across instruments by event-count weights. The raw (unstratified)
difference is reported beside it. Rates on resolved events. Units pp.

**Uncertainty.** Cluster bootstrap over (instrument, ISO week) clusters, B = 2,000, seed 20261111, percentile 95% CI;
p = two-sided share of bootstrap draws on the other side of 0 (×2). Halves: chronological, split at each instrument's
median scored session.

**Placebos.**
- **Neighbour-year book (the mirror).** LG recomputed at the same L and minute from the book of the book date nearest
  365 days earlier (later if no earlier one exists), each contract's strike re-centred by moneyness
  (K' = K × F_front(now) / F_front(then)) and its time to expiry carried over (τ' = expiry − then-date − (t − P)). It
  has the shape of a real book but not today's positioning. **It must not pass the P1 gate**; if it does, the effect is
  geometry (where gamma usually sits), not positioning, and P1 is demoted to CONTEXT.
- **Whole-cluster permutation**: tercile labels permuted between (instrument, ISO-week) clusters 2,000 times; the real D
  must sit above the 97.5th percentile.
- **Calls/puts swapped**: mechanical; must flip the sign of D exactly (code check, asserted).

## 4. Hypotheses (expectation first)

| # | Question | Pre-registered expectation |
|---|---|---|
| **P1** | At **random levels** (gamma at any price), NQ + ES: D = break(bottom LGs tercile) − break(top LGs tercile) | **Yes, small**: D ≈ +3 to +5pp (negative gamma breaks more) |
| **P2** | At **real levels** (NQ ladder + NQ/ES walls), same D | Yes, similar or larger |
| **P3** | **Level-specific gamma**: D(real) − D(random), difference-in-differences, two-sided | Null expected (Popovici; wall-placebo); a pass means gamma matters more at a level than at a random price |
| | **THE GATE** (each of P1, P2) | D ≥ +3pp; 95% CI excludes 0; BH q ≤ 0.10 in the family P1-P3; same sign in both halves; same sign on NQ and on ES; the neighbour-year mirror does not pass the same gate; the real D above the 97.5th percentile of the cluster permutation |
| | **P3 gate** | \|DiD\| ≥ 3pp, CI excludes 0, BH q ≤ 0.10, same sign both halves |
| | **THE MIRROR** | neighbour-year book: must NOT pass (else CONTEXT). Calls/puts swap: D flips sign exactly |
| **S1** | Gold (random + real levels, separate cells), same D and gate (single instrument; halves) | Weaker or null (no weeklies, small book) |
| **S2** | FX six pairs pooled, random + real, same D; instrument rule ≥ 4 of 6 same sign | Null expected (Baltussen: FX continuation not significant after 2000; `gamma-regime-trades-fx` NULL) |

Secondary family (BH q = 0.10 across all of these, descriptive weight only; a survivor is a candidate for its own
prereg, never a result):
- P1/P2 per instrument (NQ, ES).
- P1/P2 per real-level family (ladder, walls).
- **Close window**: D in the last 60 and last 30 minutes before the cash close vs D in the rest of the session
  (interaction), random and real levels. Library prediction: any effect concentrates there.
- **DTE split**: D using LG from ≤ 1, 2-5 and > 5 DTE contracts separately (cells with < 400 events per arm are
  reported as UNDERPOWERED, not scored).
- Sign split (LGs < 0 vs > 0) instead of terciles.
- Dose: D(bottom vs middle) and D(middle vs top), to see whether the effect grows with |LG| or sits at one end.
- Local share (a) and gamma slope (b): bottom-vs-top tercile D on each.
- Open-sign control: D within open-book sign = long and within = short (does the touch-time variable add beyond the
  open-time sign that already failed?).
- Signed σ returns at 15 / 60 / 240 minutes: bottom − top tercile difference.
- Unresolved-as-HOLD sensitivity.

## 5. Power

Measured n per cell is written into a `PRE-RESULTS` amendment (A1) by a count-first pass **before any outcome is
computed** (touches and LG only; no race, no returns). Planning figures: NQ and ES each ~1,400 scorable sessions,
10 random levels a session, ~50-60% first-touched → ~7,000-8,000 random events per instrument, ~2,500 per tercile;
~300 ISO weeks per instrument, ~600 clusters in total.

MDE (80% power, two-sided α = 0.05) for a difference of two break rates near 50%:
MDE = 2.8 × sqrt(0.25 × (1/n_bottom + 1/n_top)) × sqrt(deff), deff = 1 + (m − 1) × ρ, m = events per cluster,
ρ = 0.02 assumed intra-week correlation of outcomes (events in a week share the same market path). With ~5,000 per arm
pooled over NQ+ES and m ≈ 25, deff ≈ 1.5 → MDE ≈ 3.4pp. **P1 is at the edge of the 3pp bar; P2 and P3 (fewer real
events, ~4 walls + 6 ladder lines a session on NQ, 4 walls on ES) are expected UNDERPOWERED for 3pp.** The rule:
a cell whose A1 MDE exceeds 3pp is UNDERPOWERED by design; if it comes back with a CI that still includes +3pp it is
banked UNDERPOWERED, and if the CI upper bound is below +3pp it is banked NULL (the effect the gate needed is ruled out).
After the run, the realised bootstrap SE replaces the assumed deff in the verdict (MDE = 2.8 × SE).

## 6. Multiplicity

- Scored cells: P1, P2, P3 (primary, ledger id `level-local-gamma`); S1, S2 (secondary sample, ledger id
  `level-local-gamma-fxgold`). BH q = 0.10 over P1-P3 (as briefed); P1/P2 gates are additionally conjunctive (halves,
  both instruments, mirror, permutation), which is stricter than Holm on two cells. S1-S2 BH q = 0.10 between them.
- Secondary family above: ~40 cells, BH q = 0.10 with the chance baseline; descriptive only.
- Promotion to anything live needs |t| ≥ 3 and a forward test; nothing here is promoted by this study alone.

## 7. What this does NOT test

- **Not a trade.** No costs, no stop/target, no entry rule; a pass says the hold/break odds differ, not that a fade or
  follow pays net (every costed direction test on the desk has failed).
- **Not the whole dealer book.** CME futures options only (NQ ~5% of Nasdaq dealer gamma; no SPX/SPY/QQQ/0DTE);
  the sign convention (dealers long calls, short puts) is assumed, not observed.
- **Not range size** (gex-range-es covers that), not vanna/charm flows, not the hedge-flow schedule, not intraday OI.
- Direction of the day: the D statistic is about holding vs breaking relative to the approach side, not up vs down.

## 8. What each verdict changes

- **P1 passes**: local repriced gamma becomes a candidate break/hold column for the level pages (OI levels export,
  S/R zones) as a probability shift, shown as research-only until a forward record at |t| ≥ 3; the page wording "gamma
  holds/breaks levels" is allowed for this variable only. **P1 null**: pages stop implying that dealer gamma at a price
  makes it hold or break; the gamma map stays a size/vol context.
- **P2/P3 pass**: levels carry gamma-specific behaviour beyond a random price; candidate for a wall/line shadow.
  **Null/underpowered**: walls and ladder lines are treated like random prices for gamma purposes.
- **Close-window survivor** (secondary): candidate for its own prereg on the forward record (Cboe chain capture from
  2026-10-19 carries SPX/NDX/QQQ books, the right population).
- **S1/S2**: gold/FX pages get the same wording as P1's verdict only if their own cells agree.
- **Underpowered**: the forward route is the Cboe full-chain archive (2026-10-19 →), which covers the index books that
  dominate dealer gamma; a re-run needs ≥ 400 sessions of it.

## Amendments

(none yet; A1 = the count-first power table, PRE-RESULTS)

## RESULTS

*Written to `analysis/output/level-local-gamma/RESULTS.md` and `results.json`.*
