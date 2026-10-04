from ._wb import *

# ── Equal dollars vs equal risk, then leverage and March 2020 (risk-parity-erc) ──
# The lesson's worked example: bonds σ 5%, equities 15%, commodities 25%, every pair ρ = 0.30.
# Equal dollars (1/3 each): risk shares 6.97 / 29.51 / 63.52% (lesson: "about 7%, 30%, 64%"),
# σp = 11.64%. Inverse-vol = ERC here: w = 0.6522 / 0.2174 / 0.1304, i.e. $195.65 / $65.22 / $39.13
# of $300, each RC = 33.3%, σp = 7.144%. Leverage to the equal-dollar risk is our arithmetic:
# 11.64 / 7.144 = 1.63×, so bonds become 1.63 × 65.2% ≈ 106% of capital (illustrative target).
# March 2020: VIX record close 82.69 on 16 March; stocks and Treasuries fell together for days;
# Fed's open-ended purchases 23 March.
PLANK_TILT_R = [[40, 525], [260, 595]]   # commodities end down
PLANK_LEVEL = [[40, 560], [260, 560]]
PLANK_TILT_L = [[40, 595], [260, 525]]   # bonds end down
RP = dict(w=600, h=815, intro='Three sleeves, $300, and the difference between splitting the money evenly and splitting the risk evenly. Press play, or step through.', steps=[
    step('Three sleeves from the lesson\'s worked example: a bond fund that swings about 5% a year, equities about 15%, commodities about 25%. Every pair is assumed to move together with the same correlation, 0.30.',
         icon('bd', 'scroll', 62, 4, 0.65, 'blue', 'bonds σ 5%', lsize=17),
         icon('eq', 'up', 268, 4, 0.65, 'purple', 'equities σ 15%', lsize=17),
         icon('cm', 'barrel', 472, 4, 0.65, 'amber', 'commodities σ 25%', lsize=17)),
    step('The obvious "balanced" split: $300, $100 in each. Equal dollars.',
         box('wb', 20, 118, 150, 64, 'capital', 'blue', sub='$100', size=18),
         box('we', 225, 118, 150, 64, 'capital', 'purple', sub='$100', size=18),
         box('wc', 430, 118, 150, 64, 'capital', 'amber', sub='$100', size=18)),
    step('Now ask where the day-to-day swings come from. Bonds supply about 7% of the portfolio\'s risk, equities about 30%, and commodities about 64%: two-thirds of the risk from one third of the money.',
         chart('rs', (10, 198, 580, 240), 'Share of the portfolio\'s risk', [0.45, 3.55], [0, 78],
               [[33.3, '33%'], [64, '64%']], [[1, 'bonds'], [2, 'equities'], [3, 'commodities']], pl=52),
         note('ldl', 380, 216, 'equal $', 'red', 17), note('lerc', 470, 216, 'equal risk', 'green', 17),
         dict(bars='bd1', chart='rs', data=[[0.82, 6.97, '7%', 'red'], [1.82, 29.51, '30%', 'red'], [2.82, 63.52, '64%', 'red']], bw=40, ms=1100)),
    step('Picture it as a seesaw of risk: the commodities end slams down and the bonds end sits in the air, a rounding error however many dollars are on it.',
         note('sst', 150, 470, 'risk seesaw', 'chalk', 18),
         dict(line='piv', points=[[150, 562], [126, 614], [174, 614], [150, 562]], tone='chalk', width=3, ms=500),
         dict(line='pk1', points=PLANK_TILT_R, tone='chalk', width=5, ms=600),
         chip('sb', 62, 510, 'bonds', 'blue'),
         chip('sc', 238, 567, 'commodities', 'amber')),
    step('Risk parity flips the question: give each sleeve the same slice of risk. With one shared correlation that means sizing by 1 ÷ volatility: 20, 6.67 and 4, out of 30.67. Bonds get 65.2% of the money, equities 21.7%, commodities 13.0%.',
         chip('m1', 505, 158, '$60.87', 'amber'), chip('m2', 300, 158, '$34.78', 'purple'),
         move('m1', 95, 150, 1400), move('m2', 95, 150, 1400), dict(hide='m1'), dict(hide='m2'),
         dict(count='wb', **{'from': 100, 'to': 195.65, 'dp': 2, 'pre': '$', 'ms': 1400}),
         dict(count='we', **{'from': 100, 'to': 65.22, 'dp': 2, 'pre': '$', 'ms': 1400}),
         dict(count='wc', **{'from': 100, 'to': 39.13, 'dp': 2, 'pre': '$', 'ms': 1400})),
    step('Now every sleeve supplies exactly a third of the risk: 33.3% each. The seesaw balances, because the calm asset holds the big pile.',
         dict(bars='bd2', chart='rs', data=[[1.18, 33.33, '33%', 'green'], [2.18, 33.33, '33%', 'green'], [3.18, 33.33, '33%', 'green']], bw=40, ms=1000),
         dict(hide='pk1'),
         dict(line='pk2', points=PLANK_LEVEL, tone='green', width=5, ms=500),
         move('sb', 62, 542, 600), move('sc', 238, 542, 600)),
    step('A side effect, not the goal: the total wiggle falls too. Equal dollars runs about 11.64% a year; the equal-risk mix about 7.14%.',
         box('sp', 330, 470, 260, 74, 'portfolio risk σp', 'blue', sub='11.64%', size=19),
         dict(count='sp', **{'from': 11.64, 'to': 7.14, 'dp': 2, 'suf': '%', 'ms': 1300})),
    step('Less risk also means less return, with most of the money parked in low-return bonds. So real funds borrow. Scaling the whole mix about 1.63 times brings the risk back to 11.64%, still split evenly, and bonds become about 106% of your capital. Illustrative target.',
         icon('lend', 'bank', 340, 560, 0.5, 'chalk', 'borrow', sym='$', lsize=17),
         box('lev', 430, 570, 160, 60, '× 1.63', 'amber', size=22),
         arrow('lend', 'lev', None, 'amber'),
         dict(count='sp', **{'from': 7.14, 'to': 11.64, 'dp': 2, 'suf': '%', 'ms': 1300})),
    step('That only works while bonds stay calm and keep moving apart from stocks. March 2020: volatility jumped almost everywhere at once, the VIX closed at a record 82.69 on 16 March, and for several days stocks and Treasuries fell together.',
         icon('fire', 'fire', 30, 660, 0.6, 'red', 'VIX 82.69\n16 Mar', lsize=17),
         dict(hide='pk2'),
         dict(line='pk3', points=PLANK_TILT_L, tone='red', width=5, ms=500),
         move('sb', 62, 568, 600), move('sc', 238, 510, 600),
         dict(pulse='bd')),
    step('The big, levered bond sleeve now carried far more risk than it had been given, and the portfolio\'s risk overshot its target. Every fund running these rules got the same order: cut. Risk-parity and vol-target funds sold into the fall.',
         icon('fund', 'crowd', 245, 660, 0.6, 'purple', 'risk-parity &\nvol-target funds', lsize=17),
         icon('sell', 'down', 470, 660, 0.6, 'red', 'sell into\nthe fall', lsize=17),
         arrow('fire', 'fund', None, 'red'),
         arrow('fund', 'sell', 'cut', 'red', size=17)),
    step('The selling came after the losses, and it left them holding less when markets rebounded after the Fed\'s open-ended purchases on 23 March. Equal risk is exact for the risk you measured, not the risk that arrives.',
         note('end', 300, 792, 'equal risk ≠ equal dollars · exact only for the Σ you measured', 'amber', 18)),
])


BOARD = dict(name='riskparity', lesson='risk-parity-erc',
             title='Equal dollars vs equal risk, drawn step by step', cfg=RP,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>\n  <h2>How practitioners actually use this</h2>\n  <p>\n    Risk parity is a real',
             deck_after=12)
