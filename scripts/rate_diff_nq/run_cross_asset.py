"""Orchestrator for COG-CROSS-ASSET (forge/COG_CROSS_ASSET_PREREG.md): stage 1 (T1/T2 per asset), stage 2 (T3/T4/T5 per asset x line).
    python scripts/rate_diff_nq/run_cross_asset.py [--workers 8] [--stage1-only] [--skip-stage1]"""
import argparse, os, subprocess, sys, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]; S = ROOT / 'scripts' / 'rate_diff_nq'; LOGD = ROOT / 'scratchpad'
ap = argparse.ArgumentParser(); ap.add_argument('--workers', type=int, default=8); ap.add_argument('--stage1-only', action='store_true'); ap.add_argument('--skip-stage1', action='store_true'); A = ap.parse_args()
ASSETS = ['xauusd', 'eurusd', 'usdjpy', 'us2000', 'us30', 'spx500', 'de30']
LINES = {'P0': ('CME_SR3U6', 'ICEEU_IH7', 'spread'), 'P3': ('CME_SR3Z6', 'ICEEU_ER3Z6', 'spread'), 'L-US': ('CME_SR3Z6', 'ICEEU_IH7', 'us')}


def popen(cmd, log, env):
    e = dict(os.environ)
    e.update(env)
    return subprocess.Popen([sys.executable] + cmd, cwd=ROOT, env=e, stdout=open(LOGD / log, 'w'), stderr=subprocess.STDOUT)


def drain(tasks, workers):
    running = []
    while tasks or running:
        running = [(p, n) for p, n in running if p.poll() is None]
        while tasks and len(running) < workers:
            cmd, env, log = tasks.pop(0)
            running.append((popen(cmd, log, env), log))
            print('started', log, flush=True)
        time.sleep(10)


t0 = time.time()
if not A.skip_stage1:
    drain([([str(S / 'cog_matched_pairs_t12.py')], dict(COG_ASSET=a, COG_TAG=f'_A_{a}'), f'ca_{a}_t12.log') for a in ASSETS], A.workers)
    print(f'stage 1 done in {(time.time() - t0) / 60:.1f} min', flush=True)
if not A.stage1_only:
    tasks = []
    for kind in ('T5', 'T4', 'T3'):                                   # longest first
        for a in ASSETS:
            for ln, (us, eu, mode) in LINES.items():
                env = dict(COG_ASSET=a, COG_US=us, COG_EU=eu, COG_MODE=mode, COG_TAG=f'_A_{a}_{ln.replace("-", "_")}')
                cmd = {'T5': [str(S / 'cog_shape_agnostic.py'), '--placebo', '30'],
                       'T4': [str(S / 'cog_sequence_events.py'), '--placebo', '100', '--sel-placebo', '0'],
                       'T3': [str(S / 'cog_turn_events.py'), '--placebo', '100', '--own-only']}[kind]
                tasks.append((cmd, env, f'ca_{a}_{ln}_{kind}.log'))
    drain(tasks, A.workers)
    print(f'stage 2 done in {(time.time() - t0) / 60:.1f} min', flush=True)
