# Hedging vs. Spread Trading — why our hedges bled and the journal's pairs don't

A note prompted by a simple observation: the **beta-hedge signal**, the
**hedge monitor**, and the **position-hedge bot** all lost money and never really
reduced the risk of a trade — while the colleague's **Trade Journal** pairs
(`L:DAX S:SP`, `L:DOW S:NAS`, two stakes, `Z IN` / `Z OUT`) are doing well.

They look similar (both involve two correlated instruments) but they are doing
**fundamentally different jobs**. That difference is the whole story.

---

## The one-line answer

> Our hedges tried to **cancel risk on a directional trade** by adding a
> correlation-sized offset — that's a cost with no edge, and correlation breaks
> exactly when you need it. The journal isn't hedging at all: it **trades the
> spread itself**, market-neutral, sized so the two legs are beta-matched,
> entered only on a z-score divergence and exited on reversion or a stop. The
> market-neutrality is a *side-effect* of a real relative-value edge, not the
> objective — so it makes money instead of bleeding it.

---

## 1. What we built — a hedge *overlay*

All three pieces share one philosophy: *"I'm already in a directional trade,
bolt on a second position to reduce its risk."* The hedge is a **cost added to an
existing bet**.

**Beta hedge / hedge-monitor signal** — `server.js` (`_hedgeScore`),
`hedge-signals.html`, `js/levels.js` (Hedge Monitor)
- Ranks hedge partners by `score = −corr×0.7 + betaSpread×0.3`, where the betas
  come from **crude proxies** (USDCHF stands in for VIX, EURUSD for DXY,
  USDJPY for rates — see `BETA_FACTOR_PROXIES`).
- The hedge leg is sized as `lots × |correlation| × hedge_ratio` — scaled by
  *correlation*.

**Position-hedge bot** — `bot/position_hedge_bot.py`
- Watches *any* open position from the other bots and auto-opens the
  best-correlated instrument in the opposite direction
  (`_find_best_hedge` → highest `|corr|`, no regime check).
- Closes the hedge only when the **main position** closes. It has no entry edge
  and no exit logic of its own.

**Hedge bot** — `bot/hedge_bot.py`
- Consumes the server's pair signals and opens both legs; sizing is
  `lots_b = lots_a × (pip_val_a / pip_val_b) × |corr|`.

### Why this structurally loses money

1. **A correct hedge cancels the profit too.** If the offset is sized to
   neutralize the risk, it also neutralizes the return — and you paid two sets
   of spread + commission to flatten your own P&L. The best case is "lost less."
2. **Correlation is unstable and fails when it matters.** Sizing off `|corr|`
   assumes the relationship holds. In a shock, correlations jump to 1 or break,
   so the hedge either does nothing or *adds* to the loss.
3. **The risk factor being hedged isn't real.** USDCHF ≠ VIX. The proxy betas
   don't capture the actual exposure, so the "hedge" offsets the wrong thing.
4. **There is no entry edge.** You hedge because you're *in a trade*, not because
   the relationship is mispriced. You're adding a negative-carry leg with zero
   expected return to pay for its costs.

---

## 2. What the colleague built — the spread *is* the trade

The journal rows (`L:DAX S:SP`, two stakes like `£7.58 / £1.22`, `Z IN` /
`Z OUT`) are **relative-value / statistical-arbitrage spread trades**, journaled
and replayed with real costs (`journal-app.js`, the pairs engine, and the
`_spreadZ` Welford z-score in `server.js`).

There is **no underlying directional position to protect** — long-one /
short-the-other is the entire trade.

### The four things it does differently

1. **The spread is the position, not an add-on.** Long DAX + short S&P *is* the
   trade. Market-neutrality is a *byproduct* of having an edge in the relative
   move, not the goal — so neutralizing risk doesn't kill the profit, because the
   profit *comes from* the neutral spread reverting.

2. **It only enters when there's a statistical edge.** Entry requires the
   log-spread z-score to diverge (`Z IN` ≈ 2–8σ in the screenshots); exit is when
   it reverts toward 0 (`Z OUT`). A measured mean-reversion signal — our hedges
   have no entry condition at all.

3. **The two stakes are vol/beta-matched, not correlation-scaled.**
   `£7.58 / £1.22` is the ratio that makes both legs move the same money per unit,
   so the pair is genuinely neutral to the index beta. (Our position-hedge bot
   scales by `|corr|`, which leaves a residual directional tilt.)

4. **Defined exits + honest accounting.** `TIME_STOP` (exit if it hasn't reverted
   in time), `STOP` (z blew past the band → cut the tail), explicit per-trade
   costs, and IS/OOS-style replay. The grade tags (`Elite`, `ACT 5/5`,
   `Exhaustion`) gate *which* divergences are worth taking. Our hedges just sit
   until the parent trade closes.

A ~53% win rate looks unremarkable, but with stops cutting the tail and
reversions running, expectancy is positive — and crucially it's a **standalone
return stream**, where a hedge is a guaranteed drag whose best case is "lost
less."

---

## 3. Side-by-side

| | Our hedge tools | Colleague's spread/pairs |
|---|---|---|
| **Purpose** | Reduce risk of an existing directional trade | Generate return from a relative-value edge |
| **Is there an underlying trade?** | Yes — hedge is an overlay on it | No — the spread *is* the trade |
| **Entry trigger** | "I'm in a position" (no edge) | Spread z-score divergence (`Z IN`) |
| **Exit** | When the main position closes | Reversion (`Z OUT`), `TIME_STOP`, or `STOP` |
| **Leg sizing** | `lots × \|corr\| × hedge_ratio` | Beta/vol-matched so legs move equal money |
| **Market-neutral?** | Approximately, with residual tilt | Yes — by construction, as a side-effect of edge |
| **Expected value** | Negative (cost with no edge) | Positive (statistical edge, tails stopped) |
| **When correlation breaks** | Hedge fails / adds to loss | Trade is closed by the z-stop |
| **Code** | `server.js _hedgeScore`, `position_hedge_bot.py`, `hedge_bot.py`, `js/levels.js` | `journal-app.js`, pairs engine, `_spreadZ` |

---

## 4. Takeaway

Hedging an existing directional trade with a correlation-sized offset is a
structurally **negative-EV** activity — it pays costs to suppress both the risk
and the reward of a position, and it breaks in the exact regime you bought it
for. The journal's pairs are not hedges; they are **market-neutral trades with a
measured edge**, where neutrality is a consequence of the edge rather than the
purpose.

**Implication:** retiring the position-hedge bot (and the beta-hedge overlay) in
favour of the spread engine isn't "a better hedge" — it's stopping the practice
of bolting negative-EV overlays onto trades, and instead running the neutral
spread as its own strategy with its own entry/exit discipline.
