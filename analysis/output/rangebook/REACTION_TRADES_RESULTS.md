# Trading the reaction after the touch — results

Pre-registration: forge/REACTION_TRADES_PREREG.md (ec1f51b). R per trade, net of spread. Primary set 16 FX + gold; confirmation set NQ, SPX, DOW, US2000, DE30, UK100. Every builder passed its future-scramble self-check.

## A — the tighter fade (price back inside > 0.1σ at the decision)

| decision | stop buffer | target | trades | net R | 2016–22 | 2023–26 | indices R | Asia / London / NY / Late | PASS |
|---|---|---|---|---|---|---|---|---|---|
| +5 min | 0.05σ | halfway to the line behind | 63,128 | -0.169 | -0.174 | -0.157 | -0.062 | -0.124 / -0.186 / -0.169 / -0.169 | – |
| +5 min | 0.05σ | the line behind | 63,128 | -0.166 | -0.172 | -0.154 | -0.041 | -0.121 / -0.190 / -0.159 / -0.177 | – |
| +5 min | 0.05σ | 1R | 63,128 | -0.165 | -0.171 | -0.152 | -0.050 | -0.108 / -0.182 / -0.166 / -0.171 | – |
| +5 min | 0.05σ | 2R | 63,128 | -0.176 | -0.182 | -0.163 | -0.033 | -0.141 / -0.199 / -0.167 / -0.187 | – |
| +5 min | 0.15σ | halfway to the line behind | 63,129 | -0.117 | -0.122 | -0.104 | -0.045 | -0.084 / -0.135 / -0.115 / -0.111 | – |
| +5 min | 0.15σ | the line behind | 63,129 | -0.117 | -0.124 | -0.102 | -0.027 | -0.080 / -0.140 / -0.112 / -0.115 | – |
| +5 min | 0.15σ | 1R | 63,129 | -0.120 | -0.128 | -0.103 | -0.029 | -0.083 / -0.142 / -0.118 / -0.111 | – |
| +5 min | 0.15σ | 2R | 63,129 | -0.123 | -0.130 | -0.108 | -0.002 | -0.095 / -0.143 / -0.118 / -0.122 | – |
| +15 min | 0.05σ | halfway to the line behind | 114,762 | -0.143 | -0.144 | -0.139 | -0.046 | -0.138 / -0.155 / -0.127 / -0.163 | – |
| +15 min | 0.05σ | the line behind | 114,762 | -0.138 | -0.141 | -0.132 | -0.035 | -0.142 / -0.150 / -0.113 / -0.180 | – |
| +15 min | 0.05σ | 1R | 114,762 | -0.140 | -0.143 | -0.133 | -0.034 | -0.135 / -0.154 / -0.121 / -0.166 | – |
| +15 min | 0.05σ | 2R | 114,762 | -0.143 | -0.147 | -0.136 | -0.015 | -0.151 / -0.159 / -0.113 / -0.187 | – |
| +15 min | 0.15σ | halfway to the line behind | 114,762 | -0.103 | -0.105 | -0.101 | -0.035 | -0.098 / -0.118 / -0.091 / -0.111 | – |
| +15 min | 0.15σ | the line behind | 114,762 | -0.101 | -0.102 | -0.098 | -0.026 | -0.098 / -0.115 / -0.083 / -0.124 | – |
| +15 min | 0.15σ | 1R | 114,762 | -0.103 | -0.105 | -0.099 | -0.022 | -0.103 / -0.120 / -0.083 / -0.121 | – |
| +15 min | 0.15σ | 2R | 114,762 | -0.108 | -0.109 | -0.105 | -0.006 | -0.116 / -0.121 / -0.087 / -0.133 | – |
| +30 min | 0.05σ | halfway to the line behind | 137,332 | -0.117 | -0.121 | -0.108 | -0.046 | -0.121 / -0.130 / -0.096 / -0.138 | – |
| +30 min | 0.05σ | the line behind | 137,332 | -0.118 | -0.125 | -0.103 | -0.042 | -0.137 / -0.133 / -0.086 / -0.154 | – |
| +30 min | 0.05σ | 1R | 137,332 | -0.117 | -0.122 | -0.105 | -0.040 | -0.125 / -0.132 / -0.091 / -0.144 | – |
| +30 min | 0.05σ | 2R | 137,332 | -0.122 | -0.126 | -0.113 | -0.034 | -0.142 / -0.134 / -0.092 / -0.158 | – |
| +30 min | 0.15σ | halfway to the line behind | 137,333 | -0.085 | -0.089 | -0.076 | -0.037 | -0.092 / -0.096 / -0.070 / -0.094 | – |
| +30 min | 0.15σ | the line behind | 137,333 | -0.086 | -0.092 | -0.074 | -0.034 | -0.104 / -0.100 / -0.063 / -0.103 | – |
| +30 min | 0.15σ | 1R | 137,333 | -0.089 | -0.094 | -0.078 | -0.033 | -0.104 / -0.105 / -0.066 / -0.105 | – |
| +30 min | 0.15σ | 2R | 137,333 | -0.091 | -0.098 | -0.075 | -0.023 | -0.113 / -0.101 / -0.069 / -0.111 | – |

BH 10% over 24 cells: 0 survive before the both-halves and index checks.

## B — cutting continuation trades

| set | rule | trades | hold R | rule R | improvement [95% CI] | 2016–22 | 2023–26 | B1 fires on | PASS |
|---|---|---|---|---|---|---|---|---|---|
| 16 FX + gold | B1: back inside at +15 min | 526,570 | -0.056 | -0.058 | -0.0020 [-0.0036, -0.0003] | -0.0022 | -0.0016 | 22% | – |
| 16 FX + gold | B2: B1 or a Cipher B divergence | 526,570 | -0.056 | -0.058 | -0.0021 [-0.0043, +0.0001] | -0.0023 | -0.0017 | 22% | – |
| 6 indices | B1: back inside at +15 min | 149,428 | -0.018 | -0.017 | +0.0015 [-0.0018, +0.0046] | +0.0018 | +0.0010 | 23% | no |
| 6 indices | B2: B1 or a Cipher B divergence | 149,428 | -0.018 | -0.017 | +0.0014 [-0.0030, +0.0056] | +0.0021 | +0.0005 | 23% | no |

## Reading
- **A fails, and the tighter versions are worse than the plain fade** (−0.09 to −0.18R vs −0.056R racing to the line
  behind). A stop just beyond the touch extreme gets taken out by the re-test: price that is back inside often
  comes back to probe the high once more before it fades. A wider buffer (0.15σ) loses less every time.
- **B fails: cutting a continuation trade that is back inside after 15 minutes does not help** (−0.002R on FX/gold,
  +0.0015R on indices, both within noise). From that point the trade has a 23% chance of its target and 48% of its
  stop, but the target is now further away and the stop nearer, so holding is worth about what the exit locks in.
  The odds moved; the payoff moved with them.
- The cut rule fires on 22% of trades, so it is not a small sample: the reaction carries information, and the
  price at that moment already reflects it.
