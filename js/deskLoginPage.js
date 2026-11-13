// js/deskLoginPage.js: the Desk Terminal's sign-in page (zone 'desk'). Pure: returns one self-contained HTML string, no fetches of its own.
// The form contract is the same as every other zone's page (server.js POST /login): JSON { zone:'desk', password, remember }, then a redirect to
// `next` on success, or back to /login?zone=desk&next=...&error=1. Only the look is new. The terminal's own world: deep navy, purple for what you
// press, gold for the wordmark, the pulsing dot, JetBrains Mono / Inter; a slow-drifting candle backdrop (one CSS transform, no per-frame script),
// the four session clocks, a rotating "what's inside" line. Reduced motion switches every animation off.
//   node --test js/deskLoginPage.test.mjs

// `next` goes into a <script>: JSON, with < > & and the JS line separators escaped so a crafted path can never close the script tag.
const jsString = v => JSON.stringify(String(v)).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function deskLoginPage(next = '/desk-terminal.html', error = false) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Sign in — Desk Terminal</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root{--bg:#070a17;--bg1:#0c1124;--bg2:#111833;--line:#1f2950;--line2:#2c3866;--tx:#eef0fb;--tx2:#a9b0d0;--tx3:#8a93b8;--pur:#8b7cf6;--pur2:#b4a9ff;--gold:#e8b85a;--dn:#ff6b84;--up:#2fd39a;
    --mono:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;--sans:Inter,ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif}
  *{box-sizing:border-box}
  html,body{margin:0;min-height:100%}
  body{font:14px/1.55 var(--sans);color:var(--tx);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;padding:28px 16px;overflow-x:hidden;position:relative;
    background:radial-gradient(1100px 560px at 82% -10%,rgba(139,124,246,.20),transparent 60%),radial-gradient(900px 520px at -12% 112%,rgba(232,184,90,.09),transparent 60%),var(--bg)}
  /* the backdrop: a faint candle chart drifting left, drawn once by the script below, moved by one CSS transform */
  .tape{position:fixed;left:0;right:0;bottom:0;height:58vh;pointer-events:none;overflow:hidden;opacity:.5;
    -webkit-mask-image:linear-gradient(180deg,transparent,#000 55%,#000);mask-image:linear-gradient(180deg,transparent,#000 55%,#000)}
  .tape svg{position:absolute;left:0;bottom:0;height:100%;width:200%;animation:drift 150s linear infinite}
  @keyframes drift{from{transform:translateX(0)}to{transform:translateX(-50%)}}
  .glow{position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 38%,rgba(139,124,246,.12),transparent 42%)}
  .wrap{position:relative;width:100%;max-width:420px;text-align:center}
  .tag{display:flex;align-items:center;justify-content:center;gap:12px;color:var(--gold);font:600 11px var(--mono);letter-spacing:.22em;margin-bottom:26px}
  .tag .ln{width:26px;height:1px;background:linear-gradient(90deg,transparent,var(--gold));opacity:.7}
  .tag .ln.r{background:linear-gradient(90deg,var(--gold),transparent)}
  .brand{display:flex;align-items:center;justify-content:center;gap:14px;font:700 27px var(--mono);letter-spacing:.14em;margin:0 0 6px}
  .brand i{width:13px;height:13px;border-radius:50%;background:var(--pur);box-shadow:0 0 18px var(--pur);animation:pulse 2.4s ease-in-out infinite;flex:none}
  .brand span{background:linear-gradient(90deg,var(--gold),#f3d89a 55%,var(--pur2));-webkit-background-clip:text;background-clip:text;color:transparent}
  .brand b{display:inline-block;width:.55em;height:.95em;margin-left:2px;background:var(--pur2);vertical-align:-.08em;animation:blink 1.1s steps(1) infinite}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.78)}}
  @keyframes blink{50%{opacity:0}}
  .says{margin:0 0 24px;font-size:15px;color:var(--tx2)}
  .says .inside{display:block;margin-top:4px;font:600 11px var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--tx3);min-height:1.6em}
  .says em{font-style:normal;color:var(--pur2)}
  .card{position:relative;text-align:left;background:linear-gradient(180deg,rgba(17,24,51,.93),rgba(12,17,36,.93));border:1px solid var(--line2);border-radius:20px;padding:28px 24px 24px;
    box-shadow:0 0 70px rgba(139,124,246,.12),inset 0 1px 0 rgba(255,255,255,.03);backdrop-filter:blur(6px)}
  .card.shake{animation:shake .45s}
  @keyframes shake{20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}
  .lbl{font:600 10.5px var(--mono);letter-spacing:.18em;text-transform:uppercase;color:var(--tx3);margin-bottom:14px;display:flex;align-items:center;gap:8px}
  .lbl::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--up);box-shadow:0 0 8px var(--up)}
  .vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
  .field{position:relative;margin-bottom:14px}
  .field svg.lock{position:absolute;left:16px;top:50%;transform:translateY(-50%);color:var(--tx3);pointer-events:none}
  .field input{width:100%;background:var(--bg);border:1px solid var(--line2);border-radius:14px;padding:15px 48px;color:var(--tx);font:500 15px var(--sans);outline:none;transition:border-color .15s,box-shadow .15s}
  .field input::placeholder{color:#6d7599}
  .field input:focus{border-color:var(--pur);box-shadow:0 0 0 3px rgba(139,124,246,.24),0 0 22px rgba(139,124,246,.18)}
  .field.bad input{border-color:var(--dn)}
  .field .toggle{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:0;color:var(--tx3);cursor:pointer;padding:9px;border-radius:10px;line-height:0}
  .field .toggle:hover{color:var(--pur2)}
  .remember{display:flex;align-items:center;gap:10px;color:var(--tx2);font-size:13.5px;margin:2px 2px 18px}
  .remember input{accent-color:var(--pur);width:16px;height:16px}
  button.go{width:100%;border:1px solid rgba(139,124,246,.6);border-radius:14px;padding:15px;font:700 12.5px var(--mono);letter-spacing:.18em;text-transform:uppercase;color:#fff;cursor:pointer;
    background:linear-gradient(90deg,rgba(139,124,246,.55),rgba(108,92,231,.55));box-shadow:0 0 24px rgba(139,124,246,.25);transition:filter .15s,transform .05s}
  button.go:hover{filter:brightness(1.12)}
  button.go:active{transform:translateY(1px)}
  button.go[disabled]{filter:saturate(.5) brightness(.9);cursor:progress}
  button.go:focus-visible,.field .toggle:focus-visible,.remember input:focus-visible{outline:2px solid var(--pur2);outline-offset:2px}
  .err{display:flex;gap:8px;align-items:flex-start;color:var(--dn);font-size:13.5px;margin:0 0 14px;padding:10px 12px;border:1px solid rgba(255,107,132,.35);background:rgba(255,93,120,.08);border-radius:12px}
  .note{margin:16px 2px 0;font-size:12px;color:var(--tx3);line-height:1.5}
  .clocks{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;position:relative;margin:26px -60px 16px}
  @media (max-width:560px){.clocks{margin:22px 0 14px}}
  .clk{display:flex;align-items:center;gap:7px;padding:5px 11px;border:1px solid var(--line);border-radius:999px;background:rgba(12,17,36,.8);font:600 11px var(--mono);letter-spacing:.06em;color:var(--tx2)}
  .clk em{font-style:normal;color:var(--tx)}
  .dot{width:7px;height:7px;border-radius:50%;background:#4b5478}
  .dot.on{background:var(--up);box-shadow:0 0 8px var(--up)}
  .foot{position:relative;text-align:center;font:600 10.5px var(--mono);letter-spacing:.2em;color:var(--tx3);text-transform:uppercase}
  @media (max-width:420px){.brand{font-size:22px;letter-spacing:.1em}.card{padding:24px 18px 20px}.tag{font-size:10px;letter-spacing:.14em;gap:8px}.tag .ln{width:14px;flex:0 1 14px}.clk{padding:5px 9px;font-size:10.5px}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style></head><body>
<div class="tape" aria-hidden="true"><svg id="tape" viewBox="0 0 2000 400" preserveAspectRatio="none"></svg></div>
<div class="glow" aria-hidden="true"></div>
<main class="wrap">
  <div class="tag"><span class="ln"></span>MACRO · RATES · CENTRAL BANKS<span class="ln r"></span></div>
  <h1 class="brand"><i></i>DESK <span>TERMINAL</span><b aria-hidden="true"></b></h1>
  <p class="says">The desk's macro analysis. None of the advice.<span class="inside">Inside · <em id="says">Rates</em></span></p>
  <div class="card" id="card">
    <div class="lbl">Private access</div>
    <div id="msg" role="alert" aria-live="assertive">${error ? '<div class="err"><span aria-hidden="true">✕</span><span>That key did not fit. Check it and try again.</span></div>' : ''}</div>
    <form id="f" autocomplete="on">
      <div class="field${error ? ' bad' : ''}" id="field">
        <label class="vh" for="pw">Password</label>
        <svg class="lock" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
        <input type="password" id="pw" name="password" placeholder="Enter access key" autocomplete="current-password" autofocus required${error ? ' aria-invalid="true"' : ''}>
        <button type="button" class="toggle" id="toggle" aria-label="Show password" aria-pressed="false">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
      <label class="remember"><input type="checkbox" id="remember" checked> Keep me signed in for 30 days</label>
      <button type="submit" class="go" id="go">Enter the desk</button>
    </form>
    <p class="note">Educational and informational macro analysis. Not investment advice and not a trade signal.</p>
  </div>
  <div class="clocks" id="clocks" aria-label="World clocks"></div>
  <div class="foot">Authorised viewers only</div>
</main>
<script>
(function () {
  // backdrop: a seeded random-walk candle chart, drawn once; the CSS animation does the drifting
  var seed = 20261113; function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  var n = 100, step = 20, price = 210, drift = 0, up = '#2fd39a', dn = '#ff6b84', candles = [], out = '';
  for (var i = 0; i < n; i++) {
    drift = drift * 0.9 + (rnd() - 0.5) * 7; var o = price, c = Math.max(40, Math.min(360, o + drift + (rnd() - 0.5) * 16));
    candles.push({ o: o, c: c, h: Math.max(o, c) + rnd() * 12, l: Math.min(o, c) - rnd() * 12 }); price = c;
  }
  function yy(v) { return (400 - v).toFixed(1); }
  // two copies side by side: the animation slides by exactly one copy, so the loop has no seam
  [0, 2000].forEach(function (dx) {
    candles.forEach(function (k, i) {
      var x = i * step + 10 + dx, col = k.c >= k.o ? up : dn;
      out += '<line x1="' + x + '" x2="' + x + '" y1="' + yy(k.h) + '" y2="' + yy(k.l) + '" stroke="' + col + '" stroke-width="1.2" opacity=".55"/><rect x="' + (x - 5) + '" y="' + yy(Math.max(k.o, k.c)) + '" width="10" height="' + Math.max(2, Math.abs(k.c - k.o)).toFixed(1) + '" fill="' + col + '" opacity=".38"/>';
    });
  });
  var svg = document.getElementById('tape'); svg.setAttribute('viewBox', '0 0 4000 400'); svg.innerHTML = out;

  // the word that rotates under the title
  var words = ['Rates', 'Central banks', 'The macro chain', 'Volatility', 'Positioning', 'Credit', 'Currencies'], wi = 0, says = document.getElementById('says');
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(function () { wi = (wi + 1) % words.length; says.textContent = words[wi]; }, 2200);

  // the four session clocks (open = a weekday between 08:00 and 17:00 local; approximate, it is a dot not a calendar)
  var zones = [['London', 'Europe/London'], ['New York', 'America/New_York'], ['Tokyo', 'Asia/Tokyo'], ['Sydney', 'Australia/Sydney']], box = document.getElementById('clocks');
  box.innerHTML = zones.map(function (z, i) { return '<div class="clk"><span class="dot" id="d' + i + '"></span>' + z[0] + ' <em id="c' + i + '">--:--</em></div>'; }).join('');
  function tick() {
    zones.forEach(function (z, i) {
      try {
        var p = new Intl.DateTimeFormat('en-GB', { timeZone: z[1], hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date()), g = {};
        p.forEach(function (x) { g[x.type] = x.value; });
        var h = +g.hour % 24; document.getElementById('c' + i).textContent = g.hour + ':' + g.minute;
        document.getElementById('d' + i).className = 'dot' + (g.weekday !== 'Sat' && g.weekday !== 'Sun' && h >= 8 && h < 17 ? ' on' : '');
      } catch (e) { /* the clock is decoration */ }
    });
  }
  tick(); setInterval(tick, 1000);

  var pw = document.getElementById('pw'), toggle = document.getElementById('toggle'), form = document.getElementById('f'), go = document.getElementById('go'), card = document.getElementById('card');
  toggle.addEventListener('click', function () { var show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; toggle.setAttribute('aria-pressed', String(show)); toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); });
  if (${error ? 'true' : 'false'}) { card.classList.add('shake'); }
  form.addEventListener('submit', async function (e) {
    e.preventDefault(); go.disabled = true; go.textContent = 'Checking…';
    try {
      var res = await fetch('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zone: 'desk', password: pw.value, remember: document.getElementById('remember').checked }) });
      if (res.ok) { go.textContent = 'Welcome'; location.href = ${jsString(next)}; return; }
    } catch (err) { /* fall through to the error page */ }
    location.href = '/login?zone=desk&next=' + encodeURIComponent(${jsString(next)}) + '&error=1';
  });
})();
</script>
</body></html>`;
}
