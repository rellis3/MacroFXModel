# cboe-vol-indices-range — results

Prereg: `forge/CBOE_VOL_INDICES_RANGE_PREREG.md` (prereg fe892ae7, amendment A1 b94a0873, 2026-11-28). Run 2026-11-28, seed 20261128, B = 2000, block 63 sessions. Branch `wf2/vol-indices-range`. Ledger ids: one per map × horizon (table below).

## Verdict: NULL 5, UNDERPOWERED 21, VALIDATED 4 (of 30 map × horizon questions)

**OVX is the one index that clearly adds to the range forecast.** On WTI (CFD) the OVX layer cuts next-session
H-L pinball by 6.0% (Lin 0.940 [0.917, 0.965]) and the 5-session window by 4.9% (Ext 0.951 [0.929, 0.982]) beyond the
ladder-v2 chosen sigma (HAR + GARCH-t, which carries no IV). Every gate holds: Holm over the 32 direct cells, both
halves (1d 0.924 / 0.963), all 20 circular-shift placebos worse (median 1.000), and the CL futures track agrees
(0.892). |t| ≈ 4.6 on the 1d Lin cell. On Brent (cross-asset family, the CFD is ICE Brent, not OVX's own USO
underlying) the gain is the same size: 1d 0.950 [0.935, 0.972], 5d 0.929 [0.897, 0.969], all gates held. The layer's
level coefficient is positive (OVX rich vs the forecast → wider ranges), as expected. Concentration (descriptive): without
2020 the WTI 1d ratio is 0.959, without the top 1% range days 0.953, 2024-26 alone 0.967; Brent 0.955 / 0.971 / 0.959.

**Everything else is short of the gate.** VXSLV on silver: 1-2% on the CFD (UNDERPOWERED), though the SI futures track
shows 3.8-6.4%. That disagreement between tracks is worth a look on its own. RVX (US2000) and VXD (US30) on top of the
production VIX layer: 2-4% at 1d with CIs below 1 for RVX, but they miss Holm (MDE 0.026-0.068), so UNDERPOWERED. VXTLT
on ZB/ZN: about zero, unstable across halves (UNDERPOWERED). SKEW: NULL on NQ 1d (a 1.5% gain is ruled out); on SPX
and NQ 5d the extremes layer makes the forecast worse (SPX 5d Ext 1.019 [1.003, 1.036]). Cross-asset: VXEEM and VXFXI on
AUDUSD, VXGDX on gold (beyond GVZ) are NULL at 1d. VXAPL/VXAZN on NQ (beyond VXN) give 2-3% at 1d, UNDERPOWERED. OVX on
USDCAD adds nothing.

Exploratory caution on the MDE: the cell bootstrap SEs came out larger than the prereg guessed (1d MDE 0.02-0.07,
not 0.01-0.02). So most non-OVX cells could not have shown a 1.5% gain, and their verdict is UNDERPOWERED, not NULL.

## Map × horizon verdicts

| ledger id | family | index → instrument | h | Lin | Ext | verdict |
|---|---|---|---|---|---|---|
| `cboe-vol-range-ovx-wti-1d` | A | OVX → WTI | 1d | VALIDATED | VALIDATED | **VALIDATED** |
| `cboe-vol-range-ovx-wti-5d` | A | OVX → WTI | 5d | UNDERPOWERED | VALIDATED | **VALIDATED** |
| `cboe-vol-range-vxslv-silver-1d` | A | VXSLV → SILVER | 1d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-vxslv-silver-5d` | A | VXSLV → SILVER | 5d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-vxtlt-zb-1d` | A | VXTLT → ZB | 1d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-vxtlt-zb-5d` | A | VXTLT → ZB | 5d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-vxtlt-zn-1d` | A | VXTLT → ZN | 1d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-vxtlt-zn-5d` | A | VXTLT → ZN | 5d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-rvx-us2000-1d` | A | RVX → US2000 | 1d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-rvx-us2000-5d` | A | RVX → US2000 | 5d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-vxd-us30-1d` | A | VXD → US30 | 1d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-vxd-us30-5d` | A | VXD → US30 | 5d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-skew-spx500-1d` | A | SKEW → SPX500 | 1d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-skew-spx500-5d` | A | SKEW → SPX500 | 5d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-skew-nq-1d` | A | SKEW → NQ | 1d | NULL | NULL | **NULL** |
| `cboe-vol-range-skew-nq-5d` | A | SKEW → NQ | 5d | NULL | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-vxeem-audusd-1d` | B | VXEEM → AUDUSD | 1d | NULL | NULL | **NULL** |
| `cboe-vol-range-vxeem-audusd-5d` | B | VXEEM → AUDUSD | 5d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-vxfxi-audusd-1d` | B | VXFXI → AUDUSD | 1d | NULL | NULL | **NULL** |
| `cboe-vol-range-vxfxi-audusd-5d` | B | VXFXI → AUDUSD | 5d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-vxgdx-gold-1d` | B | VXGDX → GOLD | 1d | NULL | NULL | **NULL** |
| `cboe-vol-range-vxgdx-gold-5d` | B | VXGDX → GOLD | 5d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-vxapl-nq-1d` | B | VXAPL → NQ | 1d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-vxapl-nq-5d` | B | VXAPL → NQ | 5d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-vxazn-nq-1d` | B | VXAZN → NQ | 1d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-vxazn-nq-5d` | B | VXAZN → NQ | 5d | NULL | NULL | **NULL** |
| `cboe-vol-range-ovx-usdcad-1d` | B | OVX → USDCAD | 1d | UNDERPOWERED | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-ovx-usdcad-5d` | B | OVX → USDCAD | 5d | NULL | UNDERPOWERED | **UNDERPOWERED** |
| `cboe-vol-range-ovx-brent-1d` | B | OVX → BRENT | 1d | VALIDATED | VALIDATED | **VALIDATED** |
| `cboe-vol-range-ovx-brent-5d` | B | OVX → BRENT | 5d | VALIDATED | VALIDATED | **VALIDATED** |

## Scored cells (primary track)

Ratio = layer L ÷ benchmark B, sum of H-L pinball at τ 0.50/0.75/0.90 on test rows (< 1 = the index helps). MDE = 2.8 × bootstrap SE of log ratio. Pass bar 0.985.

| cell | bench | n | ratio | 95% CI | p (1-sided) | Holm | MDE | halves 18-22 / 23-26 | placebo median (real below k of 20) | repl. track | B / L p75 exc | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| OVX→WTI C 1d Lin | B_har_garcht | 1971 | 0.9401 | [0.9168, 0.9648] | 0.0005 | yes | 0.0372 | 0.9241 / 0.9633 | 1.0002 (20) | 0.8916 | 23.8% / 24.2% | VALIDATED |
| OVX→WTI C 1d Ext | B_har_garcht | 1971 | 0.9518 | [0.9347, 0.9715] | 0.0005 | yes | 0.0281 | 0.9358 / 0.9749 | 1.0008 (20) | 0.9204 | 23.8% / 23.2% | VALIDATED |
| OVX→WTI C 5d Lin | B_har_garcht | 1967 | 0.9437 | [0.9014, 1.0044] | 0.0340 | no | 0.0789 | 0.9530 / 0.9313 | 1.0193 (20) | 0.8883 | 24.8% / 25.1% | UNDERPOWERED |
| OVX→WTI C 5d Ext | B_har_garcht | 1967 | 0.9507 | [0.9291, 0.9818] | 0.0010 | yes | 0.0396 | 0.9502 / 0.9515 | 1.0079 (20) | 0.9118 | 24.8% / 24.1% | VALIDATED |
| VXSLV→SILVER C 1d Lin | HARCJ | 1968 | 0.9886 | [0.9715, 1.0026] | 0.0665 | no | 0.0229 | 0.9762 / 1.0002 | 1.0074 (20) | 0.9436 | 26.3% / 24.3% | UNDERPOWERED |
| VXSLV→SILVER C 1d Ext | HARCJ | 1968 | 0.9949 | [0.9809, 1.0069] | 0.2039 | no | 0.0191 | 0.9953 / 0.9944 | 1.0049 (20) | 0.9621 | 26.3% / 26.3% | UNDERPOWERED |
| VXSLV→SILVER C 5d Lin | HARCJ | 1963 | 0.9816 | [0.9536, 1.0093] | 0.0960 | no | 0.0412 | 0.9908 / 0.9721 | 1.0121 (20) | 0.9363 | 27.2% / 27.4% | UNDERPOWERED |
| VXSLV→SILVER C 5d Ext | HARCJ | 1963 | 0.9822 | [0.9627, 1.0018] | 0.0390 | no | 0.0289 | 0.9921 / 0.9719 | 1.0162 (20) | 0.9420 | 27.2% / 28.1% | UNDERPOWERED |
| VXTLT→ZB F 1d Lin | HARCJ | 1980 | 0.9945 | [0.9786, 1.0143] | 0.2594 | no | 0.0264 | 1.0044 / 0.9811 | 0.9999 (17) | — | 25.1% / 23.6% | UNDERPOWERED |
| VXTLT→ZB F 1d Ext | HARCJ | 1980 | 0.9891 | [0.9738, 1.0023] | 0.0575 | no | 0.0209 | 0.9916 / 0.9858 | 1.0009 (20) | — | 25.1% / 24.4% | UNDERPOWERED |
| VXTLT→ZB F 5d Lin | HARCJ | 1839 | 1.0013 | [0.9707, 1.0451] | 0.5157 | no | 0.0525 | 1.0277 / 0.9656 | 1.0063 (14) | — | 27.0% / 26.1% | UNDERPOWERED |
| VXTLT→ZB F 5d Ext | HARCJ | 1839 | 0.9983 | [0.9787, 1.0197] | 0.4283 | no | 0.0291 | 1.0105 / 0.9820 | 1.0064 (18) | — | 27.0% / 26.8% | UNDERPOWERED |
| VXTLT→ZN F 1d Lin | H8 | 2009 | 1.0138 | [0.9796, 1.0659] | 0.7381 | no | 0.0604 | 1.0465 / 0.9731 | 1.0024 (0) | — | 25.7% / 26.4% | UNDERPOWERED |
| VXTLT→ZN F 1d Ext | H8 | 2009 | 0.9815 | [0.9663, 0.9989] | 0.0210 | no | 0.0239 | 0.9917 / 0.9687 | 1.0026 (20) | — | 25.7% / 26.5% | UNDERPOWERED |
| VXTLT→ZN F 5d Lin | H8 | 1875 | 1.0748 | [0.9847, 1.2078] | 0.9330 | no | 0.1527 | 1.1608 / 0.9625 | 1.0035 (0) | — | 25.6% / 24.8% | UNDERPOWERED |
| VXTLT→ZN F 5d Ext | H8 | 1875 | 1.0019 | [0.9619, 1.0575] | 0.5737 | no | 0.0685 | 1.0405 / 0.9514 | 0.9987 (7) | — | 25.6% / 26.0% | UNDERPOWERED |
| RVX→US2000 C 1d Lin | E_ewma_090 + VIX | 1967 | 0.9755 | [0.9562, 0.9958] | 0.0100 | no | 0.0297 | 0.9867 / 0.9627 | 1.0003 (20) | 0.9741 | 28.9% / 28.2% | UNDERPOWERED |
| RVX→US2000 C 1d Ext | E_ewma_090 + VIX | 1967 | 0.9785 | [0.9607, 0.9964] | 0.0065 | no | 0.0258 | 0.9870 / 0.9687 | 1.0019 (20) | 0.9792 | 28.9% / 28.9% | UNDERPOWERED |
| RVX→US2000 C 5d Lin | E_ewma_090 + VIX | 1962 | 0.9908 | [0.9773, 1.0044] | 0.0980 | no | 0.0194 | 1.0007 / 0.9782 | 1.0009 (20) | 0.9922 | 29.4% / 29.7% | UNDERPOWERED |
| RVX→US2000 C 5d Ext | E_ewma_090 + VIX | 1962 | 0.9921 | [0.9785, 1.0044] | 0.1154 | no | 0.0190 | 1.0033 / 0.9780 | 1.0057 (20) | 0.9982 | 29.4% / 28.7% | UNDERPOWERED |
| VXD→US30 C 1d Lin | E_har_rv_log + VIX | 1971 | 0.9610 | [0.9154, 1.0017] | 0.0360 | no | 0.0677 | 0.9547 / 0.9707 | 0.9984 (20) | 0.9590 | 25.6% / 25.7% | UNDERPOWERED |
| VXD→US30 C 1d Ext | E_har_rv_log + VIX | 1971 | 0.9757 | [0.9460, 1.0015] | 0.0365 | no | 0.0407 | 0.9708 / 0.9831 | 1.0002 (20) | 0.9735 | 25.6% / 26.0% | UNDERPOWERED |
| VXD→US30 C 5d Lin | E_har_rv_log + VIX | 1967 | 0.9824 | [0.9683, 1.0019] | 0.0370 | no | 0.0241 | 0.9770 / 0.9920 | 1.0028 (20) | 0.9976 | 22.7% / 23.9% | UNDERPOWERED |
| VXD→US30 C 5d Ext | E_har_rv_log + VIX | 1967 | 0.9899 | [0.9774, 1.0060] | 0.1049 | no | 0.0202 | 0.9846 / 0.9994 | 1.0022 (20) | 0.9956 | 22.7% / 24.1% | UNDERPOWERED |
| SKEW→SPX500 C 1d Lin | G_garch_t + VIX | 1964 | 0.9903 | [0.9768, 1.0042] | 0.0940 | no | 0.0200 | 0.9795 / 1.0057 | 1.0049 (20) | 0.9898 | 26.2% / 28.6% | UNDERPOWERED |
| SKEW→SPX500 C 1d Ext | G_garch_t + VIX | 1964 | 0.9940 | [0.9800, 1.0053] | 0.1469 | no | 0.0181 | 0.9870 / 1.0039 | 1.0038 (20) | 0.9911 | 26.2% / 27.2% | UNDERPOWERED |
| SKEW→SPX500 C 5d Lin | G_garch_t + VIX | 1957 | 0.9997 | [0.9855, 1.0148] | 0.4328 | no | 0.0210 | 0.9973 / 1.0038 | 1.0087 (20) | 0.9976 | 26.0% / 27.2% | UNDERPOWERED |
| SKEW→SPX500 C 5d Ext | G_garch_t + VIX | 1957 | 1.0190 | [1.0029, 1.0359] | 0.9910 | no | 0.0231 | 1.0237 / 1.0112 | 1.0067 (1) | 1.0061 | 26.0% / 26.8% | UNDERPOWERED |
| SKEW→NQ C 1d Lin | E6 + VXN | 1971 | 0.9954 | [0.9883, 1.0010] | 0.0540 | no | 0.0090 | 0.9921 / 0.9998 | 1.0028 (20) | 0.9957 | 25.3% / 26.3% | NULL |
| SKEW→NQ C 1d Ext | E6 + VXN | 1971 | 0.9964 | [0.9873, 1.0035] | 0.1664 | no | 0.0115 | 0.9915 / 1.0029 | 1.0030 (19) | 0.9968 | 25.3% / 25.9% | NULL |
| SKEW→NQ C 5d Lin | E6 + VXN | 1967 | 1.0025 | [0.9972, 1.0076] | 0.7971 | no | 0.0073 | 1.0033 / 1.0015 | 1.0046 (16) | 1.0029 | 24.2% / 24.7% | NULL |
| SKEW→NQ C 5d Ext | E6 + VXN | 1967 | 1.0173 | [1.0053, 1.0308] | 0.9985 | no | 0.0177 | 1.0261 / 1.0057 | 1.0063 (0) | 1.0197 | 24.2% / 24.1% | UNDERPOWERED |
| VXEEM→AUDUSD C 1d Lin | R15 + SETTLE:aud_usd | 943 | 0.9949 | [0.9875, 1.0028] | 0.1479 | no | 0.0112 | — / 0.9949 | 1.0014 (20) | — | 21.7% / 21.7% | NULL |
| VXEEM→AUDUSD C 1d Ext | R15 + SETTLE:aud_usd | 943 | 1.0044 | [0.9951, 1.0131] | 0.7896 | no | 0.0127 | — / 1.0044 | 1.0007 (3) | — | 21.7% / 21.4% | NULL |
| VXEEM→AUDUSD C 5d Lin | R15 + SETTLE:aud_usd | 939 | 1.0002 | [0.9877, 1.0107] | 0.3908 | no | 0.0168 | — / 1.0002 | 1.0034 (13) | — | 22.4% / 23.1% | UNDERPOWERED |
| VXEEM→AUDUSD C 5d Ext | R15 + SETTLE:aud_usd | 939 | 1.0086 | [0.9941, 1.0193] | 0.8421 | no | 0.0175 | — / 1.0086 | 1.0031 (6) | — | 22.4% / 21.8% | UNDERPOWERED |
| VXFXI→AUDUSD C 1d Lin | R15 + SETTLE:aud_usd | 943 | 0.9967 | [0.9930, 1.0003] | 0.0400 | no | 0.0052 | — / 0.9967 | 1.0015 (17) | — | 21.7% / 22.5% | NULL |
| VXFXI→AUDUSD C 1d Ext | R15 + SETTLE:aud_usd | 943 | 1.0028 | [0.9964, 1.0128] | 0.8126 | no | 0.0117 | — / 1.0028 | 1.0046 (11) | — | 21.7% / 20.8% | NULL |
| VXFXI→AUDUSD C 5d Lin | R15 + SETTLE:aud_usd | 939 | 1.0041 | [0.9945, 1.0162] | 0.8181 | no | 0.0151 | — / 1.0040 | 1.0058 (12) | — | 22.4% / 20.7% | UNDERPOWERED |
| VXFXI→AUDUSD C 5d Ext | R15 + SETTLE:aud_usd | 939 | 1.0113 | [1.0009, 1.0287] | 0.9820 | no | 0.0195 | — / 1.0114 | 1.0061 (6) | — | 22.4% / 20.5% | UNDERPOWERED |
| VXGDX→GOLD C 1d Lin | HARCJ + GVZ | 1971 | 0.9935 | [0.9853, 1.0008] | 0.0380 | no | 0.0113 | 1.0002 / 0.9870 | 1.0004 (20) | — | 26.6% / 25.4% | NULL |
| VXGDX→GOLD C 1d Ext | HARCJ + GVZ | 1971 | 0.9928 | [0.9871, 0.9993] | 0.0115 | no | 0.0086 | 0.9946 / 0.9911 | 1.0020 (19) | — | 26.6% / 25.5% | NULL |
| VXGDX→GOLD C 5d Lin | HARCJ + GVZ | 1967 | 1.0073 | [0.9966, 1.0182] | 0.9045 | no | 0.0154 | 1.0035 / 1.0107 | 1.0075 (10) | — | 28.5% / 28.4% | UNDERPOWERED |
| VXGDX→GOLD C 5d Ext | HARCJ + GVZ | 1967 | 0.9979 | [0.9874, 1.0114] | 0.3193 | no | 0.0176 | 0.9972 / 0.9985 | 1.0019 (17) | — | 28.5% / 28.1% | UNDERPOWERED |
| VXAPL→NQ C 1d Lin | E6 + VXN | 1971 | 0.9725 | [0.9441, 0.9981] | 0.0155 | no | 0.0398 | 0.9710 / 0.9744 | 0.9970 (20) | — | 25.3% / 25.7% | UNDERPOWERED |
| VXAPL→NQ C 1d Ext | E6 + VXN | 1971 | 0.9913 | [0.9761, 1.0061] | 0.1539 | no | 0.0223 | 0.9885 / 0.9949 | 1.0003 (20) | — | 25.3% / 26.3% | UNDERPOWERED |
| VXAPL→NQ C 5d Lin | E6 + VXN | 1967 | 0.9945 | [0.9826, 1.0082] | 0.2199 | no | 0.0183 | 0.9993 / 0.9881 | 1.0113 (20) | — | 24.2% / 24.9% | UNDERPOWERED |
| VXAPL→NQ C 5d Ext | E6 + VXN | 1967 | 1.0008 | [0.9889, 1.0141] | 0.5817 | no | 0.0181 | 1.0053 / 0.9949 | 1.0088 (19) | — | 24.2% / 25.1% | UNDERPOWERED |
| VXAZN→NQ C 1d Lin | E6 + VXN | 1971 | 0.9769 | [0.9518, 0.9978] | 0.0160 | no | 0.0340 | 0.9717 / 0.9839 | 0.9941 (20) | — | 25.3% / 26.1% | UNDERPOWERED |
| VXAZN→NQ C 1d Ext | E6 + VXN | 1971 | 0.9889 | [0.9729, 1.0033] | 0.0770 | no | 0.0223 | 0.9833 / 0.9961 | 0.9992 (20) | — | 25.3% / 26.5% | UNDERPOWERED |
| VXAZN→NQ C 5d Lin | E6 + VXN | 1967 | 0.9948 | [0.9877, 1.0040] | 0.1354 | no | 0.0116 | 0.9965 / 0.9926 | 1.0051 (20) | — | 24.2% / 24.3% | NULL |
| VXAZN→NQ C 5d Ext | E6 + VXN | 1967 | 0.9993 | [0.9926, 1.0063] | 0.4433 | no | 0.0098 | 1.0021 / 0.9958 | 1.0066 (20) | — | 24.2% / 24.8% | NULL |
| OVX→USDCAD C 1d Lin | B_har_garcht + SETTLE:usd_cad | 943 | 1.0042 | [0.9868, 1.0194] | 0.6467 | no | 0.0233 | — / 1.0042 | 1.0001 (1) | — | 22.3% / 24.4% | UNDERPOWERED |
| OVX→USDCAD C 1d Ext | B_har_garcht + SETTLE:usd_cad | 943 | 1.0087 | [0.9971, 1.0203] | 0.8916 | no | 0.0168 | — / 1.0087 | 1.0009 (0) | — | 22.3% / 23.0% | UNDERPOWERED |
| OVX→USDCAD C 5d Lin | B_har_garcht + SETTLE:usd_cad | 939 | 1.0017 | [0.9932, 1.0098] | 0.6447 | no | 0.0121 | — / 1.0017 | 1.0051 (16) | — | 23.4% / 22.8% | NULL |
| OVX→USDCAD C 5d Ext | B_har_garcht + SETTLE:usd_cad | 939 | 1.0077 | [0.9960, 1.0204] | 0.9040 | no | 0.0171 | — / 1.0077 | 1.0098 (11) | — | 23.4% / 24.1% | UNDERPOWERED |
| OVX→BRENT C 1d Lin | B_har_garcht | 1972 | 0.9504 | [0.9346, 0.9720] | 0.0005 | yes | 0.0280 | 0.9442 / 0.9589 | 1.0006 (20) | — | 24.3% / 22.5% | VALIDATED |
| OVX→BRENT C 1d Ext | B_har_garcht | 1972 | 0.9622 | [0.9483, 0.9804] | 0.0005 | yes | 0.0238 | 0.9515 / 0.9767 | 1.0015 (20) | — | 24.3% / 23.1% | VALIDATED |
| OVX→BRENT C 5d Lin | B_har_garcht | 1968 | 0.9289 | [0.8965, 0.9688] | 0.0010 | yes | 0.0556 | 0.9297 / 0.9278 | 1.0144 (20) | — | 23.6% / 22.6% | VALIDATED |
| OVX→BRENT C 5d Ext | B_har_garcht | 1968 | 0.9388 | [0.9190, 0.9702] | 0.0005 | yes | 0.0386 | 0.9358 / 0.9429 | 1.0088 (20) | — | 23.6% / 21.8% | VALIDATED |

## Controls

- Positive control (A1, WTI C 1d, planted index with noise sd 0.25): ratio 0.76585 [0.74186, 0.79594] (bar < 0.90). Pass.
- Known-zero (pure-noise index): ratio 0.99788 [0.99296, 1.0028] (CI must hold 1, point ≥ 0.995). Pass.
- Benchmark rebuild: the ladder-v2 chosen sigma re-fitted per walk-forward year reproduces the stored `test_<track>.parquet` column (max relative error printed per instrument in `run_log.txt`).
- Placebo: 20 circular shifts of the index per cell (offsets 252 … n−252), same fit and score; median in the table.

## Disaggregation (descriptive; BH q = 0.10 over every bucket cell; survivors are candidates only)
74 of 236 bucket cells survive BH at q = 0.10, so about 7 of the 74 are expected to be false discoveries. The bucket cells overlap heavily (Lin and Ext share days, and the 1d and 5d windows overlap), so read this as a pattern, not 74 findings. The pattern: in the extreme-index buckets the benchmark's p75 line is badly off (exceeded 34-43% of days when the index is high or jumping, 11-16% when it is low), and the layer pulls it back toward 25%. That holds for VXTLT on ZB/ZN and VXSLV on silver as well, even though their pooled cells fail. **Candidate for its own prereg:** an extremes-only layer, active only on the decile days, scored on those days. These are candidates, never results.


| cell | bucket | n | ratio | p | BH | B p75 exc | L p75 exc |
|---|---|---|---|---|---|---|---|
| OVX→WTI 1d Lin | lvl_hi | 284 | 0.8591 | 0.0275 | **yes** | 37.7% | 27.1% |
| OVX→WTI 1d Lin | lvl_lo | 231 | 0.9044 | 0.0005 | **yes** | 13.4% | 27.7% |
| OVX→WTI 1d Lin | d5_hi | 244 | 0.8699 | 0.0005 | **yes** | 38.1% | 29.5% |
| OVX→WTI 1d Lin | d5_lo | 256 | 0.9524 | 0.0785 | no | 16.0% | 27.0% |
| OVX→WTI 1d Ext | lvl_hi | 284 | 0.9175 | 0.1024 | no | 37.7% | 23.9% |
| OVX→WTI 1d Ext | lvl_lo | 231 | 0.8734 | 0.0005 | **yes** | 13.4% | 23.4% |
| OVX→WTI 1d Ext | d5_hi | 244 | 0.9115 | 0.0005 | **yes** | 38.1% | 27.5% |
| OVX→WTI 1d Ext | d5_lo | 256 | 0.9210 | 0.0085 | **yes** | 16.0% | 23.8% |
| OVX→WTI 5d Lin | lvl_hi | 284 | 0.8813 | 0.0290 | **yes** | 42.6% | 25.7% |
| OVX→WTI 5d Lin | lvl_lo | 230 | 0.9393 | 0.4303 | no | 7.0% | 26.1% |
| OVX→WTI 5d Lin | d5_hi | 244 | 0.9421 | 0.3943 | no | 45.5% | 32.0% |
| OVX→WTI 5d Lin | d5_lo | 255 | 1.0051 | 0.5922 | no | 13.7% | 23.5% |
| OVX→WTI 5d Ext | lvl_hi | 284 | 0.9113 | 0.4498 | no | 42.6% | 20.8% |
| OVX→WTI 5d Ext | lvl_lo | 230 | 0.8641 | 0.0825 | no | 7.0% | 22.2% |
| OVX→WTI 5d Ext | d5_hi | 244 | 0.9290 | 0.0620 | no | 45.5% | 32.0% |
| OVX→WTI 5d Ext | d5_lo | 255 | 0.9686 | 0.2669 | no | 13.7% | 21.2% |
| VXSLV→SILVER 1d Lin | lvl_hi | 333 | 0.9412 | 0.1014 | no | 35.1% | 24.6% |
| VXSLV→SILVER 1d Lin | lvl_lo | 221 | 1.0021 | 0.3708 | no | 22.6% | 27.1% |
| VXSLV→SILVER 1d Lin | d5_hi | 188 | 0.9345 | 0.0005 | **yes** | 33.5% | 27.1% |
| VXSLV→SILVER 1d Lin | d5_lo | 208 | 1.0115 | 0.4583 | no | 26.0% | 30.8% |
| VXSLV→SILVER 1d Ext | lvl_hi | 333 | 0.9634 | 0.2399 | no | 35.1% | 25.8% |
| VXSLV→SILVER 1d Ext | lvl_lo | 221 | 1.0041 | 0.6757 | no | 22.6% | 28.5% |
| VXSLV→SILVER 1d Ext | d5_hi | 188 | 0.9564 | 0.0005 | **yes** | 33.5% | 28.7% |
| VXSLV→SILVER 1d Ext | d5_lo | 208 | 1.0004 | 0.3558 | no | 26.0% | 32.7% |
| VXSLV→SILVER 5d Lin | lvl_hi | 336 | 0.9230 | 0.0070 | **yes** | 37.8% | 28.3% |
| VXSLV→SILVER 5d Lin | lvl_lo | 221 | 0.9970 | 0.5102 | no | 14.9% | 31.7% |
| VXSLV→SILVER 5d Lin | d5_hi | 188 | 0.9496 | 0.4458 | no | 42.6% | 41.0% |
| VXSLV→SILVER 5d Lin | d5_lo | 205 | 1.0127 | 0.4733 | no | 22.0% | 25.4% |
| VXSLV→SILVER 5d Ext | lvl_hi | 336 | 0.9260 | 0.0505 | no | 37.8% | 29.8% |
| VXSLV→SILVER 5d Ext | lvl_lo | 221 | 0.9698 | 0.4493 | no | 14.9% | 26.2% |
| VXSLV→SILVER 5d Ext | d5_hi | 188 | 0.9223 | 0.0010 | **yes** | 42.6% | 42.6% |
| VXSLV→SILVER 5d Ext | d5_lo | 205 | 0.9670 | 0.0355 | no | 22.0% | 24.9% |
| VXTLT→ZB 1d Lin | lvl_hi | 365 | 1.0402 | 0.9490 | no | 29.3% | 20.0% |
| VXTLT→ZB 1d Lin | lvl_lo | 146 | 0.9536 | 0.0005 | **yes** | 15.8% | 21.2% |
| VXTLT→ZB 1d Lin | d5_hi | 248 | 0.9429 | 0.0180 | **yes** | 34.3% | 28.6% |
| VXTLT→ZB 1d Lin | d5_lo | 267 | 0.9918 | 0.5662 | no | 18.7% | 21.3% |
| VXTLT→ZB 1d Ext | lvl_hi | 365 | 0.9837 | 0.5087 | no | 29.3% | 23.6% |
| VXTLT→ZB 1d Ext | lvl_lo | 146 | 0.9402 | 0.0095 | **yes** | 15.8% | 18.5% |
| VXTLT→ZB 1d Ext | d5_hi | 248 | 0.9247 | 0.0020 | **yes** | 34.3% | 27.8% |
| VXTLT→ZB 1d Ext | d5_lo | 267 | 0.9824 | 0.1649 | no | 18.7% | 22.8% |
| VXTLT→ZB 5d Lin | lvl_hi | 343 | 1.0714 | 0.8766 | no | 30.9% | 21.0% |
| VXTLT→ZB 5d Lin | lvl_lo | 134 | 0.9414 | 0.1969 | no | 17.2% | 27.6% |
| VXTLT→ZB 5d Lin | d5_hi | 226 | 0.9815 | 0.3143 | no | 31.4% | 27.0% |
| VXTLT→ZB 5d Lin | d5_lo | 249 | 0.9817 | 0.5712 | no | 20.9% | 24.5% |
| VXTLT→ZB 5d Ext | lvl_hi | 343 | 1.0085 | 0.8356 | no | 30.9% | 25.1% |
| VXTLT→ZB 5d Ext | lvl_lo | 134 | 0.9306 | 0.0555 | no | 17.2% | 22.4% |
| VXTLT→ZB 5d Ext | d5_hi | 226 | 0.9753 | 0.1669 | no | 31.4% | 26.1% |
| VXTLT→ZB 5d Ext | d5_lo | 249 | 0.9831 | 0.3753 | no | 20.9% | 26.9% |
| VXTLT→ZN 1d Lin | lvl_hi | 293 | 1.2483 | 0.9890 | no | 28.3% | 15.4% |
| VXTLT→ZN 1d Lin | lvl_lo | 311 | 0.9570 | 0.0335 | no | 14.8% | 24.1% |
| VXTLT→ZN 1d Lin | d5_hi | 247 | 0.9424 | 0.0060 | **yes** | 36.0% | 29.1% |
| VXTLT→ZN 1d Lin | d5_lo | 264 | 1.0159 | 0.7106 | no | 19.7% | 24.2% |
| VXTLT→ZN 1d Ext | lvl_hi | 293 | 1.0042 | 0.5952 | no | 28.3% | 21.2% |
| VXTLT→ZN 1d Ext | lvl_lo | 311 | 0.9238 | 0.0015 | **yes** | 14.8% | 25.1% |
| VXTLT→ZN 1d Ext | d5_hi | 247 | 0.9181 | 0.0005 | **yes** | 36.0% | 26.3% |
| VXTLT→ZN 1d Ext | d5_lo | 264 | 0.9630 | 0.1509 | no | 19.7% | 26.5% |
| VXTLT→ZN 5d Lin | lvl_hi | 281 | 1.5612 | 0.9980 | no | 29.9% | 14.9% |
| VXTLT→ZN 5d Lin | lvl_lo | 294 | 0.9016 | 0.0060 | **yes** | 11.2% | 21.4% |
| VXTLT→ZN 5d Lin | d5_hi | 222 | 1.0257 | 0.9180 | no | 32.0% | 23.9% |
| VXTLT→ZN 5d Lin | d5_lo | 243 | 1.0945 | 0.8751 | no | 20.6% | 26.7% |
| VXTLT→ZN 5d Ext | lvl_hi | 281 | 1.1132 | 0.8816 | no | 29.9% | 19.2% |
| VXTLT→ZN 5d Ext | lvl_lo | 294 | 0.8610 | 0.0040 | **yes** | 11.2% | 26.5% |
| VXTLT→ZN 5d Ext | d5_hi | 222 | 0.9676 | 0.3403 | no | 32.0% | 23.9% |
| VXTLT→ZN 5d Ext | d5_lo | 243 | 0.9818 | 0.4443 | no | 20.6% | 30.5% |
| RVX→US2000 1d Lin | lvl_hi | 229 | 0.9407 | 0.0005 | **yes** | 43.2% | 34.9% |
| RVX→US2000 1d Lin | lvl_lo | 75 | 0.8814 | 0.0005 | **yes** | 32.0% | 36.0% |
| RVX→US2000 1d Lin | d5_hi | 165 | 0.8788 | 0.0005 | **yes** | 46.1% | 37.0% |
| RVX→US2000 1d Lin | d5_lo | 183 | 1.0722 | 0.9640 | no | 24.0% | 30.6% |
| RVX→US2000 1d Ext | lvl_hi | 229 | 0.9132 | 0.0005 | **yes** | 43.2% | 31.0% |
| RVX→US2000 1d Ext | lvl_lo | 75 | 0.9091 | 0.0005 | **yes** | 32.0% | 30.7% |
| RVX→US2000 1d Ext | d5_hi | 165 | 0.8846 | 0.0005 | **yes** | 46.1% | 32.7% |
| RVX→US2000 1d Ext | d5_lo | 183 | 1.0378 | 0.8856 | no | 24.0% | 29.0% |
| RVX→US2000 5d Lin | lvl_hi | 231 | 0.9388 | 0.0005 | **yes** | 45.5% | 42.0% |
| RVX→US2000 5d Lin | lvl_lo | 80 | 0.9573 | 0.0005 | **yes** | 27.5% | 35.0% |
| RVX→US2000 5d Lin | d5_hi | 165 | 1.0083 | 0.9075 | no | 31.5% | 24.2% |
| RVX→US2000 5d Lin | d5_lo | 181 | 1.0439 | 0.9855 | no | 23.2% | 33.1% |
| RVX→US2000 5d Ext | lvl_hi | 231 | 0.8988 | 0.0005 | **yes** | 45.5% | 33.3% |
| RVX→US2000 5d Ext | lvl_lo | 80 | 0.9702 | 0.0005 | **yes** | 27.5% | 31.2% |
| RVX→US2000 5d Ext | d5_hi | 165 | 1.0033 | 0.7721 | no | 31.5% | 21.2% |
| RVX→US2000 5d Ext | d5_lo | 181 | 1.0103 | 0.9760 | no | 23.2% | 27.1% |
| VXD→US30 1d Lin | lvl_hi | 74 | 0.9936 | 0.9930 | no | 29.7% | 24.3% |
| VXD→US30 1d Lin | lvl_lo | 312 | 0.9475 | 0.2689 | no | 21.2% | 20.2% |
| VXD→US30 1d Lin | d5_hi | 193 | 0.7714 | 0.0890 | no | 42.0% | 27.5% |
| VXD→US30 1d Lin | d5_lo | 210 | 1.0559 | 1.0000 | no | 17.6% | 32.4% |
| VXD→US30 1d Ext | lvl_hi | 74 | 0.9904 | 1.0000 | no | 29.7% | 25.7% |
| VXD→US30 1d Ext | lvl_lo | 312 | 0.9706 | 0.2644 | no | 21.2% | 19.9% |
| VXD→US30 1d Ext | d5_hi | 193 | 0.8610 | 0.1784 | no | 42.0% | 20.7% |
| VXD→US30 1d Ext | d5_lo | 210 | 1.0051 | 0.6482 | no | 17.6% | 26.7% |
| VXD→US30 5d Lin | lvl_hi | 74 | 0.9806 | 0.0090 | **yes** | 44.6% | 33.8% |
| VXD→US30 5d Lin | lvl_lo | 312 | 0.9812 | 0.2099 | no | 14.7% | 19.6% |
| VXD→US30 5d Lin | d5_hi | 193 | 0.9592 | 0.4188 | no | 24.4% | 18.1% |
| VXD→US30 5d Lin | d5_lo | 210 | 1.0174 | 0.6612 | no | 18.1% | 27.6% |
| VXD→US30 5d Ext | lvl_hi | 74 | 0.9742 | 0.0705 | no | 44.6% | 29.7% |
| VXD→US30 5d Ext | lvl_lo | 312 | 0.9712 | 0.0265 | **yes** | 14.7% | 23.7% |
| VXD→US30 5d Ext | d5_hi | 193 | 1.0028 | 0.7416 | no | 24.4% | 14.5% |
| VXD→US30 5d Ext | d5_lo | 210 | 0.9821 | 0.1794 | no | 18.1% | 27.6% |
| SKEW→SPX500 1d Lin | lvl_hi | 495 | 0.9821 | 0.2439 | no | 20.4% | 28.9% |
| SKEW→SPX500 1d Lin | lvl_lo | 189 | 0.9583 | 0.0250 | **yes** | 31.7% | 24.3% |
| SKEW→SPX500 1d Lin | d5_hi | 200 | 0.9833 | 0.3443 | no | 17.5% | 28.5% |
| SKEW→SPX500 1d Lin | d5_lo | 179 | 0.9441 | 0.0010 | **yes** | 35.8% | 31.8% |
| SKEW→SPX500 1d Ext | lvl_hi | 495 | 0.9933 | 0.4573 | no | 20.4% | 28.1% |
| SKEW→SPX500 1d Ext | lvl_lo | 189 | 0.9579 | 0.0920 | no | 31.7% | 22.2% |
| SKEW→SPX500 1d Ext | d5_hi | 200 | 0.9761 | 0.1019 | no | 17.5% | 23.5% |
| SKEW→SPX500 1d Ext | d5_lo | 179 | 0.9390 | 0.0575 | no | 35.8% | 32.4% |
| SKEW→SPX500 5d Lin | lvl_hi | 503 | 1.0061 | 0.7041 | no | 23.7% | 29.8% |
| SKEW→SPX500 5d Lin | lvl_lo | 188 | 1.0302 | 0.9105 | no | 23.9% | 17.0% |
| SKEW→SPX500 5d Lin | d5_hi | 210 | 0.9952 | 0.0215 | **yes** | 21.4% | 26.7% |
| SKEW→SPX500 5d Lin | d5_lo | 179 | 0.9987 | 0.3098 | no | 30.7% | 31.3% |
| SKEW→SPX500 5d Ext | lvl_hi | 503 | 1.0211 | 0.9265 | no | 23.7% | 30.6% |
| SKEW→SPX500 5d Ext | lvl_lo | 188 | 1.1345 | 0.9930 | no | 23.9% | 13.8% |
| SKEW→SPX500 5d Ext | d5_hi | 210 | 1.0076 | 0.2654 | no | 21.4% | 24.3% |
| SKEW→SPX500 5d Ext | d5_lo | 179 | 1.0190 | 0.7811 | no | 30.7% | 29.1% |
| SKEW→NQ 1d Lin | lvl_hi | 487 | 0.9927 | 0.2189 | no | 21.8% | 26.1% |
| SKEW→NQ 1d Lin | lvl_lo | 215 | 0.9811 | 0.0090 | **yes** | 30.2% | 26.0% |
| SKEW→NQ 1d Lin | d5_hi | 187 | 0.9810 | 0.0225 | **yes** | 17.1% | 23.0% |
| SKEW→NQ 1d Lin | d5_lo | 182 | 0.9791 | 0.0025 | **yes** | 32.4% | 31.9% |
| SKEW→NQ 1d Ext | lvl_hi | 487 | 1.0011 | 0.5172 | no | 21.8% | 25.1% |
| SKEW→NQ 1d Ext | lvl_lo | 215 | 0.9740 | 0.0540 | no | 30.2% | 24.7% |
| SKEW→NQ 1d Ext | d5_hi | 187 | 0.9903 | 0.0025 | **yes** | 17.1% | 18.7% |
| SKEW→NQ 1d Ext | d5_lo | 182 | 0.9495 | 0.0040 | **yes** | 32.4% | 28.0% |
| SKEW→NQ 5d Lin | lvl_hi | 490 | 1.0081 | 0.8941 | no | 23.9% | 26.3% |
| SKEW→NQ 5d Lin | lvl_lo | 216 | 1.0077 | 0.8856 | no | 21.3% | 18.1% |
| SKEW→NQ 5d Lin | d5_hi | 186 | 1.0065 | 0.3408 | no | 19.4% | 23.1% |
| SKEW→NQ 5d Lin | d5_lo | 183 | 1.0013 | 0.0930 | no | 24.6% | 24.6% |
| SKEW→NQ 5d Ext | lvl_hi | 490 | 1.0410 | 0.9995 | no | 23.9% | 24.3% |
| SKEW→NQ 5d Ext | lvl_lo | 216 | 1.0747 | 0.9990 | no | 21.3% | 15.3% |
| SKEW→NQ 5d Ext | d5_hi | 186 | 1.0140 | 0.5697 | no | 19.4% | 21.5% |
| SKEW→NQ 5d Ext | d5_lo | 183 | 1.0033 | 0.8301 | no | 24.6% | 25.1% |
| VXEEM→AUDUSD 1d Lin | lvl_hi | 146 | 0.9827 | 0.0005 | **yes** | 21.9% | 24.0% |
| VXEEM→AUDUSD 1d Lin | lvl_lo | 215 | 1.0046 | 0.6567 | no | 22.3% | 20.9% |
| VXEEM→AUDUSD 1d Lin | d5_hi | 84 | 0.9835 | 0.0005 | **yes** | 28.6% | 27.4% |
| VXEEM→AUDUSD 1d Lin | d5_lo | 80 | 0.9698 | 0.0005 | **yes** | 11.3% | 12.5% |
| VXEEM→AUDUSD 1d Ext | lvl_hi | 146 | 1.0294 | 0.9925 | no | 21.9% | 17.8% |
| VXEEM→AUDUSD 1d Ext | lvl_lo | 215 | 1.0149 | 0.7751 | no | 22.3% | 20.5% |
| VXEEM→AUDUSD 1d Ext | d5_hi | 84 | 1.0155 | 0.9955 | no | 28.6% | 25.0% |
| VXEEM→AUDUSD 1d Ext | d5_lo | 80 | 0.9425 | 0.0005 | **yes** | 11.3% | 18.8% |
| VXEEM→AUDUSD 5d Lin | lvl_hi | 141 | 1.0364 | 0.9285 | no | 22.7% | 18.4% |
| VXEEM→AUDUSD 5d Lin | lvl_lo | 214 | 0.9949 | 0.3193 | no | 24.3% | 27.6% |
| VXEEM→AUDUSD 5d Lin | d5_hi | 84 | 0.9971 | 0.2394 | no | 23.8% | 21.4% |
| VXEEM→AUDUSD 5d Lin | d5_lo | 79 | 0.9903 | 0.0130 | **yes** | 20.3% | 24.1% |
| VXEEM→AUDUSD 5d Ext | lvl_hi | 141 | 1.0739 | 1.0000 | no | 22.7% | 12.1% |
| VXEEM→AUDUSD 5d Ext | lvl_lo | 214 | 0.9988 | 0.6597 | no | 24.3% | 27.1% |
| VXEEM→AUDUSD 5d Ext | d5_hi | 84 | 1.0294 | 1.0000 | no | 23.8% | 21.4% |
| VXEEM→AUDUSD 5d Ext | d5_lo | 79 | 0.9849 | 0.1319 | no | 20.3% | 27.8% |
| VXFXI→AUDUSD 1d Lin | lvl_hi | 240 | 1.0022 | 0.9990 | no | 24.2% | 24.6% |
| VXFXI→AUDUSD 1d Lin | d5_hi | 219 | 0.9957 | 0.0020 | **yes** | 22.8% | 24.2% |
| VXFXI→AUDUSD 1d Lin | d5_lo | 59 | 0.9565 | — | no | 13.6% | 16.9% |
| VXFXI→AUDUSD 1d Ext | lvl_hi | 240 | 1.0276 | 1.0000 | no | 24.2% | 18.8% |
| VXFXI→AUDUSD 1d Ext | d5_hi | 219 | 1.0007 | 0.2894 | no | 22.8% | 22.8% |
| VXFXI→AUDUSD 1d Ext | d5_lo | 59 | 0.9464 | — | no | 13.6% | 16.9% |
| VXFXI→AUDUSD 5d Lin | lvl_hi | 238 | 1.0145 | 0.8411 | no | 21.8% | 18.1% |
| VXFXI→AUDUSD 5d Lin | d5_hi | 219 | 1.0062 | 0.9995 | no | 19.6% | 19.2% |
| VXFXI→AUDUSD 5d Lin | d5_lo | 59 | 0.9871 | — | no | 20.3% | 20.3% |
| VXFXI→AUDUSD 5d Ext | lvl_hi | 238 | 1.0369 | 0.9795 | no | 21.8% | 16.4% |
| VXFXI→AUDUSD 5d Ext | d5_hi | 219 | 1.0060 | 0.9870 | no | 19.6% | 20.1% |
| VXFXI→AUDUSD 5d Ext | d5_lo | 59 | 1.0349 | — | no | 20.3% | 23.7% |
| VXGDX→GOLD 1d Lin | lvl_hi | 177 | 1.0006 | 0.0160 | **yes** | 24.9% | 24.9% |
| VXGDX→GOLD 1d Lin | lvl_lo | 367 | 0.9783 | 0.0125 | **yes** | 31.9% | 29.7% |
| VXGDX→GOLD 1d Lin | d5_hi | 812 | 0.9833 | 0.0340 | no | 29.6% | 28.4% |
| VXGDX→GOLD 1d Lin | d5_lo | 136 | 0.9944 | 0.1944 | no | 16.9% | 18.4% |
| VXGDX→GOLD 1d Ext | lvl_hi | 177 | 1.0111 | 0.9775 | no | 24.9% | 21.5% |
| VXGDX→GOLD 1d Ext | lvl_lo | 367 | 0.9805 | 0.0075 | **yes** | 31.9% | 28.3% |
| VXGDX→GOLD 1d Ext | d5_hi | 812 | 0.9883 | 0.1999 | no | 29.6% | 27.6% |
| VXGDX→GOLD 1d Ext | d5_lo | 136 | 0.9757 | 0.0005 | **yes** | 16.9% | 22.1% |
| VXGDX→GOLD 5d Lin | lvl_hi | 176 | 1.0038 | 0.5757 | no | 26.1% | 21.0% |
| VXGDX→GOLD 5d Lin | lvl_lo | 363 | 1.0147 | 0.8046 | no | 31.1% | 35.0% |
| VXGDX→GOLD 5d Lin | d5_hi | 813 | 1.0128 | 0.8476 | no | 32.7% | 31.1% |
| VXGDX→GOLD 5d Lin | d5_lo | 135 | 0.9676 | 0.0015 | **yes** | 16.3% | 20.0% |
| VXGDX→GOLD 5d Ext | lvl_hi | 176 | 1.0073 | 0.5882 | no | 26.1% | 19.3% |
| VXGDX→GOLD 5d Ext | lvl_lo | 363 | 0.9937 | 0.0930 | no | 31.1% | 31.1% |
| VXGDX→GOLD 5d Ext | d5_hi | 813 | 0.9989 | 0.5352 | no | 32.7% | 30.8% |
| VXGDX→GOLD 5d Ext | d5_lo | 135 | 0.9664 | 0.0005 | **yes** | 16.3% | 20.0% |
| VXAPL→NQ 1d Lin | lvl_hi | 100 | 1.0252 | 1.0000 | no | 25.0% | 30.0% |
| VXAPL→NQ 1d Lin | lvl_lo | 329 | 0.9876 | 0.3728 | no | 25.8% | 22.2% |
| VXAPL→NQ 1d Lin | d5_hi | 163 | 0.8425 | 0.0155 | **yes** | 39.3% | 27.0% |
| VXAPL→NQ 1d Lin | d5_lo | 146 | 1.0083 | 0.2249 | no | 24.0% | 33.6% |
| VXAPL→NQ 1d Ext | lvl_hi | 100 | 1.0058 | 0.9905 | no | 25.0% | 26.0% |
| VXAPL→NQ 1d Ext | lvl_lo | 329 | 0.9943 | 0.3178 | no | 25.8% | 24.0% |
| VXAPL→NQ 1d Ext | d5_hi | 163 | 0.9181 | 0.0005 | **yes** | 39.3% | 27.0% |
| VXAPL→NQ 1d Ext | d5_lo | 146 | 1.0177 | 0.5097 | no | 24.0% | 30.8% |
| VXAPL→NQ 5d Lin | lvl_hi | 101 | 0.9915 | 0.0780 | no | 36.6% | 35.6% |
| VXAPL→NQ 5d Lin | lvl_lo | 329 | 1.0009 | 0.6332 | no | 20.1% | 22.8% |
| VXAPL→NQ 5d Lin | d5_hi | 167 | 0.9649 | 0.1414 | no | 27.5% | 24.6% |
| VXAPL→NQ 5d Lin | d5_lo | 146 | 1.0120 | 0.8996 | no | 20.5% | 26.0% |
| VXAPL→NQ 5d Ext | lvl_hi | 101 | 0.9680 | 0.0005 | **yes** | 36.6% | 27.7% |
| VXAPL→NQ 5d Ext | lvl_lo | 329 | 1.0089 | 0.7916 | no | 20.1% | 23.7% |
| VXAPL→NQ 5d Ext | d5_hi | 167 | 1.0098 | 0.6567 | no | 27.5% | 17.4% |
| VXAPL→NQ 5d Ext | d5_lo | 146 | 1.0128 | 0.9790 | no | 20.5% | 22.6% |
| VXAZN→NQ 1d Lin | lvl_hi | 163 | 1.0241 | 1.0000 | no | 27.0% | 32.5% |
| VXAZN→NQ 1d Lin | lvl_lo | 282 | 0.9243 | 0.0220 | **yes** | 29.1% | 23.4% |
| VXAZN→NQ 1d Lin | d5_hi | 156 | 0.8628 | 0.0200 | **yes** | 37.8% | 27.6% |
| VXAZN→NQ 1d Lin | d5_lo | 165 | 0.9807 | 0.2359 | no | 23.0% | 31.5% |
| VXAZN→NQ 1d Ext | lvl_hi | 163 | 1.0377 | 1.0000 | no | 27.0% | 31.3% |
| VXAZN→NQ 1d Ext | lvl_lo | 282 | 0.9486 | 0.0005 | **yes** | 29.1% | 25.9% |
| VXAZN→NQ 1d Ext | d5_hi | 156 | 0.9088 | 0.1289 | no | 37.8% | 22.4% |
| VXAZN→NQ 1d Ext | d5_lo | 165 | 0.9982 | 0.6922 | no | 23.0% | 30.9% |
| VXAZN→NQ 5d Lin | lvl_hi | 163 | 0.9832 | 0.0240 | **yes** | 35.0% | 31.9% |
| VXAZN→NQ 5d Lin | lvl_lo | 282 | 0.9752 | 0.0005 | **yes** | 20.6% | 23.4% |
| VXAZN→NQ 5d Lin | d5_hi | 157 | 0.9982 | 0.7531 | no | 25.5% | 21.7% |
| VXAZN→NQ 5d Lin | d5_lo | 164 | 0.9833 | 0.4063 | no | 20.7% | 25.6% |
| VXAZN→NQ 5d Ext | lvl_hi | 163 | 0.9874 | 0.1199 | no | 35.0% | 31.9% |
| VXAZN→NQ 5d Ext | lvl_lo | 282 | 0.9859 | 0.1234 | no | 20.6% | 24.5% |
| VXAZN→NQ 5d Ext | d5_hi | 157 | 1.0225 | 0.9820 | no | 25.5% | 21.7% |
| VXAZN→NQ 5d Ext | d5_lo | 164 | 0.9789 | 0.2124 | no | 20.7% | 25.0% |
| OVX→USDCAD 1d Lin | lvl_hi | 291 | 1.0132 | 0.8526 | no | 19.9% | 27.5% |
| OVX→USDCAD 1d Lin | lvl_lo | 116 | 1.0109 | 0.8226 | no | 21.6% | 19.0% |
| OVX→USDCAD 1d Lin | d5_hi | 112 | 1.0012 | 0.0005 | **yes** | 25.9% | 25.9% |
| OVX→USDCAD 1d Lin | d5_lo | 100 | 1.0414 | 0.8321 | no | 25.0% | 31.0% |
| OVX→USDCAD 1d Ext | lvl_hi | 291 | 1.0032 | 0.5212 | no | 19.9% | 23.4% |
| OVX→USDCAD 1d Ext | lvl_lo | 116 | 1.0361 | 1.0000 | no | 21.6% | 19.8% |
| OVX→USDCAD 1d Ext | d5_hi | 112 | 0.9946 | 0.0015 | **yes** | 25.9% | 25.0% |
| OVX→USDCAD 1d Ext | d5_lo | 100 | 1.0280 | 0.5387 | no | 25.0% | 30.0% |
| OVX→USDCAD 5d Lin | lvl_hi | 287 | 1.0031 | 0.5132 | no | 30.0% | 27.5% |
| OVX→USDCAD 5d Lin | lvl_lo | 117 | 1.0027 | 0.1284 | no | 21.4% | 23.1% |
| OVX→USDCAD 5d Lin | d5_hi | 112 | 1.0007 | 0.9535 | no | 35.7% | 30.4% |
| OVX→USDCAD 5d Lin | d5_lo | 99 | 0.9956 | 0.0260 | **yes** | 19.2% | 18.2% |
| OVX→USDCAD 5d Ext | lvl_hi | 287 | 1.0246 | 1.0000 | no | 30.0% | 31.7% |
| OVX→USDCAD 5d Ext | lvl_lo | 117 | 1.0049 | 0.1654 | no | 21.4% | 23.1% |
| OVX→USDCAD 5d Ext | d5_hi | 112 | 0.9952 | 0.5627 | no | 35.7% | 35.7% |
| OVX→USDCAD 5d Ext | d5_lo | 99 | 0.9987 | 0.0005 | **yes** | 19.2% | 24.2% |
| OVX→BRENT 1d Lin | lvl_hi | 376 | 0.9338 | 0.0125 | **yes** | 35.4% | 22.6% |
| OVX→BRENT 1d Lin | lvl_lo | 164 | 0.8982 | 0.0005 | **yes** | 14.6% | 29.3% |
| OVX→BRENT 1d Lin | d5_hi | 244 | 0.8866 | 0.0005 | **yes** | 40.6% | 28.3% |
| OVX→BRENT 1d Lin | d5_lo | 256 | 0.9586 | 0.1779 | no | 18.8% | 25.4% |
| OVX→BRENT 1d Ext | lvl_hi | 376 | 0.9508 | 0.0290 | **yes** | 35.4% | 23.4% |
| OVX→BRENT 1d Ext | lvl_lo | 164 | 0.8857 | 0.0005 | **yes** | 14.6% | 25.6% |
| OVX→BRENT 1d Ext | d5_hi | 244 | 0.9117 | 0.0005 | **yes** | 40.6% | 27.0% |
| OVX→BRENT 1d Ext | d5_lo | 256 | 0.9447 | 0.0520 | no | 18.8% | 26.6% |
| OVX→BRENT 5d Lin | lvl_hi | 382 | 0.8950 | 0.0905 | no | 39.5% | 24.3% |
| OVX→BRENT 5d Lin | lvl_lo | 164 | 0.7418 | 0.0005 | **yes** | 4.3% | 18.9% |
| OVX→BRENT 5d Lin | d5_hi | 244 | 0.9695 | 0.6557 | no | 43.9% | 31.1% |
| OVX→BRENT 5d Lin | d5_lo | 255 | 0.9166 | 0.0070 | **yes** | 14.1% | 20.8% |
| OVX→BRENT 5d Ext | lvl_hi | 382 | 0.9211 | 0.1609 | no | 39.5% | 24.6% |
| OVX→BRENT 5d Ext | lvl_lo | 164 | 0.7092 | 0.0005 | **yes** | 4.3% | 16.5% |
| OVX→BRENT 5d Ext | d5_hi | 244 | 0.9284 | 0.1949 | no | 43.9% | 28.3% |
| OVX→BRENT 5d Ext | d5_lo | 255 | 0.8977 | 0.0005 | **yes** | 14.1% | 18.4% |

## Replication track cells

| cell | n | ratio | 95% CI |
|---|---|---|---|
| OVX→WTI F 1d Lin | 2227 | 0.8916 | [0.8419, 0.9411] |
| OVX→WTI F 1d Ext | 2227 | 0.9204 | [0.8856, 0.9597] |
| OVX→WTI F 5d Lin | 2223 | 0.8883 | [0.8203, 0.9517] |
| OVX→WTI F 5d Ext | 2223 | 0.9118 | [0.8686, 0.9578] |
| VXSLV→SILVER F 1d Lin | 2046 | 0.9436 | [0.9186, 0.9686] |
| VXSLV→SILVER F 1d Ext | 2046 | 0.9621 | [0.9382, 0.9845] |
| VXSLV→SILVER F 5d Lin | 1950 | 0.9363 | [0.8963, 0.9739] |
| VXSLV→SILVER F 5d Ext | 1950 | 0.9420 | [0.9109, 0.9754] |
| RVX→US2000 F 1d Lin | 1682 | 0.9741 | [0.9523, 0.9994] |
| RVX→US2000 F 1d Ext | 1682 | 0.9792 | [0.9598, 1.0004] |
| RVX→US2000 F 5d Lin | 1656 | 0.9922 | [0.9775, 1.0114] |
| RVX→US2000 F 5d Ext | 1656 | 0.9982 | [0.9836, 1.0125] |
| VXD→US30 F 1d Lin | 2192 | 0.9590 | [0.9220, 0.9955] |
| VXD→US30 F 1d Ext | 2192 | 0.9735 | [0.9496, 0.9966] |
| VXD→US30 F 5d Lin | 2158 | 0.9976 | [0.9786, 1.0155] |
| VXD→US30 F 5d Ext | 2158 | 0.9956 | [0.9817, 1.0112] |
| SKEW→SPX500 F 1d Lin | 2197 | 0.9898 | [0.9807, 0.9992] |
| SKEW→SPX500 F 1d Ext | 2197 | 0.9911 | [0.9811, 1.0019] |
| SKEW→SPX500 F 5d Lin | 2165 | 0.9976 | [0.9903, 1.0064] |
| SKEW→SPX500 F 5d Ext | 2165 | 1.0061 | [0.9928, 1.0191] |
| SKEW→NQ F 1d Lin | 1946 | 0.9957 | [0.9863, 1.0035] |
| SKEW→NQ F 1d Ext | 1946 | 0.9968 | [0.9870, 1.0058] |
| SKEW→NQ F 5d Lin | 1922 | 1.0029 | [0.9963, 1.0089] |
| SKEW→NQ F 5d Ext | 1922 | 1.0197 | [1.0065, 1.0324] |

## Per-year ratios (primary cells)

| cell | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|---|---|
| OVX→WTI 1d Lin | — | 0.948 | 0.881 | 0.941 | 0.969 | 0.952 | 0.994 | 0.963 | 0.955 |
| OVX→WTI 1d Ext | — | 0.958 | 0.907 | 0.950 | 0.959 | 0.991 | 0.994 | 0.959 | 0.966 |
| OVX→WTI 5d Lin | — | 0.910 | 0.995 | 0.915 | 0.929 | 0.925 | 1.002 | 0.931 | 0.906 |
| OVX→WTI 5d Ext | — | 0.939 | 0.946 | 0.988 | 0.938 | 0.963 | 0.995 | 0.945 | 0.933 |
| VXSLV→SILVER 1d Lin | — | 0.954 | 0.962 | 0.981 | 1.012 | 1.027 | 0.989 | 0.971 | 1.012 |
| VXSLV→SILVER 1d Ext | — | 0.988 | 0.971 | 1.011 | 1.028 | 0.997 | 0.995 | 0.972 | 1.008 |
| VXSLV→SILVER 5d Lin | — | 0.937 | 1.018 | 0.974 | 0.987 | 0.968 | 0.977 | 0.971 | 0.972 |
| VXSLV→SILVER 5d Ext | — | 0.979 | 0.987 | 0.981 | 1.026 | 0.973 | 0.984 | 0.974 | 0.964 |
| VXTLT→ZB 1d Lin | 0.983 | 1.016 | 1.058 | 0.991 | 0.971 | 0.980 | 0.985 | 0.978 | 0.983 |
| VXTLT→ZB 1d Ext | 0.998 | 1.017 | 0.972 | 0.993 | 0.988 | 0.985 | 0.990 | 0.981 | 0.991 |
| VXTLT→ZB 5d Lin | 0.987 | 1.024 | 1.127 | 0.971 | 0.997 | 0.961 | 0.963 | 0.973 | 0.967 |
| VXTLT→ZB 5d Ext | 1.010 | 1.005 | 1.007 | 1.011 | 1.019 | 0.976 | 0.981 | 0.980 | 1.000 |
| VXTLT→ZN 1d Lin | 0.992 | 1.020 | 1.294 | 0.992 | 0.973 | 0.972 | 0.977 | 0.964 | 0.986 |
| VXTLT→ZN 1d Ext | 0.994 | 0.997 | 1.012 | 1.006 | 0.970 | 0.970 | 0.957 | 0.972 | 0.984 |
| VXTLT→ZN 5d Lin | 0.954 | 1.040 | 1.674 | 1.003 | 1.005 | 0.951 | 0.965 | 0.972 | 0.963 |
| VXTLT→ZN 5d Ext | 0.964 | 1.007 | 1.138 | 1.070 | 1.006 | 0.939 | 0.939 | 0.972 | 0.970 |
| RVX→US2000 1d Lin | — | 0.962 | 1.019 | 0.958 | 0.987 | 0.991 | 0.968 | 0.936 | 0.964 |
| RVX→US2000 1d Ext | — | 0.980 | 0.998 | 0.961 | 1.000 | 0.986 | 0.968 | 0.951 | 0.979 |
| RVX→US2000 5d Lin | — | 0.979 | 1.020 | 0.975 | 1.002 | 1.014 | 0.968 | 0.955 | 0.979 |
| RVX→US2000 5d Ext | — | 1.002 | 1.006 | 0.974 | 1.024 | 0.993 | 0.968 | 0.967 | 0.996 |
| VXD→US30 1d Lin | — | 0.956 | 0.891 | 1.002 | 1.011 | 1.013 | 1.014 | 0.903 | 0.981 |
| VXD→US30 1d Ext | — | 0.983 | 0.938 | 0.963 | 1.013 | 1.008 | 1.019 | 0.952 | 0.960 |
| VXD→US30 5d Lin | — | 0.944 | 0.967 | 1.026 | 0.983 | 0.979 | 1.006 | 0.986 | 1.000 |
| VXD→US30 5d Ext | — | 0.977 | 0.974 | 1.002 | 0.996 | 0.991 | 1.014 | 0.992 | 1.002 |
| SKEW→SPX500 1d Lin | — | 0.997 | 0.969 | 0.967 | 0.988 | 1.002 | 1.010 | 0.997 | 1.024 |
| SKEW→SPX500 1d Ext | — | 1.006 | 0.968 | 0.982 | 0.999 | 1.007 | 1.003 | 0.995 | 1.020 |
| SKEW→SPX500 5d Lin | — | 1.044 | 0.995 | 0.988 | 0.982 | 0.989 | 0.994 | 1.020 | 1.004 |
| SKEW→SPX500 5d Ext | — | 1.120 | 1.006 | 0.997 | 1.013 | 1.010 | 1.006 | 1.020 | 1.002 |
| SKEW→NQ 1d Lin | — | 0.998 | 0.986 | 0.991 | 0.997 | 0.994 | 1.006 | 0.990 | 1.016 |
| SKEW→NQ 1d Ext | — | 0.997 | 0.977 | 0.992 | 1.003 | 1.004 | 1.002 | 0.993 | 1.021 |
| SKEW→NQ 5d Lin | — | 1.018 | 0.999 | 1.008 | 0.997 | 0.998 | 1.004 | 1.002 | 1.002 |
| SKEW→NQ 5d Ext | — | 1.076 | 1.013 | 1.041 | 1.005 | 1.002 | 1.008 | 1.010 | 0.998 |
| VXEEM→AUDUSD 1d Lin | — | — | — | — | — | 1.005 | 1.001 | 0.987 | 0.982 |
| VXEEM→AUDUSD 1d Ext | — | — | — | — | — | 1.010 | 1.000 | 0.997 | 1.014 |
| VXEEM→AUDUSD 5d Lin | — | — | — | — | — | 0.998 | 1.010 | 0.987 | 1.015 |
| VXEEM→AUDUSD 5d Ext | — | — | — | — | — | 1.004 | 1.009 | 0.996 | 1.037 |
| VXFXI→AUDUSD 1d Lin | — | — | — | — | — | 1.000 | 1.000 | 0.991 | 0.994 |
| VXFXI→AUDUSD 1d Ext | — | — | — | — | — | 0.999 | 1.020 | 0.996 | 0.995 |
| VXFXI→AUDUSD 5d Lin | — | — | — | — | — | 0.988 | 1.026 | 1.006 | 0.995 |
| VXFXI→AUDUSD 5d Ext | — | — | — | — | — | 0.993 | 1.040 | 1.011 | 1.000 |
| VXGDX→GOLD 1d Lin | — | 0.992 | 0.996 | 1.004 | 1.009 | 0.997 | 0.997 | 0.984 | 0.977 |
| VXGDX→GOLD 1d Ext | — | 0.989 | 0.994 | 0.994 | 1.001 | 1.005 | 0.996 | 0.984 | 0.985 |
| VXGDX→GOLD 5d Lin | — | 1.013 | 1.004 | 0.990 | 1.009 | 1.012 | 0.986 | 1.039 | 1.004 |
| VXGDX→GOLD 5d Ext | — | 1.002 | 0.996 | 0.999 | 0.993 | 1.012 | 0.989 | 1.005 | 0.993 |
| VXAPL→NQ 1d Lin | — | 0.988 | 0.937 | 0.989 | 0.984 | 1.007 | 0.995 | 0.919 | 1.005 |
| VXAPL→NQ 1d Ext | — | 0.995 | 0.974 | 1.002 | 0.991 | 1.005 | 1.006 | 0.967 | 1.017 |
| VXAPL→NQ 5d Lin | — | 1.010 | 0.988 | 0.983 | 1.015 | 0.994 | 0.987 | 0.970 | 1.016 |
| VXAPL→NQ 5d Ext | — | 1.021 | 0.982 | 0.985 | 1.034 | 0.984 | 1.003 | 0.984 | 1.020 |
| VXAZN→NQ 1d Lin | — | 0.981 | 0.933 | 0.992 | 0.994 | 1.000 | 1.017 | 0.951 | 0.976 |
| VXAZN→NQ 1d Ext | — | 0.982 | 0.950 | 0.999 | 1.008 | 1.008 | 1.016 | 0.974 | 0.993 |
| VXAZN→NQ 5d Lin | — | 0.984 | 0.992 | 0.989 | 1.013 | 1.007 | 0.994 | 0.979 | 0.998 |
| VXAZN→NQ 5d Ext | — | 0.995 | 0.998 | 0.993 | 1.015 | 1.000 | 0.994 | 0.994 | 0.998 |
| OVX→USDCAD 1d Lin | — | — | — | — | — | 1.026 | 0.991 | 0.983 | 1.029 |
| OVX→USDCAD 1d Ext | — | — | — | — | — | 1.032 | 1.002 | 0.998 | 0.996 |
| OVX→USDCAD 5d Lin | — | — | — | — | — | 0.995 | 1.002 | 1.010 | 0.997 |
| OVX→USDCAD 5d Ext | — | — | — | — | — | 0.984 | 1.025 | 1.019 | 1.003 |
| OVX→BRENT 1d Lin | — | 0.929 | 0.934 | 0.949 | 0.967 | 0.960 | 0.994 | 0.955 | 0.944 |
| OVX→BRENT 1d Ext | — | 0.937 | 0.943 | 0.972 | 0.959 | 0.989 | 0.979 | 0.966 | 0.975 |
| OVX→BRENT 5d Lin | — | 0.912 | 0.934 | 0.932 | 0.932 | 0.910 | 1.002 | 0.944 | 0.895 |
| OVX→BRENT 5d Ext | — | 0.917 | 0.925 | 0.987 | 0.929 | 0.964 | 0.980 | 0.953 | 0.910 |

## Deviations from the prereg

- A1 (pre-results): planted-control bar re-set after the control run (see the prereg). No scored cell had been computed.
- C-track cells start 2019 (the ≥ 500 train-row rule drops 2018), as recorded in A1.

## What this changes

- **OVX → WTI and Brent (VALIDATED, 1d and 5d):** a candidate removable layer for the ladder-v2 shadow on WTI/BRENT
  (σ × exp(ridge on OVX level vs σ, 1d and 5d change)), off by default and side by side. Nothing live changes in this
  study. It clears the |t| ≥ 3 promotion bar on its cells, but it still needs owner sign-off and a forward record
  first. Range size only, with nothing about direction.
- **NULL cells** (SKEW on NQ 1d; VXEEM, VXFXI → AUDUSD 1d; VXGDX → GOLD 1d; VXAZN → NQ 5d): don't add these indices
  to those range forecasts. `plans/DATA_ASSET_MAP.md` now lists them as tested.
- **UNDERPOWERED cells:** unanswered. The two to follow up are VXSLV (the futures track is strong, the CFD weak) and
  RVX on top of VIX (consistent 2-3%).
- **Disaggregation survivors** (BH, table above) are candidates only.
