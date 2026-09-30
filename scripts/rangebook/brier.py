"""Shared scoring for the range/sequence books: cell frequencies with back-off, and a
Brier skill score with a day-bootstrap interval (forge/RANGE_BOOK_EURUSD_PREREG.md)."""
import collections, random

MIN_N = 50


def fit(train, extras):
    """train rows: (day, base_key tuple, {extra: value}, y). Back-off: full key -> base -> shorter."""
    cnt = collections.defaultdict(lambda: [0, 0])
    for _, base, ex, y in train:
        full = base + tuple(ex[e] for e in extras)
        for i in range(len(full) + 1):
            c = cnt[full[:i]]; c[0] += y; c[1] += 1
    def pred(base, ex):
        full = base + tuple(ex[e] for e in extras)
        for i in range(len(full), -1, -1):
            h, n = cnt[full[:i]]
            if n >= MIN_N: return (h + 1) / (n + 2)
        h, n = cnt[()]
        return (h + 1) / (n + 2)
    return pred, cnt


def per_day_se(test, pred):
    se = collections.defaultdict(float)
    for d, base, ex, y in test:
        se[d] += (pred(base, ex) - y) ** 2
    return se


def bss(test, pred_m, pred_b, boots=1000, seed=7):
    a, b = per_day_se(test, pred_m), per_day_se(test, pred_b)
    days = sorted(b)
    A, B = [a[d] for d in days], [b[d] for d in days]
    point = 1 - sum(A) / sum(B)
    rnd = random.Random(seed); n = len(days); vals = []
    for _ in range(boots):
        idx = [rnd.randrange(n) for _ in range(n)]
        sb = sum(B[i] for i in idx)
        vals.append(1 - sum(A[i] for i in idx) / sb if sb else 0)
    vals.sort()
    return point, vals[int(0.025 * boots)], vals[int(0.975 * boots) - 1]
