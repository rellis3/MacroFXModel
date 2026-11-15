#!/usr/bin/env python3
"""slow-bias-clock: apply prereg amendment A2 (POST-HOC, demote-only) to analysis/output/slow-bias-clock/results.json.

A2: a cell whose evidence-pack positive control (planted bar-sized drift, calibration refitted on the planted rows)
is detected < 80% at 1x the bar cannot claim NULL; NULL -> UNDERPOWERED. Never promotes. Ledger-id words recomputed.
Keeps the run's own word as `verdict_run`. Idempotent.

    python -X utf8 -I scripts/slow-bias-clock/finalize.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'analysis' / 'output' / 'slow-bias-clock'


def id_word(words):
    if 'VALIDATED' in words:
        return 'VALIDATED'
    if 'CONTEXT' in words:
        return 'CONTEXT'
    if all(w == 'NULL' for w in words):
        return 'NULL'
    return 'UNDERPOWERED'


def main():
    p = OUT / 'results.json'
    r = json.load(open(p))
    for c in r['cells']:
        c.setdefault('verdict_run', c['verdict'])
        pc = (c.get('pack') or {}).get('positive_control') or []
        one = next((x for x in pc if x['multiple_of_bar'] == 1.0), None)
        c['plant_1x_detected'] = one['detected_share'] if one else None
        if c['verdict_run'] == 'NULL' and one is not None and one['detected_share'] < 0.8:
            c['verdict'] = 'UNDERPOWERED'
            c['amendment'] = 'A2: pack positive control found the planted bar in < 80% of plants; NULL demoted'
        else:
            c['verdict'] = c['verdict_run']
        # stamp the pack
        ev = Path(OUT.parents[2]) / (c.get('pack') or {}).get('dir', '') / 'evidence.json'
        if ev.exists():
            j = json.load(open(ev))
            j['verdict_word'] = c['verdict']
            json.dump(j, open(ev, 'w'), indent=1, default=float)
            try:
                import sys
                sys.path.insert(0, str(OUT.parents[2] / 'scripts' / 'evidence_pack'))
                from pack import _markdown
                _markdown(j, str(ev.parent))
            except Exception as ex:  # markdown is cosmetic
                print('markdown not refreshed', ev, ex)
    r['ids'] = {lid: id_word([c['verdict'] for c in r['cells'] if c['ledger'] == lid])
                for lid in ('slow-bias-clock-dir', 'slow-bias-clock-r', 'slow-bias-clock-book')}
    r['preregCommit'] = '7809659e'
    r['amendments'] = ['A1 pack wiring fix (pre-pack-read)', 'A2 demote NULL when the pack plant fails (post-hoc, demote only)']
    json.dump(r, open(p, 'w'), indent=1, default=float)
    for c in r['cells']:
        print(c['name'], c['verdict_run'], '->', c['verdict'], 'plant1x', c['plant_1x_detected'])
    print(r['ids'])


if __name__ == '__main__':
    main()
