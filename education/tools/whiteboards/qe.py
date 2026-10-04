from ._wb import *

# ── 3. QE and QT through four balance sheets (qe-qt-balance-sheet) ───────────
ICON = {'fed': ('bank', '$'), 'bank': ('bank', None), 'pen': ('piggy', '$'), 'tsy': ('govt', None)}
def acct(id, x, y, title, tone):
    name, sym = ICON[id]
    return [box(id, x, y, 285, 200, title, tone, top=True, size=22),
            icon(id + '-ic', name, x + 8, y + 4, 0.36, tone, sym=sym),
            dict(line=id + '-div', points=[[x + 142, y + 44], [x + 142, y + 188]], tone='chalk', width=1.5, ms=300),
            note(id + '-a', x + 71, y + 52, 'Assets', None, 17),
            note(id + '-l', x + 213, y + 52, 'Liabilities', None, 17)]
FX, FY, BX, BY, PX, PY, TX, TY = 10, 10, 305, 10, 10, 255, 305, 255
QE = dict(w=600, h=520, intro='One $100bn purchase, followed through four balance sheets — then the same film run backwards for QT. Figures in $bn.', steps=[
    step('Four balance sheets: the Fed, the banking system, a pension fund and the US Treasury. Every one must always balance: assets equal liabilities (plus capital).',
         *acct('fed', FX, FY, 'The Fed', 'amber'), *acct('bank', BX, BY, 'Banking system', 'blue'),
         *acct('pen', PX, PY, 'Pension fund', 'purple'), *acct('tsy', TX, TY, 'US Treasury', 'chalk')),
    step('QE: the Fed buys a $100bn Treasury bond. Most QE bonds came from non-banks like this pension fund, through dealers.',
         icon('bond', 'scroll', PX + 71 - 21, PY + 100 - 30, 0.42, 'amber', 'bond 100', sym=None, lsize=16)),
    step('The bond moves to the Fed. It is now the Fed\'s asset.',
         move('bond', FX + 71 - 21, FY + 100 - 30, 1300)),
    step('How does the Fed pay? It credits the seller\'s bank with $100bn of reserves, an entry it creates on its own books. Nothing has to be borrowed first. The Fed\'s assets and liabilities rise together.',
         icon('fres', 'cash', FX + 213 - 21, FY + 100 - 30, 0.42, 'amber', 'reserves 100', sym='$', lsize=16)),
    step('The pension fund\'s bank now holds $100bn more reserves (an asset) and owes the fund a $100bn deposit (a liability). Its balance sheet grows on both sides.',
         icon('bres', 'cash', BX + 71 - 21, BY + 100 - 30, 0.42, 'blue', 'reserves 100', sym='$', lsize=16),
         icon('bdep', 'cash', BX + 213 - 21, BY + 100 - 30, 0.42, 'blue', 'deposits 100', sym='$', lsize=16)),
    step('The pension fund has swapped a long bond for a bank deposit. Everything balances: no money appeared from nowhere without a matching entry.',
         icon('pdep', 'cash', PX + 71 - 21, PY + 100 - 30, 0.42, 'purple', 'deposit 100', sym='$', lsize=16)),
    step('The point: the private sector now holds fewer long bonds and more deposits. Investors who still want duration bid up what is left, so the term premium and long yields fall. That is the portfolio-balance channel.',
         note('ch', 300, 490, 'fewer long bonds in private hands → term premium ↓ → 10-year yield ↓', 'green', 20)),
    step('QT runs the film backwards. In this cycle it has been runoff: a $100bn bond the Fed holds matures and is not replaced.',
         dict(hide='ch'), dict(pulse='bond'),
         note('qt', 300, 490, 'QT: let it mature, do not reinvest', 'red', 21)),
    step('To pay the Fed off, the Treasury sells a new $100bn bond to the public. Here the pension fund buys it.',
         icon('nb', 'scroll', TX + 71 - 21, TY + 100 - 30, 0.42, 'chalk', 'new bond 100', sym=None, lsize=16),
         move('nb', PX + 71 - 21, PY + 152 - 30, 1300)),
    step('The fund pays with its deposit, so the deposit leaves the bank and the bank\'s reserves fall with it.',
         dict(dim='pdep'), dict(dim='bdep'), dict(dim='bres')),
    step('The Treasury uses that cash to repay the Fed. The Fed\'s bond and the matching reserves both disappear. Net result: reserves down $100bn, one more long bond in private hands.',
         dict(dim='bond'), dict(dim='fres'), dict(pulse='nb'),
         note('tsyl', TX + 213, TY + 110, 'owes Fed −100\nowes public +100', None, 17)),
    step('Do it slowly and nobody notices, until reserves run short. In September 2019 that is how the Fed found out where "short" was.',
         dict(hide='qt'), note('end', 300, 490, 'Too far, too fast → reserves scarce (Sept 2019)', 'amber', 21)),
])


BOARD = dict(name='qe', lesson='qe-qt-balance-sheet', title='One QE purchase — and its QT reverse — through four balance sheets', cfg=QE,
             before='  <div class="tl-chart interactive">\n    <div class="tl-chart-label">Four balance sheets, one purchase',
             deck_after=6)
