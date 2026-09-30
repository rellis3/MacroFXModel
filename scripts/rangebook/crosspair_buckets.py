"""Instrument lists and bucket edges shared by the cross-pair scripts (one definition)."""
USD = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdcad', 'usdchf', 'nzdusd']
CROSS = ['eurgbp', 'eurjpy', 'gbpjpy', 'euraud', 'eurchf', 'audjpy', 'cadjpy', 'chfjpy']
ALL = USD + CROSS + ['gold']


def bk(v, edges, names):
    for e, n in zip(edges, names):
        if v < e: return n
    return names[-1]


DIST = lambda v: bk(v, (0.25, 0.5, 1.0), ('<0.25', '0.25-0.5', '0.5-1', '>1'))
USED = lambda v: bk(v, (0.4, 0.7, 1.0), ('<0.4', '0.4-0.7', '0.7-1', '>1'))
EXTD = lambda v: bk(v, (0.1, 0.3, 0.6), ('<0.1', '0.1-0.3', '0.3-0.6', '>0.6'))
