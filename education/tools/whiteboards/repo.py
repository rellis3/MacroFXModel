from ._wb import *

# ── Repo as a pawn shop, then the March 2020 margin spiral (collateral-margin-repo-markets)
# Lesson figures: $100m of Treasuries at a 2% haircut → $98m cash, $2m buffer (trading
# scenario); one night on $50m at 5.30% = $7,361.11 (worked example); the basis trade on a
# thin 2% haircut, the dash for cash, the Fed buying roughly $1trn within about a month
# (Section 06). The widening to 5% is illustrative; the lesson gives no post-shock haircut.
W1, W2, W3 = 10, 220, 430          # three columns, 160 wide, 50 apart
R1, R2 = 270, 398                  # spiral rows, 78 tall, 50 apart
BW, BH = 160, 78

REPO = dict(w=600, h=510, intro='Repo as a pawn shop for bonds — then what happens when the pawn shop suddenly wants a bigger cushion, as in March 2020. Press play, or step through.', steps=[
    step('Repo is a pawn shop for bonds. A borrower, say a dealer, owns $100m of Treasuries and needs cash tonight. A lender, say a money market fund, has cash it wants to park safely overnight.',
         icon('bor', 'person', 45, 4, 0.65, 'blue', 'Borrower\nneeds cash', lsize=16),
         icon('len', 'piggy', 490, 4, 0.65, 'green', 'Lender\nhas cash', sym='$', lsize=16),
         chip('bond', 215, 30, '$100m Treasuries', 'blue')),
    step('Leg 1: the borrower hands the bonds over. Legally it is a sale, with a binding promise to buy the same bonds back tomorrow at a slightly higher price.',
         move('bond', 385, 30, 1300)),
    step('Like any pawn shop, the lender won\'t count the item at full value. With a 2% haircut it lends $98m against $100m of Treasuries. The $2m gap is its cushion in case the borrower never comes back and it has to sell the bonds itself.',
         box('val', W1, 120, 180, 74, 'Bond value', 'blue', sub='$100m', size=20),
         box('lend', W2 - 5, 120, 180, 74, 'Cash lent', 'green', sub='$98m', size=20),
         box('cut', W3 - 20, 120, 180, 74, 'Haircut cushion', 'amber', sub='$2m', size=20)),
    step('The cash goes the other way. Two sales on paper; economically, a loan with the bonds held as collateral.',
         chip('cash', 390, 72, '$98m cash', 'green'),
         move('cash', 215, 72, 1300)),
    step('Tomorrow the borrower buys the bonds back for a little more than it got. That extra is the interest, the repo rate (the lesson\'s worked example: one night on $50m at 5.30% costs $7,361.11). Then most roll it again, night after night.',
         note('tmr', 300, 232, 'tomorrow: cash + interest back, bonds back → roll it again', None, 18)),
    step('Now March 2020. A hedge fund runs the Treasury basis trade: buy the bond, sell the matching future, pocket the tiny gap. It only pays with leverage, so the bond is financed exactly like this, on a thin 2% haircut, with initial margin posted on the future.',
         dict(hide='bor'), dict(hide='tmr'),
         icon('hf', 'person', 45, 4, 0.65, 'purple', 'Hedge fund\nbasis trade', lsize=16),
         note('fut', 300, 232, 'also short the future, with initial margin at the exchange', 'purple', 18)),
    step('Mid-March: investors around the world rush for cash and sell even Treasuries. Volatility jumps.',
         box('a', W1, R1, BW, BH, 'Dash for cash:\nvolatility\njumps', 'amber', size=18)),
    step('The exchange and the repo lenders protect themselves: futures margin goes up, variation margin comes due daily as prices swing, and haircuts can widen. Say the haircut goes from 2% to 5% (illustrative): the lender now advances only $95m.',
         box('b', W2, R1, BW, BH, 'Margins up,\nhaircuts wider', 'red', size=18),
         arrow('a', 'b'),
         dict(hide='fut'), note('il', 300, 232, 'haircut 2% → 5% (illustrative)', 'red', 18),
         dict(count='lend', **{'from': 98, 'to': 95, 'dp': 0, 'pre': '$', 'suf': 'm', 'ms': 1300}),
         dict(count='cut', **{'from': 2, 'to': 5, 'dp': 0, 'pre': '$', 'suf': 'm', 'ms': 1300})),
    step('So the fund must hand the lender the $3m difference in cash, the same day, on top of the higher futures margin. Every fund running the trade gets the same call at once.',
         box('c', W3, R1, BW, BH, 'Find cash\ntoday', 'red', sub='$3m', size=18),
         arrow('b', 'c'),
         chip('pay', 300, 72, '$3m', 'red'), move('pay', 420, 72, 1200)),
    step('It can\'t fund the bigger buffers, so it unwinds: sells the cash Treasuries and buys back the futures.',
         box('d', W3, R2, BW, BH, 'SELL\nTreasuries', 'red', size=18),
         arrow('c', 'd'), dict(pulse='bond')),
    step('Dealers\' balance sheets are already full, so they can\'t absorb the flood. Treasury prices fall, so yields, normally the haven, rise while stocks are falling.',
         box('e', W2, R2, BW, BH, 'Dealers full,\nyields jump', 'red', size=18),
         arrow('d', 'e')),
    step('Bigger price swings mean bigger margins again, which force more selling. That loop is what the BIS called a margin spiral.',
         arrow('e', 'b', 'margins up again', 'red', id='loop', size=17),
         dict(pulse='b')),
    step('The Fed broke the loop by becoming the buyer: from March 15 it bought roughly a trillion dollars of Treasuries within about a month. The lesson: a haircut is not a fixed property of the collateral. It rises with volatility, exactly when the borrower can least afford it.',
         icon('fed', 'bank', 55, R2 - 4, 0.6, 'amber', 'Fed buys ~$1trn\nin about a month', sym='$', lsize=16),
         arrow('fed', 'e', 'buys', 'amber', id='fb', size=17),
         dict(hide='il'),
         note('end', 300, 222, 'a haircut isn\'t fixed: it rises with volatility,\nexactly when the borrower can least afford it', 'green', 18)),
])


BOARD = dict(name='repo', lesson='collateral-margin-repo-markets',
             title='Repo as a pawn shop, and the margin spiral', cfg=REPO,
             before='  <h3>Where the textbook version breaks</h3>',
             deck_after=13)
