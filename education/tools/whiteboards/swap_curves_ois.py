from ._wb import *

# ── Swap curves & OIS discounting (swap-curves-ois) ───────────────────────────
# The lesson's worked example: flat 3% OIS curve (annual compounding), N = $10,000,000,
# 2-year annual-pay swap, fixed K = 3.2%. DF(1) 0.970874, DF(2) 0.942596, annuity 1.913470,
# PV float $574,041, par 3.0000%, PV fixed $612,310, value to the payer -$38,269.
# Crisis and LIBOR facts are the lesson's: LIBOR-OIS around 8-10bp in early 2007, roughly
# 364bp in October 2008; Barclays about $450m (June 2012), UBS about $1.5bn (Dec 2012);
# the main USD LIBOR panel ended 30 June 2023.
N, K, R = 10_000_000, 0.032, 0.03
DF1, DF2 = 1 / (1 + R), 1 / (1 + R) ** 2
ANN = DF1 + DF2
PVFL = N * (1 - DF2); PVFX = K * N * ANN
assert round(PVFL) == 574041 and round(PVFX) == 612310 and round(PVFL - PVFX) == -38269

SW = dict(w=600, h=790, intro='Two sides swap fixed for floating on money that never moves. Value each leg, find the fair rate, then ask the question 2008 forced: discount at which rate? Press play, or step through.', steps=[
    step('You and a dealer agree a 2-year swap on $10 million. The $10 million itself never changes hands. Only the difference between two rates does, once a year.',
         icon('you', 'person', 40, 64, 0.75, 'amber', 'you', lsize=17),
         icon('dlr', 'bank', 470, 64, 0.8, 'blue', 'dealer', sym='$', lsize=17),
         box('notional', 205, 80, 190, 58, '$10m notional', None, sub='never exchanged', size=18)),
    step('Your side: pay a fixed 3.2% each year, $320,000. The dealer\'s side: pay you the floating rate, whatever it resets to.',
         arrow('you', 'dlr', 'fixed 3.2% = $320,000 a year', 'amber', bend=-45, size=16),
         arrow('dlr', 'you', 'floating rate', 'blue', bend=-45, size=16)),
    step('To value each leg, discount it. Take a flat 3% OIS curve: a dollar in one year is worth 0.9709 today, a dollar in two years 0.9426.',
         note('df', 300, 252, 'DF(1) = 1 ÷ 1.03 = 0.9709    DF(2) = 1 ÷ 1.03² = 0.9426', 'purple', 18)),
    step('The floating leg is a floating-rate note minus the principal it never repays: $10m × (1 − 0.9426) = $574,041.',
         chart('pv', (10, 262, 360, 280), 'Present value of each leg ($k)', [0.4, 2.6], [0, 130],
               [[0, '500'], [50, '550'], [100, '600']], [[1, 'floating'], [2, 'fixed 3.2%']], pl=50),
         dict(bars='bfl', chart='pv', data=[[1, round(PVFL / 1000 - 500, 1), '$574,041', 'blue']], bw=70, ms=900)),
    step('The fixed leg is $320,000 a year, discounted: 3.2% × $10m × 1.9135 = $612,310. Bigger than the floating leg.',
         dict(bars='bfx', chart='pv', data=[[2, round(PVFX / 1000 - 500, 1), '$612,310', 'amber']], bw=70, ms=900)),
    step('The par rate is the fixed rate that makes the legs equal: 3.00% here. You are paying 20bp above it, so the swap is worth −$38,269 to you. (Bars start at $500k.)',
         box('val', 390, 300, 200, 100, 'par 3.00%\nyou pay 3.2%\n→ −$38,269', 'red', size=19)),
    step('But which curve should the discount factors come from? For decades it was LIBOR: a survey of what panel banks said they could borrow at, unsecured. It carries bank credit risk.',
         dict(dim='pv'), dict(dim='bfl'), dict(dim='bfx'), dict(dim='val'), dict(hide='df'),
         box('libor', 10, 562, 280, 70, 'LIBOR: unsecured,\nbank risk, a survey', 'red', size=18),
         box('ois', 310, 562, 280, 70, 'OIS: overnight rate,\nwhat collateral earns', 'green', size=18)),
    step('In calm times the gap was tiny, about 8 to 10 basis points. After Lehman failed it reached roughly 364bp in October 2008. A collateralised swap carries almost none of that bank risk.',
         chart('sp', (10, 646, 280, 140), 'LIBOR-OIS spread (bp)', [0.4, 2.6], [0, 470],
               [[0, '0'], [364, '364']], [[1, 'early 2007'], [2, 'Oct 2008']], pl=44, pt=40),
         dict(bars='spb', chart='sp', data=[[1, 9, '~9', 'blue'], [2, 364, '~364', 'red']], bw=56, ms=1100)),
    step('So desks split the job. OIS discounts every cash flow to today. A separate forecast curve says what the floating leg will pay. Two curves where there used to be one.',
         dict(pulse='ois'),
         note('split', 450, 680, 'OIS discounts', 'green', 19),
         note('split2', 450, 712, 'forecast curve projects', 'blue', 19)),
    step('And the survey had been gamed. Some banks submitted low rates to look healthy, and traders asked for fixes that suited them. Barclays paid about $450m in June 2012, UBS about $1.5bn that December.',
         dict(cross='libor')),
    step('LIBOR was replaced by SOFR, built from real overnight repo trades. The main US dollar LIBOR panel ended on 30 June 2023. Discount at what your collateral actually earns.',
         note('sofr', 450, 760, 'SOFR: real trades, not a survey', 'green', 18)),
])


BOARD = dict(name='swap_curves_ois', lesson='swap-curves-ois',
             title='A swap, its fair rate, and the curve that changed', cfg=SW,
             before='  <div class="tl-section-mark"><span>Section 03</span></div>',
             deck_after=8)
