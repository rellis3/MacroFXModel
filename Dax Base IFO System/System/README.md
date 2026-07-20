# IFO-DAX Trading Strategy

Quantitative trading strategy using German IFO Business Climate Index to generate DAX signals.

## Setup

```
pip install pandas numpy matplotlib seaborn scipy statsmodels
```

## Files

**data/**
- RAWDATA.csv - IFO monthly index values
- dax_raw.csv - DAX daily prices

**scripts/**
1. 01_data_preparation.py - Data loading and merging
2. 02_base_ifo_strategy.py - Core strategy (1x)
3. 03_professional_backtest.py - Full backtest with metrics
4. 04_regression_analysis.py - OLS regression

## Usage

```
cd scripts
python 01_data_preparation.py
python 02_base_ifo_strategy.py
```

## Strategy

IFO increases from prior month: Long DAX
IFO decreases from prior month: Short DAX

IFO is released around the 25th of each month, allowing same-month positioning.

## Results

Base strategy (1x): ~9.4% CAGR, -27% max drawdown, 0.32 Sharpe
Buy and hold: ~7.6% CAGR, -52% max drawdown, 0.21 Sharpe
