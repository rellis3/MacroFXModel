/**
 * One place that knows how to talk to a model, so the other sixteen do not.
 *
 * WHY. Every AI call in server.js was its own copy-pasted fetch: the URL, the headers,
 * the model name and the token budget written out sixteen times, with `claude-opus-5`
 * hardcoded in fourteen of them. Changing model meant fourteen edits, and running a
 * cheaper provider for the cheap jobs meant forking every call site. The REPLY side was
 * already behind one helper (`_antText`, which exists because reading `content[0].text`
 * broke silently when Opus started returning a thinking block first) — this is the same
 * treatment for the request side.
 *
 * WHAT IS AND IS NOT HARD ABOUT MULTI-PROVIDER. The wire format is the easy part, and
 * it is nearly all of what people expect to be difficult. DeepSeek and Moonshot (Kimi)
 * both speak the OpenAI chat-completions shape, so there are TWO adapters here, not one
 * per vendor. No call in this codebase uses tools or streaming, and only the research pod sends pictures
 * (anthropic only: see `vision` below), so nearly the whole
 * surface is text in, text out.
 *
 * The hard part is obedience. These prompts carry the desk's evidence ledger — 155
 * pre-registered findings, ~34k tokens — whose entire job is to stop the model claiming
 * things this desk has tested and falsified. Following that under long context is
 * exactly where cheaper models degrade, and the failure is SILENT: you get fluent,
 * confident analysis that contradicts a banked null. That is why js/modelAudit.js exists
 * and why nothing here decides on its own to route a ledger-carrying task to a cheap
 * model.
 *
 * MODEL IDS AND LIMITS ARE CONFIG, NOT CODE. Vendors rename models and change caps far
 * faster than this file gets edited, so every id, output cap and context size below is a
 * DEFAULT that an environment variable overrides. A wrong guess is then a Railway
 * setting, not a deploy.
 *
 * PRICES ARE NOT HARDCODED. This module reports TOKENS, which it knows, and converts to
 * money only when a price is configured. A made-up price in a cost report is worse than
 * no cost report.
 *
 * Pure: no fetch, no DOM, no process.env reads. The caller supplies config and performs
 * the request. Tested in js/modelRouter.test.mjs.
 */

/** The two wire formats, and which vendors speak them. */
export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    url: 'https://api.anthropic.com/v1/messages',
    keyEnv: 'ANT_KEY',
    modelsUrl: 'https://api.anthropic.com/v1/models',
    wire: 'anthropic',
    // Explicit cache breakpoints, billed at a large discount on a hit.
    explicitCache: true,
    // Reads pictures: base64 image blocks in the user message (research-vision, and the Head of Research's check).
    vision: true,
  },
  deepseek: {
    label: 'DeepSeek',
    url: 'https://api.deepseek.com/chat/completions',
    keyEnv: 'DEEPSEEK_KEY',
    modelsUrl: 'https://api.deepseek.com/models',
    wire: 'openai',
    // DeepSeek caches context automatically; there is no breakpoint to send.
    explicitCache: false,
    // Cannot read images: never send it one (buildRequest refuses).
    vision: false,
  },
  moonshot: {
    label: 'Moonshot (Kimi)',
    url: 'https://api.moonshot.ai/v1/chat/completions',
    keyEnv: 'MOONSHOT_KEY',
    modelsUrl: 'https://api.moonshot.ai/v1/models',
    wire: 'openai',
    explicitCache: false,
    vision: false,
  },
};

/** True when this provider can take image blocks with a prompt. */
export const supportsImages = provider => !!PROVIDERS[provider]?.vision;

/**
 * Default model per provider, and the output ceiling to clamp to.
 *
 * `maxOutput` is the one that bites in practice: ten call sites in server.js ask for
 * 16,000 output tokens, and a provider that caps lower does not error — it truncates,
 * and truncated JSON fails to parse somewhere far from the cause. Clamping here turns a
 * confusing parse error into a known limit.
 *
 * Override any of these with MODEL_<PROVIDER>_ID / MODEL_<PROVIDER>_MAXOUT.
 */
export const DEFAULT_MODELS = {
  anthropic: { id: 'claude-opus-5',  maxOutput: 32000, context: 200000 },
  deepseek:  { id: 'deepseek-chat',  maxOutput: 8192,  context: 65536  },
  moonshot:  { id: 'kimi-k2-0905-preview', maxOutput: 16384, context: 262144 },
};

/**
 * The jobs that call a model, grouped by what they actually need.
 *
 * This is the grouping that makes a cheap model safe to use at all. A task that carries
 * the evidence ledger is asking the model to respect 155 findings; a task that summarises
 * one news article is not. Routing them identically wastes money on one and risks the
 * other, which is why the toggle is PER TASK and not one global switch.
 */
export const TASK_CLASS = {
  // carries the full ledger: the model is being asked to obey tested nulls
  'brief':        { ledger: 'full',  label: 'Morning brief' },
  'chain':        { ledger: 'full',  label: 'Macro chain read' },
  'eod-review':   { ledger: 'brief', label: 'End-of-day review' },
  // reasoning over desk data, no ledger
  'pair':         { ledger: null,    label: 'Pair analysis' },
  'cot':          { ledger: null,    label: 'COT positioning analysis' },
  'currency':     { ledger: null,    label: 'Currency analysis' },
  'explain':      { ledger: null,    label: 'Explain a reading' },
  'oi-explain':   { ledger: null,    label: 'OI Lab panel explainer' },
  // desk analyst pipeline (plans/DESK_ANALYST_PIPELINE.md): each call carries a SLICE of the ledger chosen for its
  // area (js/deskRoles.js selectEvidence), so 'brief' -- not routed to a cheap model unless the owner says so.
  // `models` pins a model for this task on a given provider, over that provider's default (owner 2026-11-03:
  // Sonnet 5 for the desk pipeline "for now"). AI_TASK_MODEL_DESK_ANALYST / _DESK_HEAD override it from the env.
  // `effort` (Anthropic only) sets how hard the model thinks. Thinking is billed as output and counts against
  // max_tokens: on the first Railway run (2026-11-03) every analyst spent its whole 3,000-token cap thinking and
  // returned no JSON. Medium for the analysts, debaters and desks; high for the managers and the Head.
  'desk-analyst': { ledger: 'brief', label: 'Desk pipeline: analysts',     models: { anthropic: 'claude-sonnet-5' }, effort: { anthropic: 'medium' } },
  'desk-head':    { ledger: 'brief', label: 'Desk pipeline: Head of Desk', models: { anthropic: 'claude-sonnet-5' }, effort: { anthropic: 'high' } },
  // the news wire's headline reads (agent 21): a batch of up to 20 headlines every 2 minutes at most, so it runs on
  // DeepSeek by default whatever the global default is (owner 2026-11-05: "all model reads for news on DeepSeek for
  // cost"). `defaultProvider` sits under a per-task choice (ai_routing_v1 / AI_TASK_DESK_NEWS) and over the global one.
  'desk-news':    { ledger: null,    label: 'Desk news wire: headline reads', defaultProvider: 'deepseek', cheapSafe: true },
  // the research pod (owner 2026-11-05): the three researchers (quant, macro, flow) and their per-proposal threads run on
  // DeepSeek by default (cheaper; their prompts carry a SLICE of the Evidence Book chosen for the question and fit its
  // 64k context and 8,192-token output); the Head of Research, who peer-reviews their work against the whole book,
  // runs on Anthropic and only when the owner presses the button. Both sit under a per-task choice like desk-news.
  'research-pod':  { ledger: 'brief', label: 'Research pod: the three researchers', defaultProvider: 'deepseek' },
  // one market analysed on demand (owner 2026-11-10: the Analyse button on the Desk Terminal; js/assetAnalysis.js): about
  // 30-40k tokens in and 2-3k out, so about a cent a press on DeepSeek. Its own task so the morning desk stays on Anthropic.
  'desk-asset':    { ledger: 'brief', label: 'Desk Terminal: analyse one market', defaultProvider: 'deepseek' },
  // the literature desk's quick-tier reads (the paper reader, 2026-11-08, owner: "switch to DeepSeek and run"): one call per
  // paper, about 20-25k tokens in and 3.5k out, so about 1 cent a paper on DeepSeek against about 10 cents on Sonnet. A task of
  // its own so the daily desk analysts ('desk-analyst') stay on Anthropic. Deep-tier literature work still uses 'desk-head'.
  'research-reader': { ledger: 'brief', label: 'Literature desk: the paper reader', defaultProvider: 'deepseek' },
  // the paper library's equations (owner 2026-11-08, spend approved and capped): text only, about 25 equations per call as compact JSON in, LaTeX out;
  // hard cap of 1500 calls in KV (library_math_v1). DeepSeek, on the cheap 'brief' ledger, like the paper reader.
  'library-math': { ledger: 'brief', label: 'Paper library: equations to LaTeX', defaultProvider: 'deepseek' },
  // Figure and table notes from the paper's text only (js/libraryFigs.js): same shape as library-math, hard cap of 600 calls in KV (library_figs_v1).
  'library-figs': { ledger: 'brief', label: 'Paper library: figure and table notes', defaultProvider: 'deepseek' },
  // The librarian (js/libraryLibrarian.js, LIBRARY_CONTEXT=1): ONE small call that picks the papers worth reading from a scanned candidate list (at most 2 per run, hard cap of 400 in KV library_librarian_v1).
  'library-librarian': { ledger: 'brief', label: 'Paper library: the librarian picks papers', defaultProvider: 'deepseek' },
  // Concept cards (js/libraryConcepts.js): the library digests and the owner's education text turned into reviewable cards, up to 12 calls a press, hard cap of 400 in KV (library_concepts_v1).
  'library-concepts': { ledger: 'brief', label: 'Paper library: concept cards', defaultProvider: 'deepseek' },
  'research-head': { ledger: 'full',  label: 'Research pod: Head of Research review', defaultProvider: 'anthropic', models: { anthropic: 'claude-sonnet-5' }, effort: { anthropic: 'high' } },
  // pictures the owner attaches to a research question (owner 2026-11-06): each is read ONCE by a vision model into a
  // written description that the researchers (DeepSeek, which cannot see images) and the Head then read as text.
  // `vision: true`: routing it to a provider that cannot read images falls back to anthropic (resolveTask).
  'research-vision': { ledger: null, label: 'Research pod: read an attached picture', defaultProvider: 'anthropic', models: { anthropic: 'claude-sonnet-5' }, effort: { anthropic: 'low' }, vision: true },
  // summarising supplied text — the cheap jobs
  'headlines':    { ledger: null,    label: 'Headline summary',  cheapSafe: true },
  'doc-summary':  { ledger: null,    label: 'Document summary',  cheapSafe: true },
  'misc':         { ledger: null,    label: 'Other',             cheapSafe: true },
};

/**
 * The output cap for a retry after a reply was cut off at `sent` tokens: more room, but never past the provider's
 * own ceiling (`maxOutput`; DeepSeek 8,192) or `hard`. At the ceiling the retry gets the same room and has to be
 * shorter (the caller says so in the prompt); asking a provider for more than it can give only truncates again.
 */
export const retryCap = (sent, maxOutput = null, hard = 24_000) => Math.max(1, Math.min(Math.round(sent * 1.6), hard, maxOutput ?? Infinity));

/** Rough token count. Only ever used for budgeting and reporting, never for billing. */
export const estimateTokens = s => Math.ceil(String(s ?? '').length / 4);

/**
 * Which provider and model should run this task?
 *
 * `cfg.tasks[task]` wins, then the task's own `defaultProvider` (TASK_CLASS), then `cfg.provider` (the global
 * default), then anthropic. A
 * task whose provider has no key configured falls back to the default provider rather
 * than failing — a missing DeepSeek key should make the page slower and dearer, not
 * broken.
 */
export function resolveTask(task, cfg = {}) {
  const haveKey = p => !!(cfg.keys ?? {})[p];
  const wanted = (cfg.tasks ?? {})[task] ?? TASK_CLASS[task]?.defaultProvider ?? cfg.provider ?? 'anthropic';
  let provider = (PROVIDERS[wanted] && haveKey(wanted)) ? wanted
    : (PROVIDERS[cfg.provider] && haveKey(cfg.provider)) ? cfg.provider
    : 'anthropic';
  // a task that sends pictures never lands on a provider that cannot read them (DeepSeek, Kimi): anthropic, whose
  // missing key is then a clear error at call time rather than an image sent where it cannot be read
  const visionFix = !!TASK_CLASS[task]?.vision && !PROVIDERS[provider]?.vision;
  if (visionFix) provider = 'anthropic';
  const fellBack = provider !== wanted;
  const d = DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.anthropic;
  const o = (cfg.models ?? {})[provider] ?? {};
  // A task-level model (env AI_TASK_MODEL_<TASK>, then the task's own `models` default) is more specific than the
  // provider-wide one, so it wins -- but only on the provider it names: a task pinned to an Anthropic model that
  // falls back to DeepSeek must not send DeepSeek an Anthropic id.
  const envTm = (cfg.taskModels ?? {})[task];
  const taskModel = (envTm && envTm.provider === provider ? envTm.id : null) ?? TASK_CLASS[task]?.models?.[provider] ?? null;
  return {
    provider,
    model: taskModel ?? o.id ?? d.id,
    effort: (cfg.taskEffort ?? {})[task] ?? TASK_CLASS[task]?.effort?.[provider] ?? null,
    maxOutput: o.maxOutput ?? d.maxOutput,
    context: o.context ?? d.context,
    fellBack,
    why: !fellBack ? null : visionFix ? `${wanted} cannot read images; used ${provider}` : `${wanted} has no key configured; used ${provider}`,
  };
}

/**
 * Build the HTTP request for one call.
 *
 * `standing` is content that is the SAME on every call of this task — the evidence
 * ledger. It is passed separately rather than glued into `prompt` for one reason: a
 * cache only hits on a stable PREFIX, and the ledger used to sit in the middle of a
 * prompt whose opening paragraphs are today's snapshot. Stable-first is what makes the
 * ~34k ledger cacheable at all. On Anthropic it becomes a system block with an explicit
 * cache breakpoint; on OpenAI-shaped providers it is simply the front of the system
 * message, which is where their automatic caching wants it anyway.
 */
/**
 * Where the stable front of a prompt ends. A prompt builder puts it after the part that repeats from call to call (the
 * desk date and a role's Evidence Book entries, the Head of Research's whole Evidence Book): on Anthropic everything
 * before it is sent as its own block with a cache breakpoint, so a repeat within 5 minutes is read at a tenth of the
 * input price; on other providers it is removed and the text is unchanged. The model never sees it. Invisible
 * characters, so a stray copy in a log or a replay does no harm.
 */
export const CACHE_MARK = '⁣⁣cache⁣⁣';
/** The prompt split at the first mark: { lead, rest } (lead '' when there is no mark); any further marks are dropped. */
export function splitCacheMark(prompt = '') {
  const s = String(prompt ?? '');
  const i = s.indexOf(CACHE_MARK);
  if (i < 0) return { lead: '', rest: s };
  return { lead: s.slice(0, i), rest: s.slice(i + CACHE_MARK.length).split(CACHE_MARK).join('') };
}
// A system prompt this long (about 1,000 tokens) gets its own cache breakpoint on Anthropic: the same role's system
// text repeats across calls (the asset desks, the paper readers). Shorter ones fall under the model's minimum anyway.
const SYSTEM_CACHE_MIN_CHARS = 4000;

export function buildRequest({
  provider = 'anthropic', model, system = '', standing = '', prompt = '',
  maxTokens = 4000, maxOutput = null, cache = true, temperature = null, effort = null, images = [],
} = {}) {
  const P = PROVIDERS[provider];
  if (!P) throw new Error(`unknown provider: ${provider}`);
  // `images`: [{ mediaType, data (base64) }]. Only a vision provider takes them; anything else is refused here, so an
  // image can never be sent to DeepSeek by a routing mistake further up.
  const imgs = Array.isArray(images) ? images : [];
  if (imgs.length && !P.vision) throw new Error(`${P.label} cannot read images`);
  for (const im of imgs) if (!/^image\/(png|jpeg|webp|gif)$/.test(im?.mediaType ?? '') || typeof im?.data !== 'string' || !im.data) throw new Error('an image needs a mediaType (image/png, jpeg, webp or gif) and base64 data');
  const cap = maxOutput ?? DEFAULT_MODELS[provider]?.maxOutput ?? maxTokens;
  const max_tokens = Math.min(maxTokens, cap);
  const clamped = max_tokens < maxTokens;

  const { lead, rest } = splitCacheMark(prompt);
  if (P.wire === 'anthropic') {
    const cc = cache && P.explicitCache ? { cache_control: { type: 'ephemeral' } } : {};
    // A long system prompt carries its own breakpoint (it repeats for every call of the same role). With standing
    // content the system is an array as before: the standing block cached, then the system text. A short system with
    // no standing content stays the plain string it always was.
    const sysCache = cache && P.explicitCache && String(system ?? '').length >= SYSTEM_CACHE_MIN_CHARS;
    const sys = standing
      ? [
          { type: 'text', text: standing, ...cc },
          ...(system ? [{ type: 'text', text: system, ...(sysCache ? cc : {}) }] : []),
        ]
      : sysCache ? [{ type: 'text', text: system, ...cc }] : system;
    // The user turn: pictures first (Anthropic's advice), then the stable lead with its breakpoint, then the rest.
    const textBlocks = lead ? [{ type: 'text', text: lead, ...cc }, ...(rest ? [{ type: 'text', text: rest }] : [])] : [{ type: 'text', text: rest }];
    const content = imgs.length || lead
      ? [...imgs.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.data } })), ...textBlocks]
      : rest;
    return {
      url: P.url, clamped,
      headers: { 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' },
      authHeader: 'x-api-key',
      body: {
        model, max_tokens, system: sys,
        ...(temperature == null ? {} : { temperature }),
        ...(effort ? { output_config: { effort } } : {}),
        messages: [{ role: 'user', content }],
      },
    };
  }

  // OpenAI-shaped: system is a message, and `standing` leads it so the stable half is
  // the prefix for whatever automatic caching the vendor does.
  const sysText = [standing, system].filter(Boolean).join('\n\n');
  return {
    url: P.url, clamped,
    headers: { 'Content-Type': 'application/json' },
    authHeader: 'Authorization', authPrefix: 'Bearer ',
    body: {
      model, max_tokens,
      ...(temperature == null ? {} : { temperature }),
      messages: [
        ...(sysText ? [{ role: 'system', content: sysText }] : []),
        { role: 'user', content: lead + rest },   // the cache mark removed; the vendor's automatic caching reads the same prefix
      ],
    },
  };
}

/** The finished headers, with the key put where this provider wants it. */
export function authHeaders(req, key) {
  if (!key) throw new Error('no API key for this provider');
  return { ...req.headers, [req.authHeader]: (req.authPrefix ?? '') + key };
}

/**
 * Pull the reply out, whichever shape it arrived in.
 *
 * `truncated` is reported rather than thrown so the caller keeps its existing retry: the
 * Anthropic path signals it with stop_reason 'max_tokens', the OpenAI path with
 * finish_reason 'length', and a caller that only knew one of them would retry on one
 * provider and return mangled JSON on the other.
 *
 * Finding the text by TYPE and not by index is deliberate and was learned the hard way:
 * adaptive thinking puts a thinking block at content[0], and content[0].text is then
 * undefined with no error raised anywhere.
 */
export function readResponse(provider, data) {
  const P = PROVIDERS[provider];
  if (!P) throw new Error(`unknown provider: ${provider}`);

  if (P.wire === 'anthropic') {
    const blocks = Array.isArray(data?.content) ? data.content : [];
    let text = '';
    for (const b of blocks) if (b?.type === 'text' && typeof b.text === 'string') { text = b.text; break; }
    const u = data?.usage ?? {};
    return {
      text,
      truncated: data?.stop_reason === 'max_tokens',
      stopReason: data?.stop_reason ?? null,
      usage: {
        in: u.input_tokens ?? null,
        out: u.output_tokens ?? null,
        cacheWrite: u.cache_creation_input_tokens ?? null,
        cacheRead: u.cache_read_input_tokens ?? null,
      },
    };
  }

  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  const u = data?.usage ?? {};
  // DeepSeek reports its automatic cache hit under prompt_cache_hit_tokens.
  const cacheRead = u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? null;
  return {
    text: typeof choice?.message?.content === 'string' ? choice.message.content : '',
    truncated: choice?.finish_reason === 'length',
    stopReason: choice?.finish_reason ?? null,
    usage: {
      in: u.prompt_tokens ?? null,
      out: u.completion_tokens ?? null,
      cacheWrite: null,
      cacheRead,
    },
  };
}

/**
 * What that call cost — in tokens always, in money only if someone configured a price.
 *
 * Prices move and vary by tier, and a fabricated number in a cost report is worse than
 * no cost report: it gets quoted later as though it were measured. `prices` is
 * {provider: {in, out, cacheRead, cacheWrite}} in currency units per MILLION tokens, and
 * with none supplied this returns tokens and `usd: null`.
 */
export function costOf(provider, usage = {}, prices = {}) {
  const p = prices[provider] ?? null;
  const tok = {
    in: usage.in ?? 0, out: usage.out ?? 0,
    cacheRead: usage.cacheRead ?? 0, cacheWrite: usage.cacheWrite ?? 0,
  };
  if (!p) return { ...tok, usd: null, priced: false };
  const per = (n, rate) => (rate == null ? 0 : (n / 1e6) * rate);
  return {
    ...tok, priced: true,
    usd: +(per(tok.in, p.in) + per(tok.out, p.out)
         + per(tok.cacheRead, p.cacheRead ?? p.in) + per(tok.cacheWrite, p.cacheWrite ?? p.in)).toFixed(5),
  };
}

/**
 * Read the whole configuration out of the environment.
 *
 * Keys are read but NEVER returned — `keys` holds booleans, so a config object can be
 * logged, cached, or served to the browser without leaking anything. The one rule that
 * matters in a file like this.
 */
export function configFromEnv(env = {}) {
  const keys = {}, models = {}, prices = {};
  for (const [name, P] of Object.entries(PROVIDERS)) {
    keys[name] = !!env[P.keyEnv];
    const U = name.toUpperCase();
    const id = env[`MODEL_${U}_ID`], mo = env[`MODEL_${U}_MAXOUT`], ctx = env[`MODEL_${U}_CONTEXT`];
    if (id || mo || ctx) models[name] = {
      ...(id ? { id } : {}), ...(mo ? { maxOutput: +mo } : {}), ...(ctx ? { context: +ctx } : {}),
    };
    const pin = env[`PRICE_${U}_IN`], pout = env[`PRICE_${U}_OUT`], pcr = env[`PRICE_${U}_CACHE_READ`];
    if (pin || pout) prices[name] = {
      in: pin ? +pin : null, out: pout ? +pout : null, cacheRead: pcr ? +pcr : null,
    };
  }
  const tasks = {};
  for (const t of Object.keys(TASK_CLASS)) {
    const v = env[`AI_TASK_${t.replace(/-/g, '_').toUpperCase()}`];
    if (v && PROVIDERS[v]) tasks[t] = v;
  }
  // AI_TASK_MODEL_<TASK>=<model id>[@provider] pins a model for one task; the provider defaults to anthropic.
  const taskModels = {};
  for (const t of Object.keys(TASK_CLASS)) {
    const v = env[`AI_TASK_MODEL_${t.replace(/-/g, '_').toUpperCase()}`];
    if (!v) continue;
    const [id, prov = 'anthropic'] = String(v).split('@');
    if (id && PROVIDERS[prov]) taskModels[t] = { id, provider: prov };
  }
  // AI_TASK_EFFORT_<TASK>=low|medium|high|xhigh|max (Anthropic only).
  const taskEffort = {};
  for (const t of Object.keys(TASK_CLASS)) {
    const v = env[`AI_TASK_EFFORT_${t.replace(/-/g, '_').toUpperCase()}`];
    if (['low', 'medium', 'high', 'xhigh', 'max'].includes(v)) taskEffort[t] = v;
  }
  return {
    provider: PROVIDERS[env.AI_PROVIDER] ? env.AI_PROVIDER : 'anthropic',
    cache: env.AI_CACHE !== '0',
    keys, models, prices, tasks, taskModels, taskEffort,
  };
}

/** True when this task hands the model the ledger and therefore needs it obeyed. */
export const carriesLedger = task => !!TASK_CLASS[task]?.ledger;
