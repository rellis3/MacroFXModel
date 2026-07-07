"""
Confluence Bot Journal — event log + trade CSV + console output.

Cloned from GoldV2's journal (keyed by trade_id, MFE/MAE on close, SL/TP basis
and skip reasons logged, BE_STOP a distinct outcome). Generalised for the
multi-instrument Confluence bot:

  * one journal per symbol — file names carry the instrument tag so a fleet of
    pairs doesn't interleave into one file
  * pip-normalised P&L (raw price deltas ÷ pip) so "pips" means the same thing
    on EUR/USD, gold and an index instead of a raw price delta
  * price formatting honours the instrument's digit precision

Files (in log_dir), <tag> = lowercased instrument key (e.g. 'eurusd', 'gold'):
  confluence_<tag>_journal.jsonl  — one JSON object per line, every event type
  confluence_<tag>_trades.csv     — one row per completed trade
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


def _now() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


class ConfluenceJournal:
    def __init__(self, log_dir: str = '.', symbol: str = '',
                 pip: float = 1.0, digits: int = 2):
        os.makedirs(log_dir, exist_ok=True)
        self.log_dir    = log_dir
        self.symbol     = symbol
        self.pip        = pip if pip and pip > 0 else 1.0
        self.digits     = digits
        tag             = (symbol or 'confluence').lower().replace('/', '')
        self.jsonl_path = os.path.join(log_dir, f'confluence_{tag}_journal.jsonl')
        self.csv_path   = os.path.join(log_dir, f'confluence_{tag}_trades.csv')
        self._ensure_csv()

        self.zones_detected = 0
        self.zones_hit      = 0
        self.trades: list[dict] = []
        self.session_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    def _pf(self, x: float) -> str:
        return f'{x:.{self.digits}f}'

    # ── Zone map snapshot ─────────────────────────────────────────────────────

    def log_zone_map(self, zones: list, htf: Any, vol: Any, sess: Any,
                     debug: Optional[dict] = None) -> None:
        active = [z for z in zones if z.active]
        self.zones_detected = max(self.zones_detected, len(active))

        ev = {
            'type': 'ZONE_MAP', 'timestamp': _now(), 'symbol': self.symbol,
            'htf_bias': htf.bias, 'htf_conf': htf.confidence,
            'session': sess.current_session,
            'daily_open': sess.daily_open, 'vwap': sess.vwap,
            'poc': vol.poc, 'vah': vol.vah, 'val': vol.val,
            'matrix': debug or {},
            'zones': [_zone_dict(z) for z in active[:10]],
        }
        self._write(ev)
        self._print_zone_map(active, htf, vol, sess)

    # ── Zone interactions ─────────────────────────────────────────────────────

    def log_zone_approached(self, zone: Any, price: float, dist_pips: float) -> None:
        self.zones_hit += 1
        self._write({
            'type': 'ZONE_APPROACHED', 'timestamp': _now(), 'symbol': self.symbol,
            'zone_id': zone.zone_id, 'tf': zone.tf, 'direction': zone.direction,
            'score': zone.score, 'gp_low': zone.gp_low, 'gp_high': zone.gp_high,
            'in_gp': zone.in_gp, 'distinct_legs': zone.distinct_legs,
            'price': price, 'dist_pips': round(dist_pips, 1),
        })
        log.info(f'[ARMED]  {self.symbol} {zone.zone_id} score={zone.score:.1f} '
                 f'legs={zone.distinct_legs}  price={self._pf(price)}  '
                 f'({dist_pips:.1f}p from window {self._pf(zone.gp_low)}–{self._pf(zone.gp_high)})')

    def log_skip(self, zone_id: str, stage: str, reason: str) -> None:
        """A setup that confirmed but was skipped (gate / risk box / no room)."""
        self._write({'type': 'ENTRY_SKIPPED', 'timestamp': _now(), 'symbol': self.symbol,
                     'zone_id': zone_id, 'stage': stage, 'reason': reason})
        log.info(f'[SKIP]   {self.symbol} {zone_id}  [{stage}]  {reason}')

    def log_vu_watch(self, zone_id: str, snap: dict) -> None:
        """Armed-zone confirmation state changed — record why it can('t) enter."""
        self._write({'type': 'VU_WATCH', 'timestamp': _now(), 'symbol': self.symbol,
                     'zone_id': zone_id, **snap})
        vwap = snap['vwap'] + (f'/{snap["vwap_div"]}' if snap.get('vwap_div') not in (None, 'NONE') else '')
        log.info(f'[WATCH]  {self.symbol} {zone_id} — {snap["verdict"]}  '
                 f'(WT {snap["wt1"]} {snap["wt"]} · MF {snap["mf"]} {snap["mf_sig"]} '
                 f'· VWAP {vwap})')

    # ── Trade lifecycle ───────────────────────────────────────────────────────

    def log_entry(self, trade: Any, zone: Any, vu: Any, plan: Any) -> None:
        sl_pips  = round(abs(trade.entry_price - trade.sl)  / self.pip, 1)
        tp1_pips = round(abs(trade.tp1 - trade.entry_price) / self.pip, 1)
        tp2_pips = round(abs(trade.tp2 - trade.entry_price) / self.pip, 1)

        ev = {
            'type': 'ENTRY_SIGNAL', 'timestamp': _now(), 'mode': trade.mode,
            'symbol': self.symbol, 'trade_id': trade.trade_id,
            'zone_id': trade.zone_id, 'tf': zone.tf, 'score': zone.score,
            'in_gp': zone.in_gp, 'distinct_legs': zone.distinct_legs,
            'composition': getattr(zone, 'composition', []),
            'direction': trade.direction, 'entry_price': trade.entry_price,
            'sl': trade.sl, 'tp1': trade.tp1, 'tp2': trade.tp2,
            'sl_pips': sl_pips, 'tp1_pips': tp1_pips, 'tp2_pips': tp2_pips,
            'rr': round(tp2_pips / sl_pips, 2) if sl_pips > 0 else 0,
            'sl_basis': plan.sl_basis, 'tp1_basis': plan.tp1_basis,
            'tp2_basis': plan.tp2_basis,
            'lot_size': trade.lot_size, 'risk_pct': trade.risk_pct,
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

        arr = '▲' if trade.direction == 'LONG' else '▼'
        log.info(
            f'[ENTRY]  {self.symbol} {arr} {trade.direction} @ {self._pf(trade.entry_price)}  '
            f'SL {self._pf(trade.sl)} (−{sl_pips}p, {plan.sl_basis})  '
            f'TP1 {self._pf(trade.tp1)} ({plan.tp1_basis})  '
            f'TP2 {self._pf(trade.tp2)} ({plan.tp2_basis})  '
            f'R:R 1:{ev["rr"]}  VuManChu {vu.components_aligned}/3 [{vu.confidence}]'
        )

    def log_tp1_hit(self, trade: Any, price: float) -> None:
        pips = self._pips(trade.trade_id, price)
        self._write({'type': 'TP1_HIT', 'timestamp': _now(), 'symbol': self.symbol,
                     'trade_id': trade.trade_id, 'zone_id': trade.zone_id,
                     'price': price, 'pnl_pips': pips})
        log.info(f'[TP1]    {self.symbol} {trade.trade_id} @ {self._pf(price)}  '
                 f'+{pips:.1f}p — SL → breakeven')

    def log_trade_closed(self, trade: Any, price: float, reason: str) -> None:
        pips   = self._pips(trade.trade_id, price)
        if reason == 'BE_STOP':
            result = 'BREAKEVEN'
        elif reason == 'EXPIRED':
            result = 'EXPIRED'
        else:
            result = 'WIN' if pips > 0 else ('LOSS' if pips < 0 else 'BREAKEVEN')

        self._write({'type': 'TRADE_CLOSED', 'timestamp': _now(), 'symbol': self.symbol,
                     'trade_id': trade.trade_id, 'zone_id': trade.zone_id,
                     'reason': reason, 'price': price, 'pnl_pips': pips,
                     'result': result,
                     'mfe_pips': trade.mfe_pips, 'mae_pips': trade.mae_pips})
        self._patch(trade.trade_id, result, price, pips)
        self._csv_row(trade, reason, price, pips, result)

        icon = '✓' if result == 'WIN' else ('✗' if result == 'LOSS' else '~')
        log.info(f'[CLOSE]  {self.symbol} {icon} {trade.trade_id}  {reason}  {pips:+.1f}p  '
                 f'MFE +{trade.mfe_pips:.1f} MAE −{trade.mae_pips:.1f}  → {result}')

    # ── Session summary ───────────────────────────────────────────────────────

    def print_summary(self) -> None:
        wins   = [t for t in self.trades if t.get('result') == 'WIN']
        losses = [t for t in self.trades if t.get('result') == 'LOSS']
        net    = sum(t.get('pnl_pips', 0) for t in self.trades)
        wr     = len(wins) / len(self.trades) * 100 if self.trades else 0

        log.info(_SEP2)
        log.info(f'CONFLUENCE {self.symbol} — SESSION SUMMARY  {self.session_date}')
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
            'type': 'SESSION_SUMMARY', 'timestamp': _now(), 'symbol': self.symbol,
            'date': self.session_date, 'zones_detected': self.zones_detected,
            'zones_hit': self.zones_hit, 'trades': len(self.trades),
            'wins': len(wins), 'losses': len(losses),
            'net_pips': round(net, 1), 'win_rate_pct': round(wr, 1),
        })

    # ── Internal helpers ──────────────────────────────────────────────────────

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
                    'date', 'time', 'symbol', 'trade_id', 'zone_id', 'tf', 'direction', 'score',
                    'in_gp', 'legs', 'entry', 'sl', 'tp1', 'tp2',
                    'sl_pips', 'sl_basis', 'tp2_basis', 'rr',
                    'close_reason', 'close_price', 'pnl_pips', 'mfe_pips', 'mae_pips',
                    'result', 'vu_components', 'vu_confidence', 'composition',
                ])
        except Exception:
            pass

    def _csv_row(self, trade: Any, reason: str, price: float,
                 pips: float, result: str) -> None:
        t = next((x for x in self.trades if x.get('trade_id') == trade.trade_id), None)
        if not t:
            return
        try:
            ts = t['timestamp']
            vu = t.get('vumanchu', {})
            comp = '; '.join(str(c) for c in t.get('composition', []))
            with open(self.csv_path, 'a', newline='', encoding='utf-8') as f:
                csv.writer(f).writerow([
                    ts[:10], ts[11:19], self.symbol, trade.trade_id, t.get('zone_id', ''),
                    t.get('tf', ''), t.get('direction', ''), t.get('score', 0),
                    t.get('in_gp', False), t.get('distinct_legs', 0),
                    t.get('entry_price', 0), t.get('sl', 0),
                    t.get('tp1', 0), t.get('tp2', 0),
                    t.get('sl_pips', 0), t.get('sl_basis', ''),
                    t.get('tp2_basis', ''), t.get('rr', 0),
                    reason, price, round(pips, 1),
                    trade.mfe_pips, trade.mae_pips, result,
                    vu.get('components', 0), vu.get('confidence', ''), comp,
                ])
        except Exception as exc:
            log.debug(f'CSV row error: {exc}')

    def _pips(self, trade_id: str, price: float) -> float:
        t = next((x for x in self.trades if x.get('trade_id') == trade_id), None)
        if not t:
            return 0.0
        entry = t.get('entry_price', price)
        sign  = 1 if t.get('direction') == 'LONG' else -1
        return round((price - entry) * sign / self.pip, 1)

    def _patch(self, trade_id: str, result: str, price: float, pips: float) -> None:
        for t in self.trades:
            if t.get('trade_id') == trade_id:
                t['result'] = result; t['pnl_pips'] = pips; break

    def _print_zone_map(self, zones: list, htf: Any, vol: Any, sess: Any) -> None:
        log.info(_SEP)
        log.info(
            f'ZONE MAP  {self.symbol}  {datetime.now(timezone.utc).strftime("%H:%M UTC")}  '
            f'| HTF {htf.bias} ({htf.confidence:.0%}) [{htf.daily_trend}/{htf.h4_trend}]  '
            f'| {sess.current_session}  | VWAP {self._pf(sess.vwap)}'
        )
        log.info(f'  Vol: POC {self._pf(vol.poc)}  VAH {self._pf(vol.vah)}  VAL {self._pf(vol.val)}')
        if zones:
            log.info(f'  {"SCORE":>5}  {"DIR":5}  {"LEGS":>4}  {"GP":>2}  WINDOW             COMPOSITION')
            for z in zones[:8]:
                comp = ', '.join(getattr(z, 'composition', [])[:4])
                gp   = '◆' if z.in_gp else ' '
                log.info(f'  {z.score:5.1f}  {z.direction.upper():5}  {z.distinct_legs:>4}  {gp:>2}  '
                         f'{self._pf(z.gp_low)}–{self._pf(z.gp_high)}  {comp}')
        else:
            log.info('  No active zones')
        log.info(_SEP)


def _zone_dict(z: Any) -> dict:
    return {
        'zone_id': z.zone_id, 'tf': z.tf, 'direction': z.direction,
        'gp_low': z.gp_low, 'gp_high': z.gp_high, 'score': z.score,
        'in_gp': z.in_gp, 'distinct_legs': z.distinct_legs,
        'htf_aligned': z.htf_aligned, 'composition': getattr(z, 'composition', []),
    }
