"""
Gold Bot Journal — full event log + trade CSV + formatted console output.

Two output files (written into log_dir):
  gold_journal.jsonl  — one JSON object per line, every event type
  gold_trades.csv     — one row per completed trade, importable into spreadsheet

Event types logged:
  ZONE_MAP         full zone snapshot on each state refresh
  ZONE_APPROACHED  price entered proximity of a zone
  ENTRY_SIGNAL     VuManChu confirmed → paper trade opened
  TP1_HIT          first partial target reached
  TP2_HIT          final target reached
  SL_HIT           stop loss hit
  TRADE_EXPIRED    session closed with trade still open
  ZONE_INVALIDATED zone expired (price closed beyond origin)
  SESSION_SUMMARY  end-of-session statistics
"""

from __future__ import annotations
import csv
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

log = logging.getLogger(__name__)

_SEP  = '─' * 70
_SEP2 = '═' * 70


class GoldJournal:
    def __init__(self, log_dir: str = '.'):
        os.makedirs(log_dir, exist_ok=True)
        self.log_dir    = log_dir
        self.jsonl_path = os.path.join(log_dir, 'gold_journal.jsonl')
        self.csv_path   = os.path.join(log_dir, 'gold_trades.csv')
        self._ensure_csv()

        self.zones_detected: int = 0
        self.zones_hit: int = 0
        self.trades: list[dict] = []
        self.session_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    # ── Zone map snapshot ──────────────────────────────────────────────────────

    def log_zone_map(self, zones: list, htf: Any, vol: Any, sess: Any) -> None:
        active = [z for z in zones if z.active]
        self.zones_detected = max(self.zones_detected, len(active))

        ev = {
            'type': 'ZONE_MAP', 'timestamp': _now(),
            'htf_bias': htf.bias, 'htf_conf': htf.confidence,
            'session': sess.current_session,
            'daily_open': sess.daily_open, 'vwap': sess.vwap,
            'poc': vol.poc, 'vah': vol.vah, 'val': vol.val, 'npoc': vol.npoc,
            'zones': [_zone_dict(z) for z in active[:8]],
        }
        self._write(ev)
        self._print_zone_map(active, htf, vol, sess)

    # ── Zone interactions ──────────────────────────────────────────────────────

    def log_zone_approached(self, zone: Any, price: float, dist_pips: float) -> None:
        self.zones_hit += 1
        ev = {
            'type': 'ZONE_APPROACHED', 'timestamp': _now(),
            'zone_id': zone.zone_id, 'tf': zone.tf, 'direction': zone.direction,
            'score': zone.score, 'gp_low': zone.gp_low, 'gp_high': zone.gp_high,
            'price': price, 'dist_pips': round(dist_pips, 1),
        }
        self._write(ev)
        log.info(f'[ARMED]  {zone.zone_id} score={zone.score:.1f}  '
                 f'price={price:.2f}  ({dist_pips:.1f} pips from GP '
                 f'{zone.gp_low:.1f}–{zone.gp_high:.1f})')

    def log_zone_invalidated(self, zone_id: str, price: float) -> None:
        self._write({'type': 'ZONE_INVALIDATED', 'timestamp': _now(),
                     'zone_id': zone_id, 'price': price})
        log.info(f'[INVALID] {zone_id} expired at {price:.2f}')

    # ── Trade lifecycle ────────────────────────────────────────────────────────

    def log_entry(self, zone: Any, direction: str, entry: float,
                  sl: float, tp1: float, tp2: float, vu: Any,
                  mode: str = 'PAPER') -> None:
        sl_pips  = round(abs(entry - sl),  1)
        tp1_pips = round(abs(tp1  - entry), 1)
        tp2_pips = round(abs(tp2  - entry), 1)

        ev = {
            'type': 'ENTRY_SIGNAL', 'timestamp': _now(), 'mode': mode,
            'zone_id': zone.zone_id, 'tf': zone.tf, 'score': zone.score,
            'composition': getattr(zone, 'composition', []),
            'direction': direction, 'entry_price': entry,
            'sl': sl, 'tp1': tp1, 'tp2': tp2,
            'sl_pips': sl_pips, 'tp1_pips': tp1_pips, 'tp2_pips': tp2_pips,
            'rr': round(tp2_pips / sl_pips, 2) if sl_pips > 0 else 0,
            'vumanchu': {
                'wt1': vu.wt1, 'wt2': vu.wt2,
                'wt_signal': vu.wt_signal, 'mf_value': vu.mf_value,
                'mf_signal': vu.mf_signal, 'vwap_signal': vu.vwap_signal,
                'vwap_divergence': vu.vwap_divergence,
                'components': vu.components_aligned, 'confidence': vu.confidence,
            },
        }
        self._write(ev)
        self.trades.append({**ev, 'result': None, 'pnl_pips': 0.0})

        arr = '▲' if direction == 'LONG' else '▼'
        log.info(
            f'[ENTRY]  {arr} {direction} @ {entry:.2f}  '
            f'SL {sl:.2f} (−{sl_pips}p)  TP1 {tp1:.2f} (+{tp1_pips}p)  '
            f'TP2 {tp2:.2f} (+{tp2_pips}p)  R:R 1:{ev["rr"]}  '
            f'VuManChu {vu.components_aligned}/3 [{vu.confidence}] {vu.reason}'
        )

    def log_tp1_hit(self, zone_id: str, price: float) -> None:
        pips = self._pips(zone_id, price)
        self._write({'type': 'TP1_HIT', 'timestamp': _now(),
                     'zone_id': zone_id, 'price': price, 'pnl_pips': pips})
        self._patch(zone_id, 'TP1_HIT', price, pips)
        log.info(f'[TP1]    {zone_id} @ {price:.2f}  +{pips:.1f} pips (partial close)')

    def log_trade_closed(self, zone_id: str, price: float, reason: str) -> None:
        pips   = self._pips(zone_id, price)
        result = 'WIN' if pips > 0 else ('LOSS' if pips < 0 else 'BREAKEVEN')
        if reason == 'EXPIRED':
            result = 'EXPIRED'

        self._write({'type': 'TRADE_CLOSED', 'timestamp': _now(),
                     'zone_id': zone_id, 'reason': reason,
                     'price': price, 'pnl_pips': pips, 'result': result})
        self._patch(zone_id, result, price, pips)
        self._csv_row(zone_id, reason, price, pips, result)

        icon = '✓' if result == 'WIN' else ('✗' if result == 'LOSS' else '~')
        log.info(f'[CLOSE]  {icon} {zone_id}  {reason}  {pips:+.1f} pips  → {result}')

    # ── Session summary ────────────────────────────────────────────────────────

    def print_summary(self) -> None:
        wins   = [t for t in self.trades if t.get('result') == 'WIN']
        losses = [t for t in self.trades if t.get('result') == 'LOSS']
        net    = sum(t.get('pnl_pips', 0) for t in self.trades)
        wr     = len(wins) / len(self.trades) * 100 if self.trades else 0

        log.info(_SEP2)
        log.info(f'GOLD BOT — SESSION SUMMARY  {self.session_date}')
        log.info(_SEP2)
        log.info(f'  Zones detected  : {self.zones_detected}')
        log.info(f'  Zones hit       : {self.zones_hit}')
        log.info(f'  Trades          : {len(self.trades)}')
        log.info(f'  Wins            : {len(wins)}')
        log.info(f'  Losses          : {len(losses)}')
        log.info(f'  Net pips        : {net:+.1f}')
        if self.trades:
            log.info(f'  Win rate        : {wr:.0f}%')
        log.info(_SEP2)

        self._write({
            'type': 'SESSION_SUMMARY', 'timestamp': _now(),
            'date': self.session_date, 'zones_detected': self.zones_detected,
            'zones_hit': self.zones_hit, 'trades': len(self.trades),
            'wins': len(wins), 'losses': len(losses),
            'net_pips': round(net, 1), 'win_rate_pct': round(wr, 1),
        })

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _write(self, ev: dict) -> None:
        try:
            with open(self.jsonl_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(ev) + '\n')
        except Exception as exc:
            log.debug(f'Journal write error: {exc}')

    def _ensure_csv(self) -> None:
        if os.path.exists(self.csv_path):
            return
        try:
            with open(self.csv_path, 'w', newline='', encoding='utf-8') as f:
                csv.writer(f).writerow([
                    'date', 'time', 'zone_id', 'tf', 'direction', 'score',
                    'entry', 'sl', 'tp1', 'tp2', 'sl_pips', 'tp1_pips', 'tp2_pips', 'rr',
                    'close_reason', 'close_price', 'pnl_pips', 'result',
                    'vu_components', 'vu_confidence', 'composition',
                ])
        except Exception:
            pass

    def _csv_row(self, zone_id: str, reason: str, price: float,
                 pips: float, result: str) -> None:
        t = next((x for x in self.trades if x.get('zone_id') == zone_id), None)
        if not t:
            return
        try:
            ts = t['timestamp']
            vu = t.get('vumanchu', {})
            comp = '; '.join(t.get('composition', []))
            with open(self.csv_path, 'a', newline='', encoding='utf-8') as f:
                csv.writer(f).writerow([
                    ts[:10], ts[11:19], zone_id, t.get('tf', ''),
                    t.get('direction', ''), t.get('score', 0),
                    t.get('entry_price', 0), t.get('sl', 0),
                    t.get('tp1', 0), t.get('tp2', 0),
                    t.get('sl_pips', 0), t.get('tp1_pips', 0),
                    t.get('tp2_pips', 0), t.get('rr', 0),
                    reason, price, round(pips, 1), result,
                    vu.get('components', 0), vu.get('confidence', ''), comp,
                ])
        except Exception as exc:
            log.debug(f'CSV row error: {exc}')

    def _pips(self, zone_id: str, price: float) -> float:
        t = next((x for x in self.trades if x.get('zone_id') == zone_id), None)
        if not t:
            return 0.0
        entry = t.get('entry_price', price)
        sign  = 1 if t.get('direction') == 'LONG' else -1
        return round((price - entry) * sign, 1)

    def _patch(self, zone_id: str, result: str, price: float, pips: float) -> None:
        for t in self.trades:
            if t.get('zone_id') == zone_id:
                t['result'] = result; t['pnl_pips'] = pips; break

    def _print_zone_map(self, zones: list, htf: Any, vol: Any, sess: Any) -> None:
        log.info(_SEP)
        log.info(
            f'ZONE MAP  {datetime.now(timezone.utc).strftime("%H:%M UTC")}  '
            f'| HTF {htf.bias} ({htf.confidence:.0%})  '
            f'| {sess.current_session}  '
            f'| VWAP {sess.vwap:.1f}'
        )
        npoc_str = f'  nPOC {vol.npoc:.1f}' if vol.npoc else ''
        log.info(f'  Vol: POC {vol.poc:.1f}  VAH {vol.vah:.1f}  VAL {vol.val:.1f}{npoc_str}')
        log.info(f'  Daily open {sess.daily_open:.1f}  '
                 f'Asia {sess.asia_low:.1f}–{sess.asia_high:.1f}  '
                 f'Pivot {sess.pivot:.1f}')
        if zones:
            log.info(f'  {"SCORE":>5}  {"TF":>3}  {"DIR":5}  GP ZONE            COMPOSITION')
            for z in zones[:6]:
                htf_mark = ' *' if z.htf_aligned else ''
                comp = ', '.join(getattr(z, 'composition', [])[:4])
                log.info(f'  {z.score:5.1f}  {z.tf:>3}  {z.direction.upper():5}  '
                         f'{z.gp_low:.1f}–{z.gp_high:.1f}  {comp}{htf_mark}')
        else:
            log.info('  No active zones')
        log.info(_SEP)


def _now() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def _zone_dict(z: Any) -> dict:
    return {
        'zone_id': z.zone_id, 'tf': z.tf, 'direction': z.direction,
        'gp_low': z.gp_low, 'gp_high': z.gp_high, 'score': z.score,
        'htf_aligned': z.htf_aligned, 'composition': getattr(z, 'composition', []),
    }
