# today.html direction tag — EURUSD 6-year replay

Rule: forge/V4_EURUSD_DIRTAG_PREREG.md. Drivers only (HMM regime, structural travel, tape, range-used cap); COT/macro/carry/OI modifiers not replayed. H1 = 2020-09-29→2024-09-28, H2 = 2024-09-29→2026-09-28.

## A. Does the 08:00 London tag call the rest of the day?

| half | tag | days | hit % | p vs 50% |
|---|---|---|---|---|
| H1 | all up/down | 475 | 47.6 | 0.313 |
| H1 | strong only | 95 | 41.1 | 0.101 |
| H2 | all up/down | 267 | 46.1 | 0.221 |
| H2 | strong only | 38 | 44.7 | 0.626 |

Tag distribution at 08:00 over all days: {('flat', 'flat'): 747, ('down', 'lean'): 321, ('up', 'lean'): 290, ('up', 'strong'): 59, ('mixed', 'mixed'): 65, ('down', 'strong'): 74}

**Test A: FAIL**

## B. Trading the forecast lines in the tag's direction

| half | rule | trades | win % | net R | t | return @0.5% |
|---|---|---|---|---|---|---|
| H1 | with tag | 2363 | 50.9 | -0.003 | -0.1 | -3.3% |
| H1 | with tag, strong only | 226 | 47.8 | -0.054 | -0.9 | -6.1% |
| H1 | against tag | 2363 | 47.5 | -0.078 | -4.2 | -92.0% |
| H2 | with tag | 1110 | 48.6 | -0.046 | -1.7 | -25.4% |
| H2 | with tag, strong only | 87 | 42.5 | -0.143 | -1.4 | -6.2% |
| H2 | against tag | 1110 | 49.7 | -0.036 | -1.3 | -19.9% |

**Test B: FAIL**
