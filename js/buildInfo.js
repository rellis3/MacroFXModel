// js/buildInfo.js: which build is running. GET /api/version answers from this. Pure: the caller passes the environment, the clock and the
// two fallbacks (a git read at boot, the mtime of server.js), so it is testable without a server and can never leak the rest of the environment.
//
// Railway sets RAILWAY_GIT_COMMIT_SHA, RAILWAY_GIT_BRANCH and RAILWAY_DEPLOYMENT_ID on a deploy built from GitHub. It does NOT set a build time, so
// builtAt is the modified time of the deployed server.js (set when the image was built) and says so in builtAtSource. No secrets are read:
// only those three names are looked at.

const SHA = /^[0-9a-f]{7,40}$/i;
const clean = v => (typeof v === 'string' && v.trim() ? v.trim() : null);
const iso = ms => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

/**
 * @param {object} o
 * @param {object} [o.env]            process.env (only RAILWAY_GIT_COMMIT_SHA, RAILWAY_GIT_BRANCH, RAILWAY_DEPLOYMENT_ID are read)
 * @param {number} [o.startedAtMs]    when this process started
 * @param {number} [o.filesAtMs]      modified time of the deployed server.js, ms (null if unknown)
 * @param {string} [o.gitSha]         `git rev-parse HEAD` at boot, used only when Railway gave no commit (a local run)
 * @param {string} [o.gitBranch]      `git rev-parse --abbrev-ref HEAD`, same
 * @returns {{ok:true, sha:string, shortSha:string, branch:(string|null), builtAt:(string|null), builtAtSource:(string|null), startedAt:(string|null), deploymentId:(string|null), source:string}}
 */
export function buildInfo({ env = {}, startedAtMs = null, filesAtMs = null, gitSha = null, gitBranch = null } = {}) {
  const fromRailway = clean(env.RAILWAY_GIT_COMMIT_SHA), fromGit = clean(gitSha);
  const raw = [fromRailway, fromGit].find(v => v && SHA.test(v)) ?? null;
  const sha = raw ? raw.toLowerCase() : 'unknown';
  const source = raw ? (raw === fromRailway ? 'railway' : 'git') : 'unknown';
  const branch = clean(env.RAILWAY_GIT_BRANCH) ?? clean(gitBranch);
  return {
    ok: true, sha, shortSha: sha === 'unknown' ? 'unknown' : sha.slice(0, 7), branch,
    builtAt: iso(filesAtMs), builtAtSource: Number.isFinite(filesAtMs) ? 'server.js modified time' : null,
    startedAt: iso(startedAtMs), deploymentId: clean(env.RAILWAY_DEPLOYMENT_ID), source,
  };
}
