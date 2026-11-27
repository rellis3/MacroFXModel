# MacroFXModel: rules for every session

## Before you push to main

Every push to `main` runs the GitHub "Tests" job, deploys to Railway, and sends the owner an email if the job fails.
Almost every red run so far has been one cause: a **guard test** that checks a hand-kept list, failing because a
new file, page, route or fetch host was not added to that list. Fixing it takes one line, but if you skip it,
every push after yours fails as well.

1. Run the guard tests before pushing:
   ```
   echo "x 0 refs/heads/main 0" | sh .githooks/pre-push
   ```
   On a clone with `git config core.hooksPath .githooks` this runs automatically on `git push` to main.
   Cloud sessions don't have that hook, so run it by hand.
2. If one fails, the message names the list. Add your file or host there with a one-line reason. The usual ones:
   - `js/infoMap.js` `EXCLUDED_PAGES`: a new research page
   - `js/deskSnapshot.js` `FULL_EXCLUDED`: a new /api route not in the snapshot
   - `js/dataFeeds.js`: a new external host the server fetches from (a feed's `hosts`)
   - `js/biasEngineV2.test.mjs` A14: a new file that mentions Bias Engine V2
   - `js/commandHub.js`, `js/terminal/tabRegistry.js`, `js/serviceFlags.js`: new pages, tabs and services
3. Don't push with `--no-verify` to get past a red guard. The run fails in CI anyway, along with every push after it.

The full suite is `node scripts/run_tests.mjs` (what CI runs). Files listed in `tests/KNOWN_FAILING.json` don't fail the job.
