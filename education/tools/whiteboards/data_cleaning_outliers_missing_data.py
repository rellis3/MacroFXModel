from ._wb import *

# ── Data cleaning (data-cleaning-outliers-missing-data) ──────────────────────
# Ticks, median 1.02, MAD 0.005, 3.48 = 696 MADs and the 10-MAD threshold are the lesson's
# worked example. The halt/gap path in the second chart is illustrative. J-Com facts are the
# lesson's (8 December 2005; 610,000 shares at ¥1 instead of 1 share at ¥610,000; ~¥40bn loss).
TICKS = [[1, 1.02], [2, 1.01], [3, 1.03], [4, 1.02]]
BEFORE = [[0, 1.00], [1, 1.01], [2, 0.99], [3, 1.00], [4, 1.01]]
AFTER = [[8, 1.08], [9, 1.09], [10, 1.07], [11, 1.08]]

DC = dict(w=600, h=760, intro='One tick stream, cleaned the honest way: flag with only-past robust statistics, then decide what a flag means. Press play, or step through.', steps=[
    step('Ticks arrive one at a time: 1.02, 1.01, 1.03, 1.02. A live cleaner only ever knows the ticks that have already arrived.',
         chart('tk', (10, 10, 580, 260), 'Tick prices (lesson\'s worked example)', [0.4, 6.6], [0.9, 1.2],
               [[0.95, '0.95'], [1.0, '1.00'], [1.05, '1.05'], [1.1, '1.10']], [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], pl=56, pr=16),
         *[dot('k%d' % i, 'tk', p, '', 'blue') for i, p in enumerate(TICKS)]),
    step('From those four only: the median is 1.02, and the median distance from it, the MAD, is 0.005. Robust: one wild value would barely move either.',
         box('st', 20, 286, 560, 56, 'median = 1.02   ·   MAD = 0.005   (ticks 1–4 only)', 'blue', size=19)),
    step('Draw the band: median ± 10 MADs, 0.97 to 1.07. Anything outside it is flagged.',
         dict(gap='band', chart='tk', top=[[0.6, 1.07], [5.5, 1.07]], bot=[[0.6, 0.97], [5.5, 0.97]], tone='blue', op=0.2)),
    step('Tick 5 arrives at 4.50, a keying error, far off this chart. It is 4.50 − 1.02 = 3.48 away, which is 696 MADs. Flagged instantly, using nothing after tick 4.',
         dot('k5', 'tk', [5, 1.19], '4.50 ↑ off chart: 696 MADs', 'amber', dx=-8, dy=10, anchor='end'),
         dict(pulse='k5')),
    step('The trap: build the band from the whole sample, including ticks that come later, and you are judging tick 5 with tomorrow\'s data. A live system could never reproduce that call. It is lookahead bias.',
         dot('k6', 'tk', [6, 1.03], 'tick 6: not yet known', 'red', dx=-8, dy=-16, anchor='end'),
         box('trap', 20, 352, 560, 56, 'whole-sample statistics = cleaning with the future', 'red', size=19)),
    step('Now a different problem: a halt. Trading stops, then resumes at a different level. What goes in the gap? Illustrative prices.',
         dict(hide='st'), dict(hide='trap'),
         chart('gp', (10, 290, 580, 270), 'A halt: no prices in the gap (illustrative)', [0, 11], [0.96, 1.12],
               [[1.0, '1.00'], [1.05, '1.05'], [1.1, '1.10']], [[0, '0'], [4, 'halt'], [8, 'resume'], [11, '11']], pl=56, pr=16),
         series('b', 'gp', BEFORE, None, ms=700), series('a', 'gp', AFTER, None, ms=700)),
    step('Forward-fill: repeat the last price, 1.01, across the gap. It manufactures a flat, calm period that never happened, then a jump.',
         series('ff', 'gp', [[4, 1.01], [8, 1.01], [8, 1.08]], 'blue', dash=True, ms=800, label='forward-fill', lat=[6, 1.01], ldy=16, lsize=16)),
    step('Interpolate: draw a straight line from 1.01 to 1.08. It invents prices that never traded, and it needs the first price after the gap, which a live system did not yet have.',
         series('ip', 'gp', [[4, 1.01], [8, 1.08]], 'amber', dash=True, ms=800, label='interpolate', lat=[6, 1.045], ldx=-6, ldy=-14, lanchor='end', lsize=16)),
    step('Flag and exclude: mark the gap as missing and leave it out. Honest, invents nothing, but shrinks the sample.',
         box('ex', 20, 576, 560, 50, 'flag and exclude: honest, smaller sample', 'purple', size=19)),
    step('Last, a flag is not a verdict. J-Com, 8 December 2005: a trader meant to sell 1 share at ¥610,000 and sold 610,000 shares at ¥1. The prints were extreme and accurate. The trades stood, and the loss was roughly ¥40 billion.',
         chip('jc', 150, 652, '610,000 shares at ¥1', 'red'),
         chip('jm', 430, 652, 'meant: 1 share at ¥610,000', 'green')),
    step('So: detect with robust statistics from the past only, decide separately whether a flagged print was an error or a real trade, and log every change you make.',
         box('end', 20, 700, 560, 52, 'flag: yes  ·  delete: only what the venue voided', 'amber', size=19)),
])


BOARD = dict(name='data_cleaning_outliers_missing_data', lesson='data-cleaning-outliers-missing-data',
             title='Cleaning a tick stream without looking ahead', cfg=DC,
             before='  <div class="tl-section-mark"><span>Section 05</span></div>', deck_after=6)
