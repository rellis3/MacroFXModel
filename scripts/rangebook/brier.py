"""Shared scoring for the range/sequence books: cell frequencies with back-off, and a
Brier skill score with a day-bootstrap interval (forge/RANGE_BOOK_EURUSD_PREREG.md)."""
import collections, random

MIN_N = 50


def counts(train, extras=()):
    """Cell counts for every key prefix. train rows: (day, base_key tuple, {extra: value}, y)."""
    cnt = collections.defaultdict(lambda: [0, 0])
    for _, base, ex, y in train:
        full = base + tuple(ex[e] for e in extras)
        for i in range(len(full) + 1):
            c = cnt[full[:i]]; c[0] += y; c[1] += 1
    return cnt


def add_counts(*cnts):
    """Sum several count tables (e.g. to pool instruments)."""
    out = collections.defaultdict(lambda: [0, 0])
    for c in cnts:
        for k, (h, n) in c.items():
            o = out[k]; o[0] += h; o[1] += n
    return out


def predictor(cnt, extras=()):
    """Back-off: full key -> base key -> shorter, first cell with n >= MIN_N; Laplace smoothing."""
    def pred(base, ex):
        full = base + tuple(ex[e] for e in extras)
        for i in range(len(full), -1, -1):
            h, n = cnt[full[:i]] if full[:i] in cnt else (0, 0)
            if n >= MIN_N: return (h + 1) / (n + 2)
        h, n = cnt[()]
        return (h + 1) / (n + 2)
    return pred


def fit(train, extras):
    cnt = counts(train, extras)
    return predictor(cnt, extras), cnt


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
