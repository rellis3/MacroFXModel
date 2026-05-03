import { S } from './state.js';
import { CAP_DEFAULTS } from './config.js';

export async function loadCaps() {
  try {
    const res = await fetch('/api/config/caps');
    if (!res.ok) throw new Error('caps ' + res.status);
    S._caps = await res.json();
  } catch(e) {
    console.warn('Caps load failed, using defaults:', e.message);
    S._caps = CAP_DEFAULTS;
  }
}

export function getCaps(sym) {
  const cfg = S._caps || CAP_DEFAULTS;
  return sym && sym.includes('XAU') ? cfg.gold : cfg.fx;
}

export async function openCfgModal() {
  document.getElementById('cfgOverlay').classList.add('open');
  try {
    const res = await fetch('/api/config/caps');
    if (res.ok) {
      S._caps = await res.json();
      populateCfgForm(S._caps);
      const kvStatus = document.getElementById('cfgKVStatus');
      if (S._caps.updatedAt) {
        kvStatus.innerHTML = `<div class="cfg-kv-ok">✓ KV connected — last saved ${new Date(S._caps.updatedAt).toLocaleString()}</div>`;
        document.getElementById('cfgUpdatedAt').textContent = '';
      } else {
        const cfgRes = await fetch('/api/config').then(r => r.json()).catch(() => ({}));
        if (cfgRes.hasKV) {
          kvStatus.innerHTML = `<div class="cfg-kv-ok">✓ KV bound — using defaults (not yet saved)</div>`;
        } else {
          kvStatus.innerHTML = `<div class="cfg-kv-warn">⚠ FX_SCORES KV namespace not bound. Values will not persist across deploys.<br>
            Go to Cloudflare Pages → Settings → Functions → KV namespace bindings → Add: Variable <strong>FX_SCORES</strong>. Create a new KV namespace if needed.</div>`;
        }
      }
    }
  } catch(e) {
    document.getElementById('cfgKVStatus').innerHTML = `<div class="cfg-kv-warn">⚠ Could not reach /api/config/caps — worker may not be deployed</div>`;
    populateCfgForm(CAP_DEFAULTS);
  }
}

export function closeCfgModal() {
  document.getElementById('cfgOverlay').classList.remove('open');
  document.getElementById('cfgSaveStatus').textContent = '';
}

function populateCfgForm(caps) {
  const fill = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  };
  const fx   = caps.fx   || CAP_DEFAULTS.fx;
  const gold = caps.gold || CAP_DEFAULTS.gold;
  fill('fx_oiAtrFrac',     fx.oiAtrFrac);
  fill('fx_oiPipCap',      fx.oiPipCap);
  fill('fx_pivAtrFrac',    fx.pivAtrFrac);
  fill('fx_pivPipCap',     fx.pivPipCap);
  fill('fx_rngAtrFrac',    fx.rngAtrFrac);
  fill('fx_rngPipCap',     fx.rngPipCap);
  fill('fx_gexAtrFrac',    fx.gexAtrFrac);
  fill('fx_gexPipCap',     fx.gexPipCap);
  fill('fx_enhPivAtrFrac', fx.enhPivAtrFrac);
  fill('fx_enhPivPipCap',  fx.enhPivPipCap);
  fill('gold_oiAtrFrac',     gold.oiAtrFrac);
  fill('gold_oiPipCap',      gold.oiPipCap);
  fill('gold_pivAtrFrac',    gold.pivAtrFrac);
  fill('gold_pivPipCap',     gold.pivPipCap);
  fill('gold_rngAtrFrac',    gold.rngAtrFrac);
  fill('gold_rngPipCap',     gold.rngPipCap);
  fill('gold_gexAtrFrac',    gold.gexAtrFrac);
  fill('gold_gexPipCap',     gold.gexPipCap);
  fill('gold_enhPivAtrFrac', gold.enhPivAtrFrac);
  fill('gold_enhPivPipCap',  gold.enhPivPipCap);
}

function readCfgForm() {
  const num = id => parseFloat(document.getElementById(id)?.value) || null;
  return {
    fx: {
      oiAtrFrac:     num('fx_oiAtrFrac'),
      oiPipCap:      num('fx_oiPipCap'),
      pivAtrFrac:    num('fx_pivAtrFrac'),
      pivPipCap:     num('fx_pivPipCap'),
      rngAtrFrac:    num('fx_rngAtrFrac'),
      rngPipCap:     num('fx_rngPipCap'),
      gexAtrFrac:    num('fx_gexAtrFrac'),
      gexPipCap:     num('fx_gexPipCap'),
      enhPivAtrFrac: num('fx_enhPivAtrFrac'),
      enhPivPipCap:  num('fx_enhPivPipCap'),
    },
    gold: {
      oiAtrFrac:     num('gold_oiAtrFrac'),
      oiPipCap:      num('gold_oiPipCap'),
      pivAtrFrac:    num('gold_pivAtrFrac'),
      pivPipCap:     num('gold_pivPipCap'),
      rngAtrFrac:    num('gold_rngAtrFrac'),
      rngPipCap:     num('gold_rngPipCap'),
      gexAtrFrac:    num('gold_gexAtrFrac'),
      gexPipCap:     num('gold_gexPipCap'),
      enhPivAtrFrac: num('gold_enhPivAtrFrac'),
      enhPivPipCap:  num('gold_enhPivPipCap'),
    },
  };
}

export async function saveCaps() {
  const btn    = document.getElementById('cfgSaveBtn');
  const status = document.getElementById('cfgSaveStatus');
  btn.disabled = true;
  status.textContent = 'Saving…';
  status.className = 'cfg-status';

  const payload = readCfgForm();

  const allVals = [...Object.values(payload.fx), ...Object.values(payload.gold)];
  if (allVals.some(v => !v || v <= 0)) {
    status.textContent = '⚠ All values must be positive numbers';
    status.className = 'cfg-status err';
    btn.disabled = false;
    return;
  }

  try {
    const res = await fetch('/api/config/caps', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.ok) {
      S._caps = { ...payload, updatedAt: data.saved.updatedAt };
      status.textContent = '✓ Saved to KV';
      status.className = 'cfg-status ok';
      document.getElementById('cfgUpdatedAt').textContent = 'Saved ' + new Date(data.saved.updatedAt).toLocaleTimeString();
      document.getElementById('cfgKVStatus').innerHTML = `<div class="cfg-kv-ok">✓ Saved to KV at ${new Date(data.saved.updatedAt).toLocaleString()}</div>`;
      if (window._latestQuote && S.fredData) window.renderAll();
    } else {
      status.textContent = '⚠ ' + (data.error || 'Save failed');
      status.className = 'cfg-status err';
    }
  } catch(e) {
    status.textContent = '⚠ ' + e.message;
    status.className = 'cfg-status err';
  }
  btn.disabled = false;
}

export function resetCaps() {
  populateCfgForm(CAP_DEFAULTS);
  document.getElementById('cfgSaveStatus').textContent = 'Defaults loaded — click Save to apply';
  document.getElementById('cfgSaveStatus').className = 'cfg-status';
}
