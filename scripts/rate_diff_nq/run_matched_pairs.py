"""Orchestrator for COG-MATCHED-PAIRS: audit -> T1/T2/decomposition -> T3/T4/T5 per eligible candidate (parallel) -> report.
    python scripts/rate_diff_nq/run_matched_pairs.py [--workers 6] [--skip-audit] [--only P2,P3,...]
Eligibility is the registered rule (COG_MATCHED_PAIRS_ADDENDUM_A.md section 4): at least 60 in-sample days with the series and Nasdaq. No rule here depends on a result."""
import argparse, os, subprocess, sys, time
from pathlib import Path
import pandas as pd
ROOT = Path(__file__).resolve().parents[2]; S = ROOT / 'scripts' / 'rate_diff_nq'; OUTD = ROOT / 'analysis' / 'output' / 'cog_video_0918'; LOGD = ROOT / 'scratchpad'
ap = argparse.ArgumentParser(); ap.add_argument('--workers', type=int, default=6); ap.add_argument('--skip-audit', action='store_true'); ap.add_argument('--only', default=''); A = ap.parse_args()
CANDS = {'P0': ('CME_SR3U6', 'ICEEU_IH7', 'spread'), 'P1': ('CME_SR3H7', 'ICEEU_IH7', 'spread'), 'P2': ('CME_SR3Z6', 'ICEEU_IZ6', 'spread'), 'P3': ('CME_SR3Z6', 'ICEEU_ER3Z6', 'spread'), 'P4': ('CME_SR3H7', 'ICEEU_ER3H7', 'spread'),
         'L-US': ('CME_SR3Z6', '', 'us'), 'L-EU-Euribor': ('', 'ICEEU_IZ6', 'eu'), 'L-EU-ESTR': ('', 'ICEEU_ER3Z6', 'eu')}
def run(cmd, log, env=None):
    e = dict(os.environ); e.update(env or {}); return subprocess.Popen([sys.executable] + cmd, cwd=ROOT, env=e, stdout=open(log, 'w'), stderr=subprocess.STDOUT)
if not A.skip_audit:
    for sc in ('cog_matched_pairs_audit.py', 'cog_matched_pairs_t12.py'):
        print('running', sc, flush=True); subprocess.run([sys.executable, str(S / sc)], cwd=ROOT, check=True, stdout=open(LOGD / f'mp_{sc}.log', 'w'), stderr=subprocess.STDOUT)
smp = pd.read_csv(OUTD / 'matched_pairs_audit_samples.csv'); elig = {}
for r in smp.itertuples():
    is_days = getattr(r, 'IS_days', float('nan')); elig[r.candidate] = bool(is_days == is_days and float(is_days) >= 60)       # registered rule only: at least 60 in-sample days
print('eligible (IS, VAL and OOS each >= 60 days):', elig, flush=True)
only = [x for x in A.only.split(',') if x]; tasks = []
for k, (us, eu, mode) in CANDS.items():
    if only and k not in only: continue
    if not elig.get(k, False): continue
    env = dict(COG_US=us or 'CME_SR3U6', COG_EU=eu or 'ICEEU_IH7', COG_MODE=mode, COG_TAG='_' + k.replace('-', '_'))
    if mode == 'spread' and k != 'P0':
        tasks += [([str(S / 'cog_turn_events.py'), '--placebo', '200', '--own-only'], env, f'mp_{k}_T3.log'), ([str(S / 'cog_sequence_events.py'), '--placebo', '200', '--sel-placebo', '0'], env, f'mp_{k}_T4.log')]
    tasks += [([str(S / 'cog_shape_agnostic.py'), '--placebo', '60'], env, f'mp_{k}_T5.log')]
running = []; t0 = time.time()
while tasks or running:
    running = [(p, n) for p, n in running if p.poll() is None]
    while tasks and len(running) < A.workers:
        cmd, env, log = tasks.pop(0); running.append((run(cmd, LOGD / log, env), log)); print(f'started {log}', flush=True)
    time.sleep(15)
print(f'all tasks finished in {(time.time() - t0) / 60:.0f} min', flush=True)
