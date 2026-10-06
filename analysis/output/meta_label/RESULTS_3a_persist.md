# STEP 3a — meta-label "trust the lines" (results) — on the PERSISTENCE-ADJUSTED lines (Amendment 2)

Pre-registration: `forge/META_LABEL_PREREG.md` (+ Amendment 1). Test = forecast folds 1–5, each trained only on earlier out-of-sample folds with a 5-session embargo: **43,769 instrument-sessions, 1,299 dates**. Skill = 1 − Brier(model) ÷ Brier(training base rate); 95% date-block bootstrap. PASS = skill interval above 0 and every predicted-probability decile (≥ 300 sessions) within ±3 pp of what happened.

| label | base rate (test) | model | skill % [95%] | worst decile gap (pp) | verdict |
|---|---|---|---|---|---|
| range passes HL p75 | 23.4% | logit | 0.26 [-0.89, 1.36] | 10.7 | **FAIL** |
| range passes HL p75 | 23.4% | tree | 0.14 [-0.98, 1.18] | 10.5 | **FAIL** |
| high passes OH p75 | 24.3% | logit | -0.33 [-0.97, 0.27] | 9.5 | **FAIL** |
| high passes OH p75 | 24.3% | tree | -0.51 [-1.24, 0.13] | 10.9 | **FAIL** |
| low passes OL p75 | 24.2% | logit | -0.02 [-0.37, 0.33] | 4.6 | **FAIL** |
| low passes OL p75 | 24.2% | tree | 0.01 [-0.31, 0.35] | 4.8 | **FAIL** |

## Skill by test fold and class (%, point estimates)

| label | model | fold 1 | fold 2 | fold 3 | fold 4 | fold 5 | fx_crosses | fx_majors | gold | indices |
|---|---|---|---|---|---|---|---|---|---|---|
| range passes HL p75 | logit | -2.5 | 1.5 | -0.5 | 2.8 | 0.3 | -0.7 | 1.5 | 1.9 | 1.8 |
| range passes HL p75 | tree | -3.1 | 1.1 | -0.3 | 2.5 | 1.0 | -0.8 | 1.7 | 1.6 | 1.3 |
| high passes OH p75 | logit | -2.8 | -0.8 | -0.1 | 1.0 | 1.3 | -0.3 | 0.3 | -0.7 | -0.9 |
| high passes OH p75 | tree | -3.7 | -0.1 | -0.3 | 0.6 | 1.1 | -0.6 | -0.2 | -0.8 | -0.4 |
| low passes OL p75 | logit | 0.2 | 0.5 | 0.1 | 0.0 | -1.0 | -0.2 | 0.2 | 1.5 | 0.2 |
| low passes OL p75 | tree | -0.2 | 0.5 | 0.2 | 0.2 | -0.6 | -0.2 | 0.1 | 1.2 | 0.3 |

## Usefulness: what happened in each predicted decile (logistic)

**range passes HL p75**

| decile | n | predicted % | happened % |
|---|---|---|---|
| 1 | 4377 | 11.3 | 21.9 |
| 2 | 4377 | 16.2 | 21.7 |
| 3 | 4377 | 18.7 | 20.6 |
| 4 | 4377 | 20.3 | 21.0 |
| 5 | 4377 | 21.7 | 21.7 |
| 6 | 4376 | 23.1 | 22.1 |
| 7 | 4377 | 24.6 | 23.2 |
| 8 | 4377 | 26.4 | 24.2 |
| 9 | 4377 | 29.0 | 25.2 |
| 10 | 4377 | 37.9 | 32.7 |

**high passes OH p75**

| decile | n | predicted % | happened % |
|---|---|---|---|
| 1 | 4377 | 14.9 | 24.4 |
| 2 | 4377 | 19.6 | 24.0 |
| 3 | 4377 | 21.4 | 22.1 |
| 4 | 4377 | 22.4 | 22.9 |
| 5 | 4377 | 23.1 | 22.2 |
| 6 | 4376 | 23.8 | 23.1 |
| 7 | 4377 | 24.6 | 23.7 |
| 8 | 4377 | 25.5 | 24.8 |
| 9 | 4377 | 26.8 | 27.1 |
| 10 | 4377 | 30.7 | 28.8 |

**low passes OL p75**

| decile | n | predicted % | happened % |
|---|---|---|---|
| 1 | 4377 | 18.1 | 22.8 |
| 2 | 4377 | 21.1 | 23.7 |
| 3 | 4377 | 22.3 | 23.8 |
| 4 | 4377 | 23.1 | 22.5 |
| 5 | 4377 | 23.9 | 23.9 |
| 6 | 4376 | 24.7 | 23.0 |
| 7 | 4377 | 25.6 | 24.0 |
| 8 | 4377 | 26.7 | 23.5 |
| 9 | 4377 | 28.2 | 24.1 |
| 10 | 4377 | 33.8 | 31.1 |

## Largest logistic coefficients (last fold, standardised)

- range passes HL p75: event=FOMC -0.543, event=high -0.397, klass=indices -0.368, event=none -0.341, iv_sig +0.334, gap_abs +0.243, klass=gold -0.132, iv_sig_na -0.122, weekday=1 -0.119, weekday=2 -0.094
- high passes OH p75: klass=indices -0.209, weekday=1 -0.158, iv_sig +0.149, event=high -0.149, iv_sig_na -0.145, event=none -0.138, weekday=4 -0.119, weekday=3 -0.105, gap_abs +0.095, event=NFP +0.082
- low passes OL p75: iv_sig +0.198, klass=indices -0.195, event=FOMC -0.161, gap_abs +0.142, klass=gold -0.139, weekday=4 +0.137, iv_sig_na -0.115, event=NFP +0.089, weekday=3 +0.083, event=none -0.066
