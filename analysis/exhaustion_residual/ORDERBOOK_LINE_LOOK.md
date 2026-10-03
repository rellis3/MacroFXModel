# Order book at the p75 line: first look (descriptive, not pre-registered)

943 touches, 8 instruments, 2025-09-11 -> 2026-08-20

Overall: {'fade': 0.415, 'continue': 0.328, 'stall': 0.258}

By fuel share tercile (within instrument):
out         continue   fade  stall    n
fuel_t                                 
mixed          0.343  0.369  0.288  312
stop-heavy     0.308  0.454  0.238  315
wall-heavy     0.332  0.421  0.247  316

first half: continue rate by tercile {'mixed': 0.358, 'stop-heavy': 0.315, 'wall-heavy': 0.353}
second half: continue rate by tercile {'mixed': 0.329, 'stop-heavy': 0.3, 'wall-heavy': 0.313}

Per instrument, continue rate stop-heavy minus wall-heavy:
inst
AUD_USD    0.000
EUR_USD    0.007
GBP_USD   -0.162
NZD_USD   -0.023
USD_CAD   -0.091
USD_CHF    0.000
USD_JPY    0.054
XAU_USD    0.026
