from ._wb import *

# ── Merton's portfolio problem (merton-portfolio-problem) ─────────────────────
# Numbers: the lesson's own Merton fraction f* = mu / (gamma sigma^2), with the visual
# guide's example asset (6% excess return over cash, 25% volatility, so variance 6.25%):
# f* = 0.06 / (gamma * 0.0625) = 0.96 / gamma -> 96% (gamma 1, Kelly), 48% (2), 24% (4).
# LTCM: roughly 25 to 1 in early 1998 (well over $100bn on under $5bn). With wealth 1 and
# positions 25, a 1% fall loses 0.25 (a quarter of wealth); staying at 25x the new wealth
# 0.75 means positions of 18.75, so sell 6 of 24.75 = 24% of the book ("about a quarter").
# Outcome: about $4.6bn lost; 14 banks and brokers put in about $3.6bn on 23 Sept 1998.
def _f(g): return 0.06 / (g * 0.0625)
CURVE = [[round(g / 100, 2), round(_f(g / 100), 4)] for g in range(77, 501, 4)]
LEV, FALL = 25.0, 0.01
_held = LEV * (1 - FALL); _w = 1 - LEV * FALL; _target = LEV * _w; _sell = _held - _target
assert abs(_w - 0.75) < 1e-9 and abs(_target - 18.75) < 1e-9 and abs(_sell / _held - 0.2424) < 1e-3

MERTON = dict(w=600, h=800, intro='One risky asset, one safe one, and a dial for how much you dislike risk. Then what the clean answer assumes, at 25 to 1. Press play, or step through.', steps=[
    step('You hold wealth in two places: cash, which earns the safe rate, and a risky asset that beats cash by 6% a year on average, with 25% volatility.',
         icon('cash', 'piggy', 30, 10, 0.75, 'blue', 'cash\nearns r', sym='$', lsize=17),
         icon('you', 'person', 262, 10, 0.75, None, 'you', lsize=17),
         icon('risky', 'up', 480, 10, 0.75, 'purple', 'risky asset\n+6%/yr, 25% vol', lsize=17)),
    step('At every instant you choose one number: the share f of your wealth to hold in the risky asset. The rest, 1 − f, sits in cash. Merton asked how to set f for life, not for one bet.',
         chip('f', 300, 150, 'share f', 'purple'), move('f', 470, 150, 1000),
         chip('rest', 300, 150, '1 − f', 'blue'), move('rest', 110, 150, 1000)),
    step('Merton solved it in 1969 and 1971 with the HJB equation. For an investor with constant relative risk aversion γ, the best share is the edge divided by γ times the variance.',
         note('rule', 300, 205, 'f* = edge ÷ (γ × variance) = 6% ÷ (γ × 6.25%)', 'amber', 19)),
    step('Draw that share against risk aversion. The edge and the volatility never change on this chart: only the investor does.',
         chart('fg', (10, 240, 580, 270), 'Best share in the risky asset vs risk aversion γ', [0, 5.2], [0, 1.25],
               [[0, '0'], [0.5, '50%'], [1, '100%']], [[1, 'γ = 1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']]),
         series('curve', 'fg', CURVE, 'purple', ms=1500)),
    step('Risk aversion of 1 is log utility, which is exactly what Kelly maximises. So the answer here, 6 ÷ 6.25 = 96% of wealth, is precisely the Kelly fraction. Kelly is one point on Merton\'s dial.',
         dot('k1', 'fg', [1, _f(1)], 'Kelly (γ = 1): 96%', 'green', dx=14, dy=-10, anchor='start')),
    step('Risk aversion of 2: the share halves, to 48%. That is half-Kelly, exactly. At 4 it is 24%, quarter-Kelly. Each is the correct answer for that investor, not a discount on the "real" one.',
         dot('k2', 'fg', [2, _f(2)], 'γ = 2: 48%, half-Kelly', 'blue', dx=12, dy=-14, anchor='start'),
         dot('k4', 'fg', [4, _f(4)], 'γ = 4: 24%', 'amber', dy=-22)),
    step('And the share is a constant. For this kind of investor it does not change with how rich you are or how long you have left. Wealth goes up or down, you rebalance back to the same f.',
         box('const', 330, 282, 250, 74, 'rich or poor, young or old:\nthe same share f', 'blue', size=18)),
    step('That rebalancing is assumed to be free and instant. Now take a very large f. In early 1998 Long-Term Capital Management, where Merton was a partner, ran about 25 to 1: well over $100 billion of positions on under $5 billion of capital.',
         dict(dim='fg'), dict(dim='curve'), dict(dim='k1'), dict(dim='k2'), dict(dim='k4'), dict(dim='const'),
         box('ltcm', 10, 528, 270, 96, 'LTCM, early 1998\n~25 to 1: $100bn+\non under $5bn', 'red', size=18)),
    step('Start with wealth 1 and positions of 25. A 1% fall in the positions loses 0.25: a quarter of your wealth. To stay at 25 times the new wealth of 0.75, positions must drop to 18.75. You must sell 6, about a quarter of everything you own.',
         chart('reb', (300, 528, 290, 222), 'Positions, in units of capital', [0.4, 3.6], [0, 31],
               [[0, '0'], [25, '25']], [[1, 'before'], [2, 'after −1%'], [3, 'target']], pl=36),
         dict(bars='rb', chart='reb', data=[[1, 25, '25', 'blue'], [2, _held, '24.75', 'amber'], [3, _target, '18.75', 'green']], bw=46, ms=1100)),
    step('After Russia devalued and defaulted on 17 August 1998, LTCM\'s spreads widened together and lenders demanded collateral. Much of the market knew roughly what it held, so every sale moved prices against it and deepened the next mark.',
         box('sell', 10, 668, 270, 70, 'market knows the book:\nevery sale moves the price', 'red', size=17),
         arrow('ltcm', 'sell', tone='red')),
    step('By late September about $4.6 billion was gone. On 23 September fourteen banks and brokers put in about $3.6 billion to take the portfolio over. Merton\'s rule is sound; its free-rebalancing assumption is what breaks when f is far above 1.',
         note('out', 300, 778, '~$4.6bn lost · $3.6bn takeover by 14 banks, 23 Sep 1998', 'red', 18)),
])


BOARD = dict(name='merton_portfolio_problem', lesson='merton-portfolio-problem',
             title='The Merton fraction, from Kelly to 25 to 1', cfg=MERTON,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=8)
