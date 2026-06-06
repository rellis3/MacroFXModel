import { S } from './state.js';
import { CAP_DEFAULTS, KALMAN5M_DEFAULTS } from './config.js';

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

const _EQUITY_CAP = { 'NAS100_USD': 'nas100', 'SPX500_USD': 'spx500', 'DE30_USD': 'de30', 'UK100_GBP': 'uk100', 'US30_USD': 'us30', 'US2000_USD': 'us2000' };

export function getCaps(sym) {
  const cfg = S._caps || CAP_DEFAULTS;
  if (sym && sym.includes('XAU')) return cfg.gold;
  const eqKey = _EQUITY_CAP[sym];
  if (eqKey) return cfg[eqKey] || CAP_DEFAULTS[eqKey] || cfg.nas100;
  return cfg.fx;
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
  fill('fx_confluencePips',  fx.confluencePips);
  fill('fx_mergeFactor',     fx.mergeFactor);
  fill('fx_asiaMinPips',              fx.asiaMinPips);
  fill('fx_structuralLookbackDays',   fx.structuralLookbackDays);
  fill('fx_structuralPivotN',         fx.structuralPivotN);
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
  fill('gold_confluencePips',  gold.confluencePips);
  fill('gold_mergeFactor',     gold.mergeFactor);
  fill('gold_asiaMinPips',              gold.asiaMinPips);
  fill('gold_structuralLookbackDays',   gold.structuralLookbackDays);
  fill('gold_structuralPivotN',         gold.structuralPivotN);
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
  const nas100 = caps.nas100 || CAP_DEFAULTS.nas100;
  fill('nas100_confluencePips',  nas100.confluencePips);
  fill('nas100_mergeFactor',     nas100.mergeFactor);
  fill('nas100_asiaMinPips',     nas100.asiaMinPips);
  fill('nas100_structuralLookbackDays', nas100.structuralLookbackDays);
  fill('nas100_structuralPivotN',       nas100.structuralPivotN);
  fill('nas100_oiAtrFrac',     nas100.oiAtrFrac);
  fill('nas100_oiPipCap',      nas100.oiPipCap);
  fill('nas100_pivAtrFrac',    nas100.pivAtrFrac);
  fill('nas100_pivPipCap',     nas100.pivPipCap);
  fill('nas100_rngAtrFrac',    nas100.rngAtrFrac);
  fill('nas100_rngPipCap',     nas100.rngPipCap);
  fill('nas100_gexAtrFrac',    nas100.gexAtrFrac);
  fill('nas100_gexPipCap',     nas100.gexPipCap);
  fill('nas100_enhPivAtrFrac', nas100.enhPivAtrFrac);
  fill('nas100_enhPivPipCap',  nas100.enhPivPipCap);
  const k5 = caps.kalman5m || KALMAN5M_DEFAULTS;
  fill('kalman5m_lookback',      k5.lookback);
  fill('kalman5m_processNoise',  k5.processNoise);
  fill('kalman5m_observNoise',   k5.observNoise);
  fill('kalman5m_threshold',     k5.threshold);
  fill('kalman5m_longScore',     k5.longScore);
  fill('kalman5m_shortScore',    k5.shortScore);

  // Global confluence mode
  const modeEl = document.getElementById('conf_priceMode');
  if (modeEl) modeEl.value = caps.confluencePriceMode ?? 'midpoint';
  const mergeEl = document.getElementById('conf_clusterMerge');
  if (mergeEl) mergeEl.value = String(caps.clusterMerge ?? true);
  fill('conf_slMaxAtrMult', caps.slMaxAtrMult ?? 0.5);
}

function readCfgForm() {
  const num = id => parseFloat(document.getElementById(id)?.value) || null;
  const str = id => document.getElementById(id)?.value ?? null;
  return {
    confluencePriceMode: str('conf_priceMode')    ?? 'midpoint',
    clusterMerge:        str('conf_clusterMerge') !== 'false',
    slMaxAtrMult:        parseFloat(document.getElementById('conf_slMaxAtrMult')?.value) || 0.5,
    fx: {
      confluencePips: num('fx_confluencePips'),
      mergeFactor:    num('fx_mergeFactor'),
      asiaMinPips:            num('fx_asiaMinPips'),
      structuralLookbackDays: num('fx_structuralLookbackDays'),
      structuralPivotN:       num('fx_structuralPivotN'),
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
      confluencePips: num('gold_confluencePips'),
      mergeFactor:    num('gold_mergeFactor'),
      asiaMinPips:            num('gold_asiaMinPips'),
      structuralLookbackDays: num('gold_structuralLookbackDays'),
      structuralPivotN:       num('gold_structuralPivotN'),
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
    nas100: {
      confluencePips: num('nas100_confluencePips'),
      mergeFactor:    num('nas100_mergeFactor'),
      asiaMinPips:            num('nas100_asiaMinPips'),
      structuralLookbackDays: num('nas100_structuralLookbackDays'),
      structuralPivotN:       num('nas100_structuralPivotN'),
      oiAtrFrac:     num('nas100_oiAtrFrac'),
      oiPipCap:      num('nas100_oiPipCap'),
      pivAtrFrac:    num('nas100_pivAtrFrac'),
      pivPipCap:     num('nas100_pivPipCap'),
      rngAtrFrac:    num('nas100_rngAtrFrac'),
      rngPipCap:     num('nas100_rngPipCap'),
      gexAtrFrac:    num('nas100_gexAtrFrac'),
      gexPipCap:     num('nas100_gexPipCap'),
      enhPivAtrFrac: num('nas100_enhPivAtrFrac'),
      enhPivPipCap:  num('nas100_enhPivPipCap'),
    },
    kalman5m: {
      lookback:     num('kalman5m_lookback'),
      processNoise: num('kalman5m_processNoise'),
      observNoise:  num('kalman5m_observNoise'),
      threshold:    num('kalman5m_threshold'),
      longScore:    num('kalman5m_longScore'),
      shortScore:   num('kalman5m_shortScore'),
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

  const allVals = [
    ...Object.values(payload.fx),
    ...Object.values(payload.gold),
    ...Object.values(payload.nas100),
    ...Object.values(payload.kalman5m),
  ];
  if (allVals.some(v => v == null || (typeof v === 'number' && v <= 0))) {
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
