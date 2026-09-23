#!/usr/bin/env node
/**
 * Will the server boot on Railway?
 *
 *   node analysis/deploy_precheck.mjs
 *
 * WHY THIS EXISTS. Three deploys failed in a row on 2026-09-23 with
 * ERR_MODULE_NOT_FOUND, and every one was the same shape: a module that exists on
 * this machine but was never `git add`ed. The server booted fine locally and could
 * not boot anywhere else, and because Railway keeps serving the previous container
 * the site looked healthy the whole time.
 *
 * The cause is this repo running concurrent sessions. One adds `import x from
 * './js/x.js'` to server.js and writes js/x.js; another runs `git add server.js` for
 * an unrelated change and ships the import without the file. A numstat on a
 * 30,000-line file will not show you a one-line insert that is not yours.
 *
 * So: walk the whole import graph from server.js and report anything reachable that
 * git does not know about. Transitive, because the second failure was a module
 * imported BY the module the first failure was about -- checking only server.js's
 * direct imports is what let it fail twice.
 *
 * Run before any push that touches server.js or adds a js/ module.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
const tracked = new Set(execSync('git ls-files', { maxBuffer: 64e6 }).toString().split('\n'));
const seen = new Set(), missing = [], untracked = [];
function walk(file) {
  if (seen.has(file)) return; seen.add(file);
  let src; try { src = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
    const abs = path.normalize(path.join(path.dirname(file), m[1])).split(path.sep).join('/');
    if (!fs.existsSync(abs)) { missing.push(`${abs}  <- ${file}`); continue; }
    if (!tracked.has(abs)) untracked.push(`${abs}  <- ${file}`);
    walk(abs);
  }
}
// fileURLToPath, not manual unescaping: a repo path with a space becomes %20 in a
// URL and chdir fails on it, which is how the first version of this line broke.
process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
walk('server.js');
console.log('modules reachable from server.js:', seen.size);
console.log('\nMISSING FROM DISK:');
console.log(missing.length ? missing.map(x => '  ' + x).join('\n') : '  none');
console.log('\nON DISK BUT UNTRACKED — these are what break the deploy:');
console.log(untracked.length ? [...new Set(untracked)].map(x => '  ' + x).join('\n') : '  none');

// Non-zero so this can gate a push. A path that does not exist is reported but NOT
// failed on: a comment showing example usage looks exactly like an import to a regex.
process.exit(untracked.length ? 1 : 0);
