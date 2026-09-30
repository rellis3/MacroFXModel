"""Freeze the Book C ("is the running extreme the day's?") table for Study 1 (forge/EXITS_PREREG.md).
Fitted ONLY on 2016-2022 rows of the 16 cross-pair instruments; written as prefix counts so the
JS exit simulator applies the same back-off (brier.MIN_N, Laplace) as the Python books.
    python scripts/rangebook/book_c_table.py
"""
import json
from brier import counts, MIN_N
from crosspair_buckets import ALL, USED, EXTD

TRAIN_END = '2023-01-01'
rows = []
for p in ALL:
    for r in json.load(open(f'analysis/output/rangebook/{p}.json'))['records']:
        if r['date'] >= TRAIN_END: continue
        for c in r['C']:
            rows.append((r['date'], (c['h'], USED(c['used']), EXTD(c['dist'])), {}, c['exceeded']))
cnt = counts(rows)
json.dump({'minN': MIN_N, 'trainEnd': TRAIN_END, 'usedEdges': [0.4, 0.7, 1.0], 'extEdges': [0.1, 0.3, 0.6],
           'counts': {'|'.join(map(str, k)): v for k, v in cnt.items()}},
          open('analysis/output/rangebook/bookC_table.json', 'w'))
print(f'Book C table: {len(rows):,} train rows, {len(cnt)} cells, last train date {max(r[0] for r in rows)}')
