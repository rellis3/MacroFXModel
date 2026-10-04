from ._wb import *

# ── Four markets, four questions (four-markets-four-questions) ────────────────
# The four witnesses and their questions (Section 02), gold as the hard-to-read extra
# witness, the lesson's made-up worked day (S&P −1.8%; 10y +12bp = real +10 + BEI +2;
# 2y +14bp; VIX 16 → 21, VIX3M 22; dollar up, yen flat), and the March 2020 story from
# Section 05. 21/√12 = 6.06 ≈ 6.1%.
C = [75, 225, 375, 525]                      # column centres
def q(id, i, text, tone=None): return note(id, C[i], 122, text, tone, 17)
def a(id, i, text, tone): return note(id, C[i], 180, text, tone, 17)

DAY = ['ae', 'at', 'ao', 'af']
ROWB = ['tsy', 'tb', 'vix', 'vb', 'vn', 'globe', 'usd', 'yen', 'flow', 'one']

FM = dict(w=600, h=700, intro='Stocks, Treasuries, options and currencies, each asked its own question: first on a made-up day, then in March 2020. Press play, or step through.', steps=[
    step('Four markets, four witnesses. The trap is asking all of them one question, "is today good or bad?", and getting confused when the votes don\'t line up. They aren\'t answering the same question.',
         icon('eq', 'crowd', C[0] - 30, 6, 0.6, 'green', 'Equities'),
         icon('ust', 'scroll', C[1] - 30, 6, 0.6, 'blue', 'Treasuries'),
         icon('opt', 'dice', C[2] - 30, 6, 0.6, 'purple', 'Options / VIX'),
         icon('fx', 'cash', C[3] - 30, 6, 0.6, 'amber', 'FX', sym='$')),
    step('Equities answer: how do investors feel about growth and future earnings? That is mood. Treasuries answer: how much do people want safety, and what rate path is expected?',
         q('qe', 0, 'how do investors\nfeel? (mood)', 'green'),
         q('qt', 1, 'want safety?\nrate path?', 'blue')),
    step('Options, through the VIX, answer: how uncertain is everyone? That is the size of coming moves, never their direction. FX answers: whose money do people want? Relative rates and flows.',
         q('qo', 2, 'how uncertain?\nsize, not sign', 'purple'),
         q('qf', 3, 'whose money\ndo people want?', 'amber')),
    step('Gold is the extra witness, and a hard one to read: it answers more than one question at once, following real rates in some periods and the dollar in others.',
         icon('gold', 'gold', 250, 250, 0.9, 'amber', 'gold: several questions at once', lsize=18),
         note('g1', 130, 290, 'real rates?', 'blue', 18),
         note('g2', 470, 290, 'the dollar?', 'amber', 18)),
    step('Now a made-up day to practise on. The S&P 500 is down 1.8%. Ask equities their question: mood soured. On its own, that is all it tells you.',
         dict(hide='gold'), dict(hide='g1'), dict(hide='g2'),
         a('ae', 0, '−1.8%:\nmood soured', 'red'),
         dict(pulse='eq')),
    step('Treasuries: the 10-year yield is up 12bp on a down day for stocks, so no flight to safety. Split it: real yield +10bp, breakeven +2bp. The real leg drove it, and the 2-year rose most (+14bp): a more hawkish rate path.',
         chart('tsy', (10, 232, 290, 220), 'Yield moves, bp', [0.4, 4.6], [0, 18], [[0, '0'], [10, '10']],
               [[1, '10y'], [2, 'real'], [3, 'BEI'], [4, '2y']], pl=40),
         dict(bars='tb', chart='tsy', data=[[1, 12, '+12', 'amber'], [2, 10, '+10', 'blue'], [3, 2, '+2', 'purple'], [4, 14, '+14', 'red']], bw=36, ms=1100),
         a('at', 1, 'yields up:\nno haven bid', 'blue')),
    step('Options: the VIX rose from 16 to 21. That says one-month moves of about 21 ÷ √12 ≈ 6.1%, in either direction. And 21 is still below VIX3M at 22, so no inversion: more uncertainty, not a "something is happening now" signal.',
         chart('vix', (310, 232, 280, 220), 'Implied volatility', [0.4, 3.6], [0, 27], [[0, '0'], [20, '20']],
               [[1, 'VIX was'], [2, 'VIX now'], [3, 'VIX3M']], pl=40),
         dict(bars='vb', chart='vix', data=[[1, 16, '16', 'purple'], [2, 21, '21', 'purple'], [3, 22, '22', 'blue']], bw=40, ms=1000),
         a('ao', 2, 'VIX 16 → 21\n≈ 6.1% a month', 'purple')),
    step('FX: money flows into the dollar against most currencies, while the yen stays flat. That fits relative rates, with US yields rising, rather than a haven scramble, where the yen would usually be bid too.',
         icon('globe', 'globe', 40, 470, 0.6, None, 'other currencies'),
         icon('usd', 'cash', 270, 466, 0.66, 'amber', 'dollar up', sym='$'),
         icon('yen', 'coin', 480, 470, 0.6, 'blue', 'yen flat', sym='¥'),
         chip('flow', 110, 500, 'money', 'amber'),
         move('flow', 250, 500, 1300),
         a('af', 3, '$ up broadly,\nyen flat', 'amber')),
    step('Put the four answers together: one story, a hawkish rates shock, not a panic. Read them in the same moment, and stop there: the lesson warns against using one market\'s answer to forecast another\'s next move.',
         dict(hide='flow'),
         box('one', 60, 588, 480, 100, 'one story: a rates shock,\nnot a panic', 'green', sub='same moment, not a forecast', size=21)),
    step('March 2020: the answers split. Stocks fell hard and the VIX closed at a record 82.69 on 16 March. Equities said terrible mood; options said extreme uncertainty.',
         *[dict(hide=k) for k in DAY + ROWB],
         a('me', 0, 'terrible\nmood', 'red'),
         a('mo', 2, 'VIX 82.69\nrecord', 'red'),
         dict(pulse='eq'), dict(pulse='opt')),
    step('But for several days the Treasury market gave the "wrong" answer: the 10-year yield rose while stocks fell. Funds needing cash sold what was easiest to sell, Treasuries included, and dealers could not absorb it. The haven wasn\'t acting like one.',
         icon('fund', 'piggy', 20, 250, 0.75, 'red', 'funds\nneeding cash', sym='$', lsize=17),
         icon('dlr', 'bank', 250, 250, 0.75, None, 'dealers: full', lsize=17),
         chip('bond', 100, 405, 'Treasuries', 'blue'),
         move('bond', 290, 405, 1400),
         a('mt', 1, '10y yield UP\nin a crash', 'red'),
         dict(pulse='ust')),
    step('And the dollar surged against almost every currency, as anyone who had borrowed dollars scrambled to buy them back. A scramble for cash and for dollars, not an ordinary flight to safety.',
         icon('usd2', 'cash', 270, 470, 0.66, 'amber', 'dollar surged', sym='$'),
         icon('eur', 'coin', 40, 470, 0.5, None, sym='€'),
         icon('gbp', 'coin', 110, 520, 0.5, None, sym='£'),
         arrow('eur', 'usd2', tone='amber'),
         arrow('gbp', 'usd2', 'sold for $', 'amber', bend=-20, size=17),
         a('mf', 3, '$ surged', 'red'),
         dict(pulse='fx')),
    step('The bond market\'s odd answer named the problem: liquidity. The fix matched it. On 15 March the Fed cut rates to near zero, began large Treasury purchases and widened its dollar swap lines; on 23 March the purchases went open-ended, the day of the S&P\'s closing low.',
         icon('fed', 'bank', 470, 250, 0.75, 'green', 'the Fed', sym='$', lsize=17),
         move('bond', 508, 405, 1300),
         box('fix', 400, 470, 190, 110, 'liquidity\nproblem →\nliquidity fix', 'green', size=19)),
])


BOARD = dict(name='fourmarkets', lesson='four-markets-four-questions', title='Four markets, each asked its own question', cfg=FM,
             before='  <!-- DESK:START -->\n  <div class="tl-section-mark"><span>Section 06</span></div>',
             deck_after=7)
