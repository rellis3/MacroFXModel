# Setup Watch — forward monitoring of the educator claims this desk has tested

*Built 2026-10-18 at the owner's request: "a system monitoring the market and alerting me to
possible setups coming and what I need to look for as I learn." Design note for
`js/claimWatch.js`, `claim-watch.html` and the `/api/claim-watch` route.*

## The problem it answers

Every Crown clip in `CROWN_WATCH.md` ends with a verdict, and then nothing watches whether
the setup ever occurs again. When the RSP/SPY reversion paid in the week of 2026-10-16, the
only way to know his setup had fired and resolved was to compute it by hand. The desk knew
what these setups did historically and was blind to them live.

## What was already here, and why there is no second pipeline

`js/deskWatch.js` is the early-warning layer: every 15 minutes `server.js` evaluates its
triggers, compares with the last state in `desk_watch_v1` (Cloudflare KV, permanent), and
speaks **only on a transition** — to Telegram, and into a fire log that is the Evidence
Book's forward record (each fire scored five sessions later, shown per finding on
`evidence.html`). It had two kinds of trigger: `tested` (a validated finding) and
`described` (a regime change, stamped context).

Setup Watch adds a third kind and nothing else:

| kind | what it is | tag |
|---|---|---|
| `tested` | a validated finding from the ledger | ✓ |
| `described` | a regime or chain transition, context only | ~ |
| **`claim`** | **an educator's setup this desk has TESTED, firing when the configuration he says to act on is occurring; the verdict travels with it** | ◌ |

So a claim setup going live rides the same tick, the same transition rule, the same
Telegram, the same KV store and the same log as everything else. The only new machinery is
the register, its detectors, a `stage`, and a scorer for pre-registered outcomes.

## The register (`js/claimWatch.js` → `CLAIMS`)

One row per claim. Each carries the claim in his words, the verdict in the ledger's words,
the **rule exactly as the pre-registration tested it**, the `lookFor` text, and the
`outcome` the study scored. Nothing is re-derived: the equal-weight spread uses
`js/marketScan.js`'s `scoreSeries` (one z-score shared by the board, the B1 study and the
watch); the other rules are copied from their harnesses.

| id | ledger | rule (as tested) | outcome scored | base it is read against |
|---|---|---|---|---|
| `claim-breadth-narrow` | `breadth-narrowing` (NULL) | eqwt 20-session spread z ≤ −1.8 vs ~3y (B1) | RSP/SPY change at 5, 20 | H3: −0.16 [−0.52, +0.14] / −0.06 [−0.40, +0.29] |
| `claim-breadth-broad` | `breadth-narrowing` (mirror) | z ≥ +1.8 | RSP/SPY change at 5, 20 | mirror arm, null |
| `claim-semis-tilt` | `breadth-tilt-semis` (NULL) | RSP/SPY 20s change in the bottom decile of the trailing 504 | SMH−SPY at 20, 60 | +0.45% / +1.81% unconditional |
| `claim-dispersion-rising` | `dispersion-crowded-week` (D1) | DSPX ≥ trailing-3y 80th pct AND up over 20 | range ratio SPX500/NQ at 5, 20 | +0.07 / +0.23 (SPX500) vs control |
| `claim-dispersion-falling` | `dispersion-reset` (D2, sign reversed) | same, AND down over 20 | range ratio at 5, 20 | −0.12 / −0.09 (SPX500) vs control |
| `claim-fear-spike` | `fear-gold` (NULL) | VIX +5 or more over five sessions | gold return at 5, 20 | +0.35% / +1.20% ordinary |
| `claim-rotation-extreme` | `rotation-extreme` (NULL) | \|NAS100 vs US2000 20s log-relative return\| ≥ trailing-3y 90th pct* | relative return in the extreme's direction at 20 | extended in 45% of 140 |
| `claim-crack-disagreement` | `crack-disagreement-direction` (base rate) | WTI −5% and crack +$5 over 20 sessions | WTI return at 20 | up 62% [48–75] of 45; 52% unconditional |

\* S8 used the full-sample decile; the watch uses a rolling three-year one so the threshold
is knowable at the time. Noted here so the two are not mistaken for identical.

## Stages, and the one thing desk watch lacked

Desk watch is binary. The owner asked to see setups **coming**. Each detector therefore
reports `progress` — 0 far from the condition, 1 at it, in the rule's own unit (z over 1.8;
percentile rank mapped so the 30th→0 and the 10th→1; VIX points over 5; and so on). Then:

- `progress ≥ 0.75` and not live → **approaching**. Reported once, when first crossed
  from idle or from a cleared fire (`diffStates` returns an `approaching` list); never on a
  repeat. Logged as `event: 'approaching'`, never scored.
- condition true → **live** (`firing: true`), the ordinary desk-watch start; logged as
  `event: 'started'` and scored.
- A detector whose input is missing is **absent**, not idle — the same rule as every other
  desk-watch input: unmeasured is never a clear.

Detectors read the drill bundle (`_drillBundle`, six years of daily closes already held in
memory for the drill and the Market View) and `/api/crack`'s series. If a fresh deploy has
not built the bundle yet, the tick builds it once rather than leave the claims dark all day.

## Forward scoring

`scoreClaimFires(log, { bundle, series })` fills each claim fire's `outcomes[h]` once the
horizon has elapsed, with the **study's own metric** (RSP/SPY change, SMH−SPY, range ratio
over the trailing-20 median, gold return, extension in the extreme's direction), from the
same series the study used. Range ratios need high/low and come from the desk-watch OANDA
bars (60 sessions held), so they score within that window. The generic `after5` ATR range
that desk watch already computes stays alongside for the instruments a claim names.

`claim-watch.html` shows each fire against the `base` row above. **Twenty fires is not a
study.** The forward record is a running tally the owner can read against history; the
verdicts come from the pre-registered studies and the page says so.

## The alert, and the rule it keeps

A claim start reads, in Telegram:

> ◌ **Setup watch · Crowded and still crowding (dispersion high, rising)**
> DSPX 36.6 — the 84th percentile … up +3.4 over 20 sessions … The setup is LIVE. Crown’s
> claim: “…” This desk: NULL at a week … a wider MONTH, thin, range only.
> 👁 *This is the WIDE arm. Expect a somewhat wider month on the indices, never a direction …*

The verdict is in every message. Nothing emits a direction, and the test suites assert it
(`claimWatch.test.mjs`, `deskWatch.test.mjs`). This keeps the house rule from `CLAUDE.md`
and `macroChain.js`: it explains, it does not predict. The owner's purpose is to **learn on
the tape** — to see the setup an educator names as it forms, with what the desk found when
it asked, and then to watch what actually happens. That is also why the tested-null setups
are on the register: they are the ones most worth seeing arrive.

## What is NOT on it, and why

- Clip 3's prognoses (hyperscalers over semis, alts over metals, crude higher) — no rule,
  no horizon, nothing to detect.
- `crowded-bond-short-fomc` (needs CFTC positioning on the tick), `driver-roundtrip` (M15
  intraday), `vwap`-family (already a desk-watch described trigger).
- Anything from another educator. The register is generic (`CLAIMS` rows need no code of
  their own beyond a detector); add rows as claims are tested, never before.

## Files

`js/claimWatch.js` (brick; `js/claimWatch.test.mjs`) · `js/deskWatch.js` (kind `claim`,
`approaching`, Telegram tags; tests extended) · `server.js` (`_watchInputs` → `drill`,
`crack`; `_deskWatchTick` → approaching log + `scoreClaimFires`; `/api/claim-watch`) ·
`claim-watch.html` · registered in `js/siteApiMap.js` (Learn), `js/commandHub.js` (Learn ▾),
`SITE_MAP.md`.
