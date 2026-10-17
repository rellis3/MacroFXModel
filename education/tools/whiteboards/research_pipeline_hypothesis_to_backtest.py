from ._wb import *

# ── The research pipeline, run in order (research-pipeline-hypothesis-to-backtest) ──
# Numbers are the lesson's own worked example: baseline Sharpe 0.35 (zero parameters, costs in,
# 40 holding periods); + 50bp filter 0.52 (trial 2); + volatility filter 0.61 (trial 3);
# bar written first: OOS Sharpe > 0.30 on >= 30 trades; OOS 0.40 on 34 trades → supported.
# The crossover scenario (flat, flat, then filters, "Sharpe 1.4" after the eighth tweak) and
# Kaplan & Irvin (2015): NHLBI trials 17/30 (57%) before 2000 registration, 2/25 (8%) after.
CH = (10, 300, 580, 300)
STAGE_IDS = ['you', 'mech', 'n', 'seal', 'ch', 'b1', 'b2', 'b3', 'bar', 'oos', 'ver']

PIPE = dict(w=600, h=620, intro='One idea run through the five stages in order, using the lesson\'s worked example, then the same effort run in the wrong order. Press play, or step through.', steps=[
    step('Stage 1: the mechanism, written down before any data is pulled. Money tends to flow towards the currency with the higher policy rate. That is a reason, not a pattern read off a chart.',
         icon('you', 'person', 16, 10, 0.7, 'blue', 'researcher', lsize=16),
         box('mech', 120, 18, 300, 78, 'higher policy rate\n→ capital flows in', 'blue', size=19)),
    step('Stage 2: the plainest rule. Be long the higher-rate currency whenever the gap is positive. No lookback, no threshold, nothing to tune. With costs in, it scores a Sharpe of 0.35. Recorded as trial 1.',
         chart('ch', CH, 'Sharpe ratio, trial by trial', [0.4, 5.2], [0, 0.8],
               [[0, '0'], [0.2, '0.2'], [0.4, '0.4'], [0.6, '0.6']], [[1, 'plain'], [2, '+50bp'], [3, '+vol'], [4.0, 'OOS']], pl=50, pr=16),
         dict(bars='b1', chart='ch', data=[[1, 0.35, '0.35', 'purple']], bw=60, ms=900),
         box('n', 450, 18, 135, 78, 'trials', 'amber', sub='1', size=19)),
    step('Stage 3: add one filter at a time, and count. Trade only when the gap is above 50bp: 0.52. That is trial 2.',
         dict(bars='b2', chart='ch', data=[[2, 0.52, '0.52', 'amber']], bw=60, ms=900),
         dict(sub='n', text='2'), dict(pulse='n')),
    step('Skip the most volatile tenth of days: 0.61. Trial 3. Every attempt is logged, including the ones thrown away, because the count N feeds the multiple-testing correction later.',
         dict(bars='b3', chart='ch', data=[[3, 0.61, '0.61', 'amber']], bw=60, ms=900),
         dict(sub='n', text='3'), dict(pulse='n')),
    step('Stage 5 comes first: before the out-of-sample test runs, write down what passing means. An out-of-sample Sharpe above 0.30, on at least 30 trades. Sealed.',
         icon('seal', 'scroll', 128, 120, 0.7, 'green', 'bar: > 0.30, ≥ 30 trades', lsize=16),
         series('bar', 'ch', [[0.6, 0.30], [5.15, 0.30]], 'green', dash=True, ms=700, label='bar 0.30', lat=[5.15, 0.30], ldx=-4, ldy=-14, lanchor='end', lsize=16)),
    step('Stage 4: the final rule meets data the tuning never touched, with real costs and a purged split. It scores 0.40 on 34 trades. Lower than 0.61 in-sample, as usual.',
         dict(bars='oos', chart='ch', data=[[4.0, 0.40, '0.40', 'green']], bw=60, ms=900)),
    step('0.40 clears the 0.30 bar, with 34 trades against a minimum of 30. Supported. And because the bar was sealed first, nobody moved the goalposts to where the ball landed.',
         box('ver', 330, 140, 255, 72, 'verdict: supported', 'green', sub='0.40 on 34 > 0.30 on 30', size=18)),
    step('Now the same effort in the wrong order. A crossover that "looked right" a few times. No mechanism. Backtest it: flat. Shorten the fast average: still flat.',
         *[dict(hide=i) for i in STAGE_IDS],
         chip('t1', 70, 40, '1: flat', 'red'), chip('t2', 190, 40, '2: flat', 'red')),
    step('Then a volatility filter, a day-of-week filter, an ATR stop, and more. By the eighth tweak the write-up says "a crossover strategy with a Sharpe of 1.4". Nobody counted the trials, and no bar was set.',
         chip('t3', 330, 40, '3: + vol', 'amber'), chip('t4', 470, 40, '4: + day', 'amber'),
         chip('t5', 70, 96, '5: + stop', 'amber'), chip('t6', 190, 96, '6 · 7 …', 'amber'),
         chip('t8', 360, 96, '8: "Sharpe 1.4"', 'green'),
         note('nobar', 300, 160, 'no mechanism · N uncounted · no bar', 'red', 20)),
    step('Does writing the bar first matter? Medicine tested it. Large NHLBI clinical trials published before 2000: 17 of 30, or 57%, reported a benefit on their main outcome.',
         *[dict(hide=i) for i in ['t1', 't2', 't3', 't4', 't5', 't6', 't8', 'nobar']],
         chart('med', CH, 'NHLBI trials reporting a benefit (%)', [0.4, 2.6], [0, 70],
               [[0, '0'], [20, '20'], [40, '40'], [60, '60']], [[1, 'before 2000'], [2, 'after']], pl=50, pr=16),
         dict(bars='m1', chart='med', data=[[1, 57, '17 of 30 · 57%', 'green']], bw=90, ms=1000)),
    step('From 2000, such trials had to register their main outcome in advance. Of the 25 published after: 2, or 8%. Researchers could no longer pick, after seeing the data, which outcome counted.',
         dict(bars='m2', chart='med', data=[[2, 8, '2 of 25 · 8%', 'red']], bw=90, ms=1000),
         note('reg', 300, 120, 'outcome declared first → 57% falls to 8%', 'amber', 20)),
    step('The order is the safeguard. Mechanism, plain test, counted tweaks, a bar sealed before the test, then the honest out-of-sample number. Get the order right and a null stays a null.',
         note('rule', 300, 190, 'the order is the safeguard', 'green', 22)),
])


BOARD = dict(name='research_pipeline_hypothesis_to_backtest', lesson='research-pipeline-hypothesis-to-backtest',
             title='The five stages, run in order and out of order', cfg=PIPE,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=11)
