#!/usr/bin/env python3
"""
Multi-Timeframe Regime Classifier
Analyzes 1m, 5m, 15m, 30m, 4h regimes using HMM + technical indicators

Classifies regimes as:
- BULL TREND: Strong upward momentum
- BEAR TREND: Strong downward momentum  
- BULL CHOP: Bullish but choppy/ranging
- BEAR CHOP: Bearish but choppy/ranging
- NEUTRAL: No clear direction

Usage: python regime_classifier_mtf.py [gold|nq]
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.patches import Rectangle
import seaborn as sns
from pathlib import Path
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

# Optional: HMM for regime detection
try:
    from hmmlearn import hmm
    HAS_HMM = True
except ImportError:
    HAS_HMM = False
    print("Warning: hmmlearn not installed. Using fallback regime detection.")
    print("Install with: pip install hmmlearn")

# Set style
sns.set_style("darkgrid")
plt.rcParams['figure.facecolor'] = '#0a0e27'
plt.rcParams['axes.facecolor'] = '#1a1f3a'
plt.rcParams['axes.edgecolor'] = '#374151'
plt.rcParams['text.color'] = '#e0e6ed'
plt.rcParams['axes.labelcolor'] = '#e0e6ed'
plt.rcParams['xtick.color'] = '#9ca3af'
plt.rcParams['ytick.color'] = '#9ca3af'
plt.rcParams['grid.color'] = '#374151'
plt.rcParams['grid.alpha'] = 0.3

# ============================================================================
# CONFIG
# ============================================================================
INSTRUMENT = 'gold'  # 'gold' or 'nq'
M1_DATA_DIR = Path('VolRangeForecaster/data/m1')
LOOKBACK_DAYS = 30  # How many days to analyze
TIMEFRAMES = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '30m': 30,
    '4h': 240
}

# Regime colors
REGIME_COLORS = {
    'BULL_TREND': '#10b981',    # Green
    'BEAR_TREND': '#ef4444',    # Red
    'BULL_CHOP': '#60a5fa',     # Light blue
    'BEAR_CHOP': '#f59e0b',     # Orange
    'NEUTRAL': '#9ca3af'        # Gray
}

# ============================================================================
# LOAD M1 DATA
# ============================================================================
def load_m1_data(instrument):
    """Load M1 parquet data"""
    parquet_file = M1_DATA_DIR / f'{instrument}_m1.parquet'
    
    if not parquet_file.exists():
        raise FileNotFoundError(f"M1 data not found: {parquet_file}")
    
    print(f"Loading M1 data from {parquet_file}...")
    df = pd.read_parquet(parquet_file)
    
    # Debug: print columns
    print(f"Columns in parquet: {df.columns.tolist()}")
    
    # Ensure datetime column
    if 'datetime' not in df.columns:
        df = df.reset_index()
    
    # Check again after reset_index
    if 'datetime' not in df.columns:
        # Try common alternatives
        if 'time' in df.columns:
            df['datetime'] = df['time']
        elif 'timestamp' in df.columns:
            df['datetime'] = df['timestamp']
        elif df.index.name in ['datetime', 'time', 'timestamp']:
            df['datetime'] = df.index
        else:
            # Use index as datetime
            df['datetime'] = df.index
    
    df['datetime'] = pd.to_datetime(df['datetime'])
    df = df.sort_values('datetime')
    
    # Filter to recent data
    cutoff = datetime.now() - timedelta(days=LOOKBACK_DAYS)
    df = df[df['datetime'] >= cutoff].copy()
    
    print(f"Loaded {len(df):,} M1 bars ({df['datetime'].min()} to {df['datetime'].max()})")
    return df

# ============================================================================
# RESAMPLE TO HIGHER TIMEFRAMES
# ============================================================================
def resample_bars(df, minutes):
    """Resample M1 to higher timeframe"""
    df_resampled = df.set_index('datetime').resample(f'{minutes}min').agg({
        'open': 'first',
        'high': 'max',
        'low': 'min',
        'close': 'last',
        'volume': 'sum' if 'volume' in df.columns else 'count'
    }).dropna()
    
    return df_resampled.reset_index()

# ============================================================================
# TECHNICAL INDICATORS
# ============================================================================
def compute_returns(df):
    """Compute log returns"""
    df['returns'] = np.log(df['close'] / df['close'].shift(1))
    return df

def compute_ema(series, span):
    """Compute EMA"""
    return series.ewm(span=span, adjust=False).mean()

def compute_atr(df, period=14):
    """Compute Average True Range"""
    high_low = df['high'] - df['low']
    high_close = np.abs(df['high'] - df['close'].shift())
    low_close = np.abs(df['low'] - df['close'].shift())
    
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    atr = tr.rolling(window=period).mean()
    
    return atr

def compute_adx(df, period=14):
    """Compute Average Directional Index (trend strength)"""
    # +DM and -DM
    high_diff = df['high'].diff()
    low_diff = -df['low'].diff()
    
    plus_dm = np.where((high_diff > low_diff) & (high_diff > 0), high_diff, 0)
    minus_dm = np.where((low_diff > high_diff) & (low_diff > 0), low_diff, 0)
    
    # True Range
    tr = compute_atr(df, period=1)
    
    # Smoothed +DI and -DI
    plus_di = 100 * pd.Series(plus_dm).rolling(period).sum() / tr.rolling(period).sum()
    minus_di = 100 * pd.Series(minus_dm).rolling(period).sum() / tr.rolling(period).sum()
    
    # DX and ADX
    dx = 100 * np.abs(plus_di - minus_di) / (plus_di + minus_di)
    adx = dx.rolling(period).mean()
    
    return adx, plus_di, minus_di

def compute_rsi(series, period=14):
    """Compute RSI"""
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    
    rs = gain / loss
    rsi = 100 - (100 / (1 + rs))
    
    return rsi

def compute_slope(series, period=20):
    """Compute linear regression slope"""
    slopes = []
    for i in range(len(series)):
        if i < period:
            slopes.append(0)
        else:
            y = series.iloc[i-period:i].values
            x = np.arange(period)
            slope = np.polyfit(x, y, 1)[0]
            slopes.append(slope)
    
    return pd.Series(slopes, index=series.index)

def compute_volatility(df, period=20):
    """Compute rolling volatility"""
    returns = df['returns']
    vol = returns.rolling(window=period).std() * np.sqrt(252 * 1440 / TIMEFRAMES[df.attrs.get('timeframe', '1m')])
    return vol

# ============================================================================
# REGIME FEATURES
# ============================================================================
def compute_regime_features(df, timeframe):
    """Compute all features for regime classification"""
    df.attrs['timeframe'] = timeframe
    
    # Returns
    df = compute_returns(df)
    
    # Trend indicators
    df['ema_fast'] = compute_ema(df['close'], span=10)
    df['ema_slow'] = compute_ema(df['close'], span=30)
    df['ema_diff'] = (df['ema_fast'] - df['ema_slow']) / df['close']
    
    # Slope
    df['slope'] = compute_slope(df['close'], period=20)
    df['slope_norm'] = df['slope'] / df['close']
    
    # ADX (trend strength)
    df['adx'], df['plus_di'], df['minus_di'] = compute_adx(df, period=14)
    
    # RSI
    df['rsi'] = compute_rsi(df['close'], period=14)
    
    # Volatility
    df['volatility'] = compute_volatility(df, period=20)
    
    # ATR
    df['atr'] = compute_atr(df, period=14)
    df['atr_pct'] = df['atr'] / df['close']
    
    # Momentum
    df['momentum'] = df['close'].pct_change(periods=10)
    
    # Fill NaN values instead of dropping (pandas 2.0+ syntax)
    df = df.bfill().ffill().fillna(0)
    
    return df

# ============================================================================
# HMM REGIME DETECTION
# ============================================================================
def detect_regimes_hmm(df):
    """Use Hidden Markov Model to detect regimes"""
    if not HAS_HMM:
        return detect_regimes_fallback(df)
    
    # Check if we have enough data
    if len(df) < 50:
        print(f"  Warning: Only {len(df)} bars after feature computation. Using fallback.")
        return detect_regimes_fallback(df)
    
    # Features for HMM - fill NaN with 0
    feature_cols = ['returns', 'ema_diff', 'slope_norm', 'adx', 'volatility']
    
    # Check which columns exist and have data
    available_cols = [col for col in feature_cols if col in df.columns and df[col].notna().sum() > 0]
    
    if len(available_cols) < 3:
        print(f"  Warning: Insufficient feature columns. Using fallback.")
        return detect_regimes_fallback(df)
    
    features = df[available_cols].fillna(0).values
    
    # Normalize features
    from sklearn.preprocessing import StandardScaler
    scaler = StandardScaler()
    features_scaled = scaler.fit_transform(features)
    
    # Fit HMM with 5 states
    model = hmm.GaussianHMM(n_components=5, covariance_type="full", n_iter=100, random_state=42)
    model.fit(features_scaled)
    
    # Predict states
    states = model.predict(features_scaled)
    
    # Map states to regimes based on mean returns and volatility
    state_stats = []
    for state in range(5):
        mask = states == state
        mean_return = df.loc[mask, 'returns'].mean()
        mean_vol = df.loc[mask, 'volatility'].mean()
        mean_adx = df.loc[mask, 'adx'].mean()
        
        state_stats.append({
            'state': state,
            'mean_return': mean_return,
            'mean_vol': mean_vol,
            'mean_adx': mean_adx
        })
    
    state_stats = sorted(state_stats, key=lambda x: x['mean_return'])
    
    # Map states to regime labels
    regime_map = {}
    for i, stats in enumerate(state_stats):
        state = stats['state']
        mean_return = stats['mean_return']
        mean_adx = stats['mean_adx']
        
        if i == 0:  # Most bearish
            regime_map[state] = 'BEAR_TREND' if mean_adx > 25 else 'BEAR_CHOP'
        elif i == 1:
            regime_map[state] = 'BEAR_CHOP'
        elif i == 2:  # Neutral
            regime_map[state] = 'NEUTRAL'
        elif i == 3:
            regime_map[state] = 'BULL_CHOP'
        else:  # Most bullish
            regime_map[state] = 'BULL_TREND' if mean_adx > 25 else 'BULL_CHOP'
    
    df['regime'] = [regime_map[s] for s in states]
    
    return df

# ============================================================================
# FALLBACK REGIME DETECTION (NO HMM)
# ============================================================================
def detect_regimes_fallback(df):
    """Rule-based regime detection (fallback when HMM not available)"""
    regimes = []
    
    for idx, row in df.iterrows():
        ema_diff = row['ema_diff']
        adx = row['adx']
        slope = row['slope_norm']
        rsi = row['rsi']
        
        # Strong trend conditions
        is_strong_trend = adx > 25
        is_bullish = ema_diff > 0 and slope > 0
        is_bearish = ema_diff < 0 and slope < 0
        
        # Classify regime
        if is_strong_trend:
            if is_bullish:
                regime = 'BULL_TREND'
            elif is_bearish:
                regime = 'BEAR_TREND'
            else:
                regime = 'NEUTRAL'
        else:
            # Choppy/ranging
            if ema_diff > 0.001:
                regime = 'BULL_CHOP'
            elif ema_diff < -0.001:
                regime = 'BEAR_CHOP'
            else:
                regime = 'NEUTRAL'
        
        regimes.append(regime)
    
    df['regime'] = regimes
    return df

# ============================================================================
# REGIME TRANSITIONS
# ============================================================================
def detect_regime_transitions(df):
    """Detect when regime changes"""
    df['regime_changed'] = df['regime'] != df['regime'].shift(1)
    df['regime_duration'] = 0
    
    duration = 0
    for idx in range(len(df)):
        if df.iloc[idx]['regime_changed']:
            duration = 1
        else:
            duration += 1
        df.iloc[idx, df.columns.get_loc('regime_duration')] = duration
    
    return df

# ============================================================================
# VISUALIZATION
# ============================================================================
def plot_regime_chart(df_dict, instrument):
    """Create comprehensive multi-timeframe regime visualization"""
    n_timeframes = len(df_dict)
    fig = plt.figure(figsize=(20, 4 * n_timeframes))
    
    for idx, (tf, df) in enumerate(df_dict.items(), 1):
        ax = plt.subplot(n_timeframes, 1, idx)
        
        # Plot price
        ax.plot(df['datetime'], df['close'], color='#e0e6ed', linewidth=1.5, alpha=0.8, label='Close')
        
        # Plot EMAs
        ax.plot(df['datetime'], df['ema_fast'], color='#60a5fa', linewidth=1, alpha=0.6, linestyle='--', label='EMA Fast')
        ax.plot(df['datetime'], df['ema_slow'], color='#f59e0b', linewidth=1, alpha=0.6, linestyle='--', label='EMA Slow')
        
        # Shade regime backgrounds
        current_regime = None
        regime_start = None
        
        for i, row in df.iterrows():
            if row['regime'] != current_regime:
                # End previous regime
                if current_regime is not None and regime_start is not None:
                    ax.axvspan(regime_start, row['datetime'], 
                              alpha=0.15, color=REGIME_COLORS[current_regime])
                
                # Start new regime
                current_regime = row['regime']
                regime_start = row['datetime']
        
        # End final regime
        if current_regime is not None and regime_start is not None:
            ax.axvspan(regime_start, df.iloc[-1]['datetime'], 
                      alpha=0.15, color=REGIME_COLORS[current_regime])
        
        # Mark regime transitions
        transitions = df[df['regime_changed'] == True]
        for _, trans in transitions.iterrows():
            ax.axvline(x=trans['datetime'], color='#9ca3af', linestyle=':', linewidth=1, alpha=0.5)
            
            # Add regime label
            y_pos = trans['close']
            regime_label = trans['regime'].replace('_', '\n')
            ax.text(trans['datetime'], y_pos, regime_label,
                   fontsize=8, ha='left', va='bottom',
                   bbox=dict(boxstyle='round,pad=0.3', facecolor=REGIME_COLORS[trans['regime']], 
                            alpha=0.7, edgecolor='none'),
                   color='white', fontweight='bold')
        
        # Formatting
        ax.set_title(f'{instrument.upper()} — {tf} Timeframe Regime Classification', 
                    fontsize=12, fontweight='bold', color='#60a5fa', pad=10)
        ax.set_ylabel('Price', fontsize=10)
        ax.legend(loc='upper left', framealpha=0.9, fontsize=8)
        ax.grid(True, alpha=0.3)
        
        # Format x-axis
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
        ax.xaxis.set_major_locator(mdates.DayLocator(interval=max(1, LOOKBACK_DAYS // 10)))
        plt.setp(ax.xaxis.get_majorticklabels(), rotation=45, ha='right')
        
        if idx == n_timeframes:
            ax.set_xlabel('Date', fontsize=10)
    
    plt.tight_layout()
    
    # Save
    output_file = f'regime_classifier_{instrument}_mtf.png'
    plt.savefig(output_file, dpi=150, bbox_inches='tight', facecolor='#0a0e27')
    print(f"\nVisualization saved to: {output_file}")
    
    plt.show()

def plot_regime_statistics(df_dict, instrument):
    """Plot regime statistics across timeframes"""
    fig, axes = plt.subplots(2, 2, figsize=(16, 10))
    fig.suptitle(f'{instrument.upper()} — Regime Statistics', 
                fontsize=16, fontweight='bold', color='#60a5fa', y=0.995)
    
    # 1. Regime distribution by timeframe
    ax1 = axes[0, 0]
    regime_counts = {}
    for tf, df in df_dict.items():
        counts = df['regime'].value_counts()
        regime_counts[tf] = counts
    
    regime_df = pd.DataFrame(regime_counts).fillna(0).T
    regime_df.plot(kind='bar', stacked=True, ax=ax1, 
                  color=[REGIME_COLORS.get(col, '#9ca3af') for col in regime_df.columns],
                  alpha=0.8, edgecolor='#374151', linewidth=1)
    ax1.set_title('Regime Distribution by Timeframe', fontsize=12, fontweight='bold', color='#60a5fa')
    ax1.set_xlabel('Timeframe', fontsize=10)
    ax1.set_ylabel('Bar Count', fontsize=10)
    ax1.legend(title='Regime', loc='upper right', framealpha=0.9, fontsize=8)
    ax1.grid(True, alpha=0.3, axis='y')
    plt.setp(ax1.xaxis.get_majorticklabels(), rotation=0)
    
    # 2. Average regime duration
    ax2 = axes[0, 1]
    avg_durations = {}
    for tf, df in df_dict.items():
        transitions = df[df['regime_changed'] == True]
        if len(transitions) > 1:
            durations = []
            for i in range(len(transitions) - 1):
                duration = (transitions.iloc[i+1]['datetime'] - transitions.iloc[i]['datetime']).total_seconds() / 60
                durations.append(duration)
            avg_durations[tf] = np.mean(durations) if durations else 0
        else:
            avg_durations[tf] = 0
    
    tfs = list(avg_durations.keys())
    durs = list(avg_durations.values())
    ax2.bar(tfs, durs, color='#60a5fa', alpha=0.8, edgecolor='#374151', linewidth=1.5)
    ax2.set_title('Average Regime Duration', fontsize=12, fontweight='bold', color='#60a5fa')
    ax2.set_xlabel('Timeframe', fontsize=10)
    ax2.set_ylabel('Duration (minutes)', fontsize=10)
    ax2.grid(True, alpha=0.3, axis='y')
    
    # Add value labels
    for i, (tf, dur) in enumerate(zip(tfs, durs)):
        ax2.text(i, dur, f'{dur:.0f}m', ha='center', va='bottom', 
                fontsize=9, fontweight='bold', color='#e0e6ed')
    
    # 3. Regime transition matrix (1m timeframe)
    ax3 = axes[1, 0]
    df_1m = df_dict.get('1m', df_dict[list(df_dict.keys())[0]])
    
    regimes = df_1m['regime'].values
    transitions_matrix = pd.DataFrame(0, 
                                     index=list(REGIME_COLORS.keys()),
                                     columns=list(REGIME_COLORS.keys()))
    
    for i in range(len(regimes) - 1):
        from_regime = regimes[i]
        to_regime = regimes[i + 1]
        if from_regime in transitions_matrix.index and to_regime in transitions_matrix.columns:
            transitions_matrix.loc[from_regime, to_regime] += 1
    
    # Normalize
    transitions_matrix = transitions_matrix.div(transitions_matrix.sum(axis=1), axis=0).fillna(0)
    
    sns.heatmap(transitions_matrix, annot=True, fmt='.2f', cmap='YlOrRd', 
               ax=ax3, cbar_kws={'label': 'Probability'}, 
               linewidths=1, linecolor='#374151')
    ax3.set_title('Regime Transition Matrix (1m)', fontsize=12, fontweight='bold', color='#60a5fa')
    ax3.set_xlabel('To Regime', fontsize=10)
    ax3.set_ylabel('From Regime', fontsize=10)
    
    # 4. Returns by regime (1m timeframe)
    ax4 = axes[1, 1]
    regime_returns = {}
    for regime in REGIME_COLORS.keys():
        mask = df_1m['regime'] == regime
        if mask.sum() > 0:
            regime_returns[regime] = df_1m.loc[mask, 'returns'].mean() * 100
    
    regimes_list = list(regime_returns.keys())
    returns_list = list(regime_returns.values())
    colors_list = [REGIME_COLORS[r] for r in regimes_list]
    
    bars = ax4.bar(regimes_list, returns_list, color=colors_list, alpha=0.8, 
                  edgecolor='#374151', linewidth=1.5)
    ax4.set_title('Average Returns by Regime (1m)', fontsize=12, fontweight='bold', color='#60a5fa')
    ax4.set_ylabel('Average Return (%)', fontsize=10)
    ax4.axhline(y=0, color='#9ca3af', linestyle='--', linewidth=1, alpha=0.5)
    ax4.grid(True, alpha=0.3, axis='y')
    plt.setp(ax4.xaxis.get_majorticklabels(), rotation=45, ha='right')
    
    # Add value labels
    for bar, ret in zip(bars, returns_list):
        height = bar.get_height()
        ax4.text(bar.get_x() + bar.get_width()/2., height,
                f'{ret:.4f}%',
                ha='center', va='bottom' if height >= 0 else 'top',
                fontsize=9, fontweight='bold', color='#e0e6ed')
    
    plt.tight_layout()
    
    # Save
    output_file = f'regime_statistics_{instrument}_mtf.png'
    plt.savefig(output_file, dpi=150, bbox_inches='tight', facecolor='#0a0e27')
    print(f"Statistics saved to: {output_file}")
    
    plt.show()

# ============================================================================
# MAIN
# ============================================================================
def main():
    import sys
    
    global INSTRUMENT
    if len(sys.argv) > 1:
        INSTRUMENT = sys.argv[1].lower()
    
    if INSTRUMENT not in ['gold', 'nq']:
        print(f"Invalid instrument: {INSTRUMENT}")
        print("Usage: python regime_classifier_mtf.py [gold|nq]")
        return
    
    print("=" * 80)
    print("MULTI-TIMEFRAME REGIME CLASSIFIER")
    print("=" * 80)
    print(f"Instrument: {INSTRUMENT.upper()}")
    print(f"Lookback: {LOOKBACK_DAYS} days")
    print(f"Timeframes: {', '.join(TIMEFRAMES.keys())}")
    print("=" * 80)
    
    # Load M1 data
    df_m1 = load_m1_data(INSTRUMENT)
    
    # Process each timeframe
    df_dict = {}
    
    for tf, minutes in TIMEFRAMES.items():
        print(f"\nProcessing {tf} timeframe...")
        
        if minutes == 1:
            df_tf = df_m1.copy()
        else:
            df_tf = resample_bars(df_m1, minutes)
        
        print(f"  {len(df_tf)} bars")
        
        # Compute features
        df_tf = compute_regime_features(df_tf, tf)
        print(f"  Features computed")
        
        # Detect regimes
        df_tf = detect_regimes_hmm(df_tf)
        print(f"  Regimes detected")
        
        # Detect transitions
        df_tf = detect_regime_transitions(df_tf)
        
        # Count regimes
        regime_counts = df_tf['regime'].value_counts()
        print(f"  Regime distribution:")
        for regime, count in regime_counts.items():
            pct = count / len(df_tf) * 100
            print(f"    {regime}: {count} bars ({pct:.1f}%)")
        
        df_dict[tf] = df_tf
    
    print("\n" + "=" * 80)
    print("Creating visualizations...")
    print("=" * 80)
    
    # Create visualizations
    plot_regime_chart(df_dict, INSTRUMENT)
    plot_regime_statistics(df_dict, INSTRUMENT)
    
    print("\nRegime classification complete!")
    print(f"\nOutputs:")
    print(f"  - regime_classifier_{INSTRUMENT}_mtf.png (price charts with regimes)")
    print(f"  - regime_statistics_{INSTRUMENT}_mtf.png (regime statistics)")

if __name__ == '__main__':
    main()
