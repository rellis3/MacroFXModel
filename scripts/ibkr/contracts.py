"""One registry for every IBKR futures root the laptop pulls (plans/DATA_CAPTURE_G10.md section 3, phases 1, 2 and 4).

Until 2026-11-27 each script hard-coded contract MONTHS (refresh_leg_bars.IB_SPEC: ZNZ6, FGBL2612 ...), so every expiry
stopped a leg in silence (the Schatz on 9 Oct). Here each ROOT is described once: symbol, exchange, currency, trading
class, the month cycle, how many live contracts to keep, the bar type, and the ROLL RULE. Scripts ask IBKR for every
listed expiry of a root (reqContractDetails without a month), and `select_live` picks the contracts to pull.

Rules of the store (unchanged): every contract is kept in its own file, named by local symbol
(analysis/output/stir_1m_deep/<stem>.parquet; `stem_for` reproduces every existing stem), and continuous series are
BUILT from those files (scripts/ibkr/continuous.py), so a roll rule can always be changed and rebuilt.

Roll rules (applied only when a continuous series is built, never to the stored contracts):

    fnd2      US Treasuries, CGB, gold: 2 business days before first notice
    ltd3      Eurex bonds (Schatz/Bobl/Bund/Buxl, BTP, OAT, Conf): 3 business days before the last trading day
    ltd5      JGB: 5 business days before the last trading day
    asx3      ASX 3y / 10y bonds: 3 calendar days before the 15th (moved back to a business day)
    thu8      equity and FX futures: the Thursday 8 days before the contract month's 3rd Friday (= the 2nd Thursday)
    dx5       ICE dollar index: 5 business days before the last trading day
    expiry    VIX futures: on the expiry day
    strip     rate strips (SOFR, Euribor, ESTR, SONIA, CORRA, bank bills, fed funds): never rolled; ranked 1st, 2nd ...
              by expiry, the rank moving on the front contract's last trading day (as build_leg_bars' I2! and SR32!)

A roll date is a calendar date; the switch happens at 00:00 UTC on that date. Business days use the root's holiday
calendar (`HOLIDAYS`): US (CME/CBOT) and EU (Eurex/TARGET) are complete for the dates that matter here; JP, CA, AU and
UK carry the main fixed holidays only. Live roll dates use IBKR's own last trading day; the rule-based last trading day
(`last_trade`) is only the fallback for contracts IBKR no longer lists.

Pure functions only (no network, no files) except `ib_contract`, which builds an ib_insync contract lazily.
Tested by scripts/ibkr/test_contracts.py."""
from __future__ import annotations

import calendar
import datetime as dt
import re
from dataclasses import dataclass, field

CODES = 'FGHJKMNQUVXZ'
MONTH = {c: i + 1 for i, c in enumerate(CODES)}
QUARTERLY = 'HMUZ'
ROLL_WINDOW_BD = 10      # business days before a roll in which the next contract is pulled on every run (and the health check expects its bars)


@dataclass(frozen=True)
class Root:
    key: str                  # registry key, also the continuous name stem: ZN -> ZN1, ZN2
    symbol: str               # IBKR symbol
    exchange: str
    currency: str
    roll: str                 # roll rule (see module docstring)
    cycle: str = QUARTERLY    # contract-month codes kept; '' = every month
    depth: int = 2            # live contracts kept (pulled with --all, and by the backfill)
    pull: int = 2             # live contracts pulled by the 30-minute job (rolled roots: front + next, next only in the roll window)
    trading_class: str = ''
    what: str = 'MIDPOINT'
    rth: bool = False
    kind: str = 'future'      # 'future' or 'index'
    cal: str = 'US'
    prefix: str = ''          # name prefix: ZN, FGBL, SR3, 6E ...
    name_style: str = 'c1'    # c1 = PREFIX+code+1-digit year (ZNZ6); c2 = 2-digit year (CGBZ26); yymm = PREFIX+yymm (FGBL2612)
    stem_style: str = 'name'  # name = EXCH_NAME (CBOT_ZNZ6); eurex = EUREX_FGBL_<last trade>_M (IBKR's local symbol)
    stem_exch: str = ''       # exchange tag in the file stem (default: exchange)
    ltd_rule: str = ''        # rule-based last trading day (fallback when IBKR does not list the contract)
    chart_kind: str = 'price' # 'rate' (100 - rate) or 'price'
    label: str = ''
    group: str = ''
    side: str = ''
    phase: int = 1            # 1 = the legs pulled before 2026-11-27, 2 = the G10 legs added then
    extra: dict = field(default_factory=dict, compare=False, hash=False)

    @property
    def tag(self):
        return self.stem_exch or self.exchange

    @property
    def rolled(self):
        return self.roll not in ('strip', 'none')


def _r(key, symbol, exchange, currency, roll, **kw):
    kw.setdefault('prefix', key)
    return Root(key, symbol, exchange, currency, roll, **kw)


_UST = dict(roll='fnd2', ltd_rule='ust', group='US Treasury futures (price, not a rate)', side='US')
_EUX = dict(roll='ltd3', cal='EU', ltd_rule='eurex', name_style='yymm', stem_style='eurex', side='EUR', group='German bond futures (price, not a rate)')
_STRIP = dict(roll='strip', chart_kind='rate', pull=3, depth=8)
_FX = dict(roll='thu8', ltd_rule='fx', group='CME FX futures', side='US')

ROOTS = {r.key: r for r in [
    # rate strips: ranked, never rolled
    _r('SR3', 'SOFR3', 'CME', 'USD', trading_class='SR3', ltd_rule='sofr', label='SOFR 3M', group='SOFR 3M (CME SR3)', side='US', **_STRIP),
    _r('I', 'I', 'ICEEU', 'EUR', trading_class='I', cal='EU', ltd_rule='euribor', label='Euribor 3M', group='Euribor 3M (ICE I)', side='EUR', **_STRIP),
    _r('ER3', 'ER3', 'ICEEU', 'EUR', trading_class='ER3', cal='EU', ltd_rule='sofr', label='ESTR 3M', group='ESTR 3M (ICE ER3)', side='EUR', **_STRIP),
    _r('ZQ', 'ZQ', 'CBOT', 'USD', roll='strip', cycle='', depth=7, pull=5, chart_kind='rate', ltd_rule='month_end', label='Fed funds 30-day', group='Fed funds 30-day (CBOT ZQ)', side='US'),
    # US Treasuries
    _r('ZT', 'ZT', 'CBOT', 'USD', label='US 2y note', **_UST),
    _r('ZF', 'ZF', 'CBOT', 'USD', label='US 5y note', **_UST),
    _r('ZN', 'ZN', 'CBOT', 'USD', label='US 10y note', **_UST),
    _r('ZB', 'ZB', 'CBOT', 'USD', label='US 30y bond', **_UST),
    _r('UB', 'UB', 'CBOT', 'USD', label='US Ultra bond', **_UST),
    # Eurex: IBKR symbols GBS/GBM/GBL/GBX ('FGBS' does not resolve), local symbols 'FGBL 20261208 M'
    _r('GBS', 'GBS', 'EUREX', 'EUR', prefix='FGBS', label='Schatz (German 2y)', **_EUX),
    _r('GBM', 'GBM', 'EUREX', 'EUR', prefix='FGBM', label='Bobl (German 5y)', **_EUX),
    _r('GBL', 'GBL', 'EUREX', 'EUR', prefix='FGBL', label='Bund (German 10y)', **_EUX),
    _r('GBX', 'GBX', 'EUREX', 'EUR', prefix='FGBX', label='Buxl (German 30y)', **_EUX),
    _r('BTP', 'BTP', 'EUREX', 'EUR', prefix='FBTP', **{**_EUX, 'stem_style': 'name', 'group': 'Euro sovereign bond futures (price, not a rate)'}, label='Italy BTP 10y'),
    _r('OAT', 'OAT', 'EUREX', 'EUR', prefix='FOAT', **{**_EUX, 'stem_style': 'name', 'group': 'Euro sovereign bond futures (price, not a rate)'}, label='France OAT 10y'),
    # dollar, vol, equity, gold
    _r('DX', 'DX', 'NYBOT', 'USD', roll='dx5', ltd_rule='dx', label='US Dollar Index', group='Dollar and volatility', side='US'),
    _r('VX', 'VIX', 'CFE', 'USD', roll='expiry', cycle='', depth=3, pull=2, trading_class='VX', ltd_rule='vix', label='VIX future', group='Dollar and volatility', side='US'),
    _r('NQ', 'NQ', 'CME', 'USD', roll='thu8', ltd_rule='equity', label='Nasdaq-100 E-mini', group='Equity index futures', side='US'),
    _r('ES', 'ES', 'CME', 'USD', roll='thu8', ltd_rule='equity', label='S&P 500 E-mini', group='Equity index futures', side='US'),
    _r('6E', 'EUR', 'CME', 'USD', label='Euro FX', **_FX),
    _r('6B', 'GBP', 'CME', 'USD', label='British pound', **_FX),
    _r('6J', 'JPY', 'CME', 'USD', label='Japanese yen', **_FX),
    _r('GC', 'GC', 'COMEX', 'USD', roll='fnd2', cycle='GJMQVZ', ltd_rule='gold', label='Gold', group='Gold', side='US'),
    # cash vol indices: no expiry, TRADES bars in RTH
    _r('VIX', 'VIX', 'CBOE', 'USD', roll='none', kind='index', cycle='', depth=1, pull=1, what='TRADES', rth=True, label='VIX index', group='Dollar and volatility', side='US'),
    _r('VVIX', 'VVIX', 'CBOE', 'USD', roll='none', kind='index', cycle='', depth=1, pull=1, what='TRADES', rth=True, label='VVIX index', group='Dollar and volatility', side='US'),
    _r('VXN', 'VXN', 'CBOE', 'USD', roll='none', kind='index', cycle='', depth=1, pull=1, what='TRADES', rth=True, label='VXN index', group='Dollar and volatility', side='US'),
    # phase 2 (2026-11-27): the G10 legs IBKR serves on this account (probe of 2026-11-27, delayed data)
    _r('JGB', 'JGB', 'OSE.JPN', 'JPY', roll='ltd5', cal='JP', trading_class='JBL', stem_exch='OSE', ltd_rule='jgb', label='JGB 10y', group='G10 bond futures (price, not a rate)', side='JP', phase=2),
    _r('CGB', 'CGB', 'CDE', 'CAD', roll='fnd2', cal='CA', name_style='c2', ltd_rule='cgb', label='Canada 10y (CGB)', group='G10 bond futures (price, not a rate)', side='CA', phase=2),
    _r('CRA', 'CRA', 'CDE', 'CAD', cal='CA', name_style='c2', trading_class='CRA', ltd_rule='sofr', label='CORRA 3M', group='G10 short-rate strips (100 - rate)', side='CA', phase=2,
       **{**_STRIP, 'pull': 3}),      # BAX no longer lists (probe 2026-11-27: 0 contracts); the 3M CORRA future replaced it
    _r('YT', 'YT', 'SNFE', 'AUD', roll='asx3', cal='AU', ltd_rule='asx_bond', label='Australia 3y bond', group='G10 bond futures (price, not a rate)', side='AU', phase=2),
    _r('XT', 'XT', 'SNFE', 'AUD', roll='asx3', cal='AU', ltd_rule='asx_bond', label='Australia 10y bond', group='G10 bond futures (price, not a rate)', side='AU', phase=2),
    _r('IR', 'IR', 'SNFE', 'AUD', cal='AU', trading_class='IR', ltd_rule='asx_bill', label='Australia 90-day bank bills', group='G10 short-rate strips (100 - rate)', side='AU', phase=2,
       **{**_STRIP, 'pull': 3}),
    _r('CONF', 'CONF', 'EUREX', 'CHF', prefix='CONF', **{**_EUX, 'group': 'G10 bond futures (price, not a rate)', 'side': 'CH'}, label='Swiss Conf (long-term)', phase=2),
    _r('SO3', 'SONIA.N', 'ICEEU', 'GBP', trading_class='SO3', cal='UK', ltd_rule='sofr', label='SONIA 3M', group='G10 short-rate strips (100 - rate)', side='UK', phase=2,
       **{**_STRIP, 'pull': 3}),
    _r('6A', 'AUD', 'CME', 'USD', label='Australian dollar', phase=2, **_FX),
    _r('6C', 'CAD', 'CME', 'USD', label='Canadian dollar', phase=2, **_FX),
    _r('6S', 'CHF', 'CME', 'USD', label='Swiss franc', phase=2, **_FX),
    _r('6N', 'NZD', 'CME', 'USD', label='New Zealand dollar', phase=2, **_FX),
]}

# Every name refresh_leg_bars.IB_SPEC carried before the registry (2026-11-27), as (root, contract month). They keep resolving:
# the pull scripts accept them, and build_leg_bars writes aliases.json so the server draws a ROLLED root's old name
# (ZNZ6, FGBL2612, NQZ6 ...) as its continuous front (ZN1, GBL1, NQ1 ...) once that contract has rolled.
LEGACY = {
    'SR3U6': ('SR3', '202609'), 'SR3Z6': ('SR3', '202612'), 'SR3H7': ('SR3', '202703'), 'IH7': ('I', '202703'), 'IZ6': ('I', '202612'),
    'ER3Z6': ('ER3', '202612'), 'ER3H7': ('ER3', '202703'), 'SR3M7': ('SR3', '202706'), 'SR3U7': ('SR3', '202709'), 'IM7': ('I', '202706'), 'IU7': ('I', '202709'),
    'ER3U6': ('ER3', '202609'), 'ER3M7': ('ER3', '202706'), 'ER3U7': ('ER3', '202709'),
    'ZQV6': ('ZQ', '202610'), 'ZQX6': ('ZQ', '202611'), 'ZQZ6': ('ZQ', '202612'), 'ZQF7': ('ZQ', '202701'), 'ZQH7': ('ZQ', '202703'),
    'ZTZ6': ('ZT', '202612'), 'ZFZ6': ('ZF', '202612'), 'ZNZ6': ('ZN', '202612'), 'ZBZ6': ('ZB', '202612'), 'UBZ6': ('UB', '202612'),
    'FGBS2612': ('GBS', '202612'), 'FGBM2612': ('GBM', '202612'), 'FGBL2612': ('GBL', '202612'), 'FGBX2612': ('GBX', '202612'),
    'FBTP2612': ('BTP', '202612'), 'FOAT2612': ('OAT', '202612'), 'DXZ6': ('DX', '202612'), 'VXX6': ('VX', '202611'), 'VXZ6': ('VX', '202612'),
    'VVIX': ('VVIX', 'IND'), 'VIX': ('VIX', 'IND'), 'VXN': ('VXN', 'IND'), 'NQZ6': ('NQ', '202612'),
    '6EZ6': ('6E', '202612'), '6BZ6': ('6B', '202612'), '6JZ6': ('6J', '202612'), 'GCZ6': ('GC', '202612'), 'ESZ6': ('ES', '202612'),
}
# the groups refresh_leg_bars pulled by default before the registry (kept for --names and for pull_deep_history)
CORE = ['SR3U6', 'SR3Z6', 'SR3H7', 'IH7', 'IZ6', 'ER3Z6', 'ER3H7', 'IM7']
BONDS = ['ZTZ6', 'ZFZ6', 'ZNZ6', 'ZBZ6', 'UBZ6', 'FGBS2612', 'FGBM2612', 'FGBL2612', 'FGBX2612']
FEDFUNDS = ['ZQX6', 'ZQZ6', 'ZQF7', 'ZQH7']
MACRO = ['FBTP2612', 'FOAT2612', 'DXZ6', 'VXX6', 'VXZ6', 'VVIX', 'VIX', 'VXN', 'NQZ6', '6EZ6', '6BZ6', '6JZ6', 'GCZ6', 'ESZ6']


# ---------------------------------------------------------------- calendars

def _easter(y):
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mo = (h + l - 7 * m + 114) // 31
    return dt.date(y, mo, (h + l - 7 * m + 114) % 31 + 1)


def _nth_weekday(y, m, wd, n):
    """n-th (1-based) weekday wd (Mon=0) of the month; n = -1 is the last one."""
    days = [d for d in calendar.Calendar().itermonthdates(y, m) if d.month == m and d.weekday() == wd]
    return days[n - 1] if n > 0 else days[n]


def _observed(d):
    """US rule: a Saturday holiday is observed on Friday, a Sunday one on Monday."""
    return d - dt.timedelta(days=1) if d.weekday() == 5 else d + dt.timedelta(days=1) if d.weekday() == 6 else d


def _next_weekday(d):
    while d.weekday() >= 5:
        d += dt.timedelta(days=1)
    return d


def _holidays(cal, y):
    E = _easter(y)
    gf, em = E - dt.timedelta(days=2), E + dt.timedelta(days=1)
    if cal == 'US':
        return {_observed(dt.date(y, 1, 1)), _nth_weekday(y, 1, 0, 3), _nth_weekday(y, 2, 0, 3), gf, _nth_weekday(y, 5, 0, -1), _observed(dt.date(y, 6, 19)),
                _observed(dt.date(y, 7, 4)), _nth_weekday(y, 9, 0, 1), _nth_weekday(y, 11, 3, 4), _observed(dt.date(y, 12, 25))}
    if cal == 'EU':      # Eurex trading calendar: TARGET days plus 24 and 31 December
        return {dt.date(y, 1, 1), gf, em, dt.date(y, 5, 1), dt.date(y, 12, 24), dt.date(y, 12, 25), dt.date(y, 12, 26), dt.date(y, 12, 31)}
    if cal == 'UK':
        return {_next_weekday(dt.date(y, 1, 1)), gf, em, _nth_weekday(y, 5, 0, 1), _nth_weekday(y, 5, 0, -1), _nth_weekday(y, 8, 0, -1),
                *_xmas_boxing(y)}
    if cal == 'CA':
        return {_next_weekday(dt.date(y, 1, 1)), gf, _victoria(y), _next_weekday(dt.date(y, 7, 1)), _nth_weekday(y, 9, 0, 1),
                _nth_weekday(y, 10, 0, 2), *_xmas_boxing(y)}
    if cal == 'AU':
        return {_next_weekday(dt.date(y, 1, 1)), _next_weekday(dt.date(y, 1, 26)), gf, em, dt.date(y, 4, 25), _nth_weekday(y, 6, 0, 2), *_xmas_boxing(y)}
    if cal == 'JP':      # main fixed holidays only (see the module docstring)
        return {dt.date(y, 1, 1), dt.date(y, 1, 2), dt.date(y, 1, 3), dt.date(y, 12, 31), dt.date(y, 2, 11), dt.date(y, 2, 23), dt.date(y, 4, 29), dt.date(y, 5, 3), dt.date(y, 5, 4),
                dt.date(y, 5, 5), dt.date(y, 8, 11), dt.date(y, 11, 3), dt.date(y, 11, 23)}
    return set()


def _victoria(y):
    """Canada: the Monday before 25 May."""
    d = dt.date(y, 5, 24)
    while d.weekday() != 0:
        d -= dt.timedelta(days=1)
    return d


def _xmas_boxing(y):
    """25 and 26 December, moved to the next weekdays when they fall on a weekend (UK / Canada / Australia practice)."""
    c, b = dt.date(y, 12, 25), dt.date(y, 12, 26)
    if c.weekday() == 5:
        return {dt.date(y, 12, 27), dt.date(y, 12, 28)}
    if c.weekday() == 6:
        return {dt.date(y, 12, 26), dt.date(y, 12, 27)}
    if b.weekday() == 5:
        return {c, dt.date(y, 12, 28)}
    return {c, b}


_HCACHE = {}


def is_bday(d, cal='US'):
    if d.weekday() >= 5:
        return False
    k = (cal, d.year)
    if k not in _HCACHE:
        _HCACHE[k] = _holidays(cal, d.year)
    return d not in _HCACHE[k]


def add_bdays(d, n, cal='US'):
    """Move n business days (negative = back). n = 0 returns d unchanged."""
    step = 1 if n > 0 else -1
    while n:
        d += dt.timedelta(days=step)
        if is_bday(d, cal):
            n -= step
    return d


def bdays_between(a, b, cal='US'):
    """Business days from a to b: the number of business days in (a, b]; negative when b is before a."""
    if b < a:
        return -bdays_between(b, a, cal)
    n, d = 0, a
    while d < b:
        d += dt.timedelta(days=1)
        if is_bday(d, cal):
            n += 1
    return n


def last_bday(y, m, cal='US'):
    d = dt.date(y, m, calendar.monthrange(y, m)[1])
    while not is_bday(d, cal):
        d -= dt.timedelta(days=1)
    return d


def first_bday(y, m, cal='US'):
    d = dt.date(y, m, 1)
    while not is_bday(d, cal):
        d += dt.timedelta(days=1)
    return d


def third_weekday(y, m, wd):
    return _nth_weekday(y, m, wd, 3)


def _add_months(y, m, k):
    m2 = m - 1 + k
    return y + m2 // 12, m2 % 12 + 1


# ---------------------------------------------------------------- per-contract dates

def first_notice(root, y, m):
    """First notice day. US Treasuries and COMEX gold: the last business day of the month before the contract month.
    CGB (Montreal): 3 business days before the first business day of the contract month."""
    r = ROOTS[root] if isinstance(root, str) else root
    py, pm = _add_months(y, m, -1)
    if r.ltd_rule == 'cgb':
        return add_bdays(first_bday(y, m, r.cal), -3, r.cal)
    return last_bday(py, pm, r.cal)


def last_trade(root, y, m):
    """Rule-based last trading day (the fallback when IBKR does not list the contract any more)."""
    r = ROOTS[root] if isinstance(root, str) else root
    c, rule = r.cal, r.ltd_rule
    if rule == 'ust':
        lb = last_bday(y, m, c)
        return lb if r.key in ('ZT', 'ZF') else add_bdays(lb, -7, c)
    if rule == 'gold':
        return add_bdays(last_bday(y, m, c), -2, c)
    if rule == 'eurex':      # delivery day = the 10th (or the next exchange day); last trade 2 exchange days before it
        d = dt.date(y, m, 10)
        while not is_bday(d, c):
            d += dt.timedelta(days=1)
        return add_bdays(d, -2, c)
    if rule == 'jgb':        # delivery day = the 20th (or the next business day); last trade 5 business days before it
        d = dt.date(y, m, 20)
        while not is_bday(d, c):
            d += dt.timedelta(days=1)
        return add_bdays(d, -5, c)
    if rule == 'cgb':
        return add_bdays(last_bday(y, m, c), -7, c)
    if rule == 'asx_bond':
        d = dt.date(y, m, 15)
        while not is_bday(d, c):
            d += dt.timedelta(days=1)
        return d
    if rule == 'asx_bill':   # the business day before the 2nd Friday
        return add_bdays(_nth_weekday(y, m, 4, 2), -1, c)
    if rule == 'dx':
        return add_bdays(third_weekday(y, m, 2), -2, c)
    if rule == 'vix':        # the Wednesday 30 days before the next month's 3rd Friday
        ny, nm = _add_months(y, m, 1)
        return third_weekday(ny, nm, 4) - dt.timedelta(days=30)
    if rule == 'equity':     # the 3rd Friday, or the business day before it when that is a holiday (Juneteenth 2027)
        d = third_weekday(y, m, 4)
        while not is_bday(d, c):
            d -= dt.timedelta(days=1)
        return d
    if rule == 'fx':         # 2 business days before the 3rd Wednesday (CAD: 1)
        return add_bdays(third_weekday(y, m, 2), -1 if r.key == '6C' else -2, c)
    if rule == 'sofr':       # 3-month compounded strips (SOFR, ESTR, SONIA, CORRA): the business day before the 3rd Wednesday after the reference quarter
        ey, em = _add_months(y, m, 3)
        return add_bdays(third_weekday(ey, em, 2), -1, c)
    if rule == 'euribor':    # 2 TARGET days before the 3rd Wednesday of the contract month
        return add_bdays(third_weekday(y, m, 2), -2, c)
    if rule == 'month_end':
        return last_bday(y, m, c)
    raise ValueError(f'{r.key}: no last-trade rule')


def roll_date(root, y, m, ltd=None):
    """The date the continuous series moves OFF contract (y, m) onto the next one (the switch is at 00:00 UTC that day).
    ltd = IBKR's last trading day for the contract when known (a date); otherwise the rule-based one is used."""
    r = ROOTS[root] if isinstance(root, str) else root
    c = r.cal
    if r.roll in ('strip', 'expiry'):
        return ltd or last_trade(r, y, m)
    if r.roll == 'fnd2':
        return add_bdays(first_notice(r, y, m), -2, c)
    if r.roll == 'ltd3':
        return add_bdays(ltd or last_trade(r, y, m), -3, c)
    if r.roll == 'ltd5':
        return add_bdays(ltd or last_trade(r, y, m), -5, c)
    if r.roll == 'dx5':
        return add_bdays(ltd or last_trade(r, y, m), -5, c)
    if r.roll == 'asx3':
        d = dt.date(y, m, 15) - dt.timedelta(days=3)
        while not is_bday(d, c):
            d -= dt.timedelta(days=1)
        return d
    if r.roll == 'thu8':
        return third_weekday(y, m, 4) - dt.timedelta(days=8)
    if r.roll == 'none':
        return None
    raise ValueError(f'{r.key}: unknown roll rule {r.roll}')


# ---------------------------------------------------------------- names and file stems

def _y1(d, ref_year):
    """A one-digit year near ref_year (ref-4 .. ref+5)."""
    y = ref_year - ref_year % 10 + int(d)
    if y < ref_year - 4:
        y += 10
    elif y > ref_year + 5:
        y -= 10
    return y


def contract_name(root, y, m):
    """The chart / IB_SPEC name of a contract: ZNZ6, SR3U6, IZ6, FGBL2612, FBTP2612, CGBZ26, JGBZ6, 6EZ6 ..."""
    r = ROOTS[root] if isinstance(root, str) else root
    if r.kind == 'index':
        return r.key
    if r.name_style == 'yymm':
        return f'{r.prefix}{y % 100:02d}{m:02d}'
    if r.name_style == 'c2':
        return f'{r.prefix}{CODES[m - 1]}{y % 100:02d}'
    return f'{r.prefix}{CODES[m - 1]}{y % 10}'


def stem_for(root, y, m, ltd=None):
    """The parquet stem the contract is stored under. Reproduces every stem on disk before the registry:
    CBOT_ZNZ6, CME_SR3U6, ICEEU_IH7, NYBOT_DXZ6, CFE_VXZ6, CME_6EZ6, COMEX_GCZ6, CBOE_VIX, EUREX_FBTP2612 and
    EUREX_FGBL_20261208_M (IBKR's Eurex local symbol 'FGBL 20261208 M' with the spaces made underscores)."""
    r = ROOTS[root] if isinstance(root, str) else root
    if r.stem_style == 'eurex':
        d = ltd or last_trade(r, y, m)
        return f'{r.tag}_{r.prefix}_{d:%Y%m%d}_M'
    return f'{r.tag}_{contract_name(r, y, m)}'


def parse_name(name, ref_year=None):
    """name (ZNZ6, FGBL2612, CGBZ26, VIX ...) -> (root key, year, month) or None. Indices return (key, None, None)."""
    ref_year = ref_year or dt.date.today().year
    if name in ROOTS and ROOTS[name].kind == 'index':
        return name, None, None
    for r in sorted(ROOTS.values(), key=lambda x: -len(x.prefix)):      # longest prefix first: SR3 before ... , FGBL before FGB
        if r.kind == 'index' or not name.startswith(r.prefix):
            continue
        rest = name[len(r.prefix):]
        if r.name_style == 'yymm':
            mm = re.fullmatch(r'(\d{2})(\d{2})', rest)
            if mm and 1 <= int(mm.group(2)) <= 12:
                return r.key, 2000 + int(mm.group(1)), int(mm.group(2))
        elif r.name_style == 'c2':
            mm = re.fullmatch(r'([FGHJKMNQUVXZ])(\d{2})', rest)
            if mm:
                return r.key, 2000 + int(mm.group(2)), MONTH[mm.group(1)]
        else:
            mm = re.fullmatch(r'([FGHJKMNQUVXZ])(\d)', rest)
            if mm:
                return r.key, _y1(mm.group(2), ref_year), MONTH[mm.group(1)]
    return None


def parse_stem(stem, ref_year=None):
    """stem -> (root key, year, month) or None. Indices return (key, None, None)."""
    m = re.fullmatch(r'([A-Z.]+)_(.+)', stem)
    if not m:
        return None
    tag, rest = m.groups()
    me = re.fullmatch(r'([A-Z0-9]+)_(\d{8})_M', rest)
    if me:
        for r in ROOTS.values():
            if r.stem_style == 'eurex' and r.prefix == me.group(1) and r.tag == tag:
                d = me.group(2)
                return r.key, int(d[:4]), int(d[4:6])
        return None
    p = parse_name(rest, ref_year)
    if p and ROOTS[p[0]].tag == tag and ROOTS[p[0]].stem_style == 'name':
        return p
    return None


def describe_stem(stem, ref_year=None):
    """A build_leg_bars.describe() tuple (name, label, group, side, kind, period) for any registry stem, or None."""
    p = parse_stem(stem, ref_year)
    if not p:
        return None
    key, y, m = p
    r = ROOTS[key]
    if r.kind == 'index':
        return r.key, r.label, r.group, r.side, 'price', 'index level (RTH trades)'
    name = contract_name(r, y, m)
    tag = f'{calendar.month_abbr[m]}{y % 100:02d}'
    period = 'rate strip: 100 - rate' if r.chart_kind == 'rate' else 'future: price only'
    return name, f'{r.label} future {tag} ({r.exchange} {name})', r.group, r.side, r.chart_kind, period


def alias(name, ref_year=None):
    """An old IB_SPEC / chart name -> dict(root, year, month, continuous) or None. continuous is ROOT1 for a rolled root
    (the series the old name is drawn as once its contract has rolled), None for strips (a strip contract is itself) and indices."""
    p = (LEGACY[name][0], *(_ym(LEGACY[name][1]))) if name in LEGACY else parse_name(name, ref_year)
    if not p:
        return None
    key, y, m = p
    r = ROOTS[key]
    return dict(root=key, year=y, month=m, continuous=f'{key}1' if r.rolled else None)


def _ym(s):
    return (None, None) if s == 'IND' else (int(s[:4]), int(s[4:6]))


def legacy_spec(name):
    """IB_SPEC-style tuple (symbol, exchange, currency, contract month | 'IND') for a name, from the registry."""
    a = alias(name)
    if not a:
        raise KeyError(name)
    r = ROOTS[a['root']]
    return (r.symbol, r.exchange, r.currency, 'IND' if r.kind == 'index' else f'{a["year"]}{a["month"]:02d}')


def ib_spec(names=None):
    """The IB_SPEC dict refresh_leg_bars and pull_deep_history import, built from the registry. With no names: every LEGACY name."""
    return {n: legacy_spec(n) for n in (names or LEGACY)}


# ---------------------------------------------------------------- live selection

def _ltd_date(s):
    return dt.datetime.strptime(str(s).split(' ')[0][:8], '%Y%m%d').date()


def detail_row(d):
    """ib_insync ContractDetails -> the plain dict the pure functions use."""
    c = d.contract
    return dict(local=c.localSymbol, tc=c.tradingClass, ltd=c.lastTradeDateOrContractMonth.split(' ')[0], month=(d.contractMonth or c.lastTradeDateOrContractMonth)[:6],
                conId=c.conId, multiplier=c.multiplier, exchange=c.exchange, real=getattr(d, 'realExpirationDate', ''))


def select_live(root, rows, today, depth=None):
    """From a contract-details list (dicts with local, tc, ltd 'YYYYMMDD[ ...]', month 'YYYYMM'), the live contracts of the
    root in expiry order: wrong trading class, off-cycle months and expired contracts (last trade before today) dropped,
    first `depth` kept (the root's depth by default). Each returned dict gains y, m, ltd_date, name, stem, roll."""
    r = ROOTS[root] if isinstance(root, str) else root
    out = []
    for x in rows:
        if r.trading_class and x.get('tc') and x['tc'] != r.trading_class:
            continue
        y, m = int(x['month'][:4]), int(x['month'][4:6])
        if r.cycle and CODES[m - 1] not in r.cycle:
            continue
        ltd = _ltd_date(x['ltd'])
        if ltd < today:
            continue
        out.append(dict(x, y=y, m=m, ltd_date=ltd, name=contract_name(r, y, m), stem=stem_for(r, y, m, ltd), roll=roll_date(r, y, m, ltd)))
    out.sort(key=lambda z: (z['ltd_date'], z['y'], z['m']))
    seen, uniq = set(), []
    for z in out:                       # one per contract month (IBKR can list a contract twice across exchanges)
        if (z['y'], z['m']) not in seen:
            seen.add((z['y'], z['m'])); uniq.append(z)
    return uniq[:depth or r.depth]


def active_index(root, live, today):
    """Index into `live` (select_live output) of the contract the continuous ROOT1 is on today: for a rolled root the first
    one whose roll date is after today; for a strip the first one (rank 1 = the nearest still trading)."""
    r = ROOTS[root] if isinstance(root, str) else root
    if not r.rolled:
        return 0 if live else None
    for i, z in enumerate(live):
        if z['roll'] > today:
            return i
    return None


def pull_set(root, live, today, full=False, window=ROLL_WINDOW_BD):
    """The contracts the 30-minute job pulls. Strips and indices: the first `pull` live ones (`depth` with full=True).
    Rolled roots: the active contract (the one the continuous front is on) plus the next one when the active contract is within
    `window` business days of its roll. An old front that has rolled but still trades (ZNZ6 from 25 Nov to 21 Dec) is not pulled:
    the continuous series has left it and IBKR's request budget is shared (60 per 10 minutes). full=True: the first `depth` live ones."""
    r = ROOTS[root] if isinstance(root, str) else root
    if not r.rolled:
        return live[:r.depth if full else r.pull]
    if full:
        return live[:r.depth]
    i = active_index(r, live, today)
    if i is None:
        return live[:1]
    keep = [live[i]]
    if i + 1 < len(live) and bdays_between(today, live[i]['roll'], r.cal) <= window:
        keep.append(live[i + 1])
    return keep


def job_roots(tier='all', minute=None):
    """Roots the 30-minute job pulls: 'core' = the ones pulled before 2026-11-27, 'g10' = the phase-2 additions, 'all' = both,
    'auto' = core on every run and the G10 roots on the run in the first half of each hour (the 30-minute job then pulls them hourly,
    the plan's fallback when they would make one run too long; no scheduled-task change needed)."""
    if tier == 'auto':
        tier = 'all' if minute is not None and minute < 30 else 'core'
    return [k for k, r in ROOTS.items() if tier == 'all' or (tier == 'core' and r.phase == 1) or (tier == 'g10' and r.phase == 2)]


def ib_contract(root, month=None, include_expired=False):
    """ib_insync Future (or Index) for a root: no month = every listed expiry (for select_live)."""
    from ib_insync import Future, Index
    r = ROOTS[root] if isinstance(root, str) else root
    if r.kind == 'index':
        return Index(symbol=r.symbol, exchange=r.exchange, currency=r.currency)
    kw = dict(symbol=r.symbol, exchange=r.exchange, currency=r.currency, tradingClass=r.trading_class)
    if month:
        kw['lastTradeDateOrContractMonth'] = month
    if include_expired:
        kw['includeExpired'] = True
    return Future(**kw)
