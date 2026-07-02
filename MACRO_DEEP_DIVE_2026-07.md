# Macro Deep Dive — Is the Combined Data Useful, and Can It Trade Minute-by-Minute?

> Follow-up to `PLATFORM_REVIEW_2026-07.md` §2.2 ("macro is decoration").
> Question examined: **is the combined macro data actually useful, and could it
> be wired into a trading system making decisions minute by minute?**
>
> Answer in two lines: **as currently computed and wired — no, and the repo's
> own best-controlled test says so.** But three specific roles ARE viable, and
> a minute-by-minute *decision loop that consults macro* is architecturally
> easy — provided macro is treated as a slowly-changing regime state plus an
> event gate, not a per-minute signal. FRED-class data structurally cannot
> move faster than daily; pretending otherwise is where the current design
> went wrong.

---

## 1. What the data actually is (cadence reality)

Every macro series in the platform, grouped by how fast it can possibly move:

| Tier | Series | Native cadence | Publication lag | Minute-capable? |
|---|---|---|---|---|
| **Real-time** | OANDA prices/ticks (all pairs, NAS100/SPX500/XAU), Yahoo 1-min futures (ES/NQ/YM/RTY/GC, FX futures) — `/api/futures-quote` already serves these | tick / 1-min | none | **Yes — today, no new keys** |
| **Release-driven** | Finnhub economic calendar + `actual` prints (`/api/events`, `/api/surprise`) | scheduled; actuals populate within minutes of a print | minutes | **Yes, around releases** (worker doesn't cache; 1-min polling fits free tier) |
| **Daily, next-day** | VIXCLS, HY OAS (3 series), DGS/DFII/T10YIE real yields, breakevens | daily close | +1 business day | No — daily regime flag at best |
| **Daily, same-day** | RRPONTSYD (~13:15 ET) | daily | hours | No |
| **Weekly** | WALCL, WTREGEN (TGA), NFCI, ECB assets, COT (Tue positions, Fri release) | weekly | +1 to +5 days (COT +3) | No |
| **Monthly** | GS2/5/10 (monthly *averages*), all OECD rates/yields, BoJ/PBoC proxies, INDPRO | monthly | 1–2 **months** | No |

Two keys in CLAUDE.md (`TWELVE_KEY`, `NEWS_KEY`) are wired to nothing — all
quote/OHLC traffic already goes via OANDA/Yahoo, and Finnhub is only used for
the calendar.

**Current reaction latency** if a macro shock hits at 14:30 UTC:
- RegimeV2/V7's own overlay (hourly yfinance VIX/DXY/HYG inside a 30s loop):
  **≤1h** — the only sub-hour path in the platform.
- HMM confidence haircut: FRED prints next morning + 6h KV cron → **18–30h**,
  and on FRED failure it defaults to CALM (removing the haircut during stress).
- Dashboard/tier/tone/surprise/COT: **browser-in-the-loop** — nothing updates
  unattended; alerts fire from an open page or not at all.
- Level-bot VIX gate: **never** (reads KV `fred`, dashboard writes `fred2`).
- Volatility bot: **never by design** (consumes zero macro/event input).

---

## 2. Is the combined data useful? Component verdicts

The honest test is not "does the data describe the world" (it does) but "is
there evidence it predicts returns at a horizon we trade, after its
publication lag." The repo has actually run some of these tests.

| Component | Verdict | Basis |
|---|---|---|
| **Event calendar** (Finnhub/FF) | **Useful now — as risk control, no edge proof needed.** Scheduled-event blackouts/widening are variance reduction, not alpha; RegimeV2 already uses them live. The vol bot sitting on fade limits through NFP is an unforced error. | Deterministic; the only macro input whose value doesn't depend on a validated signal. |
| **Risk regime (VIX / HY OAS / NFCI)** | **Plausible, unproven, currently mis-wired.** The one place it feeds entries is sign-inverted for JPY/CHF pairs, so "evidence by live usage" is void. As a *daily* fade/follow modifier on risk-sensitive pairs it's the most defensible macro hypothesis in the stack — but it has never been backtested here (the Asia harness validates the no-macro score). | `PLATFORM_REVIEW` §1.8, §2.2; no harness run includes `macroScore`. |
| **Global liquidity (WALCL−TGA−RRP, GLI)** | **Tested and refuted for FX; no NQ timing edge; and the metric is arithmetically broken anyway.** The repo's own diagnostics: liquidity→FX Sharpe **0.01** while the price-momentum *controls* in the same harness score fine ("liquidity is the weak link"); "no liquidity rule beats buy-and-hold NQ risk-adjusted." On top of that, all four net-liq sites subtract billions from millions, so every recorded result tested the raw Fed balance sheet, not net liquidity. Fix the units, re-run once, and be prepared to accept the negative. | `GlobalLiquidity/diagnose_controls.mjs:132-133`, `backtestCore.mjs:228-231`; unit bug `PLATFORM_REVIEW` §1.7. |
| **Rate differentials (GS2 vs OECD overnight)** | **Right idea, wrong data.** Monthly-*average* yields with 1–2-month publication lags, term premium mismatch (2y note vs overnight), two different "momentum" clocks. At best a monthly carry bias; useless intraday. Rebuild on daily DGS2 + daily foreign yields if the pair-bias role is wanted; otherwise drop. | `PLATFORM_REVIEW` §2.2; inventory §1. |
| **COT positioning** | **Marginal, weekly, display-only today.** Percentiles computed on raw contracts (not OI-normalized) over a mislabeled window; the DecisionEngine consumer is a permanent no-op. Even fixed, it's a weekly contrarian *tilt* — a small confidence adjustment, never an entry driver, and irrelevant at minute scale. | `PLATFORM_REVIEW` §2.2 (M11). |
| **Macro-equity composite** | **The one positive number can't be trusted as macro evidence.** Persisted result (QQQ OOS Sharpe ~1.21, WFE ~1.23) comes from an engine floored at ≥50% long over 2005–2026 — structurally unable to distinguish "macro works" from "being long equities worked" — and its highest-weighted factor is the broken net-liq. WFE>1 (OOS beating IS) is itself a red flag. | `MACRO_BOT_DESIGN.md:160-169`; `macroEquityEngine.js:16`. |
| **Surprise index / daily tone / tier score / system-* pages** | **Unfalsifiable as built.** Hand-set weights, no history API, browser-computed, nothing consumes them. Not evidence-bearing in either direction. | Inventory §3. |

**Summary verdict:** the *combined* data is currently not useful, in the
precise sense that (a) the only live wires are broken/inverted/dead, (b) the
one clean test recorded a negative, (c) the one positive result is
confounded and unit-corrupted, and (d) everything else was never tested. That
is not the same as "macro can't work" — it means the platform has not yet
produced evidence that it does, and it already owns the harness discipline
(walk-forward, pub lags, controls) needed to find out cheaply.

---

## 3. Minute-by-minute: what's actually possible

**The question splits in two:**

**(a) Can the macro *data* change minute-by-minute?** Mostly no. FRED is
daily-to-monthly with 1-day-to-2-month lags — structural, not fixable with
better plumbing. Exactly three inputs are genuinely minute-capable today:
1. **Market risk proxies** — OANDA tick stream + Yahoo 1-min ES/NQ/GC/^VIX
   (the plumbing exists at `server.js:2054-2090`; nothing computes on it).
2. **Calendar actuals** — Finnhub prints populate within minutes of a release.
3. **Nothing else.** COT weekly, liquidity weekly, rates monthly.

**(b) Can a minute-by-minute decision loop *consult* macro?** Yes, trivially —
this is the standard two-clock architecture and it fits the house
score→selector doctrine exactly:

```
SLOW CLOCK (state producers — server crons, no browser in the loop)
  daily  : macroBias(pair, dir) → {ALIGNED | NEUTRAL | OPPOSED}
           from risk regime × PAIR_DRIVERS.riskSens (+ rate diff if rebuilt)
  hourly : riskPulse ∈ {CALM, STRESSED} from live VIX quote + HY proxy
           (replaces the FRED 18-30h path; RegimeV2 already proves this loop)
  weekly : cotTilt (optional, confidence only)
  known-in-advance: eventWindows[] per currency from the calendar

FAST CLOCK (the bots' existing 30s–90s loops)
  every cycle, before entry logic:
    if now ∈ eventWindow(pair)      → suppress/widen  (pure risk control)
    if macroBias == OPPOSED         → skip or halve   (selector, needs OOS proof)
    if riskPulse == STRESSED        → haircut size    (already the HMM pattern)
  then run the existing range/vol entry logic unchanged
```

Macro's correct role in a minute loop is a **gate that changes a few times a
day**, evaluated every minute — not a per-minute signal. The only genuinely
minute-level "macro" input is the market-derived risk pulse, and there the
platform's own evidence urges caution: in the GLI diagnostics, the
price-derived controls carried all the edge — meaning an intraday risk pulse
built from ES/NQ/VIX quotes risks being a worse duplicate of what
`dayTypeScore` and the HMM already extract from price. Test it against them
(does it add anything OOS *after* day-type?) before giving it authority.

**What NOT to build:** a minute-level "macro model" that re-scores FRED data
every minute. It would recompute the same stale number 1,440 times a day and
create the illusion of reactivity while the inputs move monthly. The current
dashboard-centric design already half-suffers from this illusion (fresh
fetch timestamps on stale observations — `/api/refresh` literally re-stamps
old data).

---

## 4. Concrete path (ordered, each step falsifiable)

1. **Prerequisites (fix before any evidence is collectible):** safe-haven sign
   inversion; WALCL/TGA/RRP units (all 4 sites); `fred` vs `fred2` key; carry
   FRED observation dates end-to-end and hard-NA stale series. (~All in
   `PLATFORM_REVIEW` P0 #4/#5, P2 #12.)
2. **Event gate into the vol bot** — `eventGate(pair, now, calendar) →
   {blackout, widenMult}` as a brick; the logic already exists twice
   (`events.js`, `news_risk.py`). Server-side, calendar polled on a timer
   (not page-load). This is risk control: ship it without waiting for edge
   proof, but A/B it in the book anyway (suppressed-window trades vs not) to
   measure what it saves.
3. **Server-side risk pulse** — hourly (not minute, to start) live VIX + HY
   proxy → `{CALM, STRESSED}` in KV, replacing the 18–30h FRED path and the
   CALM-on-failure fallback (fail STRESSED, not CALM). Consumers: HMM haircut
   + bot sizing. Generalizes what RegimeV2 already does privately.
4. **`macroBias` as a 3-state selector, then PROVE it** — two pre-registered
   factors only (risk regime × riskSens; optionally rebuilt daily rate-diff
   direction). No tunable weights. Run historical FRED (with pub lags — the
   `PUB_LAG`/`lag()` helpers exist) through the Asia/vol harnesses, macro-on
   vs macro-off, `summarizeSplit`, ≥30 OOS trades, judged on
   `portfolioStats`. **If OPPOSED-filtering doesn't beat the incumbent OOS,
   macro stays out of the entry path** — same bar as every other selector.
5. **Re-run GLI once after the unit fix**, accept the answer either way. Drop
   or demote COT/tier/tone/system-pages to display until something upstream
   earns a wire.

The platform's real advantage here isn't the macro data — it's that the
honest-harness machinery to *test* the macro data already exists. Use it
before wiring anything else in.
