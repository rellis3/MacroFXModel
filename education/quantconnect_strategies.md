# QuantConnect Strategy Library → Rebuild Notes

> **Epistemic status: REFERENCE / PROPOSAL.** This is a digest of the
> QuantConnect Strategy Library, written so each useful strategy can be
> rebuilt here from scratch without going back to the site. The performance
> figures are QuantConnect's own backtests, quoted as they published them. None
> of them has been through our honest harness. Treat every "MacroFXModel
> adaptation" line as a hypothesis that still needs a pre-registered test
> (see `151_STRATEGIES_PROPOSALS.md` for the screening filters F1–F6).

## 0. Provenance and how this was built

- **Source:** the Strategy Library shown on quantconnect.com (the
  `/strategies` and `/research/<id>/…` tutorial pages) is generated from the public
  repo `github.com/QuantConnect/Tutorials`, folder `04 Strategy Library/`
  (85 entries, last commit Jul 2025). quantconnect.com itself is blocked
  by this environment's network policy, so everything below comes from that repo.
  Most tutorials link their final algorithm as an *embedded backtest iframe*,
  so the full source isn't in the repo. The inline snippets are, and they cover
  the core logic.
- **Code in this file comes in two kinds:**
  - `# QC original (excerpt)`: copied from the tutorial and trimmed. It uses the
    LEAN API (`self.History`, `SetHoldings`, …) and legacy PascalCase names.
  - `# Portable rebuild`: my own pandas/numpy re-implementation. It needs no
    LEAN and works on a `DataFrame` of daily prices (index = dates, columns =
    symbols). Signals are always **lagged one bar** before they touch returns.
    It isn't a line-by-line port; where I changed behaviour (usually to fix
    look-ahead or a bug in the original), the notes say so.
- **Tested:** every `# Portable rebuild` block was smoke-tested on
  synthetic FX data (pandas 3.0, numpy, scipy, statsmodels, scikit-learn,
  PyWavelets). That only shows the code runs. It says nothing about edge.
- **Numbers:** the figures quoted here come from the library tutorial.
  The republished `/research/` pages often show different numbers (see
  `quantconnect_blogs.md` §12).
- **The newer "Strategies" page** (the community strategy showcase that
  replaced Quant League after Q4-2025) could not be reached. Nothing from it
  is in this file. A later session with network access should add it.

---

## 1. Triage: which of the 85 matter to us

Filter used: can it run on **spot FX / XAU / index CFDs** (F1)? Does the data
exist (F2)? Is it in a replicated-edge family (F4: trend/TSMOM, carry, VRP,
FX factors, relative value)? Equity stock-picking factor strategies were
dropped because we don't trade single stocks. They are listed in the appendix.

| Tier | Meaning | Strategies (library #) |
|---|---|---|
| **A: direct FX/macro** | Runs on our universe with data we have | FX Carry (20), FX Momentum (17), MR+Momentum in FX (02), HP-filter FX momentum (08), FX Risk Premia / skew (270), Dynamic Breakout II (04), SVM-Wavelet EURJPY (1031), Time-Series Momentum (118), Two-Centuries Trend (357), TSMOM-CF (356), Gold Market Timing (32) |
| **B: transferable technique** | Different asset, but the mechanism or maths ports over | Asset-class trend/momentum (12, 13, 1025), Momentum + market-state filter (37), Commodity roll-yield / term structure (29, 30), VIX percentile timing (58), VIX futures basis (198), VRP straddle (25), Crude→equity regression (06), Paired switching (33), Distance pairs (40), Two-stage cointegration pairs (07), Copula vs cointegration (03), OU optimal pairs (1029), WTI-Brent spread (100), Dual Thrust (05), Intraday open→close momentum (1026), Short-term reversal w/ volume & OI (71), GBM intraday (1033), Gaussian NB (1036) |
| **C: seasonality (FX flow analogues)** | Calendar effects with an FX month-end / holiday-liquidity analogue | Turn of the month (35), Same-calendar-month seasonality (269), Pre-holiday (83), January barometer (113) |
| **D: not applicable** | Single-stock fundamentals/factors | See appendix |

**Recurring lesson from the library itself:** in QuantConnect's own
replications the paper result almost never survives. Examples: FX MR+Mom
Sharpe 0.8 vs the paper's higher figure, HP-filter FX Sharpe 0.05–0.38,
skew risk-premia −0.7%/yr, intraday ETF momentum Sharpe −0.76 vs positive
in the paper, GBM Sharpe −0.72 vs the paper's ">20", Ichimoku −0.23. That
fits our banked nulls. The survivors cluster in **trend with vol scaling**,
**carry**, and **relative value with a structural anchor**.

---

## 2. Shared portable helpers (used by every rebuild below)

```python
# Portable rebuild — helpers (pandas >= 2.2: resample aliases "ME"/"QE";
# rebalance_dates() takes period aliases "M"/"W-FRI"/"Q")
import numpy as np
import pandas as pd

def to_ccy_vs_usd(px: pd.DataFrame) -> pd.DataFrame:
    """Turn pair quotes into 'currency vs USD' series so that 'up' always
    means the non-USD currency strengthened. USDJPY -> JPY = 1/USDJPY."""
    out = {}
    for c in px.columns:
        if c.startswith("USD"):
            out[c[3:]] = 1.0 / px[c]
        elif c.endswith("USD"):
            out[c[:3]] = px[c]
        else:
            out[c] = px[c]          # crosses / XAU left as-is
    return pd.DataFrame(out)

def rebalance_dates(idx: pd.DatetimeIndex, freq="M") -> pd.DatetimeIndex:
    """Last available trading day of each period (M, W-WED, Q, ...)."""
    s = pd.Series(idx, index=idx)
    return pd.DatetimeIndex(s.groupby(s.index.to_period(freq)).last().values)

def hold_between_rebalances(w_rebal: pd.DataFrame, idx) -> pd.DataFrame:
    """Weights decided on rebalance dates, held (ffill) until the next one."""
    return w_rebal.reindex(idx).ffill().fillna(0.0)

def backtest(weights: pd.DataFrame, px: pd.DataFrame,
             cost_bps: float = 1.0, lag: int = 1,
             carry: pd.DataFrame | None = None) -> pd.Series:
    """Daily P&L of target weights. `lag`=1 means a signal formed on bar t
    trades t->t+1 (no look-ahead). `carry` (optional) = daily carry accrual
    per asset in return units (e.g. rate differential / 252)."""
    r = px.pct_change()
    w = weights.reindex(r.index).ffill().shift(lag).fillna(0.0)
    pnl = (w * r).sum(axis=1)
    if carry is not None:
        pnl += (w * carry.reindex(r.index).ffill().fillna(0.0)).sum(axis=1)
    pnl -= w.diff().abs().sum(axis=1) * cost_bps / 1e4
    return pnl.fillna(0.0)

def stats(pnl: pd.Series, ppy: int = 252) -> dict:
    eq = (1 + pnl).cumprod()
    dd = eq / eq.cummax() - 1
    ann = pnl.mean() * ppy
    vol = pnl.std() * np.sqrt(ppy)
    return dict(ann_ret=ann, ann_vol=vol,
                sharpe=ann / vol if vol > 0 else np.nan,
                max_dd=dd.min(), n_days=len(pnl))
```

---

## 3. Tier A: direct FX / macro strategies

### 3.1 Forex Carry Trade (#20)

**Idea.** Borrow the low-yielder and buy the high-yielder to capture the rate
spread. This is one of the four replicated FX factors.

**Rules as published.**
- Universe: 9 currencies that have central-bank policy-rate data (Quandl).
- Monthly, on the first trading day, rank by policy rate.
- **Long the highest-rate currency, short the lowest.** One pair each side,
  equal weight.
- Rates arrive as custom data with `fillDataForward=True`, because rates only
  change at meetings.

**Reported result.** No number is given in the text; the backtest is only in the iframe.

**Rebuild narrative.**
1. Build a `rates` DataFrame with one column per currency (policy rate, %),
   forward-filled daily. **Lag it by the publication delay.** A decision rate
   is known on the meeting day, but a FRED series may be revised or posted late.
2. Convert pairs to currency-vs-USD with `to_ccy_vs_usd`. The USD leg is then
   implicit, and "long AUD" = long AUDUSD.
3. On each month-end, compute the differential vs USD, `rates[c] - rates['USD']`.
   Go long the top *k*, short the bottom *k*. Classic Quantpedia uses k=1;
   k=3 of G10 is the more robust academic version.
4. **Add the carry accrual.** A spot-only backtest shows only the FX leg and
   leaves out the interest you earn, which is the whole premium. Pass
   `carry = diff/100/252` to `backtest`.
5. Size by inverse vol if you want. Carry crashes cluster in risk-off (see the
   VIX filter in §4.4).

```python
# Portable rebuild — FX carry (k long / k short, monthly)
def fx_carry_weights(px_ccy: pd.DataFrame, rates: pd.DataFrame, k: int = 1,
                     rate_lag_days: int = 1) -> tuple[pd.DataFrame, pd.DataFrame]:
    r = rates.reindex(px_ccy.index).ffill().shift(rate_lag_days)
    diff = r[px_ccy.columns].sub(r["USD"], axis=0)          # vs USD
    w_reb = {}
    for d in rebalance_dates(px_ccy.index, "M"):
        row = diff.loc[d].dropna().sort_values()
        if len(row) < 2 * k:
            continue
        w = pd.Series(0.0, index=px_ccy.columns)
        w[row.index[-k:]] = 0.5 / k                         # high-yielders
        w[row.index[:k]] = -0.5 / k                         # low-yielders
        w_reb[d] = w
    w = hold_between_rebalances(pd.DataFrame(w_reb).T, px_ccy.index)
    carry = diff / 100 / 252
    return w, carry

# w, carry = fx_carry_weights(to_ccy_vs_usd(px), rates, k=3)
# print(stats(backtest(w, to_ccy_vs_usd(px), cost_bps=1.5, carry=carry)))
```

**MacroFXModel adaptation.** We already have policy-rate matrices
(`rate-matrix.html`, `rates.html`) and `system-fx-carry*.html`. The QC
version adds nothing new. Two points still matter: the explicit carry accrual
in the P&L, and the dependency on k=1 (a single pair is idiosyncratic noise).
Benchmark our system against k=3.

---

### 3.2 Forex Momentum (#17)

**Rules.** Universe of 15 pairs, 2006–2018. Monthly: **long the 3 currencies
with the strongest 12-month return vs USD, short the 3 weakest**, equal
weight. This is cross-sectional (relative) momentum.

```python
# Portable rebuild — cross-sectional FX momentum (12-1 optional skip)
def xs_momentum_weights(px_ccy, lookback=252, skip=0, n=3, freq="M"):
    mom = px_ccy.shift(skip) / px_ccy.shift(lookback) - 1
    w_reb = {}
    for d in rebalance_dates(px_ccy.index, freq):
        row = mom.loc[d].dropna().sort_values()
        if len(row) < 2 * n:
            continue
        w = pd.Series(0.0, index=px_ccy.columns)
        w[row.index[-n:]] = 0.5 / n
        w[row.index[:n]] = -0.5 / n
        w_reb[d] = w
    return hold_between_rebalances(pd.DataFrame(w_reb).T, px_ccy.index)
```

**Notes.** The library gives no result. Academic FX momentum (Menkhoff et al.
2012) is strongest at 1–3 month lookbacks in *less liquid* currencies and
weak in G10 majors. Test lookbacks {21, 63, 126, 252}, and test a 1-month
skip to avoid short-term reversal.

---

### 3.3 Combining Mean Reversion and Momentum in FX (#02)

**Paper.** Serban (2010), building on Balvers & Wu. UIP says FX should mean-revert,
but in practice FX shows *short-term momentum and long-term mean reversion*
(Chiang & Jiang 1995).

**Model.** For each currency *i*, with monthly (log) price *x*:

`y_t = −(1−δ)·(x_{t−1} − μ_i)/σ_i  +  ρ·(x_{t−1} − x_{t−4})  + ε`

- `μ_i`, `σ_i` are the currency's own mean and std of price. **QC's change:**
  they standardise by σ because the raw deviation scale differs so much across
  pairs that it wrecked the ranking.
- δ and ρ are shared across currencies (pooled OLS). J=3 lags gave the
  highest return in the paper.
- Target = the next month's change.

**Trading rule.** Monthly: predict `y` for each pair, **long the highest
predicted, short the lowest**. If all predictions are positive, go long only
(best one). If all are negative, go short only (worst one). Pairs: EURUSD,
GBPUSD, USDCAD, USDJPY (Oanda daily).

**Reported.** OLS on Jun-2013→Jun-2016: R² 1.4% (paper 3.89%). Momentum
coefficient ρ=0.0633 (paper 0.042). Reversal t-stat −4.07 (highly
significant), momentum t-stat 1.42. The backtest gave **~11% annual, Sharpe
0.8, 11% max DD**. Robustness over 2015–2018 is only shown as an image table.

**Look-ahead caveat in the original.** `calculate_return` computes `mean`
and `sd` over the **whole** history window and then uses them for every row
of the regression. The model is also fitted once at `Initialize` and never
refitted. The rebuild below uses expanding moments and a rolling refit. It
also removes the ±3σ outlier filter, which in the original was applied
across the pooled data with future knowledge.

```python
# QC original (excerpt) — factor construction and regression
df = df.resample('BM').last()
df['log_return'] = df.price - df.price.shift(1)
df['reversal']   = (df.price.shift(1) - mean) / sd      # mean/sd: full sample!
df['mom']        = df.price.shift(1) - df.price.shift(4)
res = sm.ols(formula='log_return ~ reversal + mom', data=df).fit()
```

```python
# Portable rebuild — no look-ahead, refit every month on an expanding window
import statsmodels.api as sm

def serban_features(px_ccy):
    m = np.log(px_ccy.resample("ME").last())
    mu = m.expanding(min_periods=24).mean().shift(1)
    sd = m.expanding(min_periods=24).std().shift(1)
    feats = {}
    for c in m.columns:
        f = pd.DataFrame({
            "ret": m[c].diff(),                          # target: x_t - x_{t-1}
            "rev": (m[c].shift(1) - mu[c]) / sd[c],      # standardised deviation
            "mom": m[c].shift(1) - m[c].shift(4),        # 3-month momentum
        })
        f["ccy"] = c
        feats[c] = f
    return pd.concat(feats.values()).dropna()

def serban_weights(px_ccy, min_train_months=36):
    F = serban_features(px_ccy)
    months = sorted(F.index.unique())
    w = {}
    for t in months[min_train_months:]:
        train = F[F.index < t]
        X = sm.add_constant(train[["rev", "mom"]]); y = train["ret"]
        beta = sm.OLS(y, X).fit().params
        now = F[F.index == t]                   # features known at start of month t
        pred = beta["const"] + beta["rev"] * now["rev"] + beta["mom"] * now["mom"]
        pred.index = now["ccy"]
        s = pd.Series(0.0, index=px_ccy.columns)
        hi, lo = pred.idxmax(), pred.idxmin()
        if pred.max() > 0 > pred.min():  s[hi], s[lo] = 0.5, -0.5
        elif pred.min() > 0:             s[hi] = 1.0
        else:                            s[lo] = -1.0
        w[t] = s
    W = pd.DataFrame(w).T
    # month label t -> apply over month t (use the prior month-end to enter)
    W.index = W.index - pd.offsets.MonthEnd(1)
    return hold_between_rebalances(W, px_ccy.index)
```

**MacroFXModel adaptation.** Standardised deviation from a long-run mean
combined with 3-month momentum is a clean two-factor FX model. It maps
directly onto our PPP/value and momentum factors. Extend it to the 13 pairs,
let ρ vary by lag (they left that in commented-out code), and compare with
our `residual-reversion` results.

---

### 3.4 Momentum on the Low-Frequency Component of FX (HP filter) (#08)

**Paper.** Harris & Yilmaz (2009). Extract the trend with a Hodrick–Prescott
filter, then apply an MA(1,2) rule *to the trend*, not to the price.

**Details.**
- HP filter: `min Σ(y−x)² + λ Σ(Δ²x)²`, solved with a sparse system
  `(I + λKᵀK)·x = y`.
- λ: the Ravn–Uhlig rule gives an absurd value for daily data (1600·120⁴,
  which is basically a straight line). By eye they chose **λ = 100**, noting
  the curve barely changes below 100.
- Rolling window: 5 years (`numdays = 360*5`) of daily closes, refit each
  day. Only the last point of the filtered trend is used.
- MA(1,2) on the trend is the sign of the trend's one-day slope. Enter **long
  when the slope turns positive, short when it turns negative** (a crossing,
  full size ±1).

**Reported (Jan-2011→May-2017).**

| Pair | Sharpe | Ann. ret | MaxDD | Trades |
|---|---|---|---|---|
| USDCAD | 0.361 | 3.1% | 10.3% | 14 |
| EURUSD | 0.375 | 3.3% | 8.3% | 11 |
| USDCHF | 0.131 | 1.2% | 24.8% | 12 |
| EURGBP | 0.337 | 2.7% | 17.6% | 11 |
| CADUSD | 0.052 | 0.0% | 22.5% | 6 |
| USDNOK | 0.054 | 0.1% | 30.3% | 16 |
| USDZAR | 0.195 | 2.2% | 23.0% | 9 |

The authors conclude it is "not robust" and "sensitive to lag parameters in a
non-monotonic way". The key insight is the **HP end-point problem**: each new
bar changes the past trend, so the last point of a two-sided filter is
unreliable. That is exactly what we found with other two-sided smoothers.

```python
# Portable rebuild — one-sided (recursive) HP trend slope signal
from scipy import sparse
from scipy.sparse.linalg import spsolve

def hp_trend(y: np.ndarray, lamb: float = 100.0) -> np.ndarray:
    n = len(y)
    K = sparse.diags([1.0, -2.0, 1.0], [0, 1, 2], shape=(n - 2, n))
    return spsolve((sparse.eye(n) + lamb * K.T @ K).tocsc(), y)

def hp_momentum_signal(close: pd.Series, window=1800, lamb=100.0) -> pd.Series:
    slope = pd.Series(np.nan, index=close.index)
    v = close.values.astype(float)
    for t in range(window, len(v)):
        tr = hp_trend(v[t - window:t + 1], lamb)        # uses data up to t only
        slope.iloc[t] = tr[-1] - tr[-2]
    return np.sign(slope).replace(0, np.nan).ffill()    # always-in ±1
```

**Adaptation.** Low priority. Its value is as a *diagnostic*: it shows how
much of a smoother's apparent edge comes from end-point revision. Use a
one-sided filter (Kalman / L1-trend) if we want this family.

---

### 3.5 Risk Premia in Forex: skewness signal (#270)

**Paper.** Lempérière, Deremble, Nguyen, Seager, Potters, Bouchaud: *"Risk
Premia: Asymmetric Tail Risks and Excess Returns"*. A strategy's Sharpe is
roughly linear in its **negative skewness**: you get paid for bearing crash risk.

**Rules as published.** EURUSD, AUDUSD, USDCAD, USDJPY (hourly data, daily
history for the signal). Compute skewness over `lookback` days (the value
isn't shown in the text). **Long if skew < −0.6, short if skew > +0.6.**
Rebalance weekly, equal weight, drop anything no longer selected.

**Reported.** **≈ −0.7% per year over a decade.** They blame a universe
that's too small, thresholds, and lookback length.

**Bug worth knowing.** `GetSkewness` is applied to *close prices*, not
returns, so it measures the shape of the price level distribution, not the
return distribution. The paper's signal is about *return* skew. Rebuild it on
log returns before calling the idea dead.

```python
# Portable rebuild — skew-premium on returns
def skew_premium_weights(px, lookback=126, lo=-0.6, hi=0.6, freq="W-FRI"):
    r = np.log(px).diff()
    sk = r.rolling(lookback).skew()
    w_reb = {}
    for d in rebalance_dates(px.index, freq):
        s = sk.loc[d]
        longs, shorts = s[s < lo].index, s[s > hi].index
        n = len(longs) + len(shorts)
        w = pd.Series(0.0, index=px.columns)
        if n:
            w[longs] = 1.0 / n
            w[shorts] = -1.0 / n
        w_reb[d] = w
    return hold_between_rebalances(pd.DataFrame(w_reb).T, px.index)
```

**Adaptation.** Rather than trading skew directly, use the *same paper's*
framing as a portfolio lens: carry is negatively skewed (a paid risk
premium), trend is positively skewed (not a premium, an anomaly). Blending
the two is the standard way to cut crash risk. See the blog notes on
"Combined Carry and Trend".

---

### 3.6 Dynamic Breakout II (#04)

**Source.** George Pruitt, *Building Winning Trading Systems* (1996, v2).
An adaptive channel breakout whose lookback expands and contracts with volatility.

**Rules.**
1. Start with lookback N=20. At each day's end, `vol_today = std(close[−30:])`
   and `vol_yday = std(close[−31:−1])`.
   `N ← round(N · (1 + (vol_today − vol_yday)/vol_today))`, clamped to **[20, 60]**.
2. Bollinger Band over N (EMA basis, **k = 2**).
3. **Long setup:** yesterday's close > upper BB **and** current ask > highest
   high of the last N days. **Short setup:** mirror image with the lower BB
   and lowest low.
4. **Exit:** long exits when price < SMA(close, N). Short exits when price > SMA(close, N).
   The exit MA length moves with N.

**Reported.** EURUSD 6y: ~2.3%/yr, Sharpe 0.31, maxDD ~14% (May–Dec 2015).
GBPUSD: negative return, ~19% DD. "Works best in a trending market."

```python
# Portable rebuild — Dynamic Breakout II (daily OHLC DataFrame with open/high/low/close)
def dynamic_breakout_ii(ohlc: pd.DataFrame, n0=20, n_min=20, n_max=60, k=2.0):
    c, h, l = ohlc["close"], ohlc["high"], ohlc["low"]
    pos = pd.Series(0.0, index=ohlc.index)
    N, p = n0, 0.0
    for t in range(61, len(ohlc)):
        v_t = c.iloc[t - 30:t].std(); v_y = c.iloc[t - 31:t - 1].std()
        N = int(np.clip(round(N * (1 + (v_t - v_y) / v_t)), n_min, n_max))
        win = c.iloc[t - N:t]
        ema = win.ewm(span=N, adjust=False).mean().iloc[-1]
        up, dn = ema + k * win.std(), ema - k * win.std()
        hh, ll = h.iloc[t - N:t].max(), l.iloc[t - N:t].min()
        sma = win.mean(); px_now = c.iloc[t]  # proxy for 'ask' at decision time
        if p > 0 and px_now < sma: p = 0.0
        if p < 0 and px_now > sma: p = 0.0
        if p == 0:
            if c.iloc[t - 1] > up and px_now > hh: p = 1.0
            elif c.iloc[t - 1] < dn and px_now < ll: p = -1.0
        pos.iloc[t] = p
    return pos      # feed as weights with lag=1 (or lag=0 if you model intrabar fills)
```

**Adaptation.** This is in the Donchian/Turtle family, which is a **banked
null** for us (F3). The one idea worth keeping is the *vol-adaptive lookback*
(N grows when vol rises, which filters false breaks). It could be a knob on
`trendBasketEngine`, but don't build a standalone system from it.

---

### 3.7 SVM-Wavelet forecasting on EURJPY (#1031)

**Paper.** Raimundo & Okamoto (2018), SVR-wavelet adaptive model.

**Pipeline.**
1. Take the last **152** daily closes. For `sym10` (filter length 20), three
   levels need `len ≥ 20·2³ − 8 ≈ 152`.
2. `coeffs = pywt.wavedec(data, 'sym10')`.
3. For each detail component (not the approximation), soft/hard threshold at
   `0.5 · max(component)`.
4. For **each** component, fit an SVR on its own lagged windows, forecast one
   step, roll the component left and append the forecast.
5. `pywt.waverec(coeffs)[-1]` is the one-step-ahead price forecast.
   `pct = forecast / close − 1`.
6. Emit an insight in the direction of `pct` with **weight = |pct|**
   (InsightWeighting PCM, so bigger forecast moves get bigger allocations).

**Reported.** 5-year Sharpe **0.252** (SPY 0.713 same period).

```python
# Portable rebuild — SVM-wavelet one-step forecast (SVR window is my choice;
# the tutorial hides it in SVMWavelet.py)
import pywt
from sklearn.svm import SVR

def _svr_next(x: np.ndarray, win: int = 10) -> float:
    X = np.array([x[i:i + win] for i in range(len(x) - win)])
    y = x[win:]
    m = SVR(kernel="rbf", C=1.0, epsilon=1e-4).fit(X, y)
    return float(m.predict(x[-win:].reshape(1, -1))[0])

def svm_wavelet_forecast(close_window: np.ndarray, thr=0.5, wave="sym10") -> float:
    w = pywt.Wavelet(wave)
    coeffs = pywt.wavedec(np.array(close_window, dtype=float), w)   # writable copy
    for i in range(len(coeffs)):
        if i > 0:
            coeffs[i] = pywt.threshold(coeffs[i], thr * np.max(np.abs(coeffs[i])))
        f = _svr_next(coeffs[i]) if len(coeffs[i]) > 12 else coeffs[i][-1]
        coeffs[i] = np.roll(coeffs[i], -1); coeffs[i][-1] = f
    return float(pywt.waverec(coeffs, w)[-1])

def svm_wavelet_weights(close: pd.Series, n=152):
    w = pd.Series(0.0, index=close.index)
    for t in range(n, len(close)):
        fc = svm_wavelet_forecast(close.values[t - n:t + 1])
        pct = fc / close.iloc[t] - 1
        w.iloc[t] = np.sign(pct) * min(abs(pct) * 100, 1.0)   # scale to [-1,1]
    return w
```

**Caveat.** Wavelet decomposition over a sliding window is causal only when
the whole transform is recomputed each bar, as done here. The *published*
wavelet-SVR accuracy figures often come from decomposing the full series
once, which is look-ahead. Low prior; include it only as an ML benchmark.

---

### 3.8 Time-Series Momentum (#118)

**Paper.** Moskowitz, Ooi & Pedersen (2012), via Quantpedia.

**Rules.** Liquid commodity futures (continuous, Quandl). Monthly: **sign of
the 12-month return (ROC 252)**. Weight ∝ **1/σ** (std of the last 252 daily
returns), normalised so Σ(1/σ)=1, then **× 0.5** gross.

```python
# QC original (excerpt)
vol_inv = 1 / history.std(ddof=1)
weights = (vol_inv / vol_inv.sum()).fillna(0).to_dict()
for symbol, roc in self.roc.items():
    self.SetHoldings(symbol, np.sign(roc.Current.Value) * weights[symbol] * .5)
```

```python
# Portable rebuild — TSMOM with inverse-vol (or vol-target) sizing
def tsmom_weights(px, lookback=252, vol_win=252, gross=0.5, freq="M",
                  target_vol=None):
    r = px.pct_change()
    sig = np.sign(px / px.shift(lookback) - 1)
    vol = r.rolling(vol_win).std() * np.sqrt(252)
    w_reb = {}
    for d in rebalance_dates(px.index, freq):
        s, v = sig.loc[d], vol.loc[d]
        if target_vol:                           # MOP-style: each asset at target vol
            w = s * (target_vol / v) / s.notna().sum()
        else:                                    # QC-style: inverse-vol normalised
            iv = 1 / v; w = s * iv / iv.sum() * gross
        w_reb[d] = w.fillna(0)
    return hold_between_rebalances(pd.DataFrame(w_reb).T, px.index)
```

**Adaptation.** This is the core replicated family (F4). Run it on the
13 FX pairs + XAU + index CFDs at 1/3/12-month lookbacks. Blend the lookbacks
rather than picking one.

---

### 3.9 Two Centuries of Trend Following (#357)

**Paper.** Lempérière, Deremble, Seager, Potters, Bouchaud (2014). Trend is
significant across 200 years and 4 asset classes (commodities, FX, indices, bonds).

**Signal (monthly):** `s_n(t) = (p(t−1) − EMA_n(p)(t−1)) / σ_n(t−1)`, where
σ_n = EMA of **|monthly price change|**, and **n = 5 months** for both EMAs.
Position = `sign(s) / σ_n` (contracts, i.e. risk-parity-like).

**Universe.** 7 commodities (CL, NG, corn, wheat, sugar, live cattle, copper),
leverage 3, Jan-1998→Sep-2019. **Sharpe 0.266 vs SPY 0.459.**

**Bug in the QC code.** `self.vol = IndicatorExtensions.EMA(self.mom, 5)`
smooths the *signed* 1-month momentum, not its absolute value. That makes
σ close to zero or negative in chop, which blows up the size. The paper uses
|Δp|. The rebuild fixes it.

```python
# Portable rebuild — Lempérière trend, monthly
def lemperiere_trend(px, n_months=5, freq="ME"):
    m = px.resample(freq).last()
    ema = m.ewm(span=n_months, adjust=False).mean()
    sig_vol = m.diff().abs().ewm(span=n_months, adjust=False).mean()
    s = (m - ema) / sig_vol                                # the signal
    raw = np.sign(s) / (sig_vol / m)                       # 1/σ in % terms
    w = raw.div(raw.abs().sum(axis=1), axis=0)             # normalise gross to 1
    return hold_between_rebalances(w, px.index)
```

**Adaptation.** The signal `(p − EMA)/σ` is a *continuous* trend strength
and makes a clean building block for `trendBasketEngine`. The paper's FX results are
the relevant ones; we can reproduce them on our 13 pairs.

---

### 3.10 TSMOM-CF: improved time-series momentum (#356)

**Paper.** Baltas & Kosowski (2017), *Demystifying Time-Series Momentum*.
It fixes three weaknesses of plain TSMOM:

1. **Signal:** replace the ±1 sign with the **t-stat of 12-month daily log
   returns, clipped to [−1, 1]** (TREND rule). This cuts turnover.
2. **Volatility:** replace close-to-close std with **Yang–Zhang** (range-based,
   more efficient, less turnover), over **21 days**.
3. **Correlation factor:** scale overall leverage by
   `CF = sqrt(N / (1 + (N−1)·ρ̄))`, where ρ̄ = average *signed* pairwise
   correlation (Σᵢ<ⱼ XᵢXⱼρᵢⱼ · 2/(N(N−1))) over the last **3 months**.
   When all positions are the same crowded trade, you de-lever.

**Weight:** `wᵢ = Xᵢ · σ_target · CF / (N · σᵢ)`, with **σ_target = 12%**,
rebalanced monthly.

**Reported.** Jan-2018→Sep-2019 (post-GFC regime): **TSMOM-CF Sharpe 0.321 vs
plain TSMOM −0.746** (SPY 0.46).

**Bug in the QC code.** `sigma_RS = mean(sqrt(RS_daily))` takes the mean of
square roots. It should be `sqrt(mean(RS_daily))`. Also, "open_to_close" in
their comments is actually close→open (the overnight jump), which is correct
for σ_OJ.

```python
# Portable rebuild — TSMOM-CF (Baltas & Kosowski)
def yang_zhang_vol(o, h, l, c, n=21) -> float:
    o, h, l, c = [x.iloc[-n:] for x in (o, h, l, c)]
    oj = np.log(o / c.shift(1)).dropna()                   # overnight jump
    cc = np.log(c / c.shift(1)).dropna()
    rs = (np.log(h / o) * (np.log(h / o) - np.log(c / o)) +
          np.log(l / o) * (np.log(l / o) - np.log(c / o)))
    k = 0.34 / (1.34 + (n + 1) / (n - 1))
    var = oj.var() + k * cc.var() + (1 - k) * rs.mean()
    return float(np.sqrt(var * 252))

def tsmom_cf_weights(ohlc: dict[str, pd.DataFrame], target=0.12, freq="M"):
    close = pd.DataFrame({s: d["close"] for s, d in ohlc.items()})
    logr = np.log(close).diff()
    w_reb = {}
    for d in rebalance_dates(close.index, freq):
        hist = logr.loc[:d].iloc[-252:]
        if len(hist) < 200:
            continue
        t = hist.mean() / (hist.std() / np.sqrt(hist.count()))
        X = t.clip(-1, 1)
        vol = pd.Series({s: yang_zhang_vol(*(ohlc[s].loc[:d][k]
                         for k in ("open", "high", "low", "close"))) for s in X.index})
        C = close.pct_change().loc[:d].iloc[-63:].corr()
        N = len(X)
        num = sum(X.iloc[i] * X.iloc[j] * C.iloc[i, j]
                  for i in range(N) for j in range(i + 1, N))
        rho_bar = 2 * num / (N * (N - 1))
        CF = np.sqrt(N / (1 + (N - 1) * rho_bar))
        w_reb[d] = X * target * CF / (N * vol)
    return hold_between_rebalances(pd.DataFrame(w_reb).T, close.index)
```

**Adaptation (high value).** All three fixes are *bricks* we can reuse:
- The t-stat signal is a direct upgrade to any sign-based trend rule.
- We already compute range-based vol. YZ is the right estimator for FX
  (it handles the weekend gap as an overnight jump).
- The correlation factor is the cleanest de-crowding rule we've seen. FX
  trends are highly correlated through USD, so ρ̄ will be large exactly when
  "everything is a dollar trade". Pre-register: TSMOM-CF vs TSMOM on 13 pairs,
  monthly, 12% target, OOS from 2015.

---

### 3.11 Gold Market Timing: the "Fed model" (#32)

**Idea.** If the S&P 500 earnings yield (E/P) is well above the 10-year yield,
equities are "cheap" relative to bonds. The tutorial says gold rises with
earnings yield, bond yield and inflation, and uses this state as a gold
timing signal.

**Rules.** Monthly: **long gold (90%) if E/P > 2 × UST10Y yield, else flat.**
Data: `YC/USA10Y`, `MULTPL/SP500_EARNINGS_YIELD_MONTH`, `WGC/GOLD_DAILY_USD`
(all Quandl, forward-filled).

```python
# Portable rebuild — Fed-model gold timing
def fed_model_gold(gold: pd.Series, ey: pd.Series, y10: pd.Series,
                   ratio=2.0, freq="M", pub_lag_days=5):
    ey = ey.reindex(gold.index).ffill().shift(pub_lag_days)
    y10 = y10.reindex(gold.index).ffill().shift(1)
    on = (ey > ratio * y10).astype(float) * 0.9
    reb = rebalance_dates(gold.index, freq)
    return on.where(on.index.isin(reb)).ffill().fillna(0).to_frame(gold.name)
```

**Caveat.** The economic story is weak and the threshold (2×) is arbitrary.
In the 2010s E/P was far above the 10y yield almost all the time, so the rule
≈ buy-and-hold gold. There is no reported number. Our `system-gold-macro` / real-yield work
(`real-yield.html`) is a better-founded gold model. Keep this only as a naive benchmark.

---

## 4. Tier B: transferable techniques

### 4.1 Asset-class trend following, momentum rotation, leveraged-ETF 200-SMA (#12, #13, #1025)

- **#12 Trend following (Faber):** 5 ETFs (stocks, bonds, commodities,
  REITs, …). Monthly: hold an asset (equal weight) **if close > 10-month SMA**,
  else cash. Warm-up 10 months.
- **#13 Momentum rotation:** the same 5 ETFs. Monthly: **hold the top 3 by
  12-month momentum**, equal weight.
- **#1025 Leveraged ETFs with risk management (Gayed & Bilello 2016):** hold
  **SSO (2× S&P) while SSO > 200-day SMA**, otherwise rotate into **SHY**
  (1–3y Treasuries). 5-year Sharpe **0.732 vs SPY 0.572**. They picked 200
  days rather than 50 to cut trades and slippage.

```python
# Portable rebuild — SMA regime gate + top-k rotation
def sma_gate(px, months=10):
    m = px.resample("ME").last()
    on = (m > m.rolling(months).mean()).astype(float)
    w = on.div(on.sum(axis=1).replace(0, np.nan), axis=0).fillna(0)
    return hold_between_rebalances(w, px.index)

def topk_rotation(px, k=3, lookback_m=12):
    m = px.resample("ME").last()
    mom = m / m.shift(lookback_m) - 1
    rank = mom.rank(axis=1, ascending=False)
    w = (rank <= k).astype(float) / k
    return hold_between_rebalances(w, px.index)

def lev_etf_switch(risk: pd.Series, safe: pd.Series, n=200):
    on = (risk > risk.rolling(n).mean()).astype(float)
    return pd.DataFrame({risk.name: on, safe.name: 1 - on})
```

**Adaptation.** For index CFDs: an NQ/SPX **200-day SMA gate** as a regime
filter on long-only index exposure is the simplest tested risk overlay. Use it
as the *baseline* that any fancier index regime model must beat.

---

### 4.2 Momentum + state-of-market filter (#37)

**Paper.** Cooper, Gutierrez & Hameed (2004), *Market States and Momentum*.

**Rules.** Market state = **12-month return of the Wilshire 5000** (ROC 252).
- State **UP** (>0): long the top 20 stocks by 6-month momentum, short the
  bottom 20, equal weight, 50/50.
- State **DOWN**: liquidate and hold **TLT** 100%.
- Rebalance monthly.

**Transferable idea.** Momentum crashes after *down* markets, at the rebound.
This regime switch (trade momentum only when the broad market's 12-month
return is positive) is a cheap momentum-crash filter.

**Adaptation.** Gate FX cross-sectional momentum (§3.2) and carry by
`sign(SPX 12m return)` or by a risk-appetite composite. Pre-register the rule
before looking.

---

### 4.3 Commodity term structure / roll yield (#29) and combined with momentum (#30)

**Roll return (annualised):**
`R = (ln P_near − ln P_far) · 365 / (T_far − T_near)`.
R>0 means backwardation, R<0 means contango.

- **#29:** monthly, **long the top 20% by roll return (backwardation), short
  the bottom 20% (contango)**, 0.5/count per leg, hold one month. Trade the
  *second* contract in the chain.
- **#30 (Fuertes, Miffre & Rallis 2010):** 22 commodities. Split into tertiles
  by roll return and discard the middle. Within High, keep the **better half by
  past-1-month mean return** (High-Winners). Within Low, keep the **worse half**
  (Low-Losers). **Long High-Winners, short Low-Losers**, 50/50, monthly.

```python
# QC original (excerpt) — roll return
expire_range = 365 / (distant_contract.Expiry - near_contract.Expiry).days
roll_returns[symbol] = (np.log(price_near) - np.log(price_distant)) * expire_range
```

```python
# Portable rebuild — double sort (carry tertile × momentum half)
def double_sort(carry: pd.DataFrame, mom: pd.DataFrame, freq="M"):
    w_reb = {}
    for d in rebalance_dates(carry.index, freq):
        c, m = carry.loc[d].dropna(), mom.loc[d].dropna()
        c = c[c.index.isin(m.index)].sort_values()
        t = len(c) // 3
        if t < 2:
            continue
        hi, lo = c.index[-t:], c.index[:t]
        hw = m[hi].sort_values().index[-(t // 2):]    # high carry, winners
        ll = m[lo].sort_values().index[:(t // 2)]     # low carry, losers
        w = pd.Series(0.0, index=carry.columns)
        w[hw] = 0.5 / len(hw); w[ll] = -0.5 / len(ll)
        w_reb[d] = w
    return hold_between_rebalances(pd.DataFrame(w_reb).T, carry.index)
```

**FX bridge (important).** In FX, the futures/forward "roll yield" **is** the
interest-rate differential (covered interest parity: `ln F − ln S ≈ (i_d − i_f)·τ`).
So #29 is FX carry and #30 is **carry × momentum double-sort**, a known
improvement over pure carry because it avoids buying high-yielders that are
already crashing. Directly testable with our `rates` + price data.

---

### 4.4 VIX percentile → equity timing (#58)

**Rules.** Keep a 2-year rolling window of VIX closes (252·2).
**If VIX > 90th percentile, long OEF (S&P 100) 100%. If VIX < 10th percentile,
short 100%.** Otherwise keep the current position (the code has no explicit
exit). 2006→2018.

```python
def vix_percentile_signal(vix: pd.Series, win=504, hi=90, lo=10) -> pd.Series:
    p_hi = vix.rolling(win).quantile(hi / 100)
    p_lo = vix.rolling(win).quantile(lo / 100)
    s = pd.Series(np.nan, index=vix.index)
    s[vix > p_hi] = 1.0; s[vix < p_lo] = -1.0
    return s.ffill().fillna(0)
```

**Adaptation.** The rolling-percentile regime is useful as a **risk-off
state variable** for FX: VIX in its top decile means carry crash risk and
JPY/CHF bid. Use the percentile rank (not raw level) as a conditioner.
Our `volatility-intelligence` / regime work already has hooks for this.

---

### 4.5 Exploiting the term structure of VIX futures (#198)

**Paper.** Simon & Campasano (2014), via Quantpedia.

**Signal.** `daily_roll = (VX1 − VIX) / days_to_expiry`.
- **Short VX** (−0.5) when `daily_roll > 0.10` (contango), and **short ES**
  as a hedge (−0.5 × HR).
- **Long VX** (+0.5) when `daily_roll < −0.10` (backwardation), long ES × HR.
- **Exit:** short when roll < 0.05, long when roll > −0.05, or 2 days before expiry.
- Contract choice: nearest with ≥10 days to maturity.

**Hedge ratio.** Regress `ΔVX = β0 + β1·ESret + β2·(ESret × TTS) + ε` over
252 days, then `HR = (1000·β1 + 1000·β2·TTS) / (0.01 · 50 · P_ES)`.
The 1000 and 50 are the VX and ES contract multipliers.

**Transferable.** The structure *roll per day to expiry, with entry/exit
thresholds and hysteresis, plus a regression hedge whose beta depends on
time-to-maturity* is a clean template. Its FX analogue is forward points
per day (carry) with a beta-hedge to the dollar index.

---

### 4.6 Volatility risk premium: short straddle with tail hedge (#25)

**Rules.** Monthly, on S&P options (weeklies included, strikes ±20, expiry
25–35 days): **sell the ~30-day ATM straddle and buy the ~15% OTM put** as a
crash hedge. Hold to expiry, let exercise/assignment happen, repeat.

```python
# QC original (excerpt) — contract selection
expiry     = min(expiries, key=lambda x: abs((x.date() - self.Time.date()).days - 30))
strike     = min(strikes,  key=lambda x: abs(x - underlying_price))
otm_strike = min(strikes,  key=lambda x: abs(x - 0.85 * underlying_price))
```

**Adaptation.** We can't trade options (F1). The *measurement* still
transfers: implied vs realised vol spread as a state variable. It's positive
most of the time and flips before stress. Existing brick: `vix-vol-carry`.

---

### 4.7 Can crude oil predict equity returns? (#06)

**Paper.** Driesprong, Jacobsen & Maat (2007), *Striking Oil: Another Puzzle?*

**Rules.** Monthly: regress SPY's monthly return on the **lagged** monthly
oil return (S&P GSCI crude TR ETN) over **24 months** (21-day steps).
Predict next month. If `pred > T-bill/12`, go 100% SPY, else cash.

**Reported.** 2010–2017 Sharpe **0.72 vs 0.60** benchmark, but only **9
trades**, and in most months the slope's **p-value was not significant**. The
authors conclude that the decisions were "almost meaningless" and the result
came from the bull market.

**Lesson (keep this).** Test the *significance of the fitted relationship at
each decision date*, not just the P&L. A lead-lag rule that is mostly long in
a bull market is just beta. Our `nasdaq-macro-lead` and `credit-leadlag` work
should report the rolling-regression t-stat alongside the equity curve.

---

### 4.8 Paired switching (#33)

**Rules.** Pick two negatively correlated assets (e.g. equity vs bond ETF).
**Each quarter, hold 100% of whichever had the higher return over the prior
quarter.**

```python
def paired_switch(a: pd.Series, b: pd.Series, freq="QE"):
    q_a, q_b = a.resample(freq).last(), b.resample(freq).last()
    pick_a = (q_a.pct_change() > q_b.pct_change()).astype(float)
    w = pd.DataFrame({a.name: pick_a, b.name: 1 - pick_a})
    return hold_between_rebalances(w, a.index)
```

**Adaptation.** Gold vs NQ, or JPY vs AUD (a risk-on/off pair): relative
momentum between two anti-correlated legs. It's a two-asset special case of §4.1.

---

### 4.9 Pairs trading: distance method on country ETFs (#40)

**Paper.** Panagiotis, Dimitrios & Tao, *Pairs Trading on International ETFs*.

**Rules.**
- Universe: 25 country ETFs. **Formation: 120 days.** Build normalised
  cumulative indices `Rᵗ = Π(1+r)`.
- Distance `D(a,b) = mean |R_a − R_b|` over the formation window. Pick the
  **5 pairs with the smallest D**.
- Trade for the next **20 days (1 month)**. **If R_a − R_b > 0.5·D, short A /
  long B** (dollar-neutral), and the mirror image. **Exit when |R_a − R_b| < 0.5·D.**
- Re-select pairs each month.

```python
# Portable rebuild — distance pairs
from itertools import combinations

def select_pairs(px_form: pd.DataFrame, top=5):
    idx = (1 + px_form.pct_change().fillna(0)).cumprod()
    dist = {(a, b): (idx[a] - idx[b]).abs().mean()
            for a, b in combinations(idx.columns, 2)}
    return sorted(dist, key=dist.get)[:top], dist

def distance_signal(px_trade: pd.DataFrame, a, b, D, thr=0.5):
    idx = (1 + px_trade.pct_change().fillna(0)).cumprod()
    spread = idx[a] - idx[b]
    pos = pd.Series(np.nan, index=spread.index)
    pos[spread > thr * D] = -1          # short a / long b
    pos[spread < -thr * D] = 1
    pos[spread.abs() < thr * D] = 0
    return pos.ffill().fillna(0)       # +1 = long a, short b
```

**Adaptation.** FX crosses already *are* pairs. A distance or cointegration
screen on **currency-vs-USD** series (AUD/NZD, EUR/CHF, CAD/NOK, …) is a
structured way to find RV trades. It links to our `residual_pca_currency_test`
and `multi-spread-sleeve`.

---

### 4.10 Intraday two-stage correlation + cointegration pairs (#07)

**Paper.** George J. Miao (2014).

**Rules.**
1. Universe: 80 US bank stocks (3,160 pairs). Bars: 10-min (configurable 5/10/30).
2. **Stage 1:** keep pairs with price **correlation ≥ 0.9**.
3. **Stage 2:** Engle–Granger. OLS `P_A = μ + γ·P_B + ε`, ADF on ε (lag by
   BIC). **Pass if ADF stat ≤ −3.34** (95%). Rank by ADF stat (most negative first).
4. **Training window 3 months (rolling), trade the next 1 month.** Repeat.
5. z = (ε − ε̄)/σ_ε. **Enter at |z| > 2.32** (99% normal). **Exit at |z| < 0.5.**
   **Stop at |z| > 4.5.**

**Reported.** 2013–2016 (10-min): **CAGR up to 29.4%, Sharpe 0.968, beta −0.11**.
"Especially profitable when the market is performing poorly", because
mispricings appear when vol rises.

```python
# Portable rebuild — two-stage screen + z-score trading with stop
from statsmodels.tsa.stattools import adfuller

def eg_screen(train: pd.DataFrame, min_corr=0.9, adf_crit=-3.34):
    out = []
    corr = train.corr()
    for a, b in combinations(train.columns, 2):
        if corr.loc[a, b] < min_corr:
            continue
        X = sm.add_constant(train[b]); fit = sm.OLS(train[a], X).fit()
        stat = adfuller(fit.resid, autolag="BIC")[0]
        if stat <= adf_crit:
            out.append((stat, a, b, fit.params["const"], fit.params[b],
                        fit.resid.mean(), fit.resid.std()))
    return sorted(out)            # most negative ADF first

def z_trade(pa, pb, mu, gamma, e_mean, e_std, z_in=2.32, z_out=0.5, z_stop=4.5):
    z = ((pa - mu - gamma * pb) - e_mean) / e_std
    pos, p = pd.Series(0.0, index=z.index), 0.0
    for t, zt in z.items():
        if p == 0:
            if zt > z_in:  p = -1.0          # A rich: short A, long gamma*B
            elif zt < -z_in: p = 1.0
        elif abs(zt) < z_out or abs(zt) > z_stop:
            p = 0.0
        pos[t] = p
    return pos
```

**Adaptation.** The **stop at 4.5σ** and the "3-month train / 1-month trade"
walk-forward are the reusable parts. For FX, run it on 1h bars of crosses,
and remember that parameters are sector-specific (their note).

---

### 4.11 Copula vs cointegration pairs (#03)

**Papers.** Stander, Marais & Botha (2013), copula method. Hanson & Hall (2012),
cointegration.

**Findings.** Copulas capture **tail dependence** that joint normality misses,
so they give more trades and are less sensitive to starting parameters.

| Method | Trades | Profit | Sharpe | MaxDD |
|---|---|---|---|---|
| Copula | 493 | 8.88% | 0.12 | 26.1% |
| Cointegration | 126 | 4.52% | 0.196 | 3.9% |

The copula made more money with a far worse DD and lower Sharpe. Low-vol ETF
pairs gave cointegration few signals (91 in 5 years).

**Mechanics (for a rebuild).** Fit marginals (empirical CDF) to each leg's
returns. Fit candidate Archimedean copulas (Clayton, Gumbel, Frank) by
Kendall's τ and pick the best by AIC. Compute the conditional probabilities
`P(U≤u | V=v)` and `P(V≤v | U=u)`. **Enter when one conditional prob < 0.05 and
the other > 0.95** (the mispriced leg), and exit when both return near 0.5.
Their snippet thresholds sit in the iframe code.

**Adaptation.** Low priority. Worth it only if tail co-moves (e.g. AUD/NZD
in risk-off) turn out to drive our RV P&L.

---

### 4.12 Optimal pairs trading with an Ornstein–Uhlenbeck model (#1029)

**Paper.** Leung & Li (2015), *Optimal Mean Reversion Trading with
Transaction Costs and Stop-Loss Exit*.

**Procedure.**
1. For β in {0.01, …, 1.00}: portfolio `X = A/A₀ − β·B/B₀` ($1 of A, −$β of B)
   over the last **252 days**. Fit OU parameters (θ mean, μ speed, σ) by
   **maximum likelihood**. Keep the **β\*** with the highest average
   log-likelihood.
2. With `c` = transaction cost = 0.05 and `r` = discount rate = 0.05,
   define
   `F(x) = ∫₀^∞ u^{r/μ−1} exp(√(2μ/σ²)(x−θ)u − u²/2) du`,
   `G(x) = ∫₀^∞ u^{r/μ−1} exp(√(2μ/σ²)(θ−x)u − u²/2) du`.
3. **Liquidation level b\***: root of `F(b) − (b−c)F′(b) = 0`.
   `V(x) = (b*−c)·F(x)/F(b*)` if x < b\*, else `x − c`.
4. **Entry level d\***: root of `G(d)(V′(d) − 1) − G′(d)(V(d) − d − c) = 0`.
5. **Enter** when X ≤ d\* and **exit** when X ≥ b\*. Retrain every quarter.

*(The tutorial's "Trading" paragraph swaps b\* and d\*. The paper's convention,
used above, is that d\* is the lower entry level and b\* is the upper exit level.)*

**Reported.** 5-year Sharpe **0.898 vs SPY 0.667**, but **only 12 trades**.
They suggest adding pairs such as GLD–GDX.

```python
# Portable rebuild — OU MLE (closed form) + optimal entry/exit
from scipy.integrate import quad
from scipy.optimize import brentq

def ou_mle(x: np.ndarray, dt: float = 1 / 252):
    x0, x1 = x[:-1], x[1:]; n = len(x1)
    Sx, Sy = x0.sum(), x1.sum()
    Sxx, Syy, Sxy = (x0 * x0).sum(), (x1 * x1).sum(), (x0 * x1).sum()
    theta = (Sy * Sxx - Sx * Sxy) / (n * (Sxx - Sxy) - (Sx * Sx - Sx * Sy))
    mu = -np.log((Sxy - theta * Sx - theta * Sy + n * theta ** 2) /
                 (Sxx - 2 * theta * Sx + n * theta ** 2)) / dt
    a = np.exp(-mu * dt)
    s2 = (2 * mu / (n * (1 - a ** 2))) * (
        Syy - 2 * a * Sxy + a ** 2 * Sxx
        - 2 * theta * (1 - a) * (Sy - a * Sx) + n * theta ** 2 * (1 - a) ** 2)
    sig = np.sqrt(s2)
    st2 = s2 * (1 - np.exp(-2 * mu * dt)) / (2 * mu)
    resid = x1 - x0 * a - theta * (1 - a)
    ll = -0.5 * np.log(2 * np.pi) - 0.5 * np.log(st2) - (resid ** 2).sum() / (2 * n * st2)
    return theta, mu, sig, ll

def best_beta(a: np.ndarray, b: np.ndarray):
    best = None
    for beta in np.arange(0.01, 1.001, 0.01):
        port = a / a[0] - beta * b / b[0]
        th, mu, sg, ll = ou_mle(port)
        if mu > 0 and (best is None or ll > best[-1]):
            best = (beta, th, mu, sg, ll)
    return best

def optimal_levels(theta, mu, sigma, c=0.05, r=0.05, h=1e-4):
    k = np.sqrt(2 * mu / sigma ** 2)
    F = lambda x: quad(lambda u: u ** (r / mu - 1) * np.exp(k * (x - theta) * u - u * u / 2), 0, np.inf)[0]
    G = lambda x: quad(lambda u: u ** (r / mu - 1) * np.exp(k * (theta - x) * u - u * u / 2), 0, np.inf)[0]
    dF = lambda x: (F(x + h) - F(x)) / h
    dG = lambda x: (G(x + h) - G(x)) / h
    s = sigma / np.sqrt(2 * mu)                       # stationary std
    b = brentq(lambda y: F(y) - (y - c) * dF(y), theta - 3 * s + c, theta + 5 * s + c)
    V = lambda x: (b - c) * F(x) / F(b) if x < b else x - c
    dV = lambda x: (V(x + h) - V(x)) / h
    d = brentq(lambda y: G(y) * (dV(y) - 1) - dG(y) * (V(y) - y - c), theta - 5 * s, b - 1e-6)
    return d, b          # enter <= d, exit >= b
```

*(The brentq brackets are a sensible default. If a root isn't bracketed,
widen them. That usually means c is too large relative to σ/√(2μ).)*

**Adaptation.** The useful output is the **cost-aware entry/exit band from OU
parameters**. It replaces ad-hoc ±2σ thresholds in any mean-reversion sleeve
(e.g. EURCHF, AUDNZD residuals). Note that c=0.05 is a *portfolio-value unit*
cost, so scale it to realistic FX spreads.

---

### 4.13 WTI–Brent spread (#100)

**Rules.** Spread = WTI − Brent (daily spot, $/bbl).
- SMA(20) of the spread.
- **Fair value**: regress Brent on WTI over the last 252 days,
  `Brent = β·WTI + α`, so `fair spread = WTI − (β·WTI + α)`.
  The regression is fitted once at start in the tutorial.
- **Spread > SMA20 → short spread** (−WTI, +Brent). **Spread < SMA20 → long spread.**
- **Exit** a short when spread < fair value, and a long when spread > fair value.

**Transferable.** It uses two anchors: a fast one (SMA20) for entry and a
structural one (regression fair value) for exit. The same template fits
**XAU vs XAG**, **EURCHF vs policy floor/SNB**, and **AUDUSD vs iron ore/copper**.
Refit the fair-value regression on a rolling basis, not once.

---

### 4.14 Dual Thrust (#05)

**Author.** Michael Chalek. An intraday open-range breakout.

**Rules.**
- Over the last **N = 4** days: `Range = max(HH − LC, HC − LL)`, where HH =
  highest high, LC = lowest close, HC = highest close, LL = lowest low.
- **Buy trigger = Open + K1·Range. Sell trigger = Open − K2·Range**, with
  K1 = K2 = 0.5.
- Always in the market (a reversal system). Break the upper trigger and flip
  long; break the lower and flip short. K1 < K2 biases long, K1 > K2 biases short.

**Reported.** SPY hourly 2004–2017: **Sharpe −0.37, DD 65.7%**.

**Bug in the tutorial code.** Both branches compare price with `self.selltrig`.
The long branch should compare with `buytrig`. With that bug the system is
basically "long above the sell trigger", which may explain part of the
disaster.

```python
def dual_thrust_levels(daily: pd.DataFrame, n=4, k1=0.5, k2=0.5):
    hh = daily["high"].rolling(n).max().shift(1)
    ll = daily["low"].rolling(n).min().shift(1)
    hc = daily["close"].rolling(n).max().shift(1)
    lc = daily["close"].rolling(n).min().shift(1)
    rng = np.maximum(hh - lc, hc - ll)
    return daily["open"] + k1 * rng, daily["open"] - k2 * rng   # buy, sell triggers
```

**Adaptation.** The range definition `max(HH−LC, HC−LL)` is a good robust
N-day range estimator for our **range-extension / expected-move** work
(`range-ext-backtest`, `expected-moves`). As a directional system it belongs
to the breakout family, which is a banked null.

---

### 4.15 Intraday momentum: first 30 minutes predict the last 30 minutes (#1026)

**Paper.** Gao, Han, Li & Zhou (2017), *Market Intraday Momentum*. Late-informed
or delayed traders cause the opening and closing half-hours to be positively
correlated. The paper reports 6.67%/yr on SPY, 11.72% IWM, 24.22% IYR.

**Rules.** Minute bars. `morning_ret = close at 30th minute / yesterday's close − 1`.
**At 31 minutes before the close, take `sign(morning_ret)`, hold to the close**
(market order + market-on-close order in the same step). Universe: SPY, IWM, IYR.

**Reported (with costs).** 2015→Aug-2020 **Sharpe −0.76** (benchmark 0.71).
Fall-2015 −0.70. **2020 crash +4.82**. Recovery +0.60. Removing costs didn't
rescue it. The paper's suggestions: trade only on macro-news days (CPI, GDP,
UMich), only in high vol, require a volume threshold, or use multiple
intraday windows.

**Adaptation.** The FX analogue is "Asia/London open move predicts the
London-fix / NY-close window". Our `SessionResearch` / `DailyOpenResearch`
can test this directly. The QC result says **condition on high-vol / event
days** or don't bother.

---

### 4.16 Short-term reversal with futures (volume and open interest) (#71)

**Rules.** 24 futures (4 FX, 5 index, 8 ag, 7 commodities), front month,
weekly **Wednesday→Wednesday**.
- For each contract, compute the change in weekly **volume** and in weekly
  **open interest** vs the prior week.
- Candidates = **top-half volume change ∩ bottom-half OI change**.
- Among them, **long the worst prior-week return, short the best** (±0.3).

**Adaptation.** Rising volume with falling OI means liquidation, not new
conviction, so the move is likely to reverse. This connects directly to our
**OI work** (`oi_bot`, `open-interest-course-notes.md`) once CME OI history
exists (F2).

---

### 4.17 ML tutorials: Gradient Boosting (#1033) and Gaussian Naive Bayes (#1036)

- **GBM (Zhou et al. 2013), SPY minute bars.** Features are technical
  indicators over a k-grid 0.5→5 in steps of 0.25. Target: the **10-minute
  forward return**. 20 stumps (depth 1, 2 leaves), retrained **monthly on 4
  weeks** of data. **Trade only if |predicted return| > cost** (commission 0.02 +
  spread 0.03). No overnight holds. **Result: Sharpe −0.72 vs 0.85.** The paper's
  custom P&L/Sharpe loss functions gave *worse* predictions than MSE.
- **GNB (Lu 2016).** Top 10 tech stocks by market cap. Features: the last **4 daily
  open→close returns of every universe member**. Label: sign of the
  open(T+1)→open(T+2) return. 100 samples, retrained when the universe changes.
  **5-year Sharpe 0.97 vs 0.81.** Worse in the 2020 recovery. They didn't check
  the independence/normality assumptions.

**Reusable ideas.** (1) *Only trade when the forecast beats the cost.*
(2) The target window starts at the **next open**, so there's no same-bar
leakage. (3) Cross-sectional lagged returns of related assets as features:
for FX, the other 12 pairs' last-N returns. Treat all of this as meta-labeling
input, which we have banked as null on folklore signals, so apply it to a
real edge only.

---

## 5. Tier C: seasonality (FX-flow analogues)

| # | Rule (as published) | FX analogue to test |
|---|---|---|
| 35 Turn of the month | Buy SPY at the open of the last trading day, hold **3 trading days**, exit. | **Month-end USD rebalancing flows** (hedge rebalancing against equity performance), the London 4pm fix on the last day. |
| 269 Same-calendar-month | Top-100 liquid US names by dollar volume. Rank by **return in the same calendar month last year**, long top / short bottom, monthly. Sharpe 0.33 vs SPY 0.89. Suggested extension: average over the last 5 years. | Per-pair same-month seasonality (e.g. JPY repatriation in March, AUD in Dec/Jan). Use a 5–10 year average, not one year. |
| 83 Pre-holiday | Long SPY if a *non-weekend* public holiday falls in the next 2 days, else flat. | Thin-liquidity pre-holiday drift: US Thanksgiving, Golden Week for JPY, Christmas. |
| 113 January barometer | January's sign sets the stance for the rest of the year. | Low prior. Skip unless it's cheap to test in the harness. |

---

## 6. What to steal: a ranked shortlist

1. **TSMOM-CF components** (§3.10): the t-stat signal, Yang–Zhang vol, and the
   correlation de-leveraging factor. Brick-level upgrades to trend.
2. **Carry × momentum double-sort** (§4.3 applied to FX): avoids carry crashes.
3. **Lempérière continuous trend signal** `(p − EMA)/σ_|Δp|` (§3.9).
4. **Serban standardised-reversal + 3m momentum** two-factor FX model (§3.3),
   rebuilt without look-ahead.
5. **OU cost-aware entry/exit bands** (§4.12) for any mean-reversion sleeve.
6. **Market-state gate** on momentum and carry (§4.2) plus a **VIX-percentile
   risk-off state** (§4.4).
7. **Volume ↑ / OI ↓ reversal filter** (§4.16), once OI data exists.
8. Diagnostics: HP end-point revision (§3.4), per-decision regression
   significance (§4.7), and code-bug audits (§3.5, 3.9, 3.10, 4.14): about half
   of the published QC snippets have a material bug or look-ahead.

---

## Appendix: full Strategy Library catalogue (85 entries)

Tiers A–C are covered above. The rest are single-stock/fundamental (D) and
listed only for completeness.

| # | Title | Tier | One-line |
|---|---|---|---|
| 01 | CAPM Alpha Ranking on Dow 30 | D | Rank Dow stocks by CAPM alpha, go long the top. |
| 02 | Combining MR and Momentum in FX | A | §3.3 |
| 03 | Pairs Trading: Copula vs Cointegration | B | §4.11 |
| 04 | Dynamic Breakout II | A | §3.6 |
| 05 | Dual Thrust | B | §4.14 |
| 06 | Can Crude Oil Predict Equity Returns | B | §4.7 |
| 07 | Intraday Dynamic Pairs (corr + coint) | B | §4.10 |
| 08 | Momentum on Low-Frequency FX component | A | §3.4 |
| 09 | Stock Selection on Fundamental Factors | D | Multi-factor fundamental ranking. |
| 10 | Short-Term Reversal in Stocks | D | Buy last-month losers, sell winners. |
| 11 | Fundamental Factor Long/Short | D | Factor long/short. |
| 12 | Asset Class Trend Following | B | §4.1 |
| 13 | Asset Class Momentum | B | §4.1 |
| 14 | Sector Momentum | D | Rotate into the top sector ETFs by 12m momentum. |
| 15 | Short Term Reversal | D | Weekly reversal in large caps. |
| 16 | Overnight Anomaly | D | Hold SPY close→open only. (FX analogue: session returns.) |
| 17 | Forex Momentum | A | §3.2 |
| 18 | Volatility Effect in Stocks | D | Low-vol anomaly. |
| 19 | Pairs Trading with Stocks | D | Classic stock pairs. |
| 20 | Forex Carry Trade | A | §3.1 |
| 21 | Momentum Effect in Stocks | D | 12-1 cross-sectional momentum. |
| 22 | Momentum in Country Equity Indexes | B | Top 5 of 35 country ETFs by 6m momentum, monthly. ~40% p.a. over equal weight, 2002–2018 (as claimed). |
| 23 | Mean Reversion in Country Equity Indexes | B | Long the bottom 4 / short the top 4 of 19 country ETFs by **36m** return, rebalance every 3 years. |
| 24 | Liquidity Effect in Stocks | D | Illiquid premium. |
| 25 | Volatility Risk Premium | B | §4.6 |
| 26 | Quantpedia | — | (index page, empty) |
| 27 | Momentum in Commodity Futures | B | Quintile long/short by 12m return, monthly. |
| 28 | Small-Cap Premium | D | Size factor. |
| 29 | Term Structure in Commodities | B | §4.3 |
| 30 | Momentum + Term Structure in Commodities | B | §4.3 |
| 31 | Book-to-Market Value | D | Value factor. |
| 32 | Gold Market Timing | A | §3.11 |
| 33 | Paired Switching | B | §4.8 |
| 34 | Momentum–Short-Term Reversal | D | Momentum excluding names in the "final stage of overreaction". |
| 35 | Turn of the Month | C | §5 |
| 36 | Sentiment & Style Rotation | D | Style rotation by sentiment. |
| 37 | Momentum + State-of-Market Filter | B | §4.2 |
| 38 | Accrual Anomaly | D | Earnings quality. |
| 39 | Asset Growth Effect | D | Low asset growth outperforms. |
| 40 | Pairs Trading with Country ETFs | B | §4.9 |
| 58 | VIX Predicts Stock Index Returns | B | §4.4 |
| 61 | Lunar Cycle | D | Lunar phase effect. Novelty. |
| 66 | Momentum + Volume | D | Momentum conditioned on turnover. |
| 71 | Short-Term Reversal with Futures | B | §4.16 |
| 77 | Beta Factors in Stocks | D | Betting-against-beta. |
| 78 | Beta Factor in Country Indexes | B | Long the lowest-beta quarter, short the highest of 35 country ETFs (beta vs SPY, 1y), monthly. |
| 83 | Pre-Holiday Effect | C | §5 |
| 85 | Momentum in Mutual Fund Returns | D | Fund momentum. |
| 91 | Momentum & Style Rotation | D | Style ETF rotation. |
| 92 | Price-Earnings Anomaly | D | Low P/E. |
| 100 | WTI–Brent Spread | B | §4.13 |
| 102 | Option Expiration Week | D | Equities rise in OpEx week. |
| 113 | January Barometer | C | §5 |
| 114 | January Effect in Stocks | D | Small caps in January. |
| 118 | Time Series Momentum | A | §3.8 |
| 125 | 12-Month Cycle in Cross-Section | D | Same-month seasonality in stocks. |
| 136 | Residual Momentum | D | Momentum of FF-residual returns (idea transferable to FX residuals). |
| 152 | Momentum in REITs | D | REIT momentum. |
| 155 | Momentum/Reversal + Volatility | D | Mom/rev conditioned on realised vol. |
| 162 | Momentum in Small Portfolios | D | Small-cap momentum. |
| 198 | Term Structure of VIX Futures | B | §4.5 |
| 199 | ROA Effect | D | Profitability. |
| 207 | Value Effect within Countries | B | Country CAPE-style value. (FX analogue: PPP value.) |
| 211 | Mean-Reversion Stat-Arb (PCA) | B | Avellaneda–Lee PCA residual reversion, 20 stocks, 30-day rebalance, >7%/yr, ~40% DD (2010–2019). See `residual_pca_currency_test/`. |
| 229 | Earnings Quality Factor | D | Quality. |
| 269 | Same-Calendar-Month Seasonality | C | §5 |
| 270 | Risk Premia in Forex | A | §3.5 |
| 271 | Price and Earnings Momentum | D | Combined momentum. |
| 353 | Fama–French Five Factors | D | FF5 sorts. |
| 354 | Expected Idiosyncratic Skewness | D | Skew factor. |
| 355 | Standardized Unexpected Earnings | D | PEAD. |
| 356 | Improved Momentum on Commodity Futures | A | §3.10 |
| 357 | Commodities Futures Trend Following | A | §3.9 |
| 1023 | Intraday Arbitrage between Index ETFs | B | SPY/IVV-style deviation ≥0.02% for 3 s. Loses after costs. |
| 1024 | Temporal CNN forecasting | D | CNN classifier on 3 tech stocks. Mean Sharpe 0.21 across 10 runs (range −0.31…0.92). Non-deterministic. |
| 1025 | Leveraged ETFs + Risk Management | B | §4.1 |
| 1026 | Intraday ETF Momentum | B | §4.15 |
| 1027 | News Sentiment for Drug Makers | D | Tiingo news sentiment. Profitable only when restricted to the best weekday. Sharpe 0.12. |
| 1028 | Ichimoku Clouds in Energy | D | Chikou crosses the cloud. Sharpe −0.23 (banked null for us). |
| 1029 | Optimal Pairs Trading (OU) | B | §4.12 |
| 1030 | G-Score Investing | D | Mohanram growth score. |
| 1031 | SVM Wavelet Forecasting | A | §3.7 |
| 1033 | Gradient Boosting Model | B | §4.17 |
| 1036 | Gaussian Naive Bayes | B | §4.17 |

### References (primary papers cited by the library, for the strategies kept)

- Serban, A.F. (2010). *Combining mean reversion and momentum trading strategies in foreign exchange markets.* JBF.
- Harris, R.D.F. & Yilmaz, F. (2009). *A momentum trading strategy based on the low frequency component of the exchange rate.* JBF 33(9).
- Lempérière, Deremble, Nguyen, Seager, Potters, Bouchaud. *Risk Premia: Asymmetric Tail Risks and Excess Returns.*
- Lempérière, Deremble, Seager, Potters, Bouchaud (2014). *Two centuries of trend following.*
- Baltas, N. & Kosowski, R. (2017). *Demystifying Time-Series Momentum Strategies.* SSRN 2140091.
- Yang, D. & Zhang, Q. (2000). *Drift-Independent Volatility Estimation…* J. Business 73(3).
- Moskowitz, Ooi & Pedersen (2012). *Time series momentum.* JFE.
- Fuertes, Miffre & Rallis (2010). *Tactical allocation in commodity futures markets.* JBF 34.
- Cooper, Gutierrez & Hameed (2004). *Market States and Momentum.* JF.
- Driesprong, Jacobsen & Maat (2007). *Striking Oil: Another Puzzle?*
- Leung, T. & Li, X. (2015). *Optimal Mean Reversion Trading with Transaction Costs and Stop-Loss Exit.* IJTAF 18(3).
- Miao, G.J. (2014). *High frequency and dynamic pairs trading based on statistical arbitrage using a two-stage correlation and cointegration approach.*
- Stander, Marais & Botha (2013). *Trading strategies with copulas.*
- Gao, Han, Li & Zhou (2017). *Market Intraday Momentum.*
- Gayed, M. & Bilello, C. (2016). *Leverage for the Long Run.*
- Pruitt, Hill & Russak (2012). *Building Winning Trading Systems.*
- Raimundo, M.S. & Okamoto, J. (2018). *SVR-wavelet adaptive model for forecasting financial time series.* ICICT.
- Zhou, Cheng, Qin & Yin (2013). *Evolution of High Frequency Systematic Trading: A Performance-Driven Gradient Boosting Model.*
- Keloharju, Linnainmaa & Nyberg. *Common Factors in Return Seasonalities.*
