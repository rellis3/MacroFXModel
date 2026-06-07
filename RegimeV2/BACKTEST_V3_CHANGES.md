# RegimeV2 — V3 Backtest: Changes, Rationale, and Usage Guide

## 1. Purpose and How to Use the Backtester

`backtest_v3.py` is a self-contained, API-free backtester for the RegimeV2 regime-following trading system. It reads historical M1 OHLCV parquet files, resamples to M5, simulates the HMM signal using EMA separation, and runs V3 (and optionally V2) trade logic across the full history.

The primary goal is to verify whether the V3 changes described in this document improve system performance before deploying them to the live bot (`regime_bot_v2.py`).

### Quick start

```bash
# V3 only, default 9-pair set, from 2018
python RegimeV2/backtest_v3.py

# V3 vs V2 comparison (recommended)
python RegimeV2/backtest_v3.py --compare-v2

# Custom pairs, start date, OOS split, JSON output
python RegimeV2/backtest_v3.py \
    --compare-v2 \
    --pairs eurusd gbpusd usdjpy eurjpy gbpjpy \
    --from 2020-01-01 \
    --oos-days 365 \
    --output results/v3_run1.json
```

### CLI arguments

| Argument | Default | Description |
|---|---|---|
| `--pairs` | 9-pair set | Space-separated pair slugs (e.g. `eurusd gbpusd`). Also accepts slash form (`EUR/USD`). |
| `--from YYYY-MM-DD` | `2018-01-01` | Backtest start date. |
| `--oos-days N` | `180` | Last N days treated as out-of-sample. |
| `--compare-v2` | off | Run V2 trade logic in the same pass for direct comparison. |
| `--output path.json` | none | Write full results (stats + all trades) to JSON. |

### Data requirements

Parquet files must exist in:
```
/home/user/MacroFXModel/VolRangeForecaster/data/m1/
```
File naming: `{pair}_m1.parquet` (e.g. `eurusd_m1.parquet`). Files must have columns `open`, `high`, `low`, `close` (case-insensitive) and a UTC DatetimeIndex. The `volume` column is optional.

### What the backtester does NOT include

- No live API calls (no regime dashboard, no MT5)
- No RiskGuard drawdown limits (intentional — tests clean signal)
- No news/FOMC/VIX gates (simulated data not available in parquet files)
- No MFE retrace exit (X13) — kept for future version
- No lot sizing (all trades counted equally in R-multiple)

---

## 2. Complete Table of V3 Changes vs V2

### Entry: Hard gates

| Gate | V2 | V3 | Change |
|---|---|---|---|
| E2 — effective confidence | `conf × session_mult ≥ 70%` | Same (kept) | No change |
| E3 — confidence rising | Must be rising vs prev bar (bypass at ≥ 85%) | **Removed as hard gate** | Absorbed into score |
| E4 — vol_z ceiling | `vol_z ≤ 2.5` | **Removed as hard gate** | Absorbed into score |
| E5/debounce — candle hold | 2 polls same regime + conf ≥ 70% | Same (kept) | No change |
| E6 — decay score | `decay < 0.25` (uses DecayDetector) | **Removed as hard gate** | Absorbed via BOCPD trend penalty in score |
| E7 — 1H not opposed | Required | Same (kept) | No change |
| E8 — consensus | `≥ 2 pairs` | Same (kept) | No change |
| E9 — FOMC window | Blocks entry | Not applicable in backtest | — |
| E10 — VIX | Blocks entry | Not applicable in backtest | — |
| E11 — news | Blocks entry | Not applicable in backtest | — |
| E12 — vol exhaustion | `score < 0.8` | **Removed as hard gate** | No historical vol-exhaustion state available |

**V3 hard gates summary: 4 gates** (E2 effective conf, E5 debounce, E8 consensus ≥ 2, E7 1H not opposed)

### Entry: Composite score gate

| Parameter | V2 | V3 | Change |
|---|---|---|---|
| `entry_score_min` | 55 | **65** | Raised by 10 points |
| Score component weights | HMM 35%, BOCPD 20%, session 15%, DXY 10%, consensus 10%, vol 5%, credit 5% | **HMM 35%, BOCPD 20%, session 15%, DXY 10%, consensus 10%, ATR-regime 10%** | vol/credit replaced by ATR-regime proxy |
| BOCPD entry behaviour | BOCPD stability only (`100 - prob`) | **BOCPD stability + rising-trend penalty** | See section 2a |

### Entry: BOCPD as forward quality signal (V3 only)

In V2, BOCPD was an **exit-only** signal (X6). In V3, it also penalises the composite score at entry:

```
bocpd_s = max(0, 100 - bocpd_prob)
if bocpd_trend > 10:          # BOCPD rising fast over last 3 bars
    bocpd_s -= bocpd_trend    # additional penalty proportional to the rate of rise
```

This means: high confidence + rising BOCPD = lower score = less likely to enter. The trade is less likely to be taken when the regime is already showing early signs of ending.

### Exit: X3 and X4 suppression

| Rule | V2 | V3 | Change |
|---|---|---|---|
| X3 — confidence slope deterioration (< -5% × 3 bars) | Always fires | **Suppressed when MFE ≥ 1R** | Winning trades get breathing room |
| X4 — single-bar confidence drop (> 15%) | Always fires | **Suppressed when MFE ≥ 1R** | Same |

### Exit: X8 consensus softened

| Rule | V2 | V3 | Change |
|---|---|---|---|
| X8 — consensus collapse | Exit when consensus < 2 (same as entry minimum) | **Exit when consensus < 1** (all other pairs disagree) | Less hair-trigger |

### Exit: All other rules unchanged

X1 (regime flip), X2 (conf floor), X5 (SL hit), X6 (BOCPD sustained high), X7 (1H opposed), X11 (score below hold_min × 2 bars) remain identical between V2 and V3 in the backtest.

---

## 3. Rationale for Each Change

### 3a. Removing E3 (conf rising) as a hard gate

**Problem in V2:** E3 was a binary gate. A bar where confidence was 82% → 81% (trivial fade) would block entry, even if all other signals were strongly aligned. This created a high rate of false rejections in trending markets where confidence oscillates on the approach to a new high.

**V3 fix:** The HMM score component already encodes the *level* of confidence (score = 0 at conf=65, 100 at conf=100). A bar with declining confidence will score lower on HMM, which reduces the total score. If the decline is material, the score will fall below the raised threshold of 65. The gate is effectively still present, but as a continuous filter rather than a binary on/off based on a single-bar comparison.

### 3b. Removing E4 (vol_z) and E12 (vol exhaustion) as hard gates

**Problem in V2:** Both gates fire based on short-window vol estimates that are noisy at M5 resolution. A legitimate breakout bar frequently has elevated vol_z > 2.5 precisely because price is accelerating — the gate inadvertently rejects the best entries.

**V3 fix:** ATR-regime score component (replaces live vol/credit which require external data) gives a continuous penalty when ATR is either dead (< 0.005% of price) or dangerously elevated (> 0.10%). The 0.005–0.04% band, where most clean trends live, scores 90/100. This is a softer, context-aware filter.

### 3c. Removing E6 (decay) as a hard gate; BOCPD trend as proxy

**Problem in V2:** The DecayDetector is stateful and depends on vol_z history across polls. In backtesting, vol_z is simulated (ATR z-score), so the decay signal is noisier than in the live bot. Using it as a binary block caused false rejections.

**V3 fix:** BOCPD naturally captures regime-end risk. If a regime is about to end, BOCPD will begin rising in the last 3–8 bars before the actual change point. Using `bocpd_trend` (the slope of BOCPD over the last 3 bars) as a score penalty achieves the same goal as the decay gate but in a continuous, graded way. An entry where BOCPD is at 30% but rising fast scores lower than an entry where BOCPD is at 35% but flat or falling.

### 3d. Raising entry_score_min from 55 to 65

**Rationale:** With 3 of the 5 hard gates removed and absorbed into the score, the score now does more work. A score of 55 was reasonable when 8+ hard gates were already pre-filtering. With only 4 hard gates, the composite score must carry more of the filtering burden. Raising to 65 ensures entries only occur when multiple signals agree strongly, not just marginally.

**Expected effect:** Fewer total trades, but with higher quality. Win rate should improve even if total R is similar, because weak trades near the old 55 threshold are cut.

### 3e. Suppressing X3/X4 when MFE ≥ 1R

**Problem in V2:** In a strong trending move, confidence frequently oscillates. HMM confidence is a lagged, smoothed signal — it dips mid-trend and recovers as price continues in the same direction. X3 and X4 were designed to exit dying trades early, but they also fired on healthy trades that were simply in a confidence pullback while price continued favourably.

**V3 fix:** Once a trade reaches 1R in profit (MFE of at least one SL-distance from entry), the position has demonstrated its validity. At that point, X3 and X4 are suppressed. The trade can only be closed by: regime flip (X1), hard confidence floor (X2), sustained BOCPD signal (X6), 1H opposition (X7), score degradation (X11), or SL hit (X5). This change is specifically designed to extend winning trades without changing how losing trades are managed.

### 3f. Softening X8 consensus exit (exit only when < 1)

**Problem in V2:** X8 exits when consensus drops below 2 — the same threshold as the entry gate. This means a pair exits as soon as it falls to "solo" status (only 1 pair in the same regime). However, leading pairs frequently enter a trend before the rest of the universe catches up. Exiting when the count drops from 2 to 1 was too reactive, often closing a perfectly good position because another pair lagged by a few bars.

**V3 fix:** Exit only when consensus < 1, meaning ALL other configured pairs are in a different regime. True counter-consensus — every other pair disagrees — is a much stronger bearish signal for the position than simply losing majority support.

---

## 4. What to Look for in the Results

### Success criteria

| Metric | Threshold to consider V3 a meaningful improvement |
|---|---|
| Win rate | V3 win rate ≥ V2 win rate + 2 percentage points |
| Profit factor | V3 PF ≥ V2 PF + 0.15 |
| Average R | V3 avg R ≥ V2 avg R + 0.05 |
| OOS consistency | OOS metrics within 15% of IS metrics (low overfitting) |
| Total trades | V3 trade count within 30–70% of V2 (not too few, not the same) |

### Red flags (V3 probably not ready)

- V3 win rate lower than V2 (wrong direction entirely)
- V3 generates fewer than 50% of V2 trades and total R is similar or worse (over-filtered)
- OOS win rate < 40% (below random for a trend-following system)
- V3 max drawdown in R larger than V2 max drawdown (exit changes made things worse)
- Most V3 trades exit via X3/X4 even with the suppression (signals fundamentally unreliable)

### Specific exit-reason checks

Look at the exit reasons breakdown. For V3 to demonstrate the X3/X4 suppression is working:

- X3 + X4 combined should be a **smaller fraction** of total exits in V3 vs V2
- X5 (SL hit) should be a **similar or larger fraction** in V3 (letting trades run to SL when winning)
- X1 (regime flip) is expected to increase in V3 relative to V2 (trades run longer)

If X3/X4 in V3 are near-zero but the win rate did not improve, the suppression may be causing trades to stay open too long past their natural end.

### Session analysis

The session breakdown reveals where V3's changes help most. Expected pattern:
- London/NY sessions: V3 should improve vs V2 (reduced noise filtering, trades run longer in trending hours)
- Asian session: V3 changes may have little effect (regime signal is weaker, BOCPD penalty at entry should still filter well)

---

## 5. How to Interpret the Output

### Printed header section

```
Loading M5 data for N pairs...
  EUR/USD: 524,288 M5 bars (2018-01-01 → 2026-06-07)
```
Confirms data was loaded correctly. If bars are suspiciously low (< 100,000 for a major pair over 5+ years), check the parquet file.

### Per-run summary rows

```
── V3 ──
  All:   n=XXX  WR=XX.X%  PF=X.XX  avgR=+X.XXX  totalR=+XX.XX  maxDD=X.XXR
  IS:    n=XXX  WR=XX.X%  ...
  OOS:   n=XXX  WR=XX.X%  ...
```

- `n` — total trades. For the default 9-pair set over 2018–2026 you should see hundreds to low thousands of V3 trades.
- `WR` — percentage of trades that closed at a positive R-multiple. Includes spread cost at entry.
- `PF` — profit factor = gross profit R / gross loss R. Above 1.3 is meaningful for a trend-following system.
- `avgR` — average R-multiple per trade. Positive means positive expectancy. A regime-following system targeting +0.3R average is realistic.
- `totalR` — cumulative R across all trades (risk-adjusted P&L proxy).
- `maxDD` — largest peak-to-trough drawdown measured in R units.

### IS vs OOS comparison

The IS (in-sample) and OOS (out-of-sample) split is the core validity check. The system was not optimised on the OOS period, so degradation from IS to OOS is expected, but should not be catastrophic.

Acceptable OOS degradation:
- Win rate: lose up to 5pp (e.g. IS 52% → OOS 47%)
- PF: lose up to 0.2 (e.g. IS 1.4 → OOS 1.2)
- Average R: lose up to 0.05R

If OOS is substantially better than IS, the IS data may contain a particularly bad regime period (e.g. 2020 COVID volatility). Check if the OOS period happens to coincide with a particularly trending market.

### V3 vs V2 delta table

```
  Win rate : V2=48.2%  V3=51.7%  Δ=+3.5pp
  PF       : V2=1.23   V3=1.41   Δ=+0.18
```

This is the key comparison. The deltas show V3's net effect on each metric. A positive delta across win rate, PF, and average R simultaneously is the target.

### Exit reasons table

Shows the distribution of why trades closed. Useful for diagnosing whether the V3 X3/X4 suppression is functioning and whether any single exit rule is dominating in an unexpected way.

### By-pair and by-session tables

Use these to check for:
- Pairs where V3 clearly underperforms (may need pair-specific tuning)
- Sessions where V3 significantly improves (validates the logic)
- Outlier pairs that drive most of the total R (concentration risk)

---

## 6. Applying V3 Changes to the Live Bot (regime_bot_v2.py)

If the backtest results meet the success criteria, apply the following changes to `regime_bot_v2.py`:

### Step 1: Entry score minimum

In `DEFAULT_CFG`, change:
```python
'entry_score_min': 55.0,
```
to:
```python
'entry_score_min': 65.0,
```

### Step 2: Remove E3 (conf rising) as a hard gate

In the gate checks section (around line 1362), remove or comment out the block:
```python
if not gate_fail and len(conf_list) >= 2:
    if conf_list[-1] <= conf_list[-2] and conf_list[-1] < cfg.get('conf_rising_bypass', 85.0):
        gate_fail = f'conf not rising ({conf_list[-2]:.0f}%→{conf_list[-1]:.0f}%)'
```

### Step 3: Remove E4 (vol_z) as a hard gate

Remove or comment out:
```python
if not gate_fail and vol_z > cfg.get('vol_z_max', 2.5):
    gate_fail = f'vol_z {vol_z:.2f} > {cfg["vol_z_max"]}'
```

### Step 4: Remove E6 (decay) as a hard gate

Remove or comment out:
```python
if not gate_fail and decay_score >= cfg.get('entry_decay_max', 0.25):
    gate_fail = f'decay {decay_score:.3f} ≥ {cfg["entry_decay_max"]}'
```

### Step 5: Remove E12 (vol exhaustion) as a hard gate

Remove or comment out:
```python
if not gate_fail and exhaust_score > 0.8:
    gate_fail = f'vol exhaustion {exhaust_score:.2f} > 0.8 (E12)'
```

### Step 6: Add BOCPD trend penalty to compute_regime_score

In `regime_score.py`, modify the BOCPD stability component. First, add `bocpd_trend` as a parameter to `compute_regime_score`:
```python
def compute_regime_score(
    ...
    bocpd_trend: float = 0.0,   # Add this parameter
    ...
) -> RegimeScore:
```

Then modify the BOCPD score component:
```python
# ── 2. BOCPD stability ────────────────────────────────────────────────────
bocpd_s = max(0.0, 100.0 - bocpd_prob)
# V3: penalise further if BOCPD is rising fast (regime ending soon)
if bocpd_trend > 10.0:
    bocpd_s = max(0.0, bocpd_s - bocpd_trend)
```

In `regime_bot_v2.py`, pass the BOCPD trend to `compute_regime_score`:
```python
# Compute OLS slope of recent BOCPD values from bocpd_reg
bocpd_recent = [bocpd_reg.change_prob(pair)]  # extend with history if tracked
bocpd_trend_val = _ols_slope(bocpd_recent[-3:]) if len(bocpd_recent) >= 3 else 0.0

reg_score = compute_regime_score(
    ...
    bocpd_trend=bocpd_trend_val,
    ...
)
```

Note: the live bot does not currently store a history of BOCPD values per pair. You will need to add a rolling deque (similar to `conf_history`) to store the last 3 BOCPD readings per pair to compute the trend.

### Step 7: Suppress X3/X4 when MFE ≥ 1R

In the open position management section, modify X3 and X4 to check MFE first:

```python
# X3 — confidence slope deterioration
if not close_reason and len(conf_list) >= cfg.get('slope_bars', 3):
    # V3: suppress when MFE ≥ 1R (winning trade — let it breathe)
    sl_dist_x3 = abs(pos['entry_price'] - pos['sl']) if pos.get('sl') else 0
    mfe_r_x3   = (running_mfe.get(pair, 0.0) / sl_dist_x3) if sl_dist_x3 > 0 else 0.0
    if mfe_r_x3 < 1.0:  # only check slope when not yet 1R profitable
        recent_slopes = [
            conf_list[i] - conf_list[i-1]
            for i in range(max(1, len(conf_list)-cfg['slope_bars']), len(conf_list))
        ]
        if recent_slopes and all(s < cfg.get('slope_thresh', -5.0) for s in recent_slopes):
            close_reason = f'Conf slope {conf_slope:+.1f}%/bar × {len(recent_slopes)} bars (X3)'
            exit_code = 'X3'

# X4 — single-bar velocity drop
if not close_reason and len(conf_list) >= 2:
    sl_dist_x4 = abs(pos['entry_price'] - pos['sl']) if pos.get('sl') else 0
    mfe_r_x4   = (running_mfe.get(pair, 0.0) / sl_dist_x4) if sl_dist_x4 > 0 else 0.0
    if mfe_r_x4 < 1.0:  # only check drop when not yet 1R profitable
        drop = conf_list[-2] - conf_list[-1]
        if drop > cfg.get('drop_thresh', 15.0):
            close_reason = f'Conf drop {drop:.1f}% in 1 bar (X4)'
            exit_code = 'X4'
```

### Step 8: Soften X8 consensus exit

Find the X8 block in the exit logic:
```python
# X8 — consensus collapsed (checked against entry regime, not current)
if not close_reason:
    cons_x8, cons_x8_total = consensus_score(cfg['pairs'], all_regimes, entry_r)
    if cons_x8_total > 1 and cons_x8 < cfg.get('consensus_min', 2):
        close_reason = f'Consensus collapsed {cons_x8}/{cons_x8_total} (X8)'
        exit_code = 'X8'
```

Change the threshold check from `< consensus_min` to `< 1`:
```python
# X8 — V3: exit only when ALL other pairs disagree (consensus < 1)
if not close_reason:
    cons_x8, cons_x8_total = consensus_score(cfg['pairs'], all_regimes, entry_r)
    if cons_x8_total > 1 and cons_x8 < 1:
        close_reason = f'Consensus collapsed {cons_x8}/{cons_x8_total} (X8)'
        exit_code = 'X8'
```

### Step 9: Update DEFAULT_CFG with V3 flag

Add a version flag to the config so the dashboard can display which version is active:
```python
'logic_version': 'v3',
```

### Step 10: Deploy procedure

1. Run the full backtest one final time with `--compare-v2 --oos-days 365` to confirm results.
2. Commit the changes on a feature branch.
3. Test in paper mode (`python RegimeV2/regime_bot_v2.py`) for at least 2 full trading days (Mon–Fri, London session).
4. Monitor the regime viewer dashboard for correct gate behaviour (fewer E3/E4/E6 gate rejections, more entries passing through to score gate).
5. Verify X3/X4 suppression is working by checking that open trades with MFE > 0 are not being closed by X3/X4 on confidence dips.
6. If paper mode metrics match expected entry frequency from the backtest, enable live mode.

---

*Document generated for RegimeV2 project. Backtest script: `RegimeV2/backtest_v3.py`. Live bot: `RegimeV2/regime_bot_v2.py`. Score module: `RegimeV2/regime_score.py`.*
