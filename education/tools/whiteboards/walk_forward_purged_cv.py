from ._wb import *

# ── Walk-forward & purged CV (walk-forward-purged-cv) ─────────────────────────
# The lesson's worked example: n = 1,000 daily bars, feature window w = 20 (HV20),
# label horizon H = 5, boundary T = 500, test h = 100 (days 500-599), embargo e = 10.
#   backward purge (label leak): i + H >= T  -> days 495-499 (5 rows)
#   forward purge (feature leak): i - w + 1 <= 599 -> days 600-618 (19 rows)
#   embargo: days 619-628 (10 rows); training resumes on day 629.
# All positions below are those day numbers mapped to board x; nothing is illustrative.
W, H, T, h, e = 20, 5, 500, 100, 10
BACK = (T - H, T - 1)                 # 495, 499
FWD = (T + h, T + h + W - 2)          # 600, 618
EMB = (T + h + W - 1, T + h + W - 2 + e)   # 619, 628
RES = T + h + W - 1 + e               # 629

def blk(id, ch, a, b, tone, op=0.55, top=1):
    return dict(gap=id, chart=ch, top=[[a, top], [b, top]], bot=[[a, 0], [b, 0]], tone=tone, op=op)
OV = (10, 120, 580, 116)
ZA = (10, 262, 280, 150)
ZB = (310, 262, 280, 150)

WF = dict(w=600, h=700, intro='One test window from the lesson\'s worked example, and the rows that quietly leak across its edges. Press play, or step through.', steps=[
    step('Ordinary k-fold cross-validation shuffles the days. Then day i can land in the test set while day i + 1 is in training: the model is graded on Tuesday after studying Wednesday. That is lookahead.',
         box('ti', 40, 20, 200, 76, 'day i', 'green', sub='test', size=21),
         box('tn', 360, 20, 200, 76, 'day i + 1', 'blue', sub='train', size=21),
         arrow('tn', 'ti', 'fit on the future', 'red')),
    step('Walk-forward fixes the order: train only on days before the boundary, test on the strict future. Here, train up to day 499 and test days 500 to 599.',
         dict(hide='ti'), dict(hide='tn'), dict(hide='tn>ti'),
         chart('ov', OV, 'Train on the past, test the strict future', [400, 700], [0, 1.2], [],
               [[400, '400'], [500, '500'], [600, '600'], [700, '700']], pl=16, pr=16),
         blk('o1', 'ov', 400, 500, 'blue'), blk('o2', 'ov', 500, 600, 'green'), blk('o3', 'ov', 600, 700, None, op=0.12),
         cnote('ol1', 'ov', [450, 0.5], 'train', 'blue', 19),
         cnote('ol2', 'ov', [550, 0.5], 'test 500–599', 'green', 19),
         cnote('ol3', 'ov', [650, 0.5], 'later folds', None, 18)),
    step('The split date is respected. Now zoom in on the left edge of the test window, days 488 to 506.',
         chart('za', ZA, 'Left edge, days 488–506', [488, 506], [0, 1.7], [],
               [[490, '490'], [495, '495'], [500, '500'], [505, '505']], pl=14, pr=14),
         blk('a1', 'za', 488, 500, 'blue'), blk('a2', 'za', 500, 506, 'green')),
    step('Day 497 is in training by date. But its label, "did a trade win over the next 5 days", uses prices on days 497 to 502. Three of those days are inside the test window.',
         series('lab', 'za', [[497, 1.3], [502, 1.3]], 'amber', ms=700, label="day 497's label", lat=[499.5, 1.3], ldy=-14, lsize=17)),
    step(f'The same holds for every training day from {BACK[0]} to {BACK[1]}: each label reaches day 500 or later. Purge them: 5 rows, removed by an exact rule.',
         dict(hide='a1'), blk('a1b', 'za', 488, BACK[0], 'blue'),
         blk('pa', 'za', BACK[0], BACK[1] + 1, 'red', op=0.85),
         note('pan', 150, 438, f'purge {BACK[0]}–{BACK[1]}: 5 rows', 'red', 19)),
    step("Now the right edge, days 580 to 634. The next fold wants to train from day 600. But day 605's 20-day volatility feature uses days 586 to 605, and most of those are test days.",
         chart('zb', ZB, 'Right edge, days 580–634', [580, 634], [0, 1.7], [],
               [[580, '580'], [600, '600'], [619, '619'], [629, '629']], pl=14, pr=14),
         blk('b1', 'zb', 580, 600, 'green'), blk('b2', 'zb', 600, 634, None, op=0.12),
         series('feat', 'zb', [[586, 1.3], [605, 1.3]], 'purple', ms=700, label="day 605's feature", lat=[595.5, 1.3], ldy=-14, lsize=17)),
    step(f'A 20-day feature keeps reaching back into the test until day {FWD[1] + 1}. So purge days {FWD[0]} to {FWD[1]}: 19 more rows.',
         blk('pb', 'zb', FWD[0], FWD[1] + 1, 'red', op=0.85),
         note('pbn', 450, 438, f'purge {FWD[0]}–{FWD[1]}: 19 rows', 'red', 19)),
    step(f'Markets stay correlated for longer than any one window, so add an embargo: {e} more days, {EMB[0]} to {EMB[1]}. Training resumes on day {RES}.',
         blk('eb', 'zb', EMB[0], EMB[1] + 1, 'amber', op=0.85),
         blk('rs', 'zb', RES, 634, 'blue', op=0.85),
         note('ebn', 450, 466, f'embargo {EMB[0]}–{EMB[1]}, resume {RES}', 'amber', 19)),
    step('Count what one test window costs: 5 rows purged for label leaks, 19 for feature leaks, 10 held as margin. 34 rows, none of them visible if you only look at the split date.',
         chart('cnt', (10, 490, 580, 200), 'Rows held out around one test window', [0.4, 3.6], [0, 23],
               [[0, '0'], [10, '10'], [20, '20']], [[1, 'label leak'], [2, 'feature leak'], [3, 'embargo']], pl=40),
         dict(bars='cb', chart='cnt', data=[[1, 5, '5', 'red'], [2, 19, '19', 'red'], [3, 10, '10', 'amber']], bw=70, ms=1000)),
    step('Then roll the boundary forward and do it again, fold after fold. Judge the rule across all the folds, not by one good-looking split.',
         dict(pulse='ov'), dict(hide='ol3'),
         cnote('roll', 'ov', [650, 0.85], 'roll forward →', 'green', 18)),
    step('One last check: draw the line where information was knowable, not where the row is indexed. A rate published the next morning belongs to the next morning. A purged test makes the number honest; it does not prove an edge.',
         note('end', 300, 102, 'the leak lives in the windows, not the dates', 'green', 20)),
])


BOARD = dict(name='walk_forward_purged_cv', lesson='walk-forward-purged-cv', title='Purging and embargo, day by day', cfg=WF,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>\n  <h2>How practitioners actually use this</h2>',
             deck_after=7)
