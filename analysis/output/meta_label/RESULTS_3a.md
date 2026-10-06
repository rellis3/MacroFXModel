# STEP 3a — meta-label "trust the lines" (results)

Pre-registration: `forge/META_LABEL_PREREG.md` (+ Amendment 1). Test = forecast folds 1–5, each trained only on earlier out-of-sample folds with a 5-session embargo: **43,769 instrument-sessions, 1,299 dates**. Skill = 1 − Brier(model) ÷ Brier(training base rate); 95% date-block bootstrap. PASS = skill interval above 0 and every predicted-probability decile (≥ 300 sessions) within ±3 pp of what happened.

| label | base rate (test) | model | skill % [95%] | worst decile gap (pp) | verdict |
|---|---|---|---|---|---|
| range passes HL p75 | 24.4% | logit | 4.77 [3.15, 6.58] | 5.2 | **FAIL** |
| range passes HL p75 | 24.4% | tree | 5.21 [3.63, 7.07] | 4.9 | **FAIL** |
| high passes OH p75 | 24.9% | logit | 0.96 [0.20, 1.69] | 5.4 | **FAIL** |
| high passes OH p75 | 24.9% | tree | 0.93 [0.23, 1.62] | 7.1 | **FAIL** |
| low passes OL p75 | 24.8% | logit | 1.63 [1.03, 2.26] | 2.0 | **PASS** |
| low passes OL p75 | 24.8% | tree | 1.51 [0.89, 2.15] | 3.2 | **FAIL** |

## Skill by test fold and class (%, point estimates)

| label | model | fold 1 | fold 2 | fold 3 | fold 4 | fold 5 | fx_crosses | fx_majors | gold | indices |
|---|---|---|---|---|---|---|---|---|---|---|
| range passes HL p75 | logit | 0.8 | 6.4 | 4.6 | 8.7 | 3.8 | 4.4 | 4.2 | 3.7 | 6.7 |
| range passes HL p75 | tree | 2.2 | 5.3 | 4.7 | 9.2 | 5.1 | 4.2 | 5.5 | 6.2 | 7.7 |
| high passes OH p75 | logit | -1.4 | 0.2 | 1.0 | 2.9 | 2.1 | 0.9 | 0.7 | 0.9 | 1.6 |
| high passes OH p75 | tree | -1.3 | 0.3 | 0.9 | 2.7 | 2.1 | 0.6 | 0.5 | 0.9 | 2.5 |
| low passes OL p75 | logit | 1.0 | 2.4 | 1.9 | 2.1 | 0.7 | 1.6 | 1.4 | 1.9 | 2.1 |
| low passes OL p75 | tree | 0.5 | 1.9 | 2.1 | 2.0 | 1.1 | 1.4 | 1.1 | 2.0 | 2.4 |

## Usefulness: what happened in each predicted decile (logistic)

**range passes HL p75**

| decile | n | predicted % | happened % |
|---|---|---|---|
| 1 | 4377 | 7.1 | 12.4 |
| 2 | 4377 | 12.5 | 15.9 |
| 3 | 4377 | 15.9 | 18.2 |
| 4 | 4377 | 18.6 | 18.6 |
| 5 | 4377 | 21.3 | 21.5 |
| 6 | 4376 | 24.0 | 23.4 |
| 7 | 4377 | 26.9 | 26.3 |
| 8 | 4377 | 30.5 | 28.6 |
| 9 | 4377 | 35.5 | 33.2 |
| 10 | 4377 | 48.8 | 45.5 |

**high passes OH p75**

| decile | n | predicted % | happened % |
|---|---|---|---|
| 1 | 4377 | 11.9 | 17.4 |
| 2 | 4377 | 17.0 | 20.7 |
| 3 | 4377 | 19.5 | 21.6 |
| 4 | 4377 | 21.4 | 22.2 |
| 5 | 4377 | 23.0 | 24.4 |
| 6 | 4376 | 24.5 | 24.0 |
| 7 | 4377 | 26.2 | 25.7 |
| 8 | 4377 | 28.1 | 28.0 |
| 9 | 4377 | 30.6 | 29.9 |
| 10 | 4377 | 36.9 | 34.7 |

**low passes OL p75**

| decile | n | predicted % | happened % |
|---|---|---|---|
| 1 | 4377 | 14.6 | 15.8 |
| 2 | 4377 | 18.7 | 20.0 |
| 3 | 4377 | 20.7 | 20.6 |
| 4 | 4377 | 22.2 | 22.4 |
| 5 | 4377 | 23.7 | 24.5 |
| 6 | 4376 | 25.1 | 25.0 |
| 7 | 4377 | 26.6 | 26.8 |
| 8 | 4377 | 28.4 | 27.0 |
| 9 | 4377 | 30.9 | 28.9 |
| 10 | 4377 | 38.1 | 36.5 |

## Largest logistic coefficients (last fold, standardised)

- range passes HL p75: event=none -0.53, weekday=3 +0.519, event=high -0.476, event=FOMC -0.363, weekday=2 +0.362, iv_sig +0.346, weekday=1 +0.309, y_err5 +0.28, weekday=4 +0.28, gap_abs +0.265
- high passes OH p75: event=none -0.231, weekday=2 +0.211, event=high -0.202, weekday=3 +0.179, iv_sig +0.156, y_err5 +0.15, regime -0.134, y_err +0.125, klass=gold +0.106, weekday=1 +0.103
- low passes OL p75: weekday=3 +0.364, weekday=4 +0.248, weekday=1 +0.233, weekday=2 +0.215, iv_sig +0.194, event=none -0.16, y_err5 +0.156, gap_abs +0.141, regime -0.115, y_err +0.101
