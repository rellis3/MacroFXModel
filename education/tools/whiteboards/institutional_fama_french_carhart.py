from ._wb import *

# ── Fama-French & Carhart (institutional-fama-french-carhart) ─────────────────
# Numbers: the lesson's worked example (illustrative one period): MKT 2.0%, SMB 1.5%, HML 1.0%,
# UMD 0.5%; CAPM beta 1.30 -> 2.60%; four-factor alpha 0.30, betas 1.10 / 0.80 / 0.60 / -0.10
# -> 4.25%; actual 4.10%. Construction: 2 size x 3 book-to-market sort (median, 30/40/30),
# UMD ranks months t-12..t-2. Carry crash: AUD/JPY about -17% from 11 July to 5 August 2024,
# as told in the Interest Rate Parity lesson this one points back to.
F = dict(MKT=2.0, SMB=1.5, HML=1.0, UMD=0.5)
B = dict(MKT=1.10, SMB=0.80, HML=0.60, UMD=-0.10)
ALPHA, B_CAPM, ACTUAL = 0.30, 1.30, 4.10
TERMS = {k: round(B[k] * F[k], 2) for k in F}               # 2.2, 1.2, 0.6, -0.05
CAPM_HAT = round(B_CAPM * F['MKT'], 2)                       # 2.6
FOUR = round(ALPHA + sum(TERMS.values()), 2)                 # 4.25
assert (CAPM_HAT, FOUR) == (2.6, 4.25)

CELLS = [('SL', 'Small\nLow', 50, 40, 'blue'), ('SN', 'Small\nNeutral', 185, 40, None), ('SH', 'Small\nHigh', 320, 40, 'amber'),
         ('BL', 'Big\nLow', 50, 120, 'blue'), ('BN', 'Big\nNeutral', 185, 120, None), ('BH', 'Big\nHigh', 320, 120, 'amber')]
X = dict(actual=1, capm=2, a=3.3, MKT=4.3, SMB=5.3, HML=6.3, UMD=7.3, total=8.6)
f2 = lambda v: f'{v:.2f}'.replace('-', '−')

FF = dict(w=600, h=790, intro='One small-cap value stock, Stock Q, over one illustrative period, and the factors that explain its return. Press play, or step through.', steps=[
    step(f'Stock Q, a small-cap value stock, returned {ACTUAL:.2f}% over the risk-free rate this period (illustrative). CAPM, with a beta of {B_CAPM:.2f} and a 2.0% market excess return, explains only {CAPM_HAT:.2f}%.',
         chart('ch', (10, 232, 580, 262), 'Excess return, one period (%)', [0.4, 9.3], [-0.6, 5], [[0, '0'], [2, '2'], [4, '4']],
               [[X['actual'], 'actual'], [X['capm'], 'CAPM'], [X['a'], 'α'], [X['MKT'], 'MKT'], [X['SMB'], 'SMB'], [X['HML'], 'HML'], [X['UMD'], 'UMD'], [X['total'], '4-factor']], zero=True, pl=34),
         dict(bars='b0', chart='ch', data=[[X['actual'], ACTUAL, f2(ACTUAL), 'green'], [X['capm'], CAPM_HAT, f2(CAPM_HAT), 'blue']], bw=40, ms=1000),
         series('gap', 'ch', [[X['capm'] + 0.32, CAPM_HAT], [X['capm'] + 0.32, ACTUAL]], 'red', dash=True, ms=500),
         cnote('gapl', 'ch', [X['capm'] + 0.32, 3.35], '1.50 missing', 'red', 16, anchor='start', dx=8)),
    step('Fama and French did not fix beta. They measured the missing patterns directly. Sort every stock twice, independently: by size into Small and Big (a median split), and by book-to-market into Low, Neutral and High (30/40/30).',
         note('hl', 105, 24, 'Low B/M', 'blue', 17), note('hn', 240, 24, 'Neutral', None, 17), note('hh', 375, 24, 'High B/M', 'amber', 17),
         *[box(i, x, y, 110, 66, t, tone, size=17) for i, t, x, y, tone in CELLS]),
    step('SMB, Small Minus Big: the average of the three small portfolios minus the average of the three big ones. Averaging across book-to-market leaves a clean size spread.',
         box('smb', 480, 60, 110, 106, 'SMB\n3 small\n− 3 big', 'green', size=17),
         arrow('SH', 'smb', tone='green')),
    step('HML, High Minus Low: the two high book-to-market portfolios minus the two low ones. The Neutral column is left out. Each factor is a real, zero-cost long-short portfolio with its own return every month.',
         note('hml', 240, 205, 'HML = (2 High) − (2 Low), Neutral left out', 'amber', 17),
         dict(pulse='SH'), dict(pulse='BH'), dict(pulse='SL'), dict(pulse='BL')),
    step(f'Carhart (1997) added momentum, UMD: past winners minus past losers, ranked on months t−12 to t−2. The latest month is skipped on purpose, because one-month returns tend to reverse.',
         dict(line='mline', points=[[40, 540], [500, 540]], tone='green', width=6, ms=900),
         dict(line='skip', points=[[510, 540], [560, 540]], tone='amber', width=6, ms=400),
         note('m1', 40, 518, 't−12', None, 16, 'start'), note('m2', 500, 518, 't−2', None, 16, 'end'), note('m3', 535, 518, 'skip t−1', 'amber', 16),
         note('ml', 270, 566, 'rank on these 11 months: long winners, short losers', 'green', 16)),
    step(f'Now regress Stock Q on all four. The market loading drops to {B["MKT"]:.2f}, because size and value finally have somewhere to go. Pieces: alpha {ALPHA:.2f}, market {f2(TERMS["MKT"])}, size {f2(TERMS["SMB"])}, value {f2(TERMS["HML"])}, momentum {f2(TERMS["UMD"])}.',
         dict(bars='b1', chart='ch', data=[[X['a'], ALPHA, f2(ALPHA), 'purple'], [X['MKT'], TERMS['MKT'], f2(TERMS['MKT']), 'blue'],
                                           [X['SMB'], TERMS['SMB'], f2(TERMS['SMB']), 'green'], [X['HML'], TERMS['HML'], f2(TERMS['HML']), 'amber'],
                                           [X['UMD'], TERMS['UMD'], f2(TERMS['UMD']), 'red']], bw=34, ms=1200)),
    step(f'Add them up: {FOUR:.2f}%, against an actual {ACTUAL:.2f}%. The error falls from 1.50 points under CAPM to 0.15. The return did not change; the model now explains most of it, and much less is left to call alpha.',
         dict(bars='b2', chart='ch', data=[[X['total'], FOUR, f2(FOUR), 'purple']], bw=40, ms=900),
         series('act', 'ch', [[0.6, ACTUAL], [9.2, ACTUAL]], 'green', dash=True, ms=600)),
    step('The same move works in currencies. The broad dollar factor plays the market\'s role. The carry factor, long high-yielders and short low-yielders, mirrors HML. FX momentum is built exactly like UMD (Menkhoff and co-authors, 2012).',
         box('fx1', 10, 600, 180, 84, 'MKT →\ndollar factor', 'blue', size=18),
         box('fx2', 210, 600, 180, 84, 'HML →\nFX carry', 'amber', size=18),
         box('fx3', 410, 600, 180, 84, 'UMD →\nFX momentum', 'green', size=18)),
    step('A factor premium is pay for a risk, not a free lunch. Value lagged through much of the 2010s. Carry is short a crash: AUD/JPY fell about 17% from 11 July to 5 August 2024.',
         box('risk', 10, 702, 580, 74, 'factor premium = pay for risk\ncarry: AUD/JPY about −17%, 11 Jul → 5 Aug 2024', 'red', size=18)),
])


BOARD = dict(name='institutional_fama_french_carhart', lesson='institutional-fama-french-carhart',
             title='From CAPM\'s gap to four factors, drawn step by step', cfg=FF,
             before='  <div class="tl-section-mark"><span>Section 04</span></div>',
             deck_after=5)
