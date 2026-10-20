"""Local stub for rendering cog-chart.html without the logged-in server: static files from the repo + the three /api/cog-chart routes (legs from the real compact files, candles synthesised on the legs' own time grid)."""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
CC = ROOT / 'analysis' / 'output' / 'cog_chart'
ASSETS = [('NAS100', 'Indices'), ('EURUSD', 'FX majors'), ('GOLD', 'Gold')]
TF = {'5m': 300, '15m': 900, '1h': 3600, '4h': 14400}


def candles(asset, tf, count):
    base = json.loads((CC / 'leg_SR3U6.json').read_text())
    end = base['m15']['t'][-1]
    step = TF[tf]
    rng = np.random.default_rng(abs(hash(asset)) % 1000)
    ts = [end - step * i for i in range(count)][::-1]
    px = 20000 + np.cumsum(rng.normal(0, 8, count)) * (step / 900) ** 0.5
    out = []
    for i, t in enumerate(ts):
        o = px[i - 1] if i else px[0]
        c = px[i]
        out.append(dict(t=t, o=round(float(o), 2), h=round(float(max(o, c) + 5), 2), l=round(float(min(o, c) - 5), 2), c=round(float(c), 2)))
    return out


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, body, ctype='application/json'):
        b = body if isinstance(body, bytes) else body.encode()
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        try:
            self.wfile.write(b)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == '/api/cog-chart/meta':
            self.send(json.dumps(dict(ok=True, assets=[dict(key=k, oanda=k, group=g) for k, g in ASSETS], timeframes=list(TF), legs=json.loads((CC / 'legs_meta.json').read_text()))))
        elif u.path == '/api/cog-chart/candles':
            a, tf, n = q.get('asset', ['NAS100'])[0], q.get('tf', ['15m'])[0], int(q.get('count', ['1500'])[0])
            self.send(json.dumps(dict(ok=True, asset=a, tf=tf, instrument=a, asOf='2026-10-09T21:00:00Z', candles=candles(a, tf, n))))
        elif u.path == '/api/cog-chart/leg':
            j = json.loads((CC / f'leg_{q["name"][0]}.json').read_text())
            self.send(json.dumps(dict(ok=True, name=j['name'], label=j['label'], group=j['group'], side=j['side'], kind=j['kind'], period=j['period'], source=j['source'], convention=j['convention'], first=j['first'], staticAsOf=j['asOf'], liveAsOf=None, m5=j['m5'], m15=j['m15'])))
        else:
            p = ROOT / u.path.lstrip('/')
            if p.is_file():
                self.send(p.read_bytes(), 'text/html' if p.suffix == '.html' else 'application/javascript' if p.suffix == '.js' else 'application/octet-stream')
            else:
                self.send_response(404)
                self.end_headers()


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8765), H).serve_forever()
