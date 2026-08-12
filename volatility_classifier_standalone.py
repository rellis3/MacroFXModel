#!/usr/bin/env python3
"""
Volatility Classifier Backtest — Exhaustion vs Continuation
Standalone Python script with visualization

Tests three strategies at volatility extremes:
  1. Always fade
  2. Always follow  
  3. Classifier (VuManChu + day-type score)

Pre-registered outcome: "Worked" = Classifier OOS Sharpe > max(fade, follow) by ≥0.2, with ≥30 OOS trades

Usage: python volatility_classifier_standalone.py
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

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
INSTRUMENT = 'eurusd'
M1_DATA_DIR = Path('VolRangeForecaster/data/m1')
DAY_COUNT = 100
OOS_PCT = 40
SL_MULT = 1.5
TP_MULT = 2.0
VMC_WIN = 10
DAYTYPE_WIN = 20

# ============================================================================
# LOAD M1 DATA
# ============================================================================
def load_m1_parquet(instrument):
    """Load M1 parquet data"""
    parquet_file = M1_DATA_DIR / f'{instrument}_m1.parquet'
    
    if not parquet_file.exists():
        raise FileNotFoundError(f"M1 data not found: {parquet_file}")
    
    print(f"Loading M1 data from {parquet_file}...")
    df = pd.read_parquet(parquet_file)
    
    # Ensure datetime column
    if 'datetime' in df.columns:
        df['datetime'] = pd.to_datetime(df['datetime'])
    else:
        # Assume index is datetime
        df = df.reset_index()
        df['datetime'] = pd.to_datetime(df['datetime'])
    
    print(f"Loaded {len(df):,} M1 bars")
    return df

# ============================================================================
# BUILD DAILY SESSIONS
# ============================================================================
def build_daily_sessions(df):
    """Group M1 bars into daily sessions"""
    df['date'] = df['datetime'].dt.date
    
    sessions = []
    for date, group in df.groupby('date'):
        if len(group) < 100:  # Skip incomplete days
            continue
        
        sessions.append({
            'date': str(date),
            'open': group.iloc[0]['open'],
            'bars': group[['open', 'high', 'low', 'close']].values
        })
    
    print(f"Built {len(sessions)} daily sessions")
    return sessions

# ============================================================================
# VOLATILITY ESTIMATION
# ============================================================================
def compute_volatility(bars):
    """Compute Yang-Zhang volatility estimate"""
    if len(bars) < 20:
        return None
    
    # Simple HV20 for now (can upgrade to Yang-Zhang)
    closes = bars[:, 3]  # close column
    returns = np.diff(np.log(closes))
    
    if len(returns) < 20:
        return None
    
    vol = np.std(returns[-20:]) * np.sqrt(252)
    return vol

# ============================================================================
# VUMANCHU WAVETREND
# ============================================================================
def compute_wavetrend(bars, n1=10, n2=21):
    """Compute VuManChu WaveTrend oscillator"""
    if len(bars) < n2:
        return None, None
    
    # HLC3
    hlc3 = (bars[:, 1] + bars[:, 2] + bars[:, 3]) / 3  # (high + low + close) / 3
    
    # EMA of HLC3
    esa = pd.Series(hlc3).ewm(span=n1, adjust=False).mean().values
    
    # Absolute deviation
    d = np.abs(hlc3 - esa)
    d_ema = pd.Series(d).ewm(span=n1, adjust=False).mean().values
    
    # CI (Channel Index)
    ci = (hlc3 - esa) / (0.015 * d_ema)
    
    # TCI (Trending Channel Index) - smoothed CI
    tci = pd.Series(ci).ewm(span=n2, adjust=False).mean().values
    
    wt1 = tci[-1] if len(tci) > 0 else 0
    wt2 = pd.Series(tci).rolling(4).mean().iloc[-1] if len(tci) >= 4 else wt1
    
    return wt1, wt2

# ============================================================================
# DAY-TYPE CLASSIFIER
# ============================================================================
def compute_daytype_score(closes, win=20):
    """Compute day-type score (trend vs chop)"""
    if len(closes) < win:
        return 0.5
    
    recent = closes[-win:]
    
    # Efficiency ratio
    net_change = abs(recent[-1] - recent[0])
    total_change = np.sum(np.abs(np.diff(recent)))
    
    if total_change == 0:
        return 0.5
    
    efficiency = net_change / total_change
    
    # Normalize to [0, 1]
    return np.clip(efficiency, 0, 1)

# ============================================================================
# CLASSIFIER LOGIC
# ============================================================================
def classify_exhaustion(sessions, session_idx, vmc_win, daytype_win):
    """Classify if extreme is exhaustion (fade) or continuation (follow)"""
    # Build historical bars
    all_bars = []
    for i in range(max(0, session_idx - 50), session_idx + 1):
        all_bars.extend(sessions[i]['bars'])
    
    all_bars = np.array(all_bars)
    
    # VuManChu on recent bars
    recent_bars = all_bars[-500:] if len(all_bars) > 500 else all_bars
    wt1, wt2 = compute_wavetrend(recent_bars, n1=vmc_win)
    
    if wt1 is None:
        return {'isExhaustion': False, 'isContinuation': False}
    
    # Day-type on daily closes
    daily_closes = [sessions[i]['bars'][-1, 3] for i in range(max(0, session_idx - daytype_win), session_idx + 1)]
    daytype_score = compute_daytype_score(np.array(daily_closes), win=min(daytype_win, len(daily_closes)))
    
    # Classification
    is_exhaustion = abs(wt1) > 50 and daytype_score < 0.4
    is_continuation = abs(wt1) > 50 and daytype_score > 0.6
    
    return {
        'wt1': wt1,
        'wt2': wt2,
        'daytype': daytype_score,
        'isExhaustion': is_exhaustion,
        'isContinuation': is_continuation
    }

# ============================================================================
# WALK BARS TO RESOLVE TRADE
# ============================================================================
def walk_bars(bars, entry, tp, sl, is_buy):
    """Walk M1 bars to resolve trade"""
    for bar in bars:
        if is_buy:
            if bar[1] >= tp:  # high >= tp
                return {'exit': tp, 'pnl': tp - entry}
            if bar[2] <= sl:  # low <= sl
                return {'exit': sl, 'pnl': sl - entry}
        else:  # sell
            if bar[2] <= tp:  # low <= tp
                return {'exit': tp, 'pnl': entry - tp}
            if bar[1] >= sl:  # high >= sl
                return {'exit': sl, 'pnl': entry - sl}
    
    # No exit
    return None

# ============================================================================
# BACKTEST ENGINE
# ============================================================================
def run_strategy(sessions, mode, opts):
    """Run backtest for one strategy"""
    records = []
    split_idx = int(len(sessions) * (1 - opts['oos_pct'] / 100))
    
    # Build historical bars for vol estimation
    all_historical = []
    
    for i in range(50, len(sessions)):
        session = sessions[i]
        
        # Add previous session to history
        if i > 0:
            all_historical.extend(sessions[i - 1]['bars'])
        
        # Compute volatility
        if len(all_historical) < 20:
            continue
        
        sigma = compute_volatility(np.array(all_historical))
        if sigma is None or sigma <= 0:
            continue
        
        # Compute bands (HL75 = 1.93 * sigma / sqrt(252))
        hl75 = 1.93 * sigma / np.sqrt(252)
        
        # Walk M1 bars to find touches
        for bar_idx, bar in enumerate(session['bars']):
            touched_high = bar[1] >= session['open'] + hl75
            touched_low = bar[2] <= session['open'] - hl75
            
            if not touched_high and not touched_low:
                continue
            
            side = None
            entry = None
            
            if mode == 'fade':
                if touched_high:
                    side = 'sell'
                    entry = session['open'] + hl75
                elif touched_low:
                    side = 'buy'
                    entry = session['open'] - hl75
            
            elif mode == 'follow':
                if touched_high:
                    side = 'buy'
                    entry = session['open'] + hl75
                elif touched_low:
                    side = 'sell'
                    entry = session['open'] - hl75
            
            elif mode == 'classifier':
                signal = classify_exhaustion(sessions, i, opts['vmc_win'], opts['daytype_win'])
                
                if touched_high:
                    if signal['isExhaustion']:
                        side = 'sell'
                        entry = session['open'] + hl75
                    elif signal['isContinuation']:
                        side = 'buy'
                        entry = session['open'] + hl75
                elif touched_low:
                    if signal['isExhaustion']:
                        side = 'buy'
                        entry = session['open'] - hl75
                    elif signal['isContinuation']:
                        side = 'sell'
                        entry = session['open'] - hl75
            
            if side is None:
                continue
            
            # Set SL/TP
            sl_dist = sigma / np.sqrt(252) * opts['sl_mult']
            tp_dist = sigma / np.sqrt(252) * opts['tp_mult']
            
            if side == 'buy':
                sl = entry - sl_dist
                tp = entry + tp_dist
            else:
                sl = entry + sl_dist
                tp = entry - tp_dist
            
            # Walk forward
            remaining_bars = session['bars'][bar_idx + 1:]
            result = walk_bars(remaining_bars, entry, tp, sl, side == 'buy')
            
            if result:
                pnl_r = result['pnl'] / (sigma / np.sqrt(252))
                is_oos = i >= split_idx
                
                records.append({
                    'date': session['date'],
                    'side': side,
                    'entry': entry,
                    'exit': result['exit'],
                    'pnl': result['pnl'],
                    'pnl_r': pnl_r,
                    'is_oos': is_oos,
                    'mode': mode
                })
                
                break  # One trade per day
    
    return pd.DataFrame(records)

# ============================================================================
# PERFORMANCE METRICS
# ============================================================================
def compute_metrics(df, is_oos=False):
    """Compute performance metrics"""
    filtered = df[df['is_oos'] == is_oos] if 'is_oos' in df.columns else df
    
    if len(filtered) == 0:
        return {
            'trades': 0,
            'win_rate': 0,
            'avg_r': 0,
            'sharpe': 0,
            'total_r': 0,
            'max_dd': 0
        }
    
    wins = len(filtered[filtered['pnl_r'] > 0])
    win_rate = wins / len(filtered)
    avg_r = filtered['pnl_r'].mean()
    sharpe = filtered['pnl_r'].mean() / filtered['pnl_r'].std() if filtered['pnl_r'].std() > 0 else 0
    total_r = filtered['pnl_r'].sum()
    
    # Max DD
    cum_r = filtered['pnl_r'].cumsum()
    running_max = cum_r.cummax()
    dd = running_max - cum_r
    max_dd = dd.max()
    
    return {
        'trades': len(filtered),
        'win_rate': win_rate * 100,
        'avg_r': avg_r,
        'sharpe': sharpe,
        'total_r': total_r,
        'max_dd': max_dd
    }

# ============================================================================
# VISUALIZATION
# ============================================================================
def create_visualizations(fade_df, follow_df, classifier_df, opts):
    """Create comprehensive visualizations"""
    fig = plt.figure(figsize=(16, 12))
    gs = fig.add_gridspec(3, 2, hspace=0.3, wspace=0.3)
    
    # 1. Equity curves (OOS only)
    ax1 = fig.add_subplot(gs[0, :])
    
    fade_oos = fade_df[fade_df['is_oos']]
    follow_oos = follow_df[follow_df['is_oos']]
    classifier_oos = classifier_df[classifier_df['is_oos']]
    
    if len(fade_oos) > 0:
        ax1.plot(range(len(fade_oos)), fade_oos['pnl_r'].cumsum(), 
                label='Always Fade', color='#ef4444', linewidth=2, alpha=0.8)
    
    if len(follow_oos) > 0:
        ax1.plot(range(len(follow_oos)), follow_oos['pnl_r'].cumsum(), 
                label='Always Follow', color='#3b82f6', linewidth=2, alpha=0.8)
    
    if len(classifier_oos) > 0:
        ax1.plot(range(len(classifier_oos)), classifier_oos['pnl_r'].cumsum(), 
                label='Classifier', color='#10b981', linewidth=2.5, alpha=0.9)
    
    ax1.set_title('OOS Equity Curves (Cumulative R)', fontsize=14, fontweight='bold', color='#60a5fa')
    ax1.set_xlabel('Trade Number', fontsize=11)
    ax1.set_ylabel('Cumulative R', fontsize=11)
    ax1.legend(loc='best', framealpha=0.9)
    ax1.grid(True, alpha=0.3)
    ax1.axhline(y=0, color='#9ca3af', linestyle='--', linewidth=1, alpha=0.5)
    
    # 2. Sharpe comparison
    ax2 = fig.add_subplot(gs[1, 0])
    
    fade_oos_metrics = compute_metrics(fade_df, is_oos=True)
    follow_oos_metrics = compute_metrics(follow_df, is_oos=True)
    classifier_oos_metrics = compute_metrics(classifier_df, is_oos=True)
    
    strategies = ['Fade', 'Follow', 'Classifier']
    sharpes = [fade_oos_metrics['sharpe'], follow_oos_metrics['sharpe'], classifier_oos_metrics['sharpe']]
    colors = ['#ef4444', '#3b82f6', '#10b981']
    
    bars = ax2.bar(strategies, sharpes, color=colors, alpha=0.8, edgecolor='#374151', linewidth=1.5)
    ax2.set_title('OOS Sharpe Ratio Comparison', fontsize=12, fontweight='bold', color='#60a5fa')
    ax2.set_ylabel('Sharpe Ratio', fontsize=11)
    ax2.axhline(y=0, color='#9ca3af', linestyle='--', linewidth=1, alpha=0.5)
    ax2.grid(True, alpha=0.3, axis='y')
    
    # Add value labels on bars
    for bar, sharpe in zip(bars, sharpes):
        height = bar.get_height()
        ax2.text(bar.get_x() + bar.get_width()/2., height,
                f'{sharpe:.2f}',
                ha='center', va='bottom' if height >= 0 else 'top',
                fontsize=10, fontweight='bold', color='#e0e6ed')
    
    # 3. Win rate comparison
    ax3 = fig.add_subplot(gs[1, 1])
    
    win_rates = [fade_oos_metrics['win_rate'], follow_oos_metrics['win_rate'], classifier_oos_metrics['win_rate']]
    
    bars = ax3.bar(strategies, win_rates, color=colors, alpha=0.8, edgecolor='#374151', linewidth=1.5)
    ax3.set_title('OOS Win Rate Comparison', fontsize=12, fontweight='bold', color='#60a5fa')
    ax3.set_ylabel('Win Rate (%)', fontsize=11)
    ax3.axhline(y=50, color='#9ca3af', linestyle='--', linewidth=1, alpha=0.5)
    ax3.grid(True, alpha=0.3, axis='y')
    ax3.set_ylim(0, 100)
    
    # Add value labels
    for bar, wr in zip(bars, win_rates):
        height = bar.get_height()
        ax3.text(bar.get_x() + bar.get_width()/2., height,
                f'{wr:.1f}%',
                ha='center', va='bottom',
                fontsize=10, fontweight='bold', color='#e0e6ed')
    
    # 4. Trade distribution (classifier only)
    ax4 = fig.add_subplot(gs[2, 0])
    
    if len(classifier_oos) > 0:
        ax4.hist(classifier_oos['pnl_r'], bins=20, color='#10b981', alpha=0.7, edgecolor='#374151', linewidth=1)
        ax4.axvline(x=0, color='#ef4444', linestyle='--', linewidth=2, alpha=0.7)
        ax4.axvline(x=classifier_oos['pnl_r'].mean(), color='#60a5fa', linestyle='--', linewidth=2, alpha=0.7, label=f'Mean: {classifier_oos["pnl_r"].mean():.2f}R')
        ax4.set_title('Classifier OOS Trade Distribution', fontsize=12, fontweight='bold', color='#60a5fa')
        ax4.set_xlabel('PnL (R)', fontsize=11)
        ax4.set_ylabel('Frequency', fontsize=11)
        ax4.legend(loc='best', framealpha=0.9)
        ax4.grid(True, alpha=0.3, axis='y')
    
    # 5. Summary table
    ax5 = fig.add_subplot(gs[2, 1])
    ax5.axis('off')
    
    # Determine verdict
    max_baseline = max(fade_oos_metrics['sharpe'], follow_oos_metrics['sharpe'])
    classifier_sharpe = classifier_oos_metrics['sharpe']
    classifier_trades = classifier_oos_metrics['trades']
    
    worked = classifier_sharpe > max_baseline + 0.2 and classifier_trades >= 30
    
    verdict_color = '#10b981' if worked else '#ef4444'
    verdict_text = '✓ WORKED' if worked else '✗ DID NOT WORK'
    
    summary_text = f"""
PRE-REGISTERED OUTCOME

Criteria: Classifier OOS Sharpe > max(fade, follow) by ≥0.2, 
          with ≥30 OOS trades

Result:   Classifier OOS Sharpe = {classifier_sharpe:.2f}
          Max Baseline = {max_baseline:.2f}
          Classifier OOS Trades = {classifier_trades}

Verdict:  {verdict_text}
"""
    
    if worked:
        summary_text += f"\nSuccess: Classifier beats baseline by {(classifier_sharpe - max_baseline):.2f} Sharpe\n         with {classifier_trades} OOS trades"
    else:
        if classifier_trades < 30:
            summary_text += f"\nReason: Insufficient OOS trades (need ≥30, got {classifier_trades})"
        else:
            summary_text += f"\nReason: Classifier does not beat baseline by ≥0.2 Sharpe\n        (delta = {(classifier_sharpe - max_baseline):.2f})"
    
    ax5.text(0.5, 0.5, summary_text,
            ha='center', va='center',
            fontsize=11,
            family='monospace',
            bbox=dict(boxstyle='round', facecolor=verdict_color, alpha=0.2, edgecolor=verdict_color, linewidth=2),
            color='#e0e6ed')
    
    plt.suptitle(f'Volatility Classifier Backtest — {INSTRUMENT.upper()}', 
                fontsize=16, fontweight='bold', color='#60a5fa', y=0.995)
    
    # Save figure
    output_file = f'volatility_classifier_{INSTRUMENT}_results.png'
    plt.savefig(output_file, dpi=150, bbox_inches='tight', facecolor='#0a0e27')
    print(f"\nVisualization saved to: {output_file}")
    
    plt.show()

# ============================================================================
# MAIN
# ============================================================================
def main():
    print("=" * 80)
    print("VOLATILITY CLASSIFIER BACKTEST — Exhaustion vs Continuation")
    print("=" * 80)
    print(f"Instrument: {INSTRUMENT.upper()}")
    print(f"Parameters: SL={SL_MULT}σ, TP={TP_MULT}σ, VMC Win={VMC_WIN}, DayType Win={DAYTYPE_WIN}, OOS={OOS_PCT}%")
    print("=" * 80)
    
    # Load data
    df = load_m1_parquet(INSTRUMENT)
    
    # Build sessions
    sessions = build_daily_sessions(df)
    
    # Take last N days
    sessions = sessions[-DAY_COUNT:]
    print(f"Using last {len(sessions)} days for backtest\n")
    
    # Run strategies
    opts = {
        'sl_mult': SL_MULT,
        'tp_mult': TP_MULT,
        'vmc_win': VMC_WIN,
        'daytype_win': DAYTYPE_WIN,
        'oos_pct': OOS_PCT
    }
    
    print("Running fade strategy...")
    fade_df = run_strategy(sessions, 'fade', opts)
    print(f"Fade: {len(fade_df)} trades")
    
    print("Running follow strategy...")
    follow_df = run_strategy(sessions, 'follow', opts)
    print(f"Follow: {len(follow_df)} trades")
    
    print("Running classifier strategy...")
    classifier_df = run_strategy(sessions, 'classifier', opts)
    print(f"Classifier: {len(classifier_df)} trades")
    
    # Print results
    print("\n" + "=" * 80)
    print("RESULTS")
    print("=" * 80)
    
    for name, df_result in [('ALWAYS FADE', fade_df), ('ALWAYS FOLLOW', follow_df), ('CLASSIFIER', classifier_df)]:
        print(f"\n{name}")
        print("-" * 80)
        
        is_metrics = compute_metrics(df_result, is_oos=False)
        oos_metrics = compute_metrics(df_result, is_oos=True)
        
        print(f"IS:  Sharpe={is_metrics['sharpe']:6.2f}  Trades={is_metrics['trades']:4d}  "
              f"WinRate={is_metrics['win_rate']:5.1f}%  AvgR={is_metrics['avg_r']:7.3f}  "
              f"TotalR={is_metrics['total_r']:7.2f}  MaxDD={is_metrics['max_dd']:6.2f}")
        
        print(f"OOS: Sharpe={oos_metrics['sharpe']:6.2f}  Trades={oos_metrics['trades']:4d}  "
              f"WinRate={oos_metrics['win_rate']:5.1f}%  AvgR={oos_metrics['avg_r']:7.3f}  "
              f"TotalR={oos_metrics['total_r']:7.2f}  MaxDD={oos_metrics['max_dd']:6.2f}")
    
    # Verdict
    fade_oos = compute_metrics(fade_df, is_oos=True)
    follow_oos = compute_metrics(follow_df, is_oos=True)
    classifier_oos = compute_metrics(classifier_df, is_oos=True)
    
    max_baseline = max(fade_oos['sharpe'], follow_oos['sharpe'])
    worked = classifier_oos['sharpe'] > max_baseline + 0.2 and classifier_oos['trades'] >= 30
    
    print("\n" + "=" * 80)
    print("PRE-REGISTERED OUTCOME")
    print("=" * 80)
    print(f"Criteria: Classifier OOS Sharpe > max(fade, follow) by ≥0.2, with ≥30 OOS trades")
    print(f"Result:   Classifier OOS Sharpe = {classifier_oos['sharpe']:.2f}, "
          f"Max Baseline = {max_baseline:.2f}, "
          f"Classifier OOS Trades = {classifier_oos['trades']}")
    print(f"Verdict:  {'✓ WORKED' if worked else '✗ DID NOT WORK'}")
    
    if worked:
        print(f"Success:  Classifier beats baseline by {(classifier_oos['sharpe'] - max_baseline):.2f} Sharpe "
              f"with {classifier_oos['trades']} OOS trades")
    else:
        if classifier_oos['trades'] < 30:
            print(f"Reason:   Insufficient OOS trades (need ≥30, got {classifier_oos['trades']})")
        else:
            print(f"Reason:   Classifier does not beat baseline by ≥0.2 Sharpe "
                  f"(delta = {(classifier_oos['sharpe'] - max_baseline):.2f})")
    
    print("=" * 80 + "\n")
    
    # Create visualizations
    print("Creating visualizations...")
    create_visualizations(fade_df, follow_df, classifier_df, opts)
    
    print("\nBacktest complete!")

if __name__ == '__main__':
    main()
