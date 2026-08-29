# How a CME paste becomes levels — current pipeline (2026-08-27)

End-to-end walkthrough of what happens between pasting the CME/QuikStrike matrix and a
line appearing on the TradingView indicator or a zone reaching the OI bot. Written after
the 2026-08-26 gamma-scoring change, because several steps no longer work the way the
older notes describe.

---

## 1. Paste → strikes

`oiParseTable` / `oiMatrixExpiryLegs` (`js/oi.js`) read the tab-separated matrix. Each
expiry column becomes a **leg**: `{ dte, strikes[], calls[], puts[] }`.

Legs carry their own DTE read from the header, so the columns do **not** have to be in
ascending DTE order (CME sometimes isn't — a 126-DTE column has appeared between 212 and
274).

## 2. Basis shift — futures space → spot space

Option strikes are quoted against the **future**; you trade **spot**. Every strike is
shifted:

```
level = CME strike − basis          basis = futures − spot
```

Re-derived live and re-projected every 15 min (`_refreshOIBasis`), so levels move through
the day even when the OI does not.

> **Known limitation.** One scalar basis is applied to **every** leg, but a gold matrix
> references several different futures (GCV6 4671.2 → GCM7 4824 — a 153-point spread).
> The traded legs are all on the front future so they're correct; back-month legs in the
> per-expiry table and in `fullBook` GEX are under-shifted by up to ~150 points.

The decimal ending tells you which day's basis a level was drawn with — `.25` vs `.39`
are different captures.

## 3. Two expiries get picked

| | chosen by | used for |
|---|---|---|
| **Primary** | `pickPrimaryExpiry` — most near-money OI | the swing/context book |
| **Day** | `pickNearExpiry` — shortest DTE that still has real near-money OI | what the bot trades |

`pickNearExpiry` requires near-money OI clearing **either** 6% of the strongest leg's
**or** an absolute 500-lot floor, so a nearly-empty front weekly is not picked. When no
leg qualifies, `dayExpiryReason` says why rather than going silent.

## 4. Greeks — real DTE, real vol

Both books compute their own greeks:

```
T      = clamp(that leg's own DTE, 1, 365) / 365
sigma  = pasted per-strike IV smile  →  that expiry's ATM IV  →  flat vol
```

`OI_GREEK_T = 14/365` still exists but is only a **default argument** for direct helper
calls — every real call site overrides it. The old "fixed 14-DTE assumption" comment on
that constant is stale; don't trust it.

`buildGexProfile` then produces, per strike:

```
callGex = callOI × gamma × contractSize × spot
putGex  = putOI  × gamma × contractSize × spot
netGex  = callGex − putGex
```

**`callGex` / `putGex` are the numbers everything downstream should be ranking on** —
they already fold in OI, moneyness, DTE and vol.

## 5. Walls at source — still raw OI

In `js/oi.js` (main path and `computeExpiryLevels`):

1. keep strikes with `oi >= minOI` (default 20)
2. sort by **raw OI**, descending
3. take the top `numLevels` (default 8; currently 20 for gold)
4. tag each with a tier

Tier is the **3× rule** — the strike's OI over the average of its ±2 neighbours:
`≥3× strong · ≥2× moderate · ≥1.5× weak`.

> **Two known weaknesses.** Neighbours all zero → the "isolated wall" branch returns
> `strong` with a `null` multiple. On a leg that only trades 25-point strikes that fires
> on *every* wall — one gold expiry graded 33 of 33 "strong", including a 9-lot one. And
> because liquidity clusters on round numbers, the rule largely detects round numbers.

**This ordering is raw OI and has not changed.** What changed is what consumers do with it.

## 6. Max pain — full chain, deliberately

`oiCalcMaxPain` sums over **every** strike, unfiltered. Where the wall list drops small
strikes, max pain must not: dropping them tilts the pain curve and moves the minimum.
The day expiry deliberately recomputes max pain from the *unfiltered* leg for this reason.

Max pain is only meaningful in the last day or two, and only when the pin is close enough
to reach in the time left.

## 7. Flips

`gexFlipCrossings` root-finds **every** zero-crossing of total net GEX across ±25% of
spot, returning `{price, dir}` per crossing. `gammaFlip` is the cheaper per-strike scan.
Where they disagree, the crossings are the better number.

As of 2026-08-26 the **day expiry computes its own crossings** too. It previously had
none, so the producer nulled the field and the `localRegime` gate silently could not fire.

## 8. Wall SELECTION for levels — gamma-scored (changed 2026-08-26)

`_selectWalls` in `js/oiConfluence.js` decides which walls become emitted levels.

**Was:** `score = oi × relevance(distance)`, where relevance used one radius
(`2.5 × refMove`) for every wall regardless of expiry.

**Now:** `score = |callGex|` / `|putGex|` for that strike, from **that book's own**
gexProfile — the day book scored on the day profile, the primary on the primary.

Why: how far a wall reaches depends on its DTE. Per-contract gamma as a share of each
expiry's own at-the-money gamma (gold, 25% vol):

```
  dist     1DTE    3DTE    7DTE   30DTE   90DTE
  +100    27.8%   65.7%   84.1%   96.8%   99.6%
  +200     0.7%   18.9%   49.6%   86.3%   96.6%
  +300     0.0%    2.5%   21.0%   71.2%   91.2%
  +500     0.0%    0.0%    1.5%   39.1%   75.6%
```

Near expiry is a tall narrow spike; far expiry a shorter, wider plateau. At +300 a 30DTE
contract carries ~8,700× the gamma of a 1DTE one. A single radius therefore does **both**
wrong things at once — keeps dead near-expiry walls inside it, cuts live far-dated walls
outside it. Gamma scoring makes the horizon handle itself.

Then the survivors are filtered by `minTier` and a `minShare` floor (30% of the top
score) and capped at `maxWalls` (3).

**Fallback is all-or-nothing per book:** a quota-trimmed record can lose its gexProfile,
and mixing gamma scores with size scores compares two different units — so if any wall in
a book can't be scored by gamma, that whole book reverts to the old size × distance
behaviour. Callers passing an explicit `topWalls` bypass scoring entirely.

## 9. Who consumes what — and where they still disagree

| Consumer | Wall ordering | Gamma-aware? |
|---|---|---|
| C+Z / OI export → TradingView | `_selectWalls` | **yes** |
| `/api/oi-levels` | `_selectWalls` | **yes** |
| `oi_recon/log_expectations` | `_selectWalls` | **yes** |
| **Today's read** panel (top of OI page) | own gamma ranking off gexProfile | **yes** |
| **Wall tables** on the OI page | `(b.oi) − (a.oi)` — raw OI | **no** |
| **OI bot**, Mode A (PIN fades) | nearest strike first | n/a — already near-money |
| **OI bot**, Mode B (breakouts) | `oi × durability` | **no** |

The page's "STRENGTH" toggle still means *biggest OI*. Near expiry that points at strikes
with almost no gamma left, which is why Today's read carries an explicit warning at ≤2 DTE
telling you to use its gamma-ranked list instead.

The bot was deliberately left alone: Mode A already selects nearest-first so it is
unaffected, and switching Mode B was measured as worth only +2 reachable zones out of 21
while materially increasing trade frequency.

## 10. Reachability — measured against *today*

Distance alone doesn't say whether a level is tradeable. Today's read anchors everything
to one normal day:

```
1-day move (1σ) = spot × frontATMIV × √(1/365)      ← fallback: refMove × √(1/primaryDTE)
```

Levels beyond 2× that are dropped from the headline (counted, not hidden); past 1× they're
tagged inline. `refMove` itself is measured to the **primary** expiry, so it overstates
what's reachable intraday — the reason the day-scaled number exists.

---

## Known gaps

1. **`oi_history` was wiped on 2026-08-26** (407KB → 16.5KB, one day). Consequences:
   `gexMedianAbs` is null so the **GEX neutral band and conviction sizing are off**;
   `classifyOIChange` has no yesterday so `avoidLiquidating` can never veto and the hold
   score runs on 3 of 4 components. Recoverable from the `oi_raw_YYYY-MM-DD` keys, which
   do have six days.
2. **Wall tables and Mode B still rank by raw OI** (§9).
3. **Isolated-wall tier branch** grades no-neighbour strikes as `strong` (§5).
4. **One basis for all legs** (§2).
5. **Reachability calibration** is an EUR/USD M5 curve applied to gold and indices.
6. **Mode C (max-pain reversion)** fires at pins 4–5× a normal day away; running as a
   shadow test on the demo account, judge it on `mfe_pips` at n≈20.
