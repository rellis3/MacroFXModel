import re,sys
__file__ = r'C:/Users/relli/OneDrive/Documents/Programming/Trading/v2 trading model/MacroFXModel/scripts/rate_diff_nq/cog_theories.py'
src=open('scripts/rate_diff_nq/cog_theories.py',encoding='utf-8').read().split('# ---------------------------------------------------------------- T5')[0]
exec(src.split("md = ['# COG-THEORIES")[0])
import numpy as np
ch=L-L.shift(16)
print('L finite',L.notna().sum(),'ch finite',ch.notna().sum())
th=np.sqrt((ch**2).rolling(1920,min_periods=960).mean()).shift(1)
print('theta finite',th.notna().sum(), th.dropna().describe())
