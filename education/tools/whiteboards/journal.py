from ._wb import *

# ── Decision vs outcome, and the journal habit (process-vs-outcome-decision-journals) ──
# Numbers: the lesson's worked example "Ten journal entries, scored": 70% stated on all
# ten, six came true; of the four losers three followed the plan (bad luck) and one broke
# it (just deserts); of the six winners one broke the plan (dumb luck), so five are
# deserved success. Brier (6 × 0.09 + 4 × 0.49)/10 = 0.25. Bayes, 55% vs 45%, 50/50
# prior: odds 1.22^(6−4) ≈ 1.49 → 60%; one win 50% → 55%; ~150 trades to reach 95%.
# Trade order below is illustrative; the counts are the lesson's.
TR = ['W', 'L', 'W', 'Wx', 'L', 'W', 'Lx', 'W', 'L', 'W']     # x = broke the plan
ROW_Y, CX = 160, [20 + i * 57 for i in range(10)]
# cells: (x, y) top-left of each 2x2 box
DL, DS, JD, BL = (10, 236), (305, 236), (10, 392), (305, 392)
CW, CH = 285, 140
def slot(cell, k): return (cell[0] + 14 + k * 54, cell[1] + 64)
win_plan = [i for i, t in enumerate(TR) if t == 'W']
loss_plan = [i for i, t in enumerate(TR) if t == 'L']
JR = dict(w=600, h=760, intro='Ten trades, a 2×2 grid, and why a P&L cannot tell a lucky whim from a sound plan. Press play, or step through.', steps=[
    step('Before each trade you write a journal entry, while you still don\'t know the outcome: what you expect, why (with the base rate), how confident, what would change your mind, and a pre-mortem. You write 70% on all ten.',
         icon('you', 'person', 14, 8, 0.6, None, 'you', lsize=17),
         icon('jr', 'scroll', 96, 8, 0.6, 'blue', 'journal', lsize=17),
         note('j1', 186, 22, '1  what I expect', 'blue', 17, anchor='start'),
         note('j2', 186, 46, '2  why, and the base rate', 'blue', 17, anchor='start'),
         note('j3', 186, 70, '3  how confident: 70%', 'blue', 17, anchor='start'),
         note('j4', 186, 94, '4  what would change my mind', 'blue', 17, anchor='start'),
         note('j5', 186, 118, '5  pre-mortem: "it failed, because…"', 'blue', 17, anchor='start')),
    step('The ten trades play out: six win, four lose. Your P&L shows exactly that, and nothing else. It cannot tell a trade made on a whim from one made on the plan.',
         *[icon(f't{i}', 'coin', CX[i], ROW_Y, 0.46, 'green' if t[0] == 'W' else 'red', sym='✓' if t[0] == 'W' else '✗')
           for i, t in enumerate(TR)]),
    step('So draw two axes instead of one. Across: was the decision good or bad? Up: did it turn out well or badly? Four boxes, and only two of them are comfortable.',
         note('ax', 152, 224, '← bad decision', None, 17),
         note('ax2', 448, 224, 'good decision →', None, 17),
         box('dl', *DL, CW, CH, 'Dumb luck', 'amber', sub='bad call, good result', top=True, size=20),
         box('ds', *DS, CW, CH, 'Deserved success', 'green', sub='good call, good result', top=True, size=20),
         box('jd', *JD, CW, CH, 'Just deserts', 'red', sub='bad call, bad result', top=True, size=20),
         box('bl', *BL, CW, CH, 'Bad luck', 'blue', sub='good call, bad result', top=True, size=20)),
    step('Now grade each trade against its journal entry. Five of the six winners followed the plan: deserved success. Note them, but don\'t over-learn them.',
         *[move(f't{i}', *slot(DS, k), 700) for k, i in enumerate(win_plan)]),
    step('The sixth winner broke the plan. That is dumb luck, the most dangerous box in trading: it pays you to do the wrong thing, so you are tempted to do it again.',
         move('t3', *slot(DL, 0), 900), dict(pulse='dl')),
    step('Three of the four losers followed the plan. Bad luck: a good decision that lost. Don\'t "fix" a sound process because of it.',
         *[move(f't{i}', *slot(BL, k), 700) for k, i in enumerate(loss_plan)]),
    step('The last loser broke the plan: just deserts. Bad call, bad result, one of the two boxes a results-only review gets right.',
         move('t6', *slot(JD, 0), 900)),
    step('A results-only review stares at the bottom row and tries to fix four losses, three of them sound. The journal points at the left column: two plan-breaks out of ten is the number to work on.',
         chip('fix4', 450, 562, 'fix the 4 losses?', 'red'),
         dict(pulse='bl'),
         chip('fix2', 150, 562, 'fix the 2 plan-breaks', 'green'),
         dict(pulse='dl'), dict(pulse='jd')),
    step('Why not trust the P&L? Start 50/50 between being a 55% trader and a 45% one. Each win multiplies the odds by 1.22 and each loss by 0.82, so six wins and four losses leave odds of 1.22 squared, about 1.49: only 60% sure. It takes about 150 trades, on average, to reach 95%.',
         dict(dim='fix4'),
         box('bay', 10, 600, 285, 100, 'sure you\'re the 55% trader', 'purple', sub='50%', size=19),
         dict(count='bay', **{'from': 50, 'to': 60, 'dp': 0, 'suf': '%', 'ms': 1200})),
    step('Score the confidence instead. You said 70% and were right 60% of the time. Brier score: six hits at 0.09, four misses at 0.49, so 2.50 ÷ 10 = 0.25, no better than always saying 50%.',
         box('bri', 305, 600, 285, 100, 'Brier score (lower is better)', 'amber', sub='0.00', size=19),
         dict(count='bri', **{'from': 0, 'to': 0.25, 'dp': 2, 'ms': 1200})),
    step('Grade the decision, not the result. Write the entry before the outcome exists, then review your winners as carefully as your losers: that is where the lucky mistakes hide.',
         note('end', 300, 740, 'Written before, graded after: the decision, not the dice.', 'amber', 19),
         dict(pulse='jr')),
])


BOARD = dict(name='journal', lesson='process-vs-outcome-decision-journals', title='Decision vs outcome, drawn step by step', cfg=JR,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>Your decision journal</h2>',
             deck_after=7)
