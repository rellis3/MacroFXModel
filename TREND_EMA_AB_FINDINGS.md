# EMA Crossover vs Momentum — A/B Findings (null; and a fair-test caveat)

**Question.** The "standard" retail trend strategy is buy/sell on a moving-average
cross (15/50/100 EMA). Is it any good — and how does it compare to the slow
sign-of-return momentum signal the trend engine deliberately uses instead
("Slow, not a twitchy EMA")?

**Method (Lego, not a fork).** The crossover is an injected **signal** into the
SAME `backtestMarket`/`backtestBasket` primitive — same inverse-vol sizing, same
portfolio vol-target, same costs, same no-lookahead accounting. Only the signal
changes, so the A/B isolates the signal. Daily closes built from local OANDA M1
(2016–2026), 8-market FX+gold basket, 2bp/turnover cost.

**Pre-registered prior:** the cross LOSES to momentum (more whipsaw → turnover →
cost), loses to buy-and-hold single-pair after costs, and the basket may scrape
modestly positive because the edge is diversification+sizing, not the cross.

---

## Result

### Basket (vol-sized, diversified, full sample, 2bp cost)

| Signal | Sharpe | ann.ret | maxDD | Calmar | DSR |
|---|---|---|---|---|---|
| momentum (incumbent) | **−0.18** | −2.0% | −37% | −0.05 | 0.00 |
| ema-cross 15/50/100 | **−0.12** | −1.6% | −47.5% | −0.03 | 0.01 |

Both **negative**. The −0.12 vs −0.18 gap is noise, and the cross has a *worse*
max drawdown. Neither signal works on this window.

### Single-pair Sharpe — momentum | ema-cross | **buy & hold**

| Pair | momentum | ema-cross | buy&hold | ema turnover/yr |
|---|---|---|---|---|
| EURUSD | −0.10 | 0.01 | **0.12** | 15.2 |
| GBPUSD | −0.28 | **0.08** | −0.04 | 14.8 |
| USDJPY | −0.05 | 0.09 | **0.31** | 13.9 |
| AUDUSD | −0.29 | −0.17 | **0.04** | 17.8 |
| USDCAD | −0.48 | −0.52 | **0.02** | 18.2 |
| USDCHF | −0.37 | −0.39 | **−0.24** | 19.7 |
| NZDUSD | −0.26 | −0.48 | **−0.07** | 18.8 |
| GOLD | 0.72 | 0.52 | **0.82** | 12.1 |

**Buy-and-hold beats the crossover on 7 of 8 markets.** The cross beats momentum
on 4 and loses on 4 — a coin flip, no real signal difference. Turnover is 12–20×
per year (3–4× momentum's), so it pays far more spread for the same nothing.

### Cost sensitivity (basket Sharpe by spread bp)

- momentum : `0bp:0.00  2bp:−0.18  5bp:−0.47  10bp:−0.94  20bp:−1.88`
- ema-cross: `0bp:−0.11  2bp:−0.12  5bp:−0.07  10bp:0.23  20bp:−0.56`

Momentum degrades monotonically with cost (as it should). The ema-cross curve is
**non-monotone and jumps around zero** (−0.12 → +0.23 → −0.56) — that is the
fingerprint of a signal with no real structure; the "improvement" at 10bp is
noise, not a finding. Do not read it as "costs help."

### OOS validation (IS-selected config → held-out half)

- **Momentum lookbacks:** IS-selected `slow (126,252)` had **IS 0.42 → OOS −0.20** (gap 0.62). The config that looked best in-sample died out-of-sample.
- **EMA spans:** IS-selected `fast (5,15,50)` **IS −0.02 → OOS −0.05** (gap 0.03). No overfit gap because there was never anything to overfit — flat-dead throughout.

Neither signal survives out-of-sample on this data.

---

## The honest caveat: this is not a clean test of "does trend-following work"

Two confounds, stated so the null isn't over-read *or* excused:

1. **Era.** 2016–2026 sits inside the well-documented **post-2011 trend-following
   drought.** The engine's own robustness read flags it: *"edge is NOT alive
   recently (recent-third Sharpe −0.32)… concentrated — dropping GOLD takes Sharpe
   −0.18 → −0.41."* Sub-period Sharpes: early −0.66, mid **+0.41**, recent −0.32 —
   the edge flickered on mid-sample and off since. So the *principled* momentum
   signal failing here is substantially the decade, not proof the premium is fake.

2. **Thin breadth.** The replicated trend premium lives **across asset classes**
   (equities, bonds, commodities, FX). Eight mostly-USD-correlated FX pairs + gold
   is weak diversification — and it shows: **GOLD (the one real trender) carries
   the entire momentum basket.** A fair trend test needs multi-asset breadth this
   FX-only data doesn't have.

**What is NOT confounded — the actual answer to your question:** the EMA crossover
adds nothing over the principled momentum signal, is beaten by simply holding on
7 of 8 markets, churns 3–4× the turnover, and dies out-of-sample. As a *standalone
entry rule* it is folklore, exactly as priced. The trend *premium* it gestures at
is real but (a) needs multi-asset breadth, (b) needs the vol-sizing/diversification
that is the real edge, and (c) had a bad decade — none of which the crossover
itself provides.

---

---

## Addendum — Breadth ladder: diversification IS the edge (demonstrated, not monetized)

Follow-up to the "needs multi-asset breadth" caveat above. The **full** multi-asset
test (equities + bonds + broad commodities + FX) **can't be sourced in-sandbox** —
stooq, FRED and OANDA hosts are all blocked by egress policy (403) and no data keys
are set. With **local data only** (FX majors + gold + NQ/Nasdaq) I ran the momentum
basket at increasing breadth, date-aligned (inner-join on common dates), costed 2bp:

| Basket | markets | Sharpe | ann.ret | maxDD | OOS (IS→held-out) | recent-3rd |
|---|---|---|---|---|---|---|
| FX-only | 7 | −0.41 | −4.4% | −47.7% | 0.40 → **−0.45** | −0.73 |
| FX + gold | 8 | −0.16 | −1.8% | −37.9% | 0.28 → −0.11 | −0.19 |
| **FX + gold + NQ** | 9 (3 asset types) | **0.01** | 0.1% | **−26.7%** | 0.40 → **+0.12** | −0.02 |

Adding two uncorrelated trenders (gold, Nasdaq) to a dead FX-only book
**monotonically raised Sharpe (−0.41 → 0.01), nearly halved max drawdown
(−47.7% → −26.7%), and flipped the held-out OOS from −0.45 to +0.12.** That is the
trend-following mechanism working exactly as advertised: **the edge is
diversification and risk, not the entry signal.**

**Do NOT read this as a tradeable edge — it isn't.** Honest caveats:
- **Still only ≈breakeven after costs** (Sharpe 0.01; +0.19 at zero cost → gone by
  5bp). Deflated Sharpe ≈0.01 — not significant.
- **Carried by 2 markets.** Every FX pair is individually negative (−0.04 to −0.50);
  GOLD (0.72) and NQ (0.56) do all the work. Dropping gold: 0.01 → −0.25. Two
  trenders rescuing a bag of losers is not breadth.
- **No bonds** (the classic managed-futures diversifier), no broad commodities, no
  international equity. Real breadth needs many uncorrelated markets.
- **Drought**: the recent third is ~0/negative across all baskets; the life was
  mid-sample (+0.4 to +0.6).

**Conclusion:** the *principle* (diversification is the edge) is visibly real and
points the right way; the *implementation reachable in this sandbox* is
breakeven-to-negative after realistic costs, concentrated in 2 markets, and
insignificant. The trend engine is data-source-agnostic (`backtestBasket` takes any
`{symbol, closes[]}`), so the real multi-asset test is a **data-access job**
(Railway/OANDA CFDs across asset classes incl. bonds, or a `FRED_KEY` for daily
Treasury/oil/equity series) — not a code job.

## Status

- `js/trendFollowEmaEngine.js` — `emaCrossSignal`, `compareTrendSignals`,
  `emaIsOosSplit`, `buyHoldStats`. Reuses the trend primitive via a new,
  behavior-preserving `signalSeries` injection point added to
  `trendFollowEngine.js` (golden-tested: omitted ⇒ bit-identical to the original).
- Tested `js/trendFollowEma.test.mjs` (11 tests, incl. the golden injection test).
- Registered in `LEGO_MODULES.md`. Kept as a costed A/B harness, not shipped as a
  strategy.
