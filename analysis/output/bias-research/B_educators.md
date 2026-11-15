# B. How the educators form a directional bias (up / down / range, ~24h to a few days)

Research note, 2026-11-15. Read-only pass over the repo. Every claim cites a file. Quotes are the educator's own words
(short). Lines marked **[ours]** are this repo's reading, not the educator's.

**Attribution rule** (`.claude/skills/cog-knowledge/SKILL.md`): C.OG is a private group *inside* Colez Trades. Max
Cole, Jay and Craig are Colez Trades educators, **not** C.OG. Jordan, Garin and Husky are Discord members, not
educators. Nicholas Crown, Jess Inskip and Roman Paolucci (Quant Guild) are outside Colez Trades.

**Sources read.** `cog-knowledge` skill + all six references; `cog/README.md`, `cog/lessons/volatility-intelligence.html`;
`education/cog-snippets.md`; `education/cog_inbox/` (incl. `processed/`); `education/bank-verbatim/*/PAGE_TEXT.md`
(C.OG's course pages, verbatim); `education/QUANT_MACRO_LESSONS_1-6.md`; `education/macro-variable-context-relevance-notes.md`;
`MD files/COG_OBSERVED_SYSTEM.md`; `education/intake/INDEX.md` and every informational and technical note it lists;
`education/intake/raw/informational/colez-trades/batch_A.md`/`batch_B.md` (gitignored per-stream extracts);
`education/intake/technical/quant-guild/PLAYBOOK.md`; `MD files/CROWN_WATCH.md`, `MD files/CLIP_WATCH.md`;
`MD files/GOLD_CHART_STRATEGY.md`, `MD files/max copier strategy.md`, `MD files/jay_pivot_method.md`;
`education/RESEARCH_METHOD_LESSONS.md`; `.claude/skills/research-director/references/cog-question-style.md` and
`agendas/*.md` (notably `daily-bias.md`, `model-audits.md`); `js/deskEvidence.js`; `plans/RESEARCH_REGISTER.md`;
`analysis/output/max-bias-reverse/RESULTS.md`.

**Not found in the repo:** no intake note exists yet for **Jay** or **Nicholas Crown** under `education/intake/`
(INDEX.md lists only Max Cole in the informational lane and Quant Guild in the technical lane). Jay's method is only in
`MD files/jay_pivot_method.md` (+ `SNIPER_INDICATOR_MARKUP_VALIDATION.md` §18); Crown's only in `MD files/CROWN_WATCH.md`.

---

## 0. The repo's result floor for "a daily bias" (read this first)

The owner already ran a bias programme this week (`.claude/skills/research-director/agendas/daily-bias.md`, set
2026-11-13, Parts 1–3; register rows in `plans/RESEARCH_REGISTER.md` lines 22–31). What has been banked, newest first:

| Ledger id (`js/deskEvidence.js`) | Question | Verdict |
|---|---|---|
| `bias-learner-fx` / `-gold` / `-idx` | walk-forward L2 logistic over ~15 point-in-time readings (1h/4h/daily/weekly trend, Asia move, close location, events, surprises, carry, COT, σ regime, IV/RV) beats B0 on P(up) at 21:00/+1/+3/+5 | **NULL** FX (Brier skill +0.05 to +0.15%, all CI uppers below the useful bar, powered); gold, indices **UNDERPOWERED** |
| `day-type-expansion-fx` / `-gold` / `-idx` | morning score from validated range inputs calls expansion vs range days better than σ alone | FX, gold **NULL**; idx **UNDERPOWERED** (+1.88% BSS, Holm 0.147) |
| `post-release-drift-pooled`, `post-release-momentum-pooled` | after CPI/NFP/PPI/FOMC, hold the surprise direction from +15 min to +1h/21:00/next 07:00/+3d | **UNDERPOWERED**, leans reversal (21:00 −0.049σ [−0.111, +0.012]); own-first-move momentum **NULL** |
| `hold-day-one-confirm-run` (+ `-close/-speed/-band/-event/-hold-r`) | a ≥1σ day closing in its outer 10% keeps running 1–5 days | **NULL** (−0.038 [−0.095, +0.020], powered); features UNDERPOWERED |
| `exit-on-fixed-entries` | any exit beats the 21:00 close on 4h-trend entries more than on random entries | **NULL** on all six exits |
| `max-bias-reverse` (register only, EXPLORATORY) | what Max's side agrees with | his side = 4h EMA20 slope on 84% (88% day-clustered, 21 days) |
| `h4-trend-hold` (EXPLORATORY) | 4h EMA20-slope side at 07:00, hold if same sign at 21:00 | loses: day −0.04R, hold −0.11R/trade |
| `macro-h4-blend` (EXPLORATORY) | macro sets side, 4h sets size | macro and 4h agree 48%; every variant ~flat over 22 days |
| `bias-scoreboard` (REGISTERED, forward) | live scoreboard of desk, Max, surprise rule, h4-trend, B0, abstention allowed | judge at 60 / 120 shared days |
| `direction-bar` (CONTEXT) | what a direction call must beat | at 1 day a cell active 10% of days must move P(up) ~6pp (0.13σ) |
| `gr-hmm-trend-direction` | HMM TREND label (200 daily returns) calls next day, 7 USD pairs | **NULL** (IC −0.011) |
| `gr-us-yields-direction` | 20-day rise in US 10y lifts the dollar next day | **NULL** (IC +0.017) |
| `post-fomc-usd-drift` | dollar drifts up 5 sessions after FOMC | **VALIDATED** (+26bp, 65%; FRAGILE, not forward-proven) |
| `positioning-into-release-direction` | on release days price moves against a crowded leveraged-fund book | **VALIDATED**, tiny (+0.064 ATR, ~3–4 EURUSD pips) |
| `cot-crowding-p5` | crowded-with-trend pullback while the crowd leaves → trend resumes (4 weeks) | **VALIDATED** on non-G10 futures holdout |

Agenda's reading (`daily-bias.md`, "Reading"): "Nobody here, and probably not FundaBias either, has a validated day-by-day
direction call." The available edge is (1) range vs expansion, (2) direction conditioned on events and positioning,
(3) abstaining. Everything below is read against this floor.

---

## 1. C.OG (Colez Trades → Quantitative & Macro Insights, private group)

### 1.1 How he forms bias (his words)

C.OG does **not** publish a day-by-day direction method. What he has said and taught splits into five pieces.

**(a) Direction comes from outside the instrument's own chart.** As relayed by the owner, his NQ system "doesn't bother
about the current or past price of NAS. It actually has nothing to do with NAS — but more with the fundamentals that
affect it"; "something about repo and reverse repo"; "tracking central bank balance sheets from different countries"
(`MD files/COG_OBSERVED_SYSTEM.md` §2, lines 59–70). In the macro-variable video: "Looking at the OHLC data alone …
there's probably some overfitting in hindsight you could use to say why this move happened … the chances of being able
to repeat that are quite low" (`education/macro-variable-context-relevance-notes.md`, 01:25). On a member's indicator
outputs: "it won't be based on anything you'll be able to infer from the nq chart or movement" (`education/cog-snippets.md` §10).

**(b) The intraday pre-open read (observed, not explained).** His alert flow: Threshold 1 VALID/INVALIDATED between
02:00–14:00 UK; Threshold 2 with stop % and risk % at ~13:30–14:00 UK (after 08:30 ET data); "Order filled" Long/Short
just before the NY open (`COG_OBSERVED_SYSTEM.md` §1; skill `references/concepts.md`). Trades ~24% of weekdays
(published tearsheet). **[ours]** §4g of the same file argues a weekly liquidity series cannot pick 60 fresh sides a year,
so stage 1 is a regime/permission filter and stage 3 is an unknown fast pre-open read.

**(c) A lead variable with a confirmation lag.** His macro series (SOFR vs Euribor spread, Python-built) "had already
changed" at 04:00; "We don't want to characterise that was a low at 4 when we couldn't actually characterise that until
4:45 … no look-ahead, no future leakage" (`macro-variable-context-relevance-notes.md`, 03:21–08:39). Rationale:
"Sofr is to capture the us side of the leg / And then estr is to capture the ecb/€ side … a growth/tech stock like the
Nasdaq is very sensitive to rates" (`cog-snippets.md` §8); "information hierarchy" — bonds price first (§11).

**(d) A layered system where the vol forecast is one layer.** "Something like 6 layers with the forecaster itself only
being one of those layers"; "the way to really develop this is by having conditional views and then other layers
supporting it"; vol as a shared state variable incl. "probability of being in different volatility regimes" and
"forecast error" (`education/cog_inbox/2026-09-28-market-movers-vol-forecaster-as-a-layer.md`, 17:09–17:19). Course page:
"**Fundamentals** provide directional bias. **Technicals** provide entry timing. **OI** provides the structural map of
where price is likely to stall, accelerate, or reverse" (`education/bank-verbatim/Lesson-06-Trading-Frameworks/PAGE_TEXT.md:226`).

**(e) The forecast lines frame direction, they don't call it.** "The open-close move is symmetric around the open
because the forecast doesn't specify direction — only magnitude." "A close *inside* the band = a normal session. A close
*outside* the band = a stretch / 75th-style day, with a directional bias confirmed." "A close hugging the open is a chop
day" (`bank-verbatim/Reading-The-Daily-Vol-Range-Forecast/PAGE_TEXT.md:202–230`). "When price reaches the projected low
… the day has used its budget … a caution flag for chasing." So for C.OG "range day" = close inside the OC p50 band.

### 1.2 Higher vs lower timeframe, regimes, HMM/Markov

- **Horizon hierarchy (course).** "Short-term (hours to days): Flows, positioning, sentiment, data surprises";
  "Intraday … Noise-dominated; hard to predict"; "Days to Weeks … Mix of signal and noise"; "Weeks to Months … Rate
  differentials, policy divergence … Highest signal — the sweet spot" (`bank-verbatim/Currency-Markets-Global-Flows/PAGE_TEXT.md:142–160`).
  "Short horizons suffer both low SNR (noise dominates) AND high transaction cost impact" (`Repositioning-…/PAGE_TEXT.md:34`).
  "Build systems that identify regime shifts and position accordingly — don't try to day-trade macro"
  (`Cross-Asset-Synthesis/PAGE_TEXT.md:195`); "discretionary daily trading on cross-asset signals is not where most alpha
  lives" (line 81). **This is the strongest single statement in the corpus about a 24h bias: his course says the macro
  edge is at weeks-to-months, not days.**
- **Volatility regimes (Volatility Intelligence L3).** Three regimes by ATR(10/14) percentile over 6–12 months: <25th
  LOW, 25–75 NORMAL, >75th HIGH. "Low volatility regimes tend to be longer and more stable … transition from low to high
  is often sudden … high to low is usually gradual." Strategy by regime: low → "Mean reversion works"; normal → "Trend
  following shines"; high → "Momentum, breakouts". "Check regime weekly. Daily fluctuations are noise — regime is a
  bigger-picture concept." (`bank-verbatim/Weekly-Regimes-Multi-Day-Structure/PAGE_TEXT.md`, Sections 01–04, Key Takeaways.)
- **Session structure (L4).** "Asia sets the table"; "London open is the key breakout window. The first 1-2 hours of
  London often establish the day's direction"; "Asia High/Low … Breaks signal direction, holds suggest range
  continuation"; "Asia breakouts work best with trend alignment, catalyst, and clean price action"; "Asia range is
  context, not a signal" (`Session-Structure-Asia-Range/PAGE_TEXT.md`, §03, Key Takeaways).
- **Macro regimes (L6).** Growth × inflation quadrants; "Regime transitions are where the money is made"; "rates and
  credit typically move before equities"; regime detection methods listed incl. "**Hidden Markov Models (HMM)** to infer
  latent regime states from asset returns"; and the caveat "**Regime identification is inherently backward-looking.** By
  the time you're confident about the regime, much of the move has happened" (`Cross-Asset-Synthesis/PAGE_TEXT.md:172–188`).
  "Lead-lag relationships are often stronger at regime turning points than during stable trends" (line 530).
- **Risk-on / risk-off (L2).** "Knowing which regime you're in matters more than your specific trade thesis"; VIX bands,
  VIX term structure, HY OAS <350 / >500bp, JPY/CHF strength; "if 3+ indicators flash warning, reduce gross exposure"
  (`education/QUANT_MACRO_LESSONS_1-6.md` §2.3). Liquidity: "Liquidity beat fundamentals. It almost always does" (§2.4).
- **Positioning.** "Pros don't ask 'what does this news mean?' They ask 'how is the market positioned, and will this news
  force repositioning?'" (`Understanding-What-Moves-Markets/PAGE_TEXT.md:721`). OpEx: "Reduce directional bets into
  expiry. Real moves often happen the week after" (line 672).
- **Dollar smile.** USD strong on the left (US exceptionalism) and right (risk-off), weak in the middle
  (`Currency-Markets-Global-Flows/PAGE_TEXT.md:236–244`).
- **No explicit Markov/HMM model of his own.** The HMM mention is a list item; the inbox message asks for a regime
  *probability* as a state variable, without method.

### 1.3 What the repo tested (C.OG ideas only)

| Claim (source) | Ledger / file | Verdict |
|---|---|---|
| Net-liquidity tide as direction (G1) | `cog-replication/G1_RESULTS.md`; `net-liquidity-tailwind-spx`, `-nq` | NULL (OOS 51.9/49.5/51.5% at 1/5/20d); tailwind UNDERPOWERED |
| OI wall magnet as direction (G3) | `oi_research_book/G3_AND_EVENTDAY_RESULTS.md` | NULL (48.8% OOS) |
| GEX sign → next-day **range** (G2) | `gex-range-es`, `gex-range` | VALIDATED (range only; IV absorbs most: `gex-range-iv`) |
| Wall-break momentum / zero-gamma break follow | `forge/GAMMA_REGIME_TRADES_PREREG.md`, `-FX` | NULL |
| Blue line / rates lead NQ, 15 min–48h | `cog-exact-pair-lead`, `cog-video-claims`, `cog-trend-state`, `cog-pinned-history`, `cog-matched-pairs`, `analysis/output/dynlead/DYNAMIC_LEAD_RESULTS.md` | NULL; same-hour link real, no lead |
| Fade/follow at his lines; setups A/B | `cog-setups-direction`, `cog-spread-direction` | NULL |
| VIX/Nasdaq dR/dt bottom decile → NQ +5 sessions | `vix-beta-change` | VALIDATED research-only (+0.57%, t 3.0); direction-bar proposes demoting to underpowered |
| VVIX/VXN 5d rise → NQ +20d | `vix-second-derivative` (vix-calculus C) | VALIDATED research-only (+1.2%/20d) |
| Credit leads equities | `credit-leads-equities` | NULL |
| Asia range → London | `asia-range-london` | **reverse** of the lesson: wide Asia lowers odds of reaching the median band |
| London first 2h sets the day's direction | `fast-start-rest-of-day` (T3b) | range VALIDATED; **direction a coin flip** (47–60% vs 48–52%) |
| Overnight hold, vol-regime filter | `overnight-hold-nq`, `overnight-vol-regime-nq` | UNDERPOWERED; regime filter flat |
| Stress on/off ("test simple filters such as high stress or low stress") | `stress-filter-hold-*` | NULL / UNDERPOWERED |
| Per-currency growth/inflation regime divergence | `regime-divergence-fx` | NULL |
| OpEx cycle | `opex-cycle-range` | range UNDERPOWERED; direction not tested |

**Untested C.OG ideas:** ATR-percentile regime → strategy type (mean-revert in LOW, trend in NORMAL, breakout in HIGH);
"Asia break *with* trend alignment"; dollar-smile side as a USD conditioner; the week after OpEx as a direction window;
run-length test on his logged directions (`COG_OBSERVED_SYSTEM.md` §4g; only 2 forward rows,
`cog-replication/FORWARD_LOG.md`); vol-regime probability as a shared state (`cog_inbox` 2026-09-28).

---

## 2. Max Cole (Colez Trades educator; "Signal Copier"; not C.OG)

### 2.1 How he forms bias

Main source: `education/intake/informational/colez-trades/2026-11-13-max-cole-daily-lives-bias.md` (40 live streams,
14 Sep–12 Nov 2026). Per-stream extracts `education/intake/raw/informational/colez-trades/batch_A.md`–`batch_D.md`
(gitignored).

Steps, in his order (stable across all four batches): **(1)** Forex Factory red folders; **(2)** FundaBias score per
instrument (direction + 1–10 conviction, "refreshed an hour or two after news"); **(3)** his own overlay: USD strength,
Fed tone, real yields "especially on gold", COT, geopolitics, *dampening only*; **(4)** pick pairs that express the USD
view plus hedges; **(5)** market entries after Asia (07:00–08:00 UK), 1R each, SL beyond structure, no TP; **(6)**
re-decide every morning. Neutral days (30–50%) have no trades; flat before tier-1 US data, "trade the direction of the
surprise afterwards", "carry the bias forward until a catalyst changes it".

Quotes: "Bias is completely and utterly fundamental"; "zero price action involved in the fundamental signals"; "90% of
fundamentals is just looking at the US dollar"; "I don't need to come with a new bias every single day… just make sure no
big news has come out"; "If we are bullish… we will only take buys" (intake note, Quotes). Size scales with the score:
"think of it like a scale from 1 to 10 bullish, 1 to 10 bearish … The higher we go bullish, the more buys I have open"
(`batch_A.md:76`). Pair logic: "US dollar very very strong, but gold is actually quite strong as well. So it kind of
evens each other out and causes a form of neutrality" (`batch_A.md:113`). "If US dollar's first in the pair it's going
to be bullish. If US dollar's second… bearish" (`batch_B.md:22`). Neutral → "range up until news", "looking for mean
reversions back into the range" (`batch_A.md:65`, `:120`). Wayond clip: "Most full-time traders… pair some type of higher
time frame bias or some type of fundamental bias with a simple entry model"; "XAU… is actually two things… research one
side of the pair and the other side" (`2026-11-12-max-cole-wayon-strategies.md`).

### 2.2 Higher vs lower timeframe, regimes

- HTF structure cited in ~11 of 40 streams, mostly "to justify *neutral*" (intake note, inputs table). He zooms "4H/daily
  'for that higher time frame environment'; marks on 15m-30m; confirms on 1-5m" (`batch_A.md:42`); "Overall, it should
  trend with the macro drivers and with the fundamental direction" (`batch_B.md:28`).
- Regime = **neutral vs directional**, not a vol regime: neutral → mean reversion in the range or no trade; directional →
  with-bias entries only (`batch_A.md:272`).
- No mention of HMM/Markov.
- **What the record shows [ours, exploratory]:** his first daily side matches the **4h EMA20 slope on 84%** of 57
  instrument-days (88% day-clustered), 24h return 81%, 5-day return only 54% (`analysis/output/max-bias-reverse/RESULTS.md`).
  "The trend he follows is the last one to two days on H4, not the week." Self-description ("zero price action") vs
  record differ. Where he went *against* the 4h trend (9 of 57) his R averaged +0.79 vs +0.09 with it (9 trades: a lead only).

### 2.3 Tested vs untested

| Claim | Ledger / file | Verdict |
|---|---|---|
| "Trade the surprise" after tier-1 US data | `post-release-drift-pooled`, `post-release-momentum-pooled`; earlier `rate-surprise-eurusd/-nq` | UNDERPOWERED, leans reversal; momentum NULL. Desk "stops saying trade the surprise" (register line 30) |
| Hold until the bias changes / swings | `hold-day-one-confirm-*`, `exit-on-fixed-entries`, `h4-trend-hold` | NULL / NULL / loses |
| Multi-timeframe readings incl. 4h trend as a learnable bias | `bias-learner-fx` | NULL |
| His posted signals | Signal Copier copy, 122 fills: +8.3R, +0.07R/trade ± 0.11; profit from a few swings and post-data days (intake note claim 7) | descriptive, 5 weeks |
| Desk-style daily bias scored 08:00–21:00 | `forge/DESK_ANALYST_PIPELINE_PREREG.md` (5 days) | interim, not judged |
| USD-first pairs (Q3), conviction/abstention (Q5), FundaBias sign | `bias-scoreboard` (forward only) | REGISTERED |
| Value-area / fib / divergence entries | `analysis/output/rangebook/CONFLUENCE_RESULTS.md`, `daily-open-fib-retest`, `vmc-nq-cipher-direction`, `range-edge-limit-fade` | NULL (entries, not bias) |
| Monthly USD factors behind "90% is the dollar" | `fx-factor-stack/-carry/-surprise/-momentum` | UNDERPOWERED |

**Untested:** the "neutral before news → range until news" claim as a *range* call (pre-release morning narrower than a
matched non-event morning; not found in the ledger); score-to-size mapping (conviction monotonicity) on history needs a
FundaBias history (not held); "gold = gold side + dollar side, neutral when both strong" as a rule (FOUR_GOLDS displays
it; forward direction untested); his against-4h-trend days (n=9).

---

## 3. Jay (Colez Trades educator) — pivot method

Source: `MD files/jay_pivot_method.md` (+ `MD files/SNIPER_INDICATOR_MARKUP_VALIDATION.md` §18–19). No intake note.

### 3.1 How he forms bias
"The pivot is the daily anchor. Everything else is confirmation." Pivot = (prev H + L + C)/3 daily, plus a 4-hour pivot.
"Price **above VWAP** → buyers in control → bias long. Price **below VWAP** → sellers in control → bias short. VWAP
relative to pivot confirms or contradicts the directional bias." Continuation trade requires "Macro / higher timeframe
bias is clearly bearish (below VWAP, below pivot)". "Untapped pivots are magnetic — even without other confluence, price
reacts sharply." "VWAP as filter — only take continuation trades in the direction VWAP confirms." Timeframes: daily +
4h pivots for structure, 1m/3m/5m for the trigger ("Divergence on lower timeframes is the trigger for reversals, not the
reason").

### 3.2 HTF/LTF, regimes
HTF = daily/4h pivots + VWAP side; LTF = 1–5m divergence and money-flow colour. No regime or Markov concept. Low-volume
days → use a fixed-range volume profile.

### 3.3 Tested vs untested
- VWAP side/regime: every VWAP construction NULL (`MD files/VWAP_REVERSION_FINDINGS.md`, `vwap-extension-fade`,
  `vwap-stretch-line-touch`, `GOLD_VWAP_FIXED_SIGMA_FINDINGS.md` §6/§14 "trade with a VWAP-side regime shift" null)
  — summarised in `CROWN_WATCH.md` 2026-09-19 entry.
- Fibs / golden pocket / daily open: NULL (`CONFLUENCE_RESULTS.md`, `daily-open-fib-retest`).
- Divergence / money flow: `vmc-nq-cipher-direction` NULL (NQ, 1–5m powered).
- **Untested:** "price above daily pivot = bullish bias" as a direction call (pivot-spike backtest exists but "the verdict
  was never re[corded]", `MD files/BACKTEST_INDEX.md:34`, Q1 line 98); "untapped pivot is magnetic" (closest: G3 magnet
  NULL, `swing-walk-*` NULL, round-number pinning NULL on FX/gold).

---

## 4. Craig + the repo's "Max & Jay" gold chart method

Source: `MD files/GOLD_CHART_STRATEGY.md` (repo write-up of the method; Craig's Sniper panel in §4) and
`MD files/max copier strategy.md`.

### 4.1 How bias is formed
- **HTF structural bias**, "Read on Daily and 4H only. Never trade against the Daily EMA structure": Bullish EMA21 > EMA50
  both sloping up; Bearish mirror; "If Daily says BULL and 4H says BEAR — bias is NEUTRAL" (§1). BOS boost when a close
  breaks the last swing.
- **Craig's confluence box**: "Pivot Bias — price above PP = bullish"; "Structural Bias — Daily/4H EMA trend"; "Momentum —
  VWAP slope direction on the current session"; "When all three agree: confluence confirmed … When they conflict: wait or
  reduce size" (§4). Value area: "inside the VA → range-bound, mean-reversion to POC"; "outside … holding above VAH →
  bullish breakout mode".
- **Max copier**: "I identify important higher-timeframe price levels on the 1 hour and enter when the market produces a
  strong impulse move beyond them"; then LTF consolidation, VAL, hidden divergence, 3–5 positions. "If gold is trading in
  the middle of a range … I may remain inactive."

### 4.2 Tested vs untested
- Max Copier engine (`js/maxCopierEngine.js`): "negative pooled OOS Sharpe across all three exit modes, 2016–2026, 26
  instruments … the breakout-predicts-continuation premise itself being 'economically empty'" (`CROWN_WATCH.md` 2026-09-21 (2);
  `MD files/LEGO_MODULES.md` §1z). NULL.
- Golden cross / SMA / Donchian (strategyLab gauntlet): 0/12 survive (`CROWN_WATCH.md` 2026-09-21 (2)).
- ConfluenceBot zones: H4 ≈ 0R, M30 −0.013R (memory `confluencebot-zone-verdict`, cited in the Wayond note).
- D1/H4 trend features are inside `bias-learner-fx` (NULL); the 4h EMA20 slope rule `h4-trend-hold` loses.
- **Untested as stated:** the D1-vs-H4 *disagreement → neutral* abstention rule, and Craig's three-way agreement
  (pivot side + structure + VWAP slope) as a direction filter.

---

## 5. Nicholas Crown (outside Colez Trades)

Source: `MD files/CROWN_WATCH.md` (13 entries, 2026-09-18 → 2026-11-03). No intake note.

### 5.1 How he forms bias
- **Macro first, one driver at a time.** "Macro right now is the only way to approach the market… The ten year is driving
  the bus … the asphalt it's driving on is … crude oil" (2026-09-18). "The only chart you need on your screens right now…
  dollar yen and the intervention" (09-18 (3)).
- **Layered stack, no weights.** "We monitor cap weight versus equal weight dispersion via RSP/SPY … overlay implied versus
  realized vol, index skew, options flow, dealer gamma exposure, and futures positioning … Then we add our rates layer …
  Finally, the narrative: … a press listener" (2026-10-16 (2)).
- **Fundamentals vs positioning by horizon.** "Fundamentals tell you where you should go in the long run, positioning
  tells you which way it's going right now"; "knowing when to diverge from the fundamentals and focus on positioning";
  asymmetric payoff into a catalyst when "a lot of the pain was already priced in" (2026-10-02).
- **Intraday regime by VWAP.** "above it, buyers are in control, below it, sellers are in control … three consecutive
  closes below VWAP and a retest of the line that holds, control has shifted" (2026-09-19).
- **Prognoses = trailing trend restated.** Repo: "Both are the trailing relative return restated as a forecast"
  (2026-10-16 (3)) **[ours]**.

### 5.2 HTF/LTF, regimes
Regime talk is about the *current driver* ("the 10Y is driving today") and dealer gamma ("pin … and accelerate",
2026-09-20 (2)). Indicator tier list: SMA 50/200 "A tier … works because institutions watch it", Donchian A, MACD F
(09-21 (2)). No HMM/Markov.

### 5.3 Tested vs untested
| Claim | Ledger | Verdict |
|---|---|---|
| Breadth narrowing as timing; RSP/SPY reversion | `breadth-narrowing` | NULL (all four hypotheses) |
| "Priced-in" asymmetry into a catalyst | `priced-in-direction`, `squeeze-fuel` | NULL |
| VWAP regime / pullback entries | VWAP book (6 constructions) | NULL |
| Real yields → Nasdaq next session | `real-nq` chain link | context, no forward lead |
| Leadership persistence | `rotation-extreme`, `breadth-tilt-semis` | NULL |
| Oil/gold ratio reversion | S17 in `MARKET_SENSE_TESTS.md` | pre-registered (see entry) |
| AI-crack → metals | `ai-crack-metals` | NULL |
| Dealer gamma | `gex-range-es` | range VALIDATED; direction NULL |
| Positioning | `positioning-into-release-direction`, `cot-crowding-p5` | VALIDATED, small / non-G10 |

**Untested (CROWN_WATCH "Open candidates", lines 61–150):** small caps (Russell vs S&P) *leading* the Fed path (equities →
rates, never run); VWAP 3-close acceptance; VWAP work on NAS100/SPX500; "who's driving" leadership ranking; energy
equities vs barrel; first close below the S&P 100-day (from Jess Inskip).

---

## 6. Jess Inskip and unnamed clips (brief)

`MD files/CLIP_WATCH.md`. Inskip reads a day "from the inside out": index → equal-weight → A/D → sectors → oil/yields/
dollar; "When it breaks a moving average, that's broadly accepted, it just triggers this sell-off" (2026-11-02). Four
markets = mood / demand / uncertainty / expectations (2026-10-02 (8)). Unnamed clip: "if high yield isn't widening while
stocks bounce … that bounce has legs" → `bounce-confirmation` UNDERPOWERED, wrong-signed at 5 sessions. 100-day break:
untested candidate.

---

## 7. Quant Guild (Roman Paolucci; technical lane)

Sources: `education/intake/technical/quant-guild/PLAYBOOK.md`, `2026-11-12-hidden-markov-models.md`,
`2026-11-12-markov-chains.md`, `2026-11-12-non-stationarity-market-timing.md`, `2026-11-12-quant-vs-discretionary.md`,
`2026-11-12-model-tier-list.md`, `2026-11-12-time-series-analysis.md`, `2026-11-12-law-of-total-expectation.md`.

### 7.1 How he would form (or refuse) a bias
He does not form a directional bias. "I'm never going to be able to predict where this purple vertical line falls. That's
not my goal" (HMM note). "Forecasts are not predictions, they're expectations… if status quo" (time-series note). "Our
goal is never prediction. Our goal is positioning for survival" (PLAYBOOK, Sayings). Market timing fails because the
regime switch is unobservable: "Do we know when it changes from a six-sided dice to a 10-sided dice?"; "You have no idea
what regime it worked in" (non-stationarity note). Discretion is legitimate as a **time-variant policy** π*: "low touch"
switching of a systematic engine on/off, judged across *separate ON episodes*: "if I'm right on average then I should see
similar performance in regimes where I turn it off and turn it back on"; "I should turn it back off once I start to
observe this drawdown" (quant-vs-discretionary note).

### 7.2 Regimes, HMM, Markov
- **Explicit Markov chain first** (20-day RV split at 33/66th pct into low/mid/high), **HMM only if it beats it out of
  sample**; "it is very easy to overfit"; "simpler models may explain similar or even more variability"; "Business likes
  explainability" (HMM note). HMMs **C tier**: "states aren't stable over time … 'usually just Russian propaganda'; need
  economic justification" (`2026-11-12-model-tier-list.md:36`). Markov chains **S tier** (line 25).
- HMM states "are compressions of those latent factors… I can't tell you what latent state 3 is" — they bundle vol and
  trend.
- Fat tails = "a time-compressed mixture of regimes"; "Stability is what we look for in the real world, not stationarity";
  "If you observe a massively volatile day, did we just enter a new regime? Or is it an outlier for the current regime?"
- **Code gaps the repo found in his notebooks:** full-sample quantile thresholds, smoothed (forward-backward) labels =
  lookahead for live use, one random start, no OOS (HMM note "What the code actually does"). Repo method lesson #14:
  "Regime labels are causal: label at t from data ≤ t only … never Viterbi, smoothed probabilities or full-sample
  quantile cuts" (`education/RESEARCH_METHOD_LESSONS.md:32`); #5 linear/Markov baseline first; #6 regime checks; #19 fit
  window; #20 expectancy legs by regime; #24 "Test discretion from an ex-ante ON/OFF log, not a blind backtest of the
  trader's tool".

### 7.3 Tested vs untested
- Repo HMM as direction: `gr-hmm-trend-direction` NULL — "The HMM trend label describes the last fortnight; it is not a
  next-day call." Memory "HMM = variance, not direction".
- Everything else is **untested**: `model-audits` Q1 (HMM label stability, 2 vs 3 states, 10 starts, transition
  homogeneity, vs explicit σ Markov chain; `.claude/skills/research-director/agendas/model-audits.md:11`), Q5 (fit window),
  Q6 (expectancy legs by regime). No regime-conditional *direction* rule has been tested with causal (filtered) labels
  except the HMM trend label above.

---

## 8. Jordan (Discord member; adjacent, not an educator)

Reconstructions of *his* method only (`education/jordan_*`). Impulse range, ATR band, VWAP session reversion: NULL;
impulse 4h range levels: two OOS correlations survive (impulse size vs exhaustion −, VWAP distance vs reversal size +)
(`.claude/skills/cog-knowledge/references/verdicts.md`, "Jordan / Colez mechanisations").

---

## 9. Where they agree and disagree

**Agree**
1. **Separate direction from entry.** C.OG ("Fundamentals provide directional bias. Technicals provide entry timing",
   Lesson-06 :226); Max ("bias is 70–80% of the system"; Wayond: "pair … a fundamental bias with a simple entry model");
   Jay ("The pivot is the daily anchor. Everything else is confirmation"); Craig/gold method (HTF bias first, zones second).
2. **Direction should come from outside the chart / from a slower clock.** C.OG (rates, liquidity, "nothing to do with NAS"),
   Max (USD fundamentals), Crown ("macro … the only way"). QG agrees only that one needs a *reason* (economic
   justification for states).
3. **Neutral / stand-aside is an output.** Max (30–50% neutral days; flat before tier-1), C.OG (trades ~24% of weekdays;
   "Asia range is context, not a signal"), gold method ("If Daily says BULL and 4H says BEAR — bias is NEUTRAL"), QG
   (switch the engine off). Repo agenda agrees: abstention is one of the three places edge may live.
4. **Regime first.** C.OG (vol regimes, risk-on/off, "matters more than your specific trade thesis"), Crown ("the 10Y is
   driving"), QG (regime mixture explains tails). Max's "regime" is just neutral vs directional.
5. **Events reset the bias.** Max (redo after the print), C.OG (stage 2 after 08:30 ET; "Real moves often happen the week
   after" OpEx).

**Disagree**
1. **Horizon of the macro edge.** C.OG's course: "don't try to day-trade macro"; edge at weeks–months; intraday
   "noise-dominated". Max does exactly a daily macro call. Crown trades days-to-weeks. QG: timing fails generally.
   The repo's results side with C.OG's course and QG: every daily macro direction cell is NULL/UNDERPOWERED
   (`direction-bar`: macro 0 of 82 validated per `daily-bias.md`).
2. **Price vs fundamentals.** Max says "zero price action", but his record = 4h EMA20 slope 84% (`max-bias-reverse`).
   Jay/Craig/gold method build bias explicitly from price (pivot, VWAP, EMA21/50). C.OG refuses NQ's own price; QMR
   (price-based) is dead (`cog-replication/DECISIONS.md`).
3. **Trend vs reversion at the open.** C.OG L4: London first 1–2h "establish the day's direction" and Asia breaks "signal
   direction"; repo: afternoon follows morning ~coin flip (`fast-start-rest-of-day` T3b) and wide Asia *reduces* London's
   reach (`asia-range-london`). Max/Jay "VAH/VAL = statistical anomaly → revert" vs C.OG L3 "high vol → momentum".
4. **HMMs.** C.OG lists HMM as a regime method (Cross-Asset Synthesis :172) and asks for a regime probability; QG rates HMMs
   C tier and demands an explicit-chain baseline; repo HMM trend label NULL.
5. **"Trade the surprise"** (Max) vs repo `post-release-drift-pooled` leaning reversal; C.OG's course puts data surprises
   in the noisy "hours to days" band (Currency-Markets :148). Repo `fed-two-moves` (CONTEXT): a decision-day move is
   half-undone within a month as often as any big day.
6. **Holding.** Max: hold swings until bias flips; C.OG L3: "Normal … Let winners run". Repo: `hold-day-one-confirm-run`
   NULL, `exit-on-fixed-entries` NULL → "close at 21:00 and re-enter".

---

## 10. Comparison table

| | C.OG | Max Cole | Jay | Craig / gold method | N. Crown | Quant Guild |
|---|---|---|---|---|---|---|
| Bias inputs | rates spreads (SOFR–Euribor), liquidity (BS−TGA−RRP), CB balance sheets, positioning/OI, vol forecast as one layer | FF calendar → FundaBias score → USD strength, Fed tone, real yields, COT | daily + 4h pivot, VWAP side | D1/H4 EMA21/50 + BOS; pivot side; VWAP slope; VA position | 10Y/oil/USDJPY driver, RSP/SPY, vol surface, gamma, CTA/COT, rates, narrative | none (refuses prediction); regime state for risk |
| Bias clock | pre-open each day (observed); course says weeks–months | once a day after Asia; carried until catalyst | session | daily / 4h | days–weeks | n/a |
| Up/down/range output | lines give range; "close inside OC band = normal / chop" | bullish / bearish / neutral (1–10 score) | long/short by pivot+VWAP | BULL / BEAR / NEUTRAL (TF conflict) | prognoses, no horizon | regime probabilities |
| HTF vs LTF | macro (slow) permission + fast pre-open read [ours]; Asia sets table, London sets direction | 4H/D "environment", 15–30m mark, 1–5m confirm; HTF used mostly to justify neutral | D/4h pivots → 1–5m trigger | D/H4 bias → M30 fib → 5m VuManChu | macro over ticks ("ant riding a horse") | n/a |
| Regimes | vol LOW/NORMAL/HIGH by ATR pct; risk-on/off; growth×inflation; dollar smile; correlation regimes | neutral vs directional | none | VA inside = range, outside = breakout | "who's driving"; gamma pin vs accelerate | explicit Markov chain on RV; HMM only if better OOS |
| HMM/Markov | HMM listed as a method; wants regime probability | no | no | no | no | central; HMM C tier |
| Abstention | yes (~24% trade rate) | yes (30–50% neutral, flat pre-news) | no explicit | NEUTRAL on TF conflict; wait if box conflicts | no | switch engine off on drawdown |
| Tested direction claims | G1 NULL, G3 NULL, rates lead NULL, setups NULL, vix-beta-change VALIDATED (research) | post-release UNDERPOWERED (reversal lean), hold NULL, 4h rule loses | VWAP NULL ×6, fibs NULL, VMC NULL | Max Copier NULL, golden cross 0/12, bias-learner NULL | breadth NULL, priced-in NULL, rotation NULL | HMM trend NULL |
| Validated pieces they touch | G2 GEX → range; vix-beta-change; VVIX/VXN rise | `post-fomc-usd-drift` (dollar, 5d) | — | — | `positioning-into-release-direction`, `cot-crowding-p5`, `gex-range-es` | `fast-start-rest-of-day`, vol clustering (range) |
| Biggest untested piece | regime → strategy type; run-length of his sides | pre-news range day; against-4h days | pivot-side bias; untapped-pivot magnet | D1/H4 disagreement as abstention | equities → Fed path lead | HMM vs explicit chain stability (`model-audits` Q1) |

---

## 11. Untested, testable ideas (screened against the ledger)

Ranked roughly by how directly they serve a 24h-to-few-day bias and how much the floor in §0 leaves room.

1. **Regime → which kind of bias works (C.OG Vol. Intelligence L3).** Label each day LOW/NORMAL/HIGH by ATR(14) percentile
   over the trailing 6–12 months (causal). Score three fixed rules per regime: fade to the open/VA (mean reversion),
   prior-day/4h trend follow, and break of the Asia range. Horizons 21:00, +1, +3 days. Noise: shifted regime labels.
   *Prior*: trend-following-fx NULL, h4-trend-hold loses, stress-filter-hold NULL; daily-bias Q9 was dropped, never run.
   Not in the ledger.
2. **Range-day call before tier-1 news (Max "range up until news").** Morning before a scheduled release vs matched
   non-event mornings: share of the day's range printed before the release, reach of the p50 band before the release.
   A range claim, so the validated half. `day-type-expansion` pooled event size but did not isolate the pre-release window.
3. **TF-conflict abstention (gold method §1; Craig box).** D1 EMA21/50 and H4 trend agree vs disagree → hit rate and R of
   any fixed side (desk, h4) on agree days vs all days; accuracy-coverage curve vs random abstention. Partly inside
   `bias-learner-fx` (features) but abstention by *disagreement* was not scored on its own.
4. **Pivot-side bias (Jay / Craig).** Price vs daily PP at 07:00 → close 21:00 direction, FX + gold + indices, vs B0 and
   shifted-pivot placebo. Pivot-spike harness exists; verdict never recorded (`MD files/BACKTEST_INDEX.md:34`, :98).
   Low prior (every level/line family NULL).
5. **Run-length test of C.OG's direction log** (`COG_OBSERVED_SYSTEM.md` §4g): runs of same-side calls vs alternation.
   Needs ~30 logged directions; forward log has 2 (`cog-replication/FORWARD_LOG.md`). Pure measurement, no model.
6. **Explicit σ Markov chain vs HMM (QG; C.OG's "probability of being in different volatility regimes").**
   `model-audits` Q1: label stability, 2 vs 3 states, multi-start, transition homogeneity by half, filtered labels only.
   Not a direction test; it decides whether any regime label is fit to condition a bias.
7. **Dollar-smile side as a USD conditioner (C.OG L5).** Classify days left/middle/right (US growth/rate differential vs
   VIX/HY stress) causally; read the 1–5 day USD basket drift in each. No ledger hit for "dollar smile".
8. **Week after OpEx as the direction window (C.OG L2).** Index direction/size in the week after monthly expiry vs other
   weeks. `opex-cycle-range` is range-only (UNDERPOWERED).
9. **Asia break with trend alignment (C.OG L4).** London break of the Asia range in the direction of the D1/H4 trend vs
   against it, to 21:00. `asia-range-london` and `fast-start-rest-of-day` test range and the morning-afternoon split, not
   aligned breaks.
10. **Equities lead the Fed path (Crown 2026-10-31).** Russell-minus-S&P relative return → next change in SR3Z6 / Atlanta Fed
    hike odds, both directions. Listed in `CROWN_WATCH.md` open candidates; never run (the reverse lead is on the
    `yield-predictive-ladder` shortlist).
11. **Max against the 4h trend** (9 of 57 days, +0.79R) and **QG ON/OFF log** (lesson #24): forward only, through
    `bias-scoreboard` — record the forecaster's ON/OFF state ex ante and judge across separate ON episodes.
12. **First close below the S&P 100-day (Jess Inskip)** → next 5/20 sessions vs matched control, with the mirror. Listed in
    `CROWN_WATCH.md` open candidates; low prior (`level-touch`, `daily-band-fade`).

Already answered, do not re-open without a new mechanism: trade the surprise (post-release-drift-pooled), hold day-one
winners (hold-day-one-confirm), exits on trend entries (exit-on-fixed-entries), learned multi-TF bias on FX
(bias-learner-fx), HMM trend direction, G1/G3/QMR, rates-lead-NQ, breadth timing, VWAP regime entries, golden
cross/Donchian, Max Copier engine.
