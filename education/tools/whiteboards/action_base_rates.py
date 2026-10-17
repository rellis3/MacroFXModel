from ._wb import *

# ── Base rates first (action-base-rates) ─────────────────────────────────────
# All numbers are the lesson's own examples:
#   reversal pattern: 5% of days are turns, pattern before 60% of turns and on 20% of
#   ordinary days. Of 1,000 days: 50 turns (30 flagged), 950 ordinary (190 flagged),
#   so 30/220 = 13.6%; odds 1:19 x LR 3 = 3:19.
#   cab problem: 15% Blue, witness right 80% -> odds 15:85 x 4 = 60:85 -> 41%.
#   small class (self-test Q5): 7 of 8, broad 45%, m = 10 -> 11.5/18 = 63.9%.
assert round(30 / 220, 3) == 0.136 and round(60 / 145, 2) == 0.41 and round(11.5 / 18, 3) == 0.639

FL = (10, 360, 280, 270)

BR = dict(w=600, h=640, intro='A reversal pattern, a thousand days, and the false alarms the story leaves out. Every number is the lesson\'s own example. Press play, or step through.', steps=[
    step('A reversal pattern prints on your chart. It shows up before 60% of big turns, so the story says "60% this is a turn". Before trusting that, count.',
         icon('ch', 'down', 30, 6, 0.75, 'blue', 'the pattern fires', lsize=17),
         note('story', 400, 50, 'the story says: 60%', 'red', 22)),
    step('Outside view first. Line up 1,000 past days. 5% of them were turns: 50 days. The other 950 were ordinary. That 5% is the base rate.',
         box('all', 10, 186, 140, 76, '1,000 days', 'blue', size=20),
         box('turn', 210, 120, 160, 76, 'turns', 'purple', sub='0', size=19),
         box('ord', 210, 250, 160, 76, 'ordinary days', None, sub='0', size=19),
         arrow('all', 'turn', '5%'), arrow('all', 'ord', '95%'),
         dict(count='turn', **{'from': 0, 'to': 50, 'dp': 0, 'ms': 900}),
         dict(count='ord', **{'from': 0, 'to': 950, 'dp': 0, 'ms': 900})),
    step('The pattern shows up before 60% of the turns: 30 of the 50.',
         box('hit', 430, 120, 160, 76, 'pattern', 'purple', sub='0', size=19),
         arrow('turn', 'hit', '60%', 'purple'),
         dict(count='hit', **{'from': 0, 'to': 30, 'dp': 0, 'ms': 900})),
    step('Here is the number the story leaves out. The pattern also shows up on 20% of ordinary days: 190 of the 950. These are false alarms.',
         box('fa', 430, 250, 160, 76, 'pattern', 'amber', sub='0', size=19),
         arrow('ord', 'fa', '20%', 'amber'),
         dict(count='fa', **{'from': 0, 'to': 190, 'dp': 0, 'ms': 900})),
    step('So 220 days showed the pattern, and only 30 of them were turns. That is 13.6%, not 60%.',
         chart('fl', FL, '220 days with the pattern', [0.4, 2.6], [0, 220],
               [[0, '0'], [100, '100'], [200, '200']], [[1, 'turns'], [2, 'false alarms']], pl=50),
         dict(bars='flb', chart='fl', data=[[1, 30, '30', 'purple'], [2, 190, '190', 'amber']], bw=64, ms=1100),
         dict(hide='story'),
         note('ans', 400, 50, 'base rate says: 13.6%', 'green', 22)),
    step('The same answer in one multiplication. Prior odds 1:19, times a likelihood ratio of 60% ÷ 20% = 3, gives 3:19. And 3 ÷ 22 = 13.6%.',
         box('odds', 310, 360, 280, 84, 'odds 1:19 × LR 3\n= 3:19 → 13.6%', 'purple', size=20)),
    step('If the hit rate equals the false-alarm rate, the LR is 1 and the evidence tells you nothing. "Followed by a rally 54% of the time" is nothing if rallies follow 54% of all days.',
         box('lr1', 310, 456, 280, 84, 'hit 54%, base 54%\nLR = 1: don\'t move', 'red', size=20)),
    step('It works anywhere. The cab problem: 15% of cabs are Blue, and a witness who is right 80% of the time says "Blue". Odds 15:85 × 4 = 60:85, so 41%. Still more likely Green.',
         dict(hide='ch'), dict(hide='ans'),
         box('cab', 10, 10, 580, 84, '15% Blue · witness right 80%\n→ only 41% Blue', 'blue', size=20)),
    step('Small reference classes need shrinking. 7 hits in 8 cases looks like 87.5%. Blend it with a broad rate of 45% worth 10 cases: (7 + 4.5) ÷ 18 = 63.9%.',
         box('shr', 310, 552, 280, 84, '7 of 8, broad 45%, m = 10\n→ 63.9%, not 87.5%', 'amber', size=19)),
    step('The habit: name the reference class, write its base rate down first, then let the evidence move you by a measured likelihood ratio. No data means LR = 1.',
         dict(hide='cab'),
         box('rule', 10, 10, 580, 84, 'base rate first, in writing\nthen × measured LR', 'green', size=21)),
])


BOARD = dict(name='action_base_rates', lesson='action-base-rates',
             title='Base rates first: the false alarms the story leaves out', cfg=BR,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=6)
