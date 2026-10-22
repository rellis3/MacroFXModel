from ._wb import *

# ── Five ways to trade options (options-trading-styles) ─────────────────────────
# Lesson inputs: stock 100, 30 days, implied vol 20% (= realised), r = q = 0, costs $0.10 per option leg.
# Black-Scholes values, recomputed in python: 105 call costs $0.64 (wins 15.8%, avg win $3.26, avg loss $0.73);
# 95 put collects $0.57 (wins 82.9%, avg win $0.46, avg loss $2.82); 100 straddle $4.57 (break-evens 95.23 / 104.77, wins 40.5%);
# 100 shares + 95 put: worst case -$5.67, premium $0.57; short 30-day / long 90-day 100 call: debit $1.67, wins 42.7%, best $1.36, worst $1.87.
# Average result per share at realised vol 25% (implied 20%): straddle +0.94, call +0.34, hedge +0.30, calendar -0.42, put -0.50.
# The two 24-trade runs are ILLUSTRATIVE: the same win rate and average win/loss, fixed order.
BUY_W, BUY_L = 3.26, -0.73
SELL_W, SELL_L = 0.46, -2.82
BUY_WINS = {5, 11, 15, 22}            # 4 wins in 24 trades
SELL_LOSS = {9, 14, 19, 23}           # 4 losses in 24 trades


def run(win_val, lose_val, wins=None, losses=None):
    w, pts = 0.0, [[0, 0.0]]
    for i in range(1, 25):
        hit = (i in wins) if wins is not None else (i not in losses)
        w += win_val if hit else lose_val
        pts.append([i, round(w, 2)])
    return pts


BUY = run(BUY_W, BUY_L, wins=BUY_WINS)
SELL = run(SELL_W, SELL_L, losses=SELL_LOSS)
assert BUY[-1][1] == round(4 * BUY_W + 20 * BUY_L, 2) == -1.56
assert SELL[-1][1] == round(20 * SELL_W + 4 * SELL_L, 2) == -2.08

RUN = (10, 180, 580, 250)
OPT = dict(w=600, h=845, intro='One stock, one month, five ways to trade the options on it. Every price is fair, so the interesting part is the shape of each bet. Press play, or step through.', steps=[
    step('A stock at 100 and options that expire in 30 days, priced at 20% implied volatility. That prices a typical one-month move of about 5.7 either way.',
         icon('you', 'person', 20, 14, 0.7, 'blue', 'you', lsize=18),
         box('stk', 140, 20, 190, 62, 'stock = 100', 'blue'),
         box('mo', 360, 20, 220, 62, '30 days', 'blue', sub='implied vol 20%')),
    step('The prices are fair: if the market has volatility right, the average result of every trade is zero before costs. The five styles are five different ways of getting to that same zero.',
         note('fair', 300, 128, 'fair price: average result = 0 (before costs)', 'amber', 19)),
    step('Style 1, buy direction. A 105 call costs $0.64. It wins only 15.8% of the time, the average win is $3.26 and the average loss is $0.73.',
         dict(hide='fair'),
         box('buy', 10, 100, 285, 66, '1 · buy a 105 call', 'green', sub='pay $0.64 · wins 15.8%', size=18)),
    step('Twenty-four months of that trade, illustrative: four wins and twenty losses. Long flat stretches of small losses, then a jump. It ends slightly down, because of costs.',
         chart('run', RUN, 'Cumulative result per share, 24 trades (illustrative)', [0, 24], [-6, 8],
               [[-5, '−5'], [0, '0'], [5, '5']], [[0, '0'], [12, '12'], [24, '24 trades']], zero=True, pl=44, pr=110),
         series('b', 'run', BUY, 'green', ms=2200, label='buyer −1.56', lat=[24, -1.56], ldx=6, ldy=0, lanchor='start', lsize=15)),
    step('Style 2, sell premium. The 95 put collects $0.57 and wins 82.9% of the time. The average win is $0.46, but the average loss is $2.82, six times bigger.',
         box('sell', 305, 100, 285, 66, '2 · sell a 95 put', 'amber', sub='collect $0.57 · wins 82.9%', size=18)),
    step('The same twenty-four months for the seller: a steady climb of small wins, then four sharp drops. It ends slightly down too. Fair prices: a high win rate and a low one are two slices of the same average.',
         series('s', 'run', SELL, 'amber', ms=2200, label='seller −2.08', lat=[24, -2.08], ldx=6, ldy=18, lanchor='start', lsize=15)),
    step('Style 3, trade volatility. A 100 straddle costs $4.57 and profits if the price travels more than $4.77 either way, which happens 40.5% of the time. It bets on size, not direction.',
         box('vol', 10, 452, 185, 120, '3 · long\nstraddle', 'purple', sub='$4.57 · wins 40.5%', size=18)),
    step('Style 4, hedge. You already own 100 shares. The 95 put costs $0.57 and caps your loss at $5.67 a share. Most months it expires unused, and that is what protection looks like.',
         box('hed', 208, 452, 185, 120, '4 · shares\n+ 95 put', 'blue', sub='worst case −$5.67', size=18)),
    step('Style 5, relative value. Sell the 30-day call and buy the 90-day call, both at 100. You bet on the gap between two prices, not on direction. Profit sits in a narrow hump near the strike.',
         box('rv', 406, 452, 185, 120, '5 · sell 30-day\nbuy 90-day', 'red', sub='best $1.36 · worst $1.87', size=16)),
    step('What decides who is paid is not the style but the gap between realised and implied volatility. Say realised comes in at 25%: the buyers are paid, the put seller and the calendar are not. At 15% it flips.',
         chart('ev', (10, 590, 580, 200), 'Average result per share if realised vol = 25%', [0, 5], [-0.8, 1.5],
               [[-0.5, '−0.5'], [0, '0'], [0.5, '0.5'], [1, '1']], [], zero=True, pl=44, pr=16),
         dict(bars='evb', chart='ev', data=[[0.5, 0.34, 'call', 'green'], [1.5, -0.5, 'put', 'red'], [2.5, 0.94, 'straddle', 'green'], [3.5, 0.3, 'hedge', 'green'], [4.5, -0.42, 'calendar', 'red']], bw=50)),
    step('So before any of the five: finish the sentence "I get paid because…". If you cannot, the average result is minus your costs, whichever style you pick.',
         note('end', 300, 826, 'no edge = minus the costs', 'red', 19)),
])


BOARD = dict(name='options_trading_styles', lesson='options-trading-styles', title='Five ways to trade the same month', cfg=OPT,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>\n  <h2>It actually happened: Berkshire Hathaway\'s index puts, 2008</h2>',
             deck_after=4)
