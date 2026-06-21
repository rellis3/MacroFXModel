# TRADING MODEL BUILDER'S GUIDE
## Systematic Strategy Development Reference

**Purpose**: This document provides the essential framework, data sources, code templates, and validation procedures needed to build, test, and deploy systematic trading models. Use this as a technical reference when developing quantitative strategies.

---

## TABLE OF CONTENTS

1. [Strategy Development Workflow](#strategy-development-workflow)
2. [Data Architecture & Sources](#data-architecture--sources)
3. [Regime Detection Implementation](#regime-detection-implementation)
4. [Core Signal Types & Code](#core-signal-types--code)
5. [Cross-Asset Relationships](#cross-asset-relationships)
6. [Backtesting Framework](#backtesting-framework)
7. [Risk Management & Position Sizing](#risk-management--position-sizing)
8. [Model Validation Checklist](#model-validation-checklist)
9. [Production Deployment](#production-deployment)
10. [Quick Reference Tables](#quick-reference-tables)

---

## STRATEGY DEVELOPMENT WORKFLOW

### The Systematic Process

```
1. HYPOTHESIS FORMATION
   ↓
2. DATA COLLECTION & CLEANING
   ↓
3. SIGNAL CONSTRUCTION
   ↓
4. IN-SAMPLE TESTING
   ↓
5. OUT-OF-SAMPLE VALIDATION
   ↓
6. WALK-FORWARD ANALYSIS
   ↓
7. MONTE CARLO STRESS TESTING
   ↓
8. PAPER TRADING (3+ months)
   ↓
9. LIVE DEPLOYMENT (small size)
   ↓
10. SCALE UP
```

### Critical Success Factors

**Before Writing Any Code:**
- Document economic rationale (why should this work?)
- Define regime dependency (when should this work?)
- Identify confounding factors (what could make this fail?)
- Set validation criteria (what metrics = success?)

**Edge Detection Questions:**
1. What market inefficiency am I exploiting?
2. Why does this inefficiency persist?
3. What would make this inefficiency disappear?
4. What's my time horizon advantage?
5. Who is on the other side of this trade?

---

## DATA ARCHITECTURE & SOURCES

### Core Data Categories

#### 1. POLICY & LIQUIDITY (Weekly-Monthly Updates)

**Federal Reserve Data (FRED)**

```python
from fredapi import Fred
import pandas as pd

fred = Fred(api_key='YOUR_API_KEY')  # Get free key at research.stlouisfed.org

# Net Liquidity Components
fed_balance_sheet = fred.get_series('WALCL')        # Fed Assets
reverse_repo = fred.get_series('RRPONTSYD')         # RRP Facility
tga = fred.get_series('WTREGEN')                    # Treasury General Account

# Calculate Net Liquidity
net_liquidity = fed_balance_sheet - tga - reverse_repo

# Financial Conditions
nfci = fred.get_series('NFCI')                      # Chicago Fed NFCI
anfci = fred.get_series('ANFCI')                    # Adjusted NFCI

# Bank Lending
lending_standards = fred.get_series('DRTSCILM')     # Tightening standards
```

**Key FRED Series for Models:**

| Indicator | FRED Code | Update Frequency | Use Case |
|-----------|-----------|------------------|----------|
| Fed Balance Sheet | WALCL | Weekly | Liquidity proxy |
| Reverse Repo | RRPONTSYD | Daily | Liquidity drain |
| TGA Balance | WTREGEN | Daily | Fiscal flows |
| ISM Manufacturing | NAPM | Monthly | Growth indicator |
| ISM Services | NMFSI | Monthly | Growth indicator |
| Core CPI | CPILFESL | Monthly | Inflation |
| Core PCE | PCEPILFE | Monthly | Fed's preferred inflation |
| Initial Claims | ICSA | Weekly | Labor market |
| Financial Conditions | NFCI | Weekly | Risk conditions |
| Bank Lending Standards | DRTSCILM | Quarterly | Credit cycle |

#### 2. RATES & YIELD CURVE (Daily Updates)

```python
import yfinance as yf

# Treasury Yields
data = yf.download(['^IRX', '^FVX', '^TNX', '^TYX'], period='2y')
yields = data['Close']
yields.columns = ['3M', '5Y', '10Y', '30Y']

# FRED alternative (less real-time)
dgs2 = fred.get_series('DGS2')   # 2-Year
dgs10 = fred.get_series('DGS10') # 10-Year

# Calculate spreads
spread_2s10s = dgs10 - dgs2

# TIPS and Breakevens
tips_10y = fred.get_series('DFII10')  # 10Y TIPS Yield
breakeven = dgs10 - tips_10y           # 10Y Breakeven Inflation
```

**Critical Rate Spreads:**

```python
def calculate_rate_spreads(yields_df):
    """
    Calculate key yield curve spreads
    """
    spreads = pd.DataFrame(index=yields_df.index)
    
    # Curve slope
    spreads['2s10s'] = yields_df['10Y'] - yields_df['2Y']
    spreads['2s30s'] = yields_df['30Y'] - yields_df['2Y']
    spreads['5s30s'] = yields_df['30Y'] - yields_df['5Y']
    
    # Real yields
    spreads['real_10y'] = yields_df['10Y'] - yields_df['breakeven_10y']
    
    return spreads
```

#### 3. CREDIT MARKETS (Daily Updates)

**Credit Spreads via FRED:**

```python
# Investment Grade
hy_oas = fred.get_series('BAMLH0A0HYM2')   # HY Option-Adjusted Spread
ig_oas = fred.get_series('BAMLC0A4CBBB')   # BBB Corporate OAS

# Calculate credit risk premium
credit_risk = hy_oas - ig_oas

# Specific ratings
aaa = fred.get_series('BAMLC0A1CAAA')      # AAA Corporate
aa = fred.get_series('BAMLC0A2CAA')        # AA Corporate
a = fred.get_series('BAMLC0A3CA')          # A Corporate
bbb = fred.get_series('BAMLC0A4CBBB')      # BBB Corporate
```

**Credit Spread Regime Classification:**

```python
def classify_credit_regime(hy_spread):
    """
    Classify credit market regime based on HY spreads
    """
    if hy_spread < 300:
        return "VERY_TIGHT"
    elif hy_spread < 400:
        return "NORMAL"
    elif hy_spread < 500:
        return "ELEVATED"
    elif hy_spread < 700:
        return "STRESSED"
    else:
        return "CRISIS"
```

#### 4. FX MARKETS (Real-time)

```python
# Using Yahoo Finance for FX pairs
fx_pairs = ['EURUSD=X', 'USDJPY=X', 'GBPUSD=X', 'AUDUSD=X']
fx_data = yf.download(fx_pairs, period='1y', interval='1d')

# Dollar Index
dxy = yf.download('DX-Y.NYB', period='1y')

# Alternative: FRED for daily FX
eurusd = fred.get_series('DEXUSEU')
usdjpy = fred.get_series('DEXJPUS')
```

**Rate Differential Calculator:**

```python
def calculate_rate_differential(us_2y, foreign_2y, fx_pair):
    """
    Calculate rate differential and expected FX direction
    """
    diff = us_2y - foreign_2y
    
    # Positive diff = USD should strengthen vs foreign
    return {
        'differential': diff,
        'expected_direction': 'USD_STRENGTH' if diff > 0 else 'USD_WEAKNESS',
        'pair': fx_pair
    }
```

#### 5. VOLATILITY & SENTIMENT (Daily Updates)

```python
# VIX and volatility indices
vix = yf.download('^VIX', period='1y')
move = yf.download('^MOVE', period='1y')  # Bond market VIX

# VIX term structure
vix_futures = yf.download(['VX=F', 'VXQ24.CBT'], period='3m')

def calculate_vix_term_structure(spot_vix, front_month, second_month):
    """
    Determine if VIX curve is in contango or backwardation
    """
    contango = front_month > spot_vix
    
    return {
        'structure': 'CONTANGO' if contango else 'BACKWARDATION',
        'slope': (second_month - front_month) / front_month * 100
    }
```

#### 6. COMMODITIES & REAL ASSETS (Daily Updates)

```python
# Key commodity tickers
commodities = {
    'gold': 'GC=F',
    'crude': 'CL=F',
    'copper': 'HG=F',
    'silver': 'SI=F'
}

commodity_data = yf.download(list(commodities.values()), period='2y')
```

### Complete Data Pipeline Template

```python
import pandas as pd
import numpy as np
from fredapi import Fred
import yfinance as yf
from datetime import datetime, timedelta

class MacroDataPipeline:
    """
    Complete data pipeline for systematic macro trading
    """
    
    def __init__(self, fred_api_key):
        self.fred = Fred(api_key=fred_api_key)
        self.data = {}
        
    def fetch_all_data(self, start_date, end_date):
        """
        Fetch all required data sources
        """
        print("Fetching Federal Reserve data...")
        self.data['fed'] = self._fetch_fed_data(start_date, end_date)
        
        print("Fetching rates data...")
        self.data['rates'] = self._fetch_rates_data(start_date, end_date)
        
        print("Fetching credit data...")
        self.data['credit'] = self._fetch_credit_data(start_date, end_date)
        
        print("Fetching FX data...")
        self.data['fx'] = self._fetch_fx_data(start_date, end_date)
        
        print("Fetching volatility data...")
        self.data['vol'] = self._fetch_vol_data(start_date, end_date)
        
        print("Fetching commodities data...")
        self.data['commodities'] = self._fetch_commodity_data(start_date, end_date)
        
        return self._combine_all_data()
    
    def _fetch_fed_data(self, start, end):
        """Federal Reserve data"""
        return pd.DataFrame({
            'fed_balance_sheet': self.fred.get_series('WALCL', start, end),
            'rrp': self.fred.get_series('RRPONTSYD', start, end),
            'tga': self.fred.get_series('WTREGEN', start, end),
            'nfci': self.fred.get_series('NFCI', start, end)
        })
    
    def _fetch_rates_data(self, start, end):
        """Treasury rates"""
        return pd.DataFrame({
            '2Y': self.fred.get_series('DGS2', start, end),
            '10Y': self.fred.get_series('DGS10', start, end),
            '30Y': self.fred.get_series('DGS30', start, end),
            'TIPS_10Y': self.fred.get_series('DFII10', start, end)
        })
    
    def _fetch_credit_data(self, start, end):
        """Credit spreads"""
        return pd.DataFrame({
            'HY_OAS': self.fred.get_series('BAMLH0A0HYM2', start, end),
            'IG_OAS': self.fred.get_series('BAMLC0A4CBBB', start, end)
        })
    
    def _fetch_fx_data(self, start, end):
        """FX pairs"""
        pairs = ['EURUSD=X', 'USDJPY=X', 'AUDUSD=X']
        data = yf.download(pairs, start=start, end=end)['Close']
        data.columns = ['EURUSD', 'USDJPY', 'AUDUSD']
        return data
    
    def _fetch_vol_data(self, start, end):
        """Volatility indices"""
        vix = yf.download('^VIX', start=start, end=end)['Close']
        return pd.DataFrame({'VIX': vix})
    
    def _fetch_commodity_data(self, start, end):
        """Commodities"""
        commodities = yf.download(['GC=F', 'CL=F'], start=start, end=end)['Close']
        commodities.columns = ['Gold', 'Crude']
        return commodities
    
    def _combine_all_data(self):
        """
        Combine all data sources into single DataFrame
        """
        combined = pd.DataFrame()
        
        for category, df in self.data.items():
            combined = pd.concat([combined, df], axis=1)
        
        # Forward fill missing data (weekends, holidays)
        combined = combined.fillna(method='ffill')
        
        return combined
    
    def calculate_derived_signals(self, df):
        """
        Calculate all derived signals from raw data
        """
        signals = df.copy()
        
        # Net Liquidity
        signals['net_liquidity'] = (
            signals['fed_balance_sheet'] - 
            signals['tga'] - 
            signals['rrp']
        )
        
        # Yield spreads
        signals['2s10s'] = signals['10Y'] - signals['2Y']
        signals['breakeven_10y'] = signals['10Y'] - signals['TIPS_10Y']
        signals['real_yield_10y'] = signals['10Y'] - signals['breakeven_10y']
        
        # Credit risk
        signals['credit_risk'] = signals['HY_OAS'] - signals['IG_OAS']
        
        return signals

# Usage
pipeline = MacroDataPipeline(fred_api_key='YOUR_KEY')
end_date = datetime.now()
start_date = end_date - timedelta(days=365*5)  # 5 years

data = pipeline.fetch_all_data(start_date, end_date)
signals = pipeline.calculate_derived_signals(data)
```

---

## REGIME DETECTION IMPLEMENTATION

### Growth-Inflation Quadrant Framework

```python
import pandas as pd
import numpy as np
from fredapi import Fred

class RegimeDetector:
    """
    Systematic regime classification based on growth and inflation momentum
    """
    
    def __init__(self, fred_api_key):
        self.fred = Fred(api_key=fred_api_key)
        
    def fetch_regime_data(self, start_date, end_date):
        """
        Fetch data required for regime classification
        """
        data = pd.DataFrame({
            # Growth indicators
            'ism_mfg': self.fred.get_series('NAPM', start_date, end_date),
            'ism_svc': self.fred.get_series('NMFSI', start_date, end_date),
            'initial_claims': self.fred.get_series('ICSA', start_date, end_date),
            
            # Inflation indicators
            'core_cpi': self.fred.get_series('CPILFESL', start_date, end_date),
            'core_pce': self.fred.get_series('PCEPILFE', start_date, end_date),
            'breakeven_5y': self.fred.get_series('T5YIE', start_date, end_date)
        })
        
        return data.fillna(method='ffill')
    
    def calculate_growth_score(self, data):
        """
        Calculate composite growth momentum score
        
        Methodology:
        - Use ISM levels and momentum
        - Invert claims (lower = stronger)
        - 3-month momentum vs 12-month trend
        """
        # ISM composite (both above 50 = expansion)
        ism_composite = 0.5 * data['ism_mfg'] + 0.5 * data['ism_svc']
        
        # Calculate momentum
        momentum_3m = ism_composite.rolling(3).mean()
        trend_12m = ism_composite.rolling(12).mean()
        growth_momentum = momentum_3m - trend_12m
        
        # Normalize to z-score
        growth_score = (growth_momentum - growth_momentum.mean()) / growth_momentum.std()
        
        return growth_score
    
    def calculate_inflation_score(self, data):
        """
        Calculate composite inflation momentum score
        
        Methodology:
        - YoY changes in core measures
        - Breakeven inflation expectations
        - Recent acceleration vs trend
        """
        # YoY changes
        cpi_yoy = data['core_cpi'].pct_change(12) * 100
        pce_yoy = data['core_pce'].pct_change(12) * 100
        
        # Composite inflation
        inflation_composite = (
            0.4 * cpi_yoy + 
            0.4 * pce_yoy + 
            0.2 * data['breakeven_5y']
        )
        
        # 3-month change (acceleration/deceleration)
        inflation_momentum = inflation_composite.diff(3)
        
        # Normalize to z-score
        inflation_score = (
            (inflation_momentum - inflation_momentum.mean()) / 
            inflation_momentum.std()
        )
        
        return inflation_score
    
    def classify_regime(self, growth_score, inflation_score):
        """
        Classify regime based on quadrant
        
        Thresholds:
        - Use zero as neutral (z-score based)
        - Can adjust to percentiles if preferred
        """
        conditions = [
            (growth_score > 0) & (inflation_score <= 0),
            (growth_score > 0) & (inflation_score > 0),
            (growth_score <= 0) & (inflation_score > 0),
            (growth_score <= 0) & (inflation_score <= 0)
        ]
        
        regimes = ['GOLDILOCKS', 'REFLATION', 'STAGFLATION', 'DEFLATION']
        
        return np.select(conditions, regimes, default='UNKNOWN')
    
    def detect_regime_transitions(self, regime_series):
        """
        Identify regime changes and transition dates
        """
        transitions = regime_series != regime_series.shift(1)
        transition_dates = regime_series[transitions].index
        
        transition_log = []
        for i in range(1, len(transition_dates)):
            transition_log.append({
                'date': transition_dates[i],
                'from': regime_series[transition_dates[i-1]],
                'to': regime_series[transition_dates[i]]
            })
        
        return pd.DataFrame(transition_log)
    
    def run_full_analysis(self, start_date, end_date):
        """
        Complete regime detection pipeline
        """
        # Fetch data
        data = self.fetch_regime_data(start_date, end_date)
        
        # Calculate scores
        growth = self.calculate_growth_score(data)
        inflation = self.calculate_inflation_score(data)
        
        # Classify regimes
        regime = self.classify_regime(growth, inflation)
        
        # Compile results
        results = pd.DataFrame({
            'growth_score': growth,
            'inflation_score': inflation,
            'regime': regime
        })
        
        # Detect transitions
        transitions = self.detect_regime_transitions(results['regime'])
        
        return results, transitions

# Usage Example
detector = RegimeDetector(fred_api_key='YOUR_KEY')
regimes, transitions = detector.run_full_analysis('2010-01-01', '2024-12-31')

print("Current Regime:", regimes['regime'].iloc[-1])
print("\nRecent Transitions:")
print(transitions.tail())
```

### Regime-Conditional Asset Allocation

```python
class RegimeBasedAllocator:
    """
    Tactical asset allocation based on detected regime
    """
    
    def __init__(self):
        # Historical optimal allocations by regime (simplified)
        self.allocations = {
            'GOLDILOCKS': {
                'equities': 0.50,
                'bonds': 0.20,
                'commodities': 0.05,
                'gold': 0.00,
                'cash': 0.05,
                'tips': 0.10,
                'credit': 0.10
            },
            'REFLATION': {
                'equities': 0.35,
                'bonds': 0.10,
                'commodities': 0.25,
                'gold': 0.10,
                'cash': 0.05,
                'tips': 0.15,
                'credit': 0.00
            },
            'STAGFLATION': {
                'equities': 0.15,
                'bonds': 0.15,
                'commodities': 0.20,
                'gold': 0.30,
                'cash': 0.15,
                'tips': 0.05,
                'credit': 0.00
            },
            'DEFLATION': {
                'equities': 0.20,
                'bonds': 0.50,
                'commodities': 0.00,
                'gold': 0.05,
                'cash': 0.10,
                'tips': 0.00,
                'credit': 0.15
            }
        }
    
    def get_target_allocation(self, regime):
        """
        Return target allocation for given regime
        """
        return self.allocations.get(regime, None)
    
    def calculate_rebalancing_trades(self, current_allocation, target_allocation):
        """
        Calculate required trades to reach target allocation
        """
        trades = {}
        for asset in target_allocation:
            current = current_allocation.get(asset, 0)
            target = target_allocation[asset]
            trades[asset] = target - current
        
        return trades

# Usage
allocator = RegimeBasedAllocator()
current_regime = regimes['regime'].iloc[-1]
target = allocator.get_target_allocation(current_regime)
print(f"Target allocation for {current_regime}:")
print(target)
```

---

## CORE SIGNAL TYPES & CODE

### 1. Momentum Signals

```python
class MomentumSignals:
    """
    Time-series and cross-sectional momentum strategies
    """
    
    @staticmethod
    def time_series_momentum(prices, lookback=252, skip_recent=21):
        """
        12-1 month momentum (skip most recent month)
        
        Parameters:
        - prices: DataFrame of asset prices
        - lookback: Number of days to look back (252 = 12 months)
        - skip_recent: Days to skip (21 = 1 month)
        
        Returns:
        - Signal: +1 (long), -1 (short), 0 (neutral)
        """
        # Calculate returns from t-252 to t-21
        momentum = (
            prices.shift(skip_recent) / 
            prices.shift(lookback) - 1
        )
        
        # Generate signals
        signal = np.where(momentum > 0, 1, -1)
        
        return pd.DataFrame(signal, index=prices.index, columns=prices.columns)
    
    @staticmethod
    def moving_average_crossover(prices, fast=50, slow=200):
        """
        Classic MA crossover system
        
        Parameters:
        - prices: Price series
        - fast: Fast MA period
        - slow: Slow MA period
        """
        ma_fast = prices.rolling(fast).mean()
        ma_slow = prices.rolling(slow).mean()
        
        # Signal: 1 when fast > slow, -1 when fast < slow
        signal = np.where(ma_fast > ma_slow, 1, -1)
        
        return pd.Series(signal, index=prices.index)
    
    @staticmethod
    def breakout_system(prices, lookback=20, atr_multiplier=2):
        """
        Donchian channel breakout with ATR-based stops
        
        Parameters:
        - prices: OHLC DataFrame
        - lookback: Channel period
        - atr_multiplier: Stop distance in ATRs
        """
        high = prices['High']
        low = prices['Low']
        close = prices['Close']
        
        # Donchian channels
        upper = high.rolling(lookback).max()
        lower = low.rolling(lookback).min()
        
        # ATR for stops
        tr1 = high - low
        tr2 = abs(high - close.shift(1))
        tr3 = abs(low - close.shift(1))
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        atr = tr.rolling(14).mean()
        
        # Generate signals
        signal = pd.Series(0, index=prices.index)
        signal[close > upper.shift(1)] = 1   # Breakout long
        signal[close < lower.shift(1)] = -1  # Breakout short
        
        # Calculate stops
        stop_long = close - (atr * atr_multiplier)
        stop_short = close + (atr * atr_multiplier)
        
        return {
            'signal': signal,
            'stop_long': stop_long,
            'stop_short': stop_short
        }
    
    @staticmethod
    def cross_sectional_momentum(returns, lookback=126, n_assets=10):
        """
        Rank assets by momentum, long top decile, short bottom decile
        
        Parameters:
        - returns: DataFrame of asset returns
        - lookback: Period for momentum calculation
        - n_assets: Number of assets to hold long/short
        """
        # Calculate momentum
        momentum = returns.rolling(lookback).apply(
            lambda x: (1 + x).prod() - 1
        )
        
        # Rank assets
        ranks = momentum.rank(axis=1, ascending=False)
        
        # Generate signals
        signals = pd.DataFrame(0, index=returns.index, columns=returns.columns)
        signals[ranks <= n_assets] = 1          # Long top performers
        signals[ranks > len(returns.columns) - n_assets] = -1  # Short bottom
        
        return signals
```

### 2. Mean Reversion Signals

```python
class MeanReversionSignals:
    """
    Mean reversion and statistical arbitrage strategies
    """
    
    @staticmethod
    def zscore_reversion(prices, lookback=20, entry_threshold=2.0, exit_threshold=0.5):
        """
        Z-score based mean reversion
        
        Entry: |Z| > entry_threshold
        Exit: |Z| < exit_threshold
        """
        # Calculate rolling statistics
        ma = prices.rolling(lookback).mean()
        std = prices.rolling(lookback).std()
        
        # Z-score
        zscore = (prices - ma) / std
        
        # Generate signals
        signal = pd.Series(0, index=prices.index)
        
        # Entry signals
        signal[zscore < -entry_threshold] = 1   # Oversold, buy
        signal[zscore > entry_threshold] = -1   # Overbought, sell
        
        # Exit signals (flatten when crosses exit threshold)
        signal[(zscore > -exit_threshold) & (zscore < exit_threshold)] = 0
        
        # Forward fill to maintain position
        signal = signal.replace(0, np.nan).fillna(method='ffill').fillna(0)
        
        return {
            'signal': signal,
            'zscore': zscore,
            'ma': ma,
            'upper_band': ma + (std * entry_threshold),
            'lower_band': ma - (std * entry_threshold)
        }
    
    @staticmethod
    def bollinger_bands(prices, lookback=20, num_std=2):
        """
        Bollinger Band mean reversion
        """
        ma = prices.rolling(lookback).mean()
        std = prices.rolling(lookback).std()
        
        upper = ma + (std * num_std)
        lower = ma - (std * num_std)
        
        # Percent B indicator
        percent_b = (prices - lower) / (upper - lower)
        
        # Signals
        signal = pd.Series(0, index=prices.index)
        signal[percent_b < 0] = 1    # Below lower band, buy
        signal[percent_b > 1] = -1   # Above upper band, sell
        
        return {
            'signal': signal,
            'upper': upper,
            'lower': lower,
            'ma': ma,
            'percent_b': percent_b
        }
    
    @staticmethod
    def pairs_trading_cointegration(asset1, asset2, lookback=252, entry_z=2.0, exit_z=0.5):
        """
        Cointegration-based pairs trading
        
        Requires: statsmodels
        """
        from statsmodels.tsa.stattools import coint
        from statsmodels.regression.linear_model import OLS
        
        signals = pd.DataFrame(index=asset1.index)
        spread_series = pd.Series(index=asset1.index, dtype=float)
        zscore_series = pd.Series(index=asset1.index, dtype=float)
        
        for i in range(lookback, len(asset1)):
            # Rolling window
            window1 = asset1.iloc[i-lookback:i]
            window2 = asset2.iloc[i-lookback:i]
            
            # Test cointegration
            score, pvalue, _ = coint(window1, window2)
            
            if pvalue < 0.05:  # Cointegrated at 5% level
                # Estimate hedge ratio via OLS
                model = OLS(window1, window2).fit()
                hedge_ratio = model.params[0]
                
                # Calculate spread
                spread = asset1.iloc[i] - hedge_ratio * asset2.iloc[i]
                
                # Calculate z-score
                spread_mean = np.mean(window1 - hedge_ratio * window2)
                spread_std = np.std(window1 - hedge_ratio * window2)
                zscore = (spread - spread_mean) / spread_std
                
                spread_series.iloc[i] = spread
                zscore_series.iloc[i] = zscore
        
        # Generate trading signals
        signals['signal'] = 0
        signals.loc[zscore_series < -entry_z, 'signal'] = 1   # Long spread
        signals.loc[zscore_series > entry_z, 'signal'] = -1   # Short spread
        signals.loc[abs(zscore_series) < exit_z, 'signal'] = 0
        
        # Forward fill positions
        signals['signal'] = signals['signal'].replace(0, np.nan).fillna(method='ffill').fillna(0)
        
        return {
            'signal': signals['signal'],
            'spread': spread_series,
            'zscore': zscore_series
        }
```

### 3. Carry & Yield Strategies

```python
class CarryStrategies:
    """
    Carry-based strategies across asset classes
    """
    
    @staticmethod
    def fx_carry_trade(spot_rates, forward_rates, interest_rate_diff):
        """
        FX carry trade based on interest rate differential
        
        Long high-yield currencies, short low-yield currencies
        """
        # Carry return = Interest rate differential - Forward premium/discount
        forward_points = (forward_rates - spot_rates) / spot_rates
        carry = interest_rate_diff - forward_points
        
        # Rank by carry
        carry_rank = carry.rank(axis=1, ascending=False, pct=True)
        
        # Signal: Long top quartile, short bottom quartile
        signal = pd.DataFrame(0, index=carry.index, columns=carry.columns)
        signal[carry_rank > 0.75] = 1
        signal[carry_rank < 0.25] = -1
        
        return signal
    
    @staticmethod
    def bond_carry_roll_down(yields, durations, holding_period=30):
        """
        Bond carry and roll-down return
        
        Expected return from:
        1. Coupon yield
        2. Roll-down (curve doesn't shift)
        """
        # Approximate roll-down return
        # Assumes parallel shift of yield curve
        roll_down = yields.diff(-1) * durations * (holding_period / 252)
        
        # Total carry = yield + roll-down
        total_carry = yields + roll_down
        
        # Signal based on highest carry
        signal = (total_carry.rank(axis=1, pct=True) > 0.5).astype(int) * 2 - 1
        
        return signal
    
    @staticmethod
    def volatility_risk_premium(vix, realized_vol, lookback=20):
        """
        Sell volatility when implied > realized
        
        Captures volatility risk premium
        """
        # Calculate realized volatility
        returns = vix.pct_change()
        realized = returns.rolling(lookback).std() * np.sqrt(252)
        
        # VRP = Implied - Realized
        vrp = vix - realized
        
        # Signal: Negative when VRP high (sell vol), positive when low
        signal = np.where(vrp > vrp.rolling(60).mean(), -1, 1)
        
        return pd.Series(signal, index=vix.index)
```

### 4. Cross-Asset Relative Value

```python
class RelativeValueSignals:
    """
    Cross-asset relative value and arbitrage
    """
    
    @staticmethod
    def equity_credit_divergence(equity_prices, credit_spreads, lookback=60):
        """
        Trade divergence between equity and credit markets
        
        When credit spreads widen but equities rally: Fade equity rally
        When credit spreads tighten but equities sell: Buy equities
        """
        # Normalize both to z-scores
        equity_z = (equity_prices - equity_prices.rolling(lookback).mean()) / \
                   equity_prices.rolling(lookback).std()
        
        credit_z = (credit_spreads - credit_spreads.rolling(lookback).mean()) / \
                   credit_spreads.rolling(lookback).std()
        
        # Divergence signal
        # Credit widening (positive z) + Equity rallying (positive z) = Sell equities
        # Credit tightening (negative z) + Equity selling (negative z) = Buy equities
        
        divergence = equity_z - credit_z  # High divergence = warning
        
        signal = np.where(divergence > 1, -1,  # Equity expensive vs credit
                         np.where(divergence < -1, 1, 0))  # Equity cheap vs credit
        
        return {
            'signal': pd.Series(signal, index=equity_prices.index),
            'divergence': divergence,
            'equity_z': equity_z,
            'credit_z': credit_z
        }
    
    @staticmethod
    def gold_real_yields(gold_prices, real_yields, lookback=126):
        """
        Gold vs real yields relationship
        
        Gold typically inversely correlated with real yields
        """
        # Calculate correlation
        corr = gold_prices.pct_change().rolling(lookback).corr(
            real_yields.pct_change()
        )
        
        # Expected relationship: negative correlation
        # When real yields fall, gold should rise
        
        gold_returns = gold_prices.pct_change(21)  # 1-month
        yield_change = real_yields.diff(21)
        
        # Signal: Buy gold when real yields falling and below trend
        yield_ma = real_yields.rolling(lookback).mean()
        
        signal = np.where((yield_change < 0) & (real_yields < yield_ma), 1,
                         np.where((yield_change > 0) & (real_yields > yield_ma), -1, 0))
        
        return pd.Series(signal, index=gold_prices.index)
    
    @staticmethod
    def yield_curve_flatteners(short_rate, long_rate, lookback=252):
        """
        Trade yield curve shape changes
        
        Flattener: Short long-end, long short-end (expect curve to flatten)
        Steepener: Long long-end, short short-end (expect curve to steepen)
        """
        # Calculate spread
        spread = long_rate - short_rate
        
        # Z-score of spread
        spread_z = (spread - spread.rolling(lookback).mean()) / \
                   spread.rolling(lookback).std()
        
        # Momentum of spread
        spread_momentum = spread.diff(21)  # 1-month change
        
        # Signal
        # When spread very wide and momentum negative: Flattener
        # When spread very narrow and momentum positive: Steepener
        
        signal = np.where((spread_z > 1) & (spread_momentum < 0), -1,  # Flattener
                         np.where((spread_z < -1) & (spread_momentum > 0), 1, 0))  # Steepener
        
        return {
            'signal': pd.Series(signal, index=spread.index),
            'spread': spread,
            'spread_z': spread_z,
            'momentum': spread_momentum
        }
```

---

## CROSS-ASSET RELATIONSHIPS

### Lead-Lag Framework

```python
class LeadLagAnalysis:
    """
    Analyze and exploit lead-lag relationships between assets
    """
    
    @staticmethod
    def calculate_cross_correlation(leader, lagger, max_lag=20):
        """
        Calculate cross-correlation at different lags
        
        Returns which lag has highest correlation
        """
        correlations = {}
        
        for lag in range(max_lag + 1):
            if lag == 0:
                corr = leader.corr(lagger)
            else:
                corr = leader.corr(lagger.shift(lag))
            
            correlations[lag] = corr
        
        # Find optimal lag
        optimal_lag = max(correlations, key=correlations.get)
        
        return {
            'correlations': correlations,
            'optimal_lag': optimal_lag,
            'optimal_correlation': correlations[optimal_lag]
        }
    
    @staticmethod
    def granger_causality_test(leader, lagger, max_lag=5):
        """
        Test if leader Granger-causes lagger
        
        Requires: statsmodels
        """
        from statsmodels.tsa.stattools import grangercausalitytests
        
        # Combine into DataFrame
        data = pd.DataFrame({
            'lagger': lagger,
            'leader': leader
        }).dropna()
        
        # Run test
        results = grangercausalitytests(data[['lagger', 'leader']], max_lag)
        
        # Extract p-values
        p_values = {}
        for lag in range(1, max_lag + 1):
            p_values[lag] = results[lag][0]['ssr_ftest'][1]  # F-test p-value
        
        return p_values
    
    @staticmethod
    def create_lead_lag_signal(leader, lagger, optimal_lag, lookback=20):
        """
        Generate trading signals based on lead-lag relationship
        
        When leader moves, position in lagger expecting it to follow
        """
        # Calculate leader's signal (momentum)
        leader_signal = np.sign(leader.diff(1))
        
        # Shift by optimal lag to create lagger signal
        lagger_signal = leader_signal.shift(optimal_lag)
        
        # Only trade when leader signal is strong
        leader_momentum = leader.pct_change(lookback)
        leader_vol = leader.pct_change().rolling(lookback).std()
        leader_zscore = leader_momentum / leader_vol
        
        # Filter: only trade when leader momentum is significant
        final_signal = lagger_signal.copy()
        final_signal[abs(leader_zscore) < 1] = 0
        
        return final_signal

# Example: Copper leading Equities
"""
copper = yf.download('HG=F', period='2y')['Close']
spy = yf.download('SPY', period='2y')['Close']

analyzer = LeadLagAnalysis()
results = analyzer.calculate_cross_correlation(copper.pct_change(), spy.pct_change(), max_lag=20)

print(f"Optimal lag: {results['optimal_lag']} days")
print(f"Correlation: {results['optimal_correlation']:.3f}")

signal = analyzer.create_lead_lag_signal(copper, spy, optimal_lag=results['optimal_lag'])
"""
```

### Cross-Asset Confirmation System

```python
class CrossAssetConfirmation:
    """
    Validate trading signals using cross-asset coherence
    """
    
    def __init__(self):
        self.relationships = {
            'risk_on': {
                'VIX': 'down',
                'HY_spreads': 'down',
                'JPY': 'down',
                'AUD': 'up',
                'Equities': 'up'
            },
            'risk_off': {
                'VIX': 'up',
                'HY_spreads': 'up',
                'JPY': 'up',
                'AUD': 'down',
                'Equities': 'down'
            }
        }
    
    def check_coherence(self, asset_moves, expected_regime):
        """
        Check if observed asset moves align with expected regime
        
        Parameters:
        - asset_moves: dict of {asset: 'up'/'down'}
        - expected_regime: 'risk_on' or 'risk_off'
        
        Returns:
        - coherence_score: 0-1, higher = more coherent
        """
        expected = self.relationships[expected_regime]
        
        matches = 0
        total = 0
        
        for asset, expected_direction in expected.items():
            if asset in asset_moves:
                if asset_moves[asset] == expected_direction:
                    matches += 1
                total += 1
        
        coherence_score = matches / total if total > 0 else 0
        
        return coherence_score
    
    def generate_confidence_adjusted_signal(self, base_signal, coherence_score, 
                                           coherence_threshold=0.7):
        """
        Adjust position size based on cross-asset confirmation
        
        High coherence = full size
        Low coherence = reduced size or no trade
        """
        if coherence_score >= coherence_threshold:
            return base_signal  # Full confidence
        elif coherence_score >= 0.5:
            return base_signal * 0.5  # Reduced confidence
        else:
            return 0  # No trade, insufficient confirmation

# Usage example
"""
# Observe current market
current_moves = {
    'VIX': 'down',
    'HY_spreads': 'down',
    'JPY': 'down',
    'AUD': 'up',
    'Equities': 'up'
}

confirmer = CrossAssetConfirmation()
coherence = confirmer.check_coherence(current_moves, 'risk_on')
print(f"Coherence score: {coherence:.2f}")

# If your model generates a long equity signal
base_signal = 1.0  # Full long
adjusted_signal = confirmer.generate_confidence_adjusted_signal(base_signal, coherence)
print(f"Adjusted signal: {adjusted_signal}")
"""
```

---

## BACKTESTING FRAMEWORK

### Complete Backtesting Engine

```python
import pandas as pd
import numpy as np
from dataclasses import dataclass
from typing import Dict, List

@dataclass
class BacktestConfig:
    """Configuration for backtest"""
    initial_capital: float = 100000
    commission: float = 0.001  # 10 bps per trade
    slippage: float = 0.0005   # 5 bps slippage
    position_size_method: str = 'equal_weight'  # or 'vol_target', 'kelly'
    max_leverage: float = 1.0
    rebalance_frequency: str = 'daily'  # 'daily', 'weekly', 'monthly'

class Backtester:
    """
    Comprehensive backtesting engine for systematic strategies
    """
    
    def __init__(self, config: BacktestConfig):
        self.config = config
        self.trades = []
        self.equity_curve = []
        
    def run_backtest(self, signals, prices, **kwargs):
        """
        Run backtest on signal series
        
        Parameters:
        - signals: DataFrame with signals (-1, 0, 1) for each asset
        - prices: DataFrame with prices for each asset
        
        Returns:
        - results: Dictionary with performance metrics
        """
        # Initialize
        capital = self.config.initial_capital
        positions = pd.DataFrame(0, index=signals.index, columns=signals.columns)
        cash = pd.Series(capital, index=signals.index)
        portfolio_value = pd.Series(capital, index=signals.index)
        
        # Iterate through time
        for i in range(1, len(signals)):
            current_date = signals.index[i]
            prev_date = signals.index[i-1]
            
            # Current signals
            current_signals = signals.iloc[i]
            prev_positions = positions.iloc[i-1]
            
            # Calculate position changes
            trades_today = current_signals - prev_positions
            
            # Execute trades
            for asset in trades_today[trades_today != 0].index:
                trade_size = trades_today[asset]
                price = prices.loc[current_date, asset]
                
                # Calculate cost with commission and slippage
                trade_value = trade_size * price * (capital / len(signals.columns))
                cost = abs(trade_value) * (self.config.commission + self.config.slippage)
                
                # Update cash
                cash.iloc[i] = cash.iloc[i-1] - trade_value - cost
                
                # Record trade
                self.trades.append({
                    'date': current_date,
                    'asset': asset,
                    'size': trade_size,
                    'price': price,
                    'value': trade_value,
                    'cost': cost
                })
            
            # Update positions
            positions.iloc[i] = current_signals
            
            # Calculate portfolio value
            position_values = positions.iloc[i] * prices.iloc[i]
            portfolio_value.iloc[i] = cash.iloc[i] + position_values.sum()
        
        # Calculate metrics
        results = self._calculate_metrics(portfolio_value)
        results['equity_curve'] = portfolio_value
        results['positions'] = positions
        results['trades'] = pd.DataFrame(self.trades)
        
        return results
    
    def _calculate_metrics(self, equity_curve):
        """
        Calculate comprehensive performance metrics
        """
        returns = equity_curve.pct_change().dropna()
        
        # Core metrics
        total_return = (equity_curve.iloc[-1] / equity_curve.iloc[0]) - 1
        cagr = (1 + total_return) ** (252 / len(returns)) - 1
        
        # Risk metrics
        volatility = returns.std() * np.sqrt(252)
        sharpe = (cagr / volatility) if volatility > 0 else 0
        
        # Downside risk
        downside_returns = returns[returns < 0]
        downside_vol = downside_returns.std() * np.sqrt(252)
        sortino = (cagr / downside_vol) if downside_vol > 0 else 0
        
        # Drawdown
        cumulative = (1 + returns).cumprod()
        running_max = cumulative.expanding().max()
        drawdown = (cumulative - running_max) / running_max
        max_drawdown = drawdown.min()
        
        # Win rate
        win_rate = (returns > 0).sum() / len(returns)
        
        # Profit factor
        gross_profit = returns[returns > 0].sum()
        gross_loss = abs(returns[returns < 0].sum())
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else np.inf
        
        return {
            'total_return': total_return,
            'cagr': cagr,
            'volatility': volatility,
            'sharpe_ratio': sharpe,
            'sortino_ratio': sortino,
            'max_drawdown': max_drawdown,
            'win_rate': win_rate,
            'profit_factor': profit_factor,
            'num_trades': len(self.trades),
            'start_date': equity_curve.index[0],
            'end_date': equity_curve.index[-1]
        }
    
    def plot_results(self, results):
        """
        Plot equity curve and drawdown
        """
        import matplotlib.pyplot as plt
        
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 8))
        
        # Equity curve
        results['equity_curve'].plot(ax=ax1)
        ax1.set_title('Equity Curve')
        ax1.set_ylabel('Portfolio Value ($)')
        ax1.grid(True)
        
        # Drawdown
        returns = results['equity_curve'].pct_change()
        cumulative = (1 + returns).cumprod()
        running_max = cumulative.expanding().max()
        drawdown = (cumulative - running_max) / running_max
        
        drawdown.plot(ax=ax2, color='red')
        ax2.set_title('Drawdown')
        ax2.set_ylabel('Drawdown (%)')
        ax2.grid(True)
        
        plt.tight_layout()
        plt.show()
        
        # Print metrics
        print("\n" + "="*50)
        print("BACKTEST RESULTS")
        print("="*50)
        for key, value in results.items():
            if key not in ['equity_curve', 'positions', 'trades']:
                if isinstance(value, float):
                    print(f"{key}: {value:.4f}")
                else:
                    print(f"{key}: {value}")
        print("="*50)

# Usage Example
"""
config = BacktestConfig(
    initial_capital=100000,
    commission=0.001,
    slippage=0.0005
)

backtester = Backtester(config)

# Assume you have signals and prices DataFrames
results = backtester.run_backtest(signals, prices)
backtester.plot_results(results)
"""
```

### Walk-Forward Analysis

```python
class WalkForwardAnalysis:
    """
    Walk-forward optimization and testing
    """
    
    def __init__(self, train_period=252, test_period=63, step_size=21):
        """
        Parameters:
        - train_period: Days in training window (252 = 1 year)
        - test_period: Days in testing window (63 = 3 months)
        - step_size: Days to step forward (21 = 1 month)
        """
        self.train_period = train_period
        self.test_period = test_period
        self.step_size = step_size
        
    def run_walk_forward(self, data, strategy_func, param_grid):
        """
        Run walk-forward analysis
        
        Parameters:
        - data: Price/signal data
        - strategy_func: Function that takes data and params, returns signals
        - param_grid: Dictionary of parameters to optimize
        
        Returns:
        - oos_results: Out-of-sample performance
        - is_results: In-sample performance
        """
        oos_equity = []
        is_equity = []
        
        start_idx = self.train_period
        
        while start_idx + self.test_period < len(data):
            # Define windows
            train_start = start_idx - self.train_period
            train_end = start_idx
            test_start = start_idx
            test_end = start_idx + self.test_period
            
            # Get data windows
            train_data = data.iloc[train_start:train_end]
            test_data = data.iloc[test_start:test_end]
            
            # Optimize on training data
            best_params = self._optimize_params(
                train_data, strategy_func, param_grid
            )
            
            # Test on OOS data
            oos_signals = strategy_func(test_data, **best_params)
            
            # Record performance
            # (Implementation depends on strategy_func structure)
            
            # Step forward
            start_idx += self.step_size
        
        # Calculate walk-forward efficiency
        wfe = np.mean(oos_equity) / np.mean(is_equity) if is_equity else 0
        
        return {
            'oos_equity': oos_equity,
            'is_equity': is_equity,
            'wfe': wfe
        }
    
    def _optimize_params(self, data, strategy_func, param_grid):
        """
        Grid search optimization on training data
        """
        best_sharpe = -np.inf
        best_params = None
        
        # Generate all parameter combinations
        from itertools import product
        
        keys = param_grid.keys()
        values = param_grid.values()
        
        for combination in product(*values):
            params = dict(zip(keys, combination))
            
            # Run strategy with these parameters
            signals = strategy_func(data, **params)
            
            # Calculate Sharpe (simplified)
            returns = signals * data.pct_change()
            sharpe = returns.mean() / returns.std() * np.sqrt(252)
            
            if sharpe > best_sharpe:
                best_sharpe = sharpe
                best_params = params
        
        return best_params
```

---

## RISK MANAGEMENT & POSITION SIZING

### Volatility-Adjusted Position Sizing

```python
class PositionSizer:
    """
    Systematic position sizing methods
    """
    
    @staticmethod
    def equal_weight(capital, n_assets):
        """
        Simple equal weight allocation
        """
        return capital / n_assets
    
    @staticmethod
    def volatility_parity(capital, returns, target_vol=0.10):
        """
        Size positions inversely to volatility
        
        Each position contributes equal risk
        """
        # Calculate volatilities
        vols = returns.std() * np.sqrt(252)
        
        # Inverse volatility weights
        inv_vol = 1 / vols
        weights = inv_vol / inv_vol.sum()
        
        # Scale to target portfolio volatility
        portfolio_vol = np.sqrt((weights ** 2 * vols ** 2).sum())
        scale = target_vol / portfolio_vol
        
        position_sizes = weights * capital * scale
        
        return position_sizes
    
    @staticmethod
    def kelly_criterion(returns, win_rate=None, avg_win=None, avg_loss=None):
        """
        Kelly criterion for optimal bet sizing
        
        f* = (p * b - q) / b
        where:
        - p = probability of win
        - q = probability of loss
        - b = ratio of avg_win to avg_loss
        
        Note: Kelly can be aggressive; often use fractional Kelly (e.g., 0.5x)
        """
        if win_rate is None:
            win_rate = (returns > 0).sum() / len(returns)
        
        if avg_win is None:
            avg_win = returns[returns > 0].mean()
        
        if avg_loss is None:
            avg_loss = abs(returns[returns < 0].mean())
        
        if avg_loss == 0:
            return 0
        
        b = avg_win / avg_loss
        q = 1 - win_rate
        
        kelly_fraction = (win_rate * b - q) / b
        
        # Use half-Kelly for safety
        return max(0, kelly_fraction * 0.5)
    
    @staticmethod
    def risk_parity_with_correlation(capital, returns, target_risk=0.15):
        """
        Risk parity accounting for correlations
        
        More sophisticated than simple vol parity
        """
        # Calculate covariance matrix
        cov_matrix = returns.cov() * 252
        
        # Optimization to find risk parity weights
        from scipy.optimize import minimize
        
        n_assets = len(returns.columns)
        
        def risk_contribution(weights, cov_matrix):
            portfolio_var = np.dot(weights, np.dot(cov_matrix, weights))
            marginal_contrib = np.dot(cov_matrix, weights)
            risk_contrib = weights * marginal_contrib / np.sqrt(portfolio_var)
            return risk_contrib
        
        def objective(weights, cov_matrix):
            rc = risk_contribution(weights, cov_matrix)
            return np.sum((rc - rc.mean()) ** 2)
        
        constraints = ({'type': 'eq', 'fun': lambda x: np.sum(x) - 1})
        bounds = tuple((0, 1) for _ in range(n_assets))
        initial_guess = np.array([1/n_assets] * n_assets)
        
        result = minimize(
            objective,
            initial_guess,
            args=(cov_matrix,),
            method='SLSQP',
            bounds=bounds,
            constraints=constraints
        )
        
        weights = result.x
        position_sizes = weights * capital
        
        return position_sizes

class RiskManager:
    """
    Risk limits and position management
    """
    
    def __init__(self, max_position_size=0.2, max_sector_exposure=0.3,
                 max_drawdown=0.15, max_leverage=1.0):
        self.max_position_size = max_position_size
        self.max_sector_exposure = max_sector_exposure
        self.max_drawdown = max_drawdown
        self.max_leverage = max_leverage
        
    def check_position_limits(self, proposed_positions, capital):
        """
        Ensure positions comply with risk limits
        """
        # Check individual position sizes
        position_values = abs(proposed_positions)
        position_pcts = position_values / capital
        
        violations = []
        
        for asset, pct in position_pcts.items():
            if pct > self.max_position_size:
                violations.append(f"{asset}: {pct:.2%} exceeds max {self.max_position_size:.2%}")
        
        # Check total leverage
        gross_exposure = position_values.sum() / capital
        if gross_exposure > self.max_leverage:
            violations.append(f"Leverage {gross_exposure:.2f}x exceeds max {self.max_leverage:.2f}x")
        
        return violations
    
    def apply_position_scaling(self, proposed_positions, capital):
        """
        Scale down positions if they exceed limits
        """
        position_values = abs(proposed_positions)
        
        # Scale down individual positions
        for asset in proposed_positions.index:
            position_pct = position_values[asset] / capital
            if position_pct > self.max_position_size:
                scale = self.max_position_size / position_pct
                proposed_positions[asset] *= scale
        
        # Scale down if leverage too high
        gross_exposure = position_values.sum() / capital
        if gross_exposure > self.max_leverage:
            scale = self.max_leverage / gross_exposure
            proposed_positions *= scale
        
        return proposed_positions
    
    def calculate_stop_loss(self, entry_price, atr, atr_multiple=2.0):
        """
        ATR-based stop loss
        """
        stop_distance = atr * atr_multiple
        stop_long = entry_price - stop_distance
        stop_short = entry_price + stop_distance
        
        return {'long': stop_long, 'short': stop_short}
```

---

## MODEL VALIDATION CHECKLIST

### Pre-Deployment Validation

```python
class ModelValidator:
    """
    Comprehensive model validation before live deployment
    """
    
    def __init__(self, model_results, benchmark_results=None):
        self.results = model_results
        self.benchmark = benchmark_results
        
    def run_all_validations(self):
        """
        Run complete validation suite
        """
        print("="*60)
        print("MODEL VALIDATION REPORT")
        print("="*60)
        
        # 1. Performance Metrics
        print("\n1. PERFORMANCE METRICS")
        self._validate_performance()
        
        # 2. Statistical Tests
        print("\n2. STATISTICAL SIGNIFICANCE")
        self._validate_statistical_significance()
        
        # 3. Robustness Tests
        print("\n3. ROBUSTNESS CHECKS")
        self._validate_robustness()
        
        # 4. Risk Checks
        print("\n4. RISK METRICS")
        self._validate_risk_metrics()
        
        # 5. Red Flags
        print("\n5. RED FLAG CHECKS")
        self._check_red_flags()
        
        print("\n" + "="*60)
    
    def _validate_performance(self):
        """Check core performance metrics"""
        sharpe = self.results.get('sharpe_ratio', 0)
        cagr = self.results.get('cagr', 0)
        max_dd = self.results.get('max_drawdown', 0)
        
        print(f"  Sharpe Ratio: {sharpe:.2f} {'✓' if sharpe > 1.0 else '✗ (target > 1.0)'}")
        print(f"  CAGR: {cagr:.2%} {'✓' if cagr > 0.10 else '✗ (target > 10%)'}")
        print(f"  Max Drawdown: {max_dd:.2%} {'✓' if max_dd > -0.20 else '✗ (target > -20%)'}")
    
    def _validate_statistical_significance(self):
        """Test statistical significance of returns"""
        returns = self.results['equity_curve'].pct_change().dropna()
        
        # T-test: Are returns significantly different from zero?
        from scipy import stats
        t_stat, p_value = stats.ttest_1samp(returns, 0)
        
        print(f"  T-statistic: {t_stat:.2f}")
        print(f"  P-value: {p_value:.4f} {'✓' if p_value < 0.05 else '✗ (target < 0.05)'}")
        
        # Number of trades
        n_trades = self.results.get('num_trades', 0)
        print(f"  Number of trades: {n_trades} {'✓' if n_trades > 100 else '⚠ (low sample size)'}")
    
    def _validate_robustness(self):
        """Check robustness via Monte Carlo"""
        returns = self.results['equity_curve'].pct_change().dropna()
        
        # Bootstrap simulation
        n_simulations = 1000
        bootstrap_sharpes = []
        
        for _ in range(n_simulations):
            sample = returns.sample(n=len(returns), replace=True)
            sharpe = sample.mean() / sample.std() * np.sqrt(252)
            bootstrap_sharpes.append(sharpe)
        
        # 95% confidence interval
        ci_lower = np.percentile(bootstrap_sharpes, 2.5)
        ci_upper = np.percentile(bootstrap_sharpes, 97.5)
        
        print(f"  Sharpe 95% CI: [{ci_lower:.2f}, {ci_upper:.2f}]")
        print(f"  {'✓' if ci_lower > 0 else '✗'} Lower bound positive")
    
    def _validate_risk_metrics(self):
        """Validate risk-adjusted performance"""
        sortino = self.results.get('sortino_ratio', 0)
        calmar = self.results.get('cagr', 0) / abs(self.results.get('max_drawdown', 0.01))
        
        print(f"  Sortino Ratio: {sortino:.2f} {'✓' if sortino > 1.5 else '✗ (target > 1.5)'}")
        print(f"  Calmar Ratio: {calmar:.2f} {'✓' if calmar > 0.5 else '✗ (target > 0.5)'}")
    
    def _check_red_flags(self):
        """Check for common overfitting red flags"""
        sharpe = self.results.get('sharpe_ratio', 0)
        win_rate = self.results.get('win_rate', 0)
        profit_factor = self.results.get('profit_factor', 0)
        
        red_flags = []
        
        if sharpe > 3:
            red_flags.append("⚠ Sharpe > 3 (possible overfitting)")
        
        if win_rate > 0.70:
            red_flags.append("⚠ Win rate > 70% (suspicious)")
        
        if profit_factor > 5:
            red_flags.append("⚠ Profit factor > 5 (check curve fitting)")
        
        returns = self.results['equity_curve'].pct_change().dropna()
        losing_months = (returns.resample('M').sum() < 0).sum()
        total_months = len(returns.resample('M').sum())
        
        if losing_months == 0:
            red_flags.append("⚠ Zero losing months (likely overfit)")
        
        if len(red_flags) == 0:
            print("  ✓ No red flags detected")
        else:
            for flag in red_flags:
                print(f"  {flag}")

# Usage
"""
validator = ModelValidator(backtest_results)
validator.run_all_validations()
"""
```

### Walk-Forward Efficiency Test

```python
def calculate_wfe(is_results, oos_results):
    """
    Walk-Forward Efficiency
    
    WFE = OOS Performance / IS Performance
    
    Target: > 0.5 (OOS at least 50% of IS performance)
    Below 0.3 = severe overfitting
    """
    is_sharpe = is_results.get('sharpe_ratio', 0)
    oos_sharpe = oos_results.get('sharpe_ratio', 0)
    
    wfe = oos_sharpe / is_sharpe if is_sharpe != 0 else 0
    
    print(f"Walk-Forward Efficiency: {wfe:.2f}")
    
    if wfe > 0.5:
        print("✓ PASS: WFE > 0.5 (good generalization)")
    elif wfe > 0.3:
        print("⚠ WARNING: WFE between 0.3-0.5 (marginal)")
    else:
        print("✗ FAIL: WFE < 0.3 (severe overfitting)")
    
    return wfe
```

---

## PRODUCTION DEPLOYMENT

### Automated Trading System Template

```python
import schedule
import time
from datetime import datetime

class TradingSystem:
    """
    Production trading system with automated execution
    """
    
    def __init__(self, strategy, data_pipeline, broker_api):
        self.strategy = strategy
        self.data = data_pipeline
        self.broker = broker_api
        self.positions = {}
        self.log = []
        
    def run_daily_process(self):
        """
        Main daily execution routine
        """
        try:
            print(f"\n{'='*60}")
            print(f"Running trading system: {datetime.now()}")
            print(f"{'='*60}")
            
            # 1. Fetch latest data
            print("1. Fetching data...")
            market_data = self.data.fetch_all_data(
                start_date=datetime.now() - timedelta(days=365),
                end_date=datetime.now()
            )
            
            # 2. Calculate signals
            print("2. Calculating signals...")
            signals = self.strategy.generate_signals(market_data)
            
            # 3. Get current positions
            print("3. Checking current positions...")
            current_positions = self.broker.get_positions()
            
            # 4. Calculate required trades
            print("4. Calculating rebalancing trades...")
            trades = self._calculate_trades(signals, current_positions)
            
            # 5. Risk checks
            print("5. Running risk checks...")
            if self._risk_check_passed(trades):
                # 6. Execute trades
                print("6. Executing trades...")
                self._execute_trades(trades)
            else:
                print("⚠ Risk checks failed. No trades executed.")
            
            # 7. Log results
            print("7. Logging results...")
            self._log_activity(signals, trades)
            
            print("✓ Daily process completed successfully")
            
        except Exception as e:
            print(f"✗ Error in daily process: {str(e)}")
            self._alert_error(e)
    
    def _calculate_trades(self, target_signals, current_positions):
        """
        Calculate delta between target and current
        """
        trades = {}
        
        for asset in target_signals.index:
            target = target_signals[asset]
            current = current_positions.get(asset, 0)
            delta = target - current
            
            if abs(delta) > 0.01:  # Only trade if meaningful change
                trades[asset] = delta
        
        return trades
    
    def _risk_check_passed(self, trades):
        """
        Pre-trade risk validation
        """
        # Check position limits
        # Check drawdown limits
        # Check correlation limits
        # etc.
        
        # Simplified example
        total_exposure = sum(abs(v) for v in trades.values())
        
        return total_exposure < 1.0  # Example limit
    
    def _execute_trades(self, trades):
        """
        Send orders to broker
        """
        for asset, size in trades.items():
            try:
                if size > 0:
                    self.broker.buy(asset, abs(size))
                    print(f"  BUY {abs(size):.2f} {asset}")
                else:
                    self.broker.sell(asset, abs(size))
                    print(f"  SELL {abs(size):.2f} {asset}")
            except Exception as e:
                print(f"  ✗ Failed to execute {asset}: {str(e)}")
    
    def _log_activity(self, signals, trades):
        """
        Log all activity for audit trail
        """
        log_entry = {
            'timestamp': datetime.now(),
            'signals': signals.to_dict(),
            'trades': trades,
            'portfolio_value': self.broker.get_portfolio_value()
        }
        
        self.log.append(log_entry)
        
        # Save to file
        pd.DataFrame(self.log).to_csv(f'trading_log_{datetime.now().date()}.csv')
    
    def _alert_error(self, error):
        """
        Send alert on critical error
        """
        # Email/SMS/Slack notification
        print(f"🚨 ALERT: {str(error)}")
    
    def start_scheduler(self):
        """
        Start automated daily execution
        """
        # Schedule for market open (e.g., 9:35 AM ET)
        schedule.every().day.at("09:35").do(self.run_daily_process)
        
        print("Trading system started. Waiting for scheduled execution...")
        
        while True:
            schedule.run_pending()
            time.sleep(60)  # Check every minute

# Usage
"""
strategy = MyTradingStrategy()
data_pipeline = MacroDataPipeline(fred_api_key='KEY')
broker = BrokerAPI()  # Your broker's API

system = TradingSystem(strategy, data_pipeline, broker)
system.start_scheduler()
"""
```

### Monitoring Dashboard

```python
class PerformanceMonitor:
    """
    Real-time performance monitoring
    """
    
    def __init__(self, live_results_path):
        self.results_path = live_results_path
        
    def generate_dashboard(self):
        """
        Create monitoring dashboard
        """
        import matplotlib.pyplot as plt
        from matplotlib.gridspec import GridSpec
        
        # Load live results
        results = pd.read_csv(self.results_path)
        
        fig = plt.figure(figsize=(15, 10))
        gs = GridSpec(3, 2, figure=fig)
        
        # Equity curve
        ax1 = fig.add_subplot(gs[0, :])
        results['portfolio_value'].plot(ax=ax1)
        ax1.set_title('Live Performance: Equity Curve')
        ax1.set_ylabel('Portfolio Value ($)')
        ax1.grid(True)
        
        # Drawdown
        ax2 = fig.add_subplot(gs[1, 0])
        returns = results['portfolio_value'].pct_change()
        cumulative = (1 + returns).cumprod()
        running_max = cumulative.expanding().max()
        drawdown = (cumulative - running_max) / running_max
        drawdown.plot(ax=ax2, color='red')
        ax2.set_title('Current Drawdown')
        ax2.grid(True)
        
        # Rolling Sharpe
        ax3 = fig.add_subplot(gs[1, 1])
        rolling_sharpe = (
            returns.rolling(60).mean() / 
            returns.rolling(60).std() * 
            np.sqrt(252)
        )
        rolling_sharpe.plot(ax=ax3)
        ax3.axhline(y=1.0, color='r', linestyle='--', label='Target')
        ax3.set_title('60-Day Rolling Sharpe')
        ax3.legend()
        ax3.grid(True)
        
        # Monthly returns heatmap
        ax4 = fig.add_subplot(gs[2, :])
        monthly_returns = returns.resample('M').sum()
        # Create heatmap of monthly returns by year
        
        plt.tight_layout()
        plt.savefig('dashboard.png')
        print("Dashboard saved to dashboard.png")

# Usage
"""
monitor = PerformanceMonitor('live_results.csv')
monitor.generate_dashboard()
"""
```

---

## QUICK REFERENCE TABLES

### Key Economic Indicators

| Indicator | FRED Code | Frequency | Signal |
|-----------|-----------|-----------|--------|
| ISM Manufacturing | NAPM | Monthly | Growth momentum |
| ISM Services | NMFSI | Monthly | Growth momentum |
| Core CPI | CPILFESL | Monthly | Inflation |
| Core PCE | PCEPILFE | Monthly | Fed's inflation gauge |
| Initial Claims | ICSA | Weekly | Labor market |
| Nonfarm Payrolls | PAYEMS | Monthly | Employment |
| Fed Balance Sheet | WALCL | Weekly | Liquidity |
| HY Credit Spread | BAMLH0A0HYM2 | Daily | Credit risk |
| VIX | VIXCLS | Daily | Equity volatility |
| 10Y-2Y Spread | T10Y2Y | Daily | Recession signal |

### Regime Asset Performance (Historical Averages)

| Asset | Goldilocks | Reflation | Stagflation | Deflation |
|-------|------------|-----------|-------------|-----------|
| Equities | +15% | +8% | -4% | -12% |
| Bonds (10Y) | +4% | -2% | -2% | +11% |
| Commodities | +1% | +19% | +12% | -16% |
| Gold | -2% | +9% | +21% | +6% |
| USD | -3% | +1% | +2% | +7% |

### Signal Type Characteristics

| Strategy Type | Best Conditions | Typical Holding Period | Win Rate | Sharpe Target |
|---------------|----------------|------------------------|----------|---------------|
| Momentum | Trending markets | 3-12 months | 45-55% | 0.8-1.2 |
| Mean Reversion | Range-bound | Days-weeks | 60-70% | 1.0-1.5 |
| Carry | Low volatility | Hold continuous | 70-80% | 0.5-0.8 |
| Stat Arb | Normal markets | Hours-days | 55-65% | 1.5-2.5 |

### Risk Metric Targets

| Metric | Good | Excellent | Red Flag |
|--------|------|-----------|----------|
| Sharpe Ratio | > 1.0 | > 2.0 | > 3.0 (overfit?) |
| Sortino Ratio | > 1.5 | > 2.5 | N/A |
| Calmar Ratio | > 0.5 | > 1.0 | N/A |
| Max Drawdown | < -20% | < -15% | < -30% |
| Win Rate | 50-60% | 60-70% | > 75% (overfit?) |
| Profit Factor | > 1.5 | > 2.0 | > 5.0 (overfit?) |

### Validation Checklist

- [ ] Economic rationale documented
- [ ] In-sample Sharpe > 1.0
- [ ] Out-of-sample Sharpe > 0.5
- [ ] Walk-forward efficiency > 0.5
- [ ] Statistical significance (p < 0.05)
- [ ] 100+ trades in backtest
- [ ] Max drawdown < -20%
- [ ] No red flags (Sharpe < 3, Win Rate < 75%)
- [ ] Tested on crisis periods (2008, 2020)
- [ ] Transaction costs modeled
- [ ] Slippage assumptions realistic
- [ ] Position sizing rules defined
- [ ] Risk limits programmed
- [ ] Paper trading completed (3+ months)
- [ ] Live deployment plan documented

---

## FINAL NOTES

### Critical Principles for Model Building

1. **Edge Must Have Economic Rationale**: If you can't explain WHY it should work, it probably won't persist.

2. **Shorter Horizons = More Noise**: SNR improves with holding period. Daily trading is hardest, monthly is easier.

3. **Most Strategies Fail**: The edge is discovering failure cheaply through systematic testing BEFORE risking capital.

4. **Validation is Non-Negotiable**: In-sample → Out-of-sample → Walk-forward → Paper trade → Live (small) → Scale

5. **Transaction Costs Matter**: 10 bps round-trip × 100 trades/year = 10% drag. Model this accurately.

6. **Regime Awareness**: No strategy works in all regimes. Know when your edge applies.

7. **Cross-Asset Confirmation**: Don't trade equities without checking bonds, credit, FX. Information flows through the capital structure.

8. **Position Sizing = Risk Management**: Even profitable strategies blow up with improper sizing.

9. **Correlation Shifts in Stress**: Diversification fails when you need it most. Plan for correlations → 1.

10. **Patience is the Retail Edge**: You have no redemption risk, no career risk, no benchmark constraints. Use it.

### Common Pitfalls to Avoid

- **Overfitting**: Optimizing on the same data you test on
- **Lookahead Bias**: Using information not available at decision time
- **Survivorship Bias**: Only including assets that survived (delisted stocks disappear)
- **Cherry-Picking**: Only showing results from favorable periods
- **Ignoring Costs**: Real trading has commissions, slippage, market impact
- **Parameter Sensitivity**: Strategy only works with specific parameters = fragile
- **Curve-Fitting**: Too many parameters relative to data points
- **Regime Blindness**: Not understanding when the strategy should/shouldn't work

### Where to Go Next

**Data Infrastructure:**
1. Set up FRED API access (free)
2. Build automated data pipeline
3. Create database for historical data
4. Set up daily update scripts

**Strategy Development:**
1. Start with one regime (e.g., Goldilocks)
2. Build one signal type (e.g., momentum)
3. Backtest rigorously
4. Validate out-of-sample
5. Paper trade before live

**Skill Building:**
1. Study correlation matrices across regimes
2. Analyze historical regime transitions
3. Build lead-lag analysis toolkit
4. Master walk-forward testing
5. Learn cross-asset relationships

**Community & Resources:**
- FRED (data): research.stlouisfed.org
- QuantConnect (backtesting platform)
- Quantopian forums (archived wisdom)
- Academic papers on SSRN
- Twitter #FinTwit (curate carefully)

---

## DOCUMENT USAGE GUIDELINES

**When building a new model:**
1. Reference [Regime Detection Implementation](#regime-detection-implementation) first
2. Choose signal type from [Core Signal Types](#core-signal-types--code)
3. Use [Backtesting Framework](#backtesting-framework) for testing
4. Apply [Model Validation Checklist](#model-validation-checklist) before deployment
5. Reference [Cross-Asset Relationships](#cross-asset-relationships) for confirmation

**When debugging a strategy:**
1. Check [Quick Reference Tables](#quick-reference-tables) for expected metrics
2. Run [Model Validation](#model-validation-checklist) to identify issues
3. Review [Common Pitfalls](#common-pitfalls-to-avoid)

**When deploying to production:**
1. Follow [Production Deployment](#production-deployment) template
2. Set up [Monitoring Dashboard](#monitoring-dashboard)
3. Implement all risk checks from [Risk Management](#risk-management--position-sizing)

This document is meant to be iterative. Update it as you build, test, and learn from your models. The frameworks provided are starting points—customize them for your specific strategies and markets.

Good luck building systematic trading strategies. Remember: **most strategies fail, and that's expected. The edge is discovering failure before it costs real capital.**
