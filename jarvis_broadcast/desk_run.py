"""Start the day's DESK RUN automatically once the morning OI pull has finished (owner, 25 Nov 2026: "automate yes, on DeepSeek").

The desk run is the site's 11-analyst AI desk (POST /api/desk-run, about 6 minutes, server side, on DeepSeek, about $0.25-0.30 a run).
Until now the owner started it by hand at about 06:50, after the OI scrape (oi_recon/run_daily.bat, 06:25 -> about 06:45).

Task Scheduler runs this on weekdays at 06:30 ("Jarvis Desk Run"):
  1. wait until today's OI log (oi_recon/logs/daily_YYYY-MM-DD.log) says "finished with exit code" (checked every 30 s, until 07:20 at the latest)
  2. open the desk site in the signed-in recorder profile and POST /api/desk-run once
  3. close the browser straight away (the 07:00 broadcast needs the same profile); the run itself carries on on the server

PAID: ONE attempt a day, never retried. A failure is logged (out/desk_run.log) and the 07:00 broadcast falls back to Bias Engine V2.
A run already done today (by hand or otherwise) is not started again.
"""
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import record_broadcast as rb  # noqa: E402

OI_LOGS = Path(os.environ.get('OI_LOGS', r'C:\Users\relli\OneDrive\Documents\Programming\Trading\v2 trading model\MacroFXModel\oi_recon\logs'))
LOG = rb.OUT / 'desk_run.log'
LATEST = (7, 20)              # start anyway at 07:20 London if the OI log never says it finished


def log(msg: str) -> None:
    line = f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  {msg}"
    print(line, flush=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open('a', encoding='utf-8') as f:
        f.write(line + '\n')


def oi_finished(today: str):
    p = OI_LOGS / f'daily_{today}.log'
    if not p.exists():
        return None
    for line in reversed(p.read_text(encoding='utf-8', errors='replace').splitlines()):
        if 'finished with exit code' in line:
            return line.strip()
    return None


def main() -> int:
    today = datetime.now().strftime('%Y-%m-%d')
    log(f'waiting for the OI pull ({OI_LOGS / f"daily_{today}.log"})')
    while True:
        done = oi_finished(today)
        if done:
            log(f'OI pull: {done}')
            break
        now = datetime.now()
        if (now.hour, now.minute) >= LATEST:
            log('OI pull has not reported finishing by 07:20: starting the desk run anyway')
            break
        time.sleep(30)
    from playwright.sync_api import sync_playwright
    try:
        with sync_playwright() as pw:
            ctx = rb.launch(pw, False)
            page = ctx.new_page()
            page.goto(rb.BASE + '/desk-terminal.html', wait_until='domcontentloaded', timeout=90_000)
            r = page.evaluate("""async () => {
                const st = await fetch('/api/desk-run?summary=1').then(r => r.json()).catch(() => null);
                const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
                if (st && st.ok && st.date === today) return { skipped: true, why: 'a desk run for today already exists' };
                const job = await fetch('/api/desk-run/status').then(r => r.json()).catch(() => null);
                if (job && job.job && job.job.status === 'running') return { skipped: true, why: 'a desk run is already running' };
                const res = await fetch('/api/desk-run', { method: 'POST' });
                return { status: res.status, body: (await res.text()).slice(0, 400) };
            }""")
            ctx.close()
    except Exception as e:                    # paid: one attempt only
        log(f'FAILED to start the desk run (not retried): {e}')
        return 1
    if r.get('skipped'):
        log(f"not started: {r['why']}")
        return 0
    ok = r.get('status') == 202
    log(f"{'started' if ok else 'FAILED (not retried)'}: HTTP {r.get('status')} {r.get('body')}")
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
