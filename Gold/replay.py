"""
Gold Bot — Trade Replay Analyser

Reads gold_journal.jsonl and reconstructs session-by-session performance
from the logged events. No MT5 connection required — works purely from
the journal file that the bot writes during live observation.

What it analyses:
  Zone hit rate:  what fraction of logged zones were price-approached
  Entry rate:     what fraction of approached zones fired an entry signal
  Win rate:       what fraction of entries won (TP2 hit)
  RR:             average R-multiple per closed trade
  By-TF split:    which timeframes produce the most reliable zones
  Composition:    which level combinations win most often

Usage (run from project root):
  python Gold/replay.py
  python Gold/replay.py --journal Gold/logs/gold_journal.jsonl
  python Gold/replay.py --journal Gold/logs/gold_journal.jsonl --date 2026-05-24
  python Gold/replay.py --csv-out Gold/logs/replay.csv

Output:
  Console: per-session and overall summary tables
  CSV:     one row per session-day with zone / trade statistics
"""

from __future__ import annotations
import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


# ── Data structures ───────────────────────────────────────────────────────────

@dataclass
class ZoneRecord:
    zone_id: str
    tf: str
    direction: str
    score: float
    gp_low: float
    gp_high: float
    composition: list
    appeared_at: str         # ISO timestamp of the ZONE_MAP event
    approached: bool = False
    approach_price: Optional[float] = None
    entered: bool = False
    entry_price: Optional[float] = None
    entry_direction: Optional[str] = None
    vu_components: int = 0
    vu_confidence: str = ''
    sl: Optional[float] = None
    tp1: Optional[float] = None
    tp2: Optional[float] = None
    tp1_hit: bool = False
    tp2_hit: bool = False
    sl_hit: bool = False
    close_price: Optional[float] = None
    invalidated: bool = False

    @property
    def closed(self) -> bool:
        return self.tp2_hit or self.sl_hit

    @property
    def result(self) -> str:
        if self.tp2_hit:
            return 'WIN'
        if self.tp1_hit and not self.sl_hit:
            return 'TP1_ONLY'
        if self.sl_hit:
            return 'LOSS'
        if self.entered:
            return 'OPEN'
        return '-'

    @property
    def pnl_r(self) -> float:
        if not self.entered or self.entry_price is None or self.sl is None:
            return 0.0
        sl_dist = abs(self.entry_price - self.sl)
        if sl_dist == 0:
            return 0.0
        if self.tp2_hit and self.close_price:
            return abs(self.close_price - self.entry_price) / sl_dist
        if self.sl_hit and self.close_price:
            return -abs(self.close_price - self.entry_price) / sl_dist
        return 0.0


@dataclass
class SessionDay:
    date: str
    zones: dict = field(default_factory=dict)   # zone_id → ZoneRecord
    zone_map_count: int = 0     # number of ZONE_MAP refreshes


# ── Journal reader ────────────────────────────────────────────────────────────

def _read_journal(path: str) -> list[dict]:
    events: list[dict] = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return events


def _event_date(event: dict) -> str:
    ts = event.get('timestamp', '')
    if ts:
        try:
            return ts[:10]
        except Exception:
            pass
    return 'unknown'


def _build_sessions(events: list[dict]) -> dict[str, SessionDay]:
    sessions: dict[str, SessionDay] = {}

    for ev in events:
        date  = _event_date(ev)
        etype = ev.get('event', ev.get('type', ''))

        if date not in sessions:
            sessions[date] = SessionDay(date=date)
        sess = sessions[date]

        if etype == 'ZONE_MAP':
            sess.zone_map_count += 1
            for z in ev.get('zones', []):
                zid = z.get('zone_id', '')
                if not zid or zid in sess.zones:
                    continue
                sess.zones[zid] = ZoneRecord(
                    zone_id     = zid,
                    tf          = z.get('tf', '?'),
                    direction   = z.get('direction', '?'),
                    score       = z.get('score', 0.0),
                    gp_low      = z.get('gp_low', 0.0),
                    gp_high     = z.get('gp_high', 0.0),
                    composition = z.get('composition', []),
                    appeared_at = ev.get('timestamp', ''),
                )

        elif etype == 'ZONE_APPROACHED':
            zid = ev.get('zone_id', '')
            if zid in sess.zones:
                sess.zones[zid].approached    = True
                sess.zones[zid].approach_price = ev.get('price')

        elif etype == 'ENTRY_SIGNAL':
            zid = ev.get('zone_id', '')
            if zid in sess.zones:
                z = sess.zones[zid]
                z.entered         = True
                z.entry_price     = ev.get('entry_price') or ev.get('price')
                z.entry_direction = ev.get('direction')
                z.sl              = ev.get('sl')
                z.tp1             = ev.get('tp1')
                z.tp2             = ev.get('tp2')
                vu = ev.get('vumanchu', {})
                z.vu_components   = vu.get('components_aligned', ev.get('vu_components', 0))
                z.vu_confidence   = vu.get('confidence', ev.get('vu_confidence', ''))

        elif etype == 'TP1_HIT':
            zid = ev.get('zone_id', '')
            if zid in sess.zones:
                sess.zones[zid].tp1_hit = True

        elif etype == 'TRADE_CLOSED':
            zid    = ev.get('zone_id', '')
            reason = ev.get('reason') or ev.get('result', '')
            if zid in sess.zones:
                if reason == 'TP2_HIT':
                    sess.zones[zid].tp2_hit     = True
                    sess.zones[zid].close_price = ev.get('price')
                elif reason == 'SL_HIT':
                    sess.zones[zid].sl_hit      = True
                    sess.zones[zid].close_price = ev.get('price')
                # EXPIRED / breakeven / other: leave win/loss flags unset

        elif etype == 'ZONE_INVALIDATED':
            zid = ev.get('zone_id', '')
            if zid in sess.zones:
                sess.zones[zid].invalidated = True

    return sessions


# ── Analysis ──────────────────────────────────────────────────────────────────

def _safe_pct(num: int, denom: int) -> str:
    return f'{num / denom * 100:.0f}%' if denom else 'n/a'


def _analyse(sessions: dict[str, SessionDay], filter_date: Optional[str] = None):
    if filter_date:
        sessions = {k: v for k, v in sessions.items() if k == filter_date}

    # Aggregate stats
    total_zones = total_approached = total_entered = 0
    total_wins = total_tp1 = total_losses = 0
    pnl_rs: list[float] = []
    tf_stats: dict[str, dict] = defaultdict(lambda: {'z': 0, 'a': 0, 'e': 0, 'w': 0, 'l': 0})
    comp_wins: dict[str, int] = defaultdict(int)
    comp_total: dict[str, int] = defaultdict(int)

    session_rows: list[dict] = []

    for date in sorted(sessions.keys()):
        sess = sessions[date]
        zones = list(sess.zones.values())

        n_zones     = len(zones)
        n_approached= sum(1 for z in zones if z.approached)
        n_entered   = sum(1 for z in zones if z.entered)
        n_wins      = sum(1 for z in zones if z.tp2_hit)
        n_tp1       = sum(1 for z in zones if z.tp1_hit and not z.tp2_hit)
        n_losses    = sum(1 for z in zones if z.sl_hit)
        day_pnl     = [z.pnl_r for z in zones if z.closed]
        net_r       = round(sum(day_pnl), 2) if day_pnl else 0.0

        session_rows.append({
            'date':       date,
            'zone_maps':  sess.zone_map_count,
            'zones':      n_zones,
            'approached': n_approached,
            'entered':    n_entered,
            'wins':       n_wins,
            'tp1_only':   n_tp1,
            'losses':     n_losses,
            'hit_rate':   _safe_pct(n_approached, n_zones),
            'entry_rate': _safe_pct(n_entered, n_approached),
            'win_rate':   _safe_pct(n_wins, n_entered),
            'net_r':      net_r,
        })

        total_zones      += n_zones
        total_approached += n_approached
        total_entered    += n_entered
        total_wins       += n_wins
        total_tp1        += n_tp1
        total_losses     += n_losses
        pnl_rs.extend(day_pnl)

        for z in zones:
            tf_stats[z.tf]['z'] += 1
            if z.approached: tf_stats[z.tf]['a'] += 1
            if z.entered:    tf_stats[z.tf]['e'] += 1
            if z.tp2_hit:    tf_stats[z.tf]['w'] += 1
            if z.sl_hit:     tf_stats[z.tf]['l'] += 1

            for comp_item in z.composition:
                comp_total[comp_item] += 1
                if z.tp2_hit:
                    comp_wins[comp_item] += 1

    return session_rows, tf_stats, comp_wins, comp_total, pnl_rs, {
        'zones': total_zones, 'approached': total_approached,
        'entered': total_entered, 'wins': total_wins,
        'tp1': total_tp1, 'losses': total_losses,
    }


# ── Console output ────────────────────────────────────────────────────────────

def _print_report(session_rows, tf_stats, comp_wins, comp_total, pnl_rs, totals):
    sep = '─' * 90

    print(f'\n{sep}')
    print('GOLD BOT — REPLAY ANALYSIS')
    print(sep)

    # Per-session table
    hdr = f'{"DATE":<12} {"ZONES":>6} {"HIT":>6} {"ENTRY":>7} {"W":>4} {"TP1":>5} {"L":>4} {"HIT%":>6} {"ENTR%":>7} {"WIN%":>6} {"NET-R":>7}'
    print(hdr)
    print('─' * 90)
    for r in session_rows:
        print(
            f'{r["date"]:<12} {r["zones"]:>6} {r["approached"]:>6} {r["entered"]:>7} '
            f'{r["wins"]:>4} {r["tp1_only"]:>5} {r["losses"]:>4} '
            f'{r["hit_rate"]:>6} {r["entry_rate"]:>7} {r["win_rate"]:>6} '
            f'{r["net_r"]:>+7.2f}R'
        )

    # Totals
    print('─' * 90)
    t = totals
    net_r = round(sum(pnl_rs), 2)
    avg_r = round(sum(pnl_rs) / len(pnl_rs), 2) if pnl_rs else 0.0
    print(
        f'{"TOTAL":<12} {t["zones"]:>6} {t["approached"]:>6} {t["entered"]:>7} '
        f'{t["wins"]:>4} {t["tp1"]:>5} {t["losses"]:>4} '
        f'{_safe_pct(t["approached"], t["zones"]):>6} '
        f'{_safe_pct(t["entered"], t["approached"]):>7} '
        f'{_safe_pct(t["wins"], t["entered"]):>6} '
        f'{net_r:>+7.2f}R'
    )
    print(f'\n  Avg R per trade: {avg_r:+.2f}R   '
          f'Trades closed: {len(pnl_rs)}')

    # By-TF split
    print(f'\n{sep}')
    print('BY TIMEFRAME')
    print(f'  {"TF":<6} {"ZONES":>6} {"HIT":>6} {"ENTRY":>7} {"WINS":>6} {"LOSS":>6} {"WIN%":>7}')
    for tf in ['D1', 'H4', 'H1', 'M30', 'M15']:
        s = tf_stats.get(tf)
        if not s or s['z'] == 0:
            continue
        print(f'  {tf:<6} {s["z"]:>6} {s["a"]:>6} {s["e"]:>7} '
              f'{s["w"]:>6} {s["l"]:>6} {_safe_pct(s["w"], s["e"]):>7}')

    # Composition win rates (top 10 by frequency)
    print(f'\n{sep}')
    print('COMPOSITION CONFLUENCE — win rate per level type (min 3 appearances)')
    ranked = sorted(
        [(k, comp_wins[k], comp_total[k]) for k in comp_total if comp_total[k] >= 3],
        key=lambda x: -x[1] / x[2],
    )
    for label, wins, total in ranked[:12]:
        print(f'  {label:<45}  {wins:>3}/{total:<3}  {_safe_pct(wins, total):>6}')

    print(f'\n{sep}\n')


# ── CSV export ────────────────────────────────────────────────────────────────

def _write_csv(path: str, session_rows: list[dict]) -> None:
    if not session_rows:
        return
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(session_rows[0].keys()))
        w.writeheader()
        w.writerows(session_rows)
    print(f'CSV written → {path}')


# ── Entry point ───────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description='Gold Bot trade replay analyser')
    p.add_argument('--journal', default='gold_journal.jsonl',
                   help='Path to gold_journal.jsonl (default: ./gold_journal.jsonl)')
    p.add_argument('--date', default=None,
                   help='Filter to a single date YYYY-MM-DD')
    p.add_argument('--csv-out', default=None,
                   help='Optional path to write per-session CSV summary')
    return p.parse_args()


if __name__ == '__main__':
    args = _parse_args()

    if not os.path.exists(args.journal):
        print(f'Journal not found: {args.journal}')
        sys.exit(1)

    events   = _read_journal(args.journal)
    sessions = _build_sessions(events)

    if not sessions:
        print('No sessions found in journal.')
        sys.exit(0)

    session_rows, tf_stats, comp_wins, comp_total, pnl_rs, totals = _analyse(
        sessions, filter_date=args.date
    )

    _print_report(session_rows, tf_stats, comp_wins, comp_total, pnl_rs, totals)

    if args.csv_out:
        _write_csv(args.csv_out, session_rows)
