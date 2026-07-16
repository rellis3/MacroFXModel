# Yield-Spread Z Strategy (the "Bennett Z" bot) — validated macro sleeve

> **Status: the survivor.** After a long falsification cycle that nulled the level-based
> and macro-direction ideas, one strategy cleared every audit — a US-vs-foreign 2Y
> yield-**spread** z-score mean-reversion, traded on FX. It is validated **in-sample /
> OOS across 2015–2025** (lookahead-audited, sign-corrected, honest daily-MTM Sharpe
> ~1.0–1.2, robust across the parameter grid). It is **not** forward-proven — the only
> remaining test is paper-trading it live. Read this before touching the engine so the
> conclusion isn't re-litigated.

Code: `js/bennettZCore.js` (pure) · `js/bennettZEngine.js` (I/O) · `bennett-z.html`
(viewer) · `/api/bennett-z/*` (run + sweep). Companion to `CLAUDE.md` (the rules) and
`ENTRY_ZONE_CONFIDENCE.md` (the honest-Sharpe lesson this reuses).

---

## 1. What the strategy is

The signal — confirmed from a screenshot of the live "Bennett" dashboard, not inferred —
is a **single macro factor**: the US-vs-foreign **2Y yield-spread, z-scored**.

- **Spread** = `US 2Y (FRED GS2) − foreign short rate` (per pair; e.g. EURUSD uses the
  German short rate).
- **Signal** = a rolling z-score of that spread. When |z| is extreme, the spread has
  dislocated from its recent norm and is bet to **mean-revert**.
- **Entry**: when `|z| ≥ entryThreshold`, in the z-direction, oriented by USD role
  (below).
- **Exit**: when the spread reverts to `|z| ≤ zExit`, **or** a max-hold cap. This is
  the **z-exit** — the trade closes because the macro dislocation that justified it is
  gone (Bennett's `Z-EXIT`).
- **No price levels.** The z-threshold *is* the trigger — there is no fib / Asia-range /
  support-resistance component. (This is why the earlier level-based tests were the
  wrong tests — see §3.)

**Direction (a corrected bug).** The raw rule `z>0 → LONG the pair` is only right when the
pair moves *with* the USD (USD-base, e.g. USDJPY). A **USD-quote** pair (EURUSD, GBPUSD,
AUDUSD) moves *opposite* to USD, so its sign must flip. Orienting by USD role (default on)
is economically forced and anchored on the one pair whose sign was independently
validated (USDJPY). Getting this wrong made USD-quote pairs lose exactly as much as they
should have won (EURUSD went 0-for-9 → 9-for-9 when corrected).

---

## 2. The validated configuration

The robust region — **not a single cherry-picked cell** — is:

| Parameter | Value | Note |
|---|---|---|
| entry `|z|` | **2.0 – 2.5** | Bennett's own 2.75 is *weaker*; lower & broader is better |
| z-window | **90 – 126 days** | 252 is the weakest, most regime-concentrated window |
| z-exit | 1.5 | close when the dislocation has largely corrected |
| max hold | 20 days | time stop |
| direction | orient by USD role | USD-quote pairs flipped |
| pub lags | US +2d, foreign +45d | monthly foreign rates are released ~a month late |
| cost | ~0.02% round-trip | ~2 pips on majors |
| pairs | USDJPY, EURUSD, GBPUSD, AUDUSD, USDCAD, USDCHF | equal-weight book |

Representative OOS result (2.0 / 126, publication lags on): **109 trades, 63% win, PF
2.19, +59% total, honest daily-MTM Sharpe ≈ 1.14, every OOS year 2022–2026 positive,
6/6 pairs positive.**

---

## 3. The investigation arc — what we ruled out, and why

This started as "explain the z-exit" and became a full falsification cycle. The value is
as much in what was *killed cheaply* as in what survived.

| Idea tested | Result | Why it was the wrong/right test |
|---|---|---|
| **Macro as a confidence factor** on Asia-range fib entries (`zscore-v2`) | **Null** | The *entry* (fib level) had no edge; scoring a zero-edge entry can't create one |
| **Macro direction** predicts forward FX drift (`macro-direction`) | **Weak/null** | Macro can't set a *sharp intraday* direction; it's a slow weeks-months bias. Only *carry* weakly led |
| **5m range levels** beat a placebo (`range-level-edge`) | **Null (folklore)** | Real levels bounced no more than the same level shifted to a random price — S/R has no standalone edge here |
| **Bennett's *actual* mechanism** (spread-z reversion, no levels) | **Survives** | We had been testing configs Bennett doesn't run; his real bot is pure spread-z |

The through-line: the levels and macro-direction premises underneath the *intraday* bot
were folklore on this data. The thing that worked is a **slow, rare, macro
mean-reversion** signal — a different animal entirely.

---

## 4. Every audit it passed (why we believe it)

A strong-looking backtest means nothing until it survives the ways it could be fake. This
one did, in order:

1. **Direction sign** — corrected a real bug (USD-quote pairs were inverted); economically
   grounded, not fit to the data.
2. **Publication-lag lookahead** — the monthly foreign rates were being read ~a month
   before release. With honest lags (US +2d / foreign +45d), Sharpe fell **2.16 → 1.58**
   (there *was* lookahead) but the edge held. `buildRollingZSeries` had no pub lag; this
   engine adds it.
3. **Honest Sharpe** — the first "portfolio Sharpe" was *my bug* (it smeared each trade's
   return across its days, suppressing daily variance → inflated 3.79). Replaced with real
   day-over-day mark-to-market: **~1.0–1.2**, the true risk-adjusted number.
4. **Breadth** — **6/6 pairs** positive, **5/5 OOS years** positive (short windows) — not
   a one-pair or one-year artifact.
5. **Parameter robustness** — a 12-cell sweep (entry |z| 2.0–2.75 × window 90/126/252)
   came back **12/12 profitable** (PF 1.73–5.04, Sharpe 0.70–1.21). Graceful degradation,
   not a lucky spike. This is the strongest evidence it isn't overfit.

Sizing note: Bennett **sizes up at extreme z** (1×/1.5×/2× at ±2.75/±3.75/±4.5). Our data
says that's **backwards or noise** — the deepest tiers are tiny samples and don't reliably
beat flat sizing. Trade it **flat-sized**.

---

## 5. Honest caveats (do not skip)

- **It is one historical period.** 2015–2025 spanned the biggest rate-divergence cycle in
  decades. The parameter-robustness rules out *knob*-overfitting; it does **not** rule out
  a *period* effect — that this whole era favoured rate-spread reversion. The 5/5-year
  breadth mitigates but doesn't eliminate this.
- **Forward is the only real proof.** Everything here is in-sample in the sense that it's
  the only history we have. Paper-trade it before risking capital.
- **It's a modest-frequency sleeve, not a system.** ~15–25 OOS trades/pair; Sharpe ~1.1.
  Its value is as a **diversifying macro sleeve** alongside steadier strategies (e.g. the
  trend-basket), not as a standalone book.
- **Costs**: validated at ~2 pips round-trip; worth confirming it holds at 3–4 pips (the
  high PFs suggest it will).
- **Data honesty**: OANDA D1-derived daily closes + FRED with publication lags. Do not
  remove the lags "to get more trades" — that reintroduces lookahead.

---

## 6. Next steps (in order)

1. **Cost stress-test** — re-run 2.25/90 at cost 0.04%; confirm PF stays > ~1.5.
2. **Paper-trade** the validated region (2.0–2.5 / 90–126, flat-sized, orient-on,
   lags-on) live and track it against this backtest for 3–6 months. This is *the* test.
3. **Do not add parameters or "improve" it** before forward data arrives — that overfits
   the thing we just proved robust (CLAUDE.md: "the bar is forward-validation, not more
   building").
4. If forward holds, size it as one sleeve of a diversified book.

---

*Provenance: this document is the capstone of the "Bennett z-exit" investigation
(2026-07). Config, audits, and results are reproducible via `bennett-z.html` → Run test /
Run robustness sweep, with a live `FRED_KEY` + M1 on Railway.*
