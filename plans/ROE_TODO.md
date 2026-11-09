# ROE: what we need to do (kept up to date as we go)

Last updated 2026-11-09 (after P3).

## Owner actions (only you can do these)
1. **Set `ROE_PUSH_TOKEN`**: the same long random text (24+ characters) on Railway and as a laptop environment variable. Until then `python -m roe --push` is refused.
2. **Refresh the stale laptop inputs**: COT (last 2026-10-20), several Cboe csv files, T10Y3M from FRED. Seven of the ten starting items ran on stale inputs in the first dry run.
3. **Copy `roe/sources.default.json` to `roe_sources.laptop.json`** and point it at your real local files; then schedule the daily run (Windows `schtasks` or cron line in `roe/README.md`).
4. **First real run**: `python -m roe --push`, then open `roe.html` and tell me what reads wrong or is missing.
5. **Decide** (later, not blocking): whether the desk should ever see ROE output (today: no, by your standing rule).

## Questions waiting for you
- Is the question wording what you would want to read? (Open `roe.html` after the first push.)
- Item 4 (`hl_p75`, realised range vs the shipped line) is switched off because it uses a lockbox-adjacent layer. Leave off until the one evaluation has run?
- Library cleanup: duplicate papers and author-name titles. OK to tidy?
- Library no-login window closes by itself 2026-11-09 06:00 UTC (already passed: the library is login-gated again unless extended).

## Build backlog, in order
| Phase | What | Needs from you |
|---|---|---|
| P3 | Question writer (rules), questions travel with the push, de-dup by spec, `roe.html` board (grouped, no scores) | built |
| P4 | Historical evaluator: Stage 1 and Stage 2 on the allowed windows, baseline, power, Holm/BH/BY. The biggest piece, because `/api/state` is not a history source | nothing yet; I will propose the data path first |
| P5 | Research QA gate (effective sample size, six outcomes) | owner approval of the Head of Research role text |
| P6 | Open-case button, the three approvals (you authorise Research approved and Design approved; deterministic Acceptance Check sets Validation approved) | your say on the button wording |
| P7 | Forward tracker (Stage 3), shown only after the lockbox evaluation | none |
| P8 | Optional capped DeepSeek wording tidy; remaining watch items (23 of 72 built) | cost cap approval if wanted |

## Known gaps outside the ROE (from the architecture review)
Red team challenging the Head of Desk's final conclusions; paper versioning; Agent Operating Framework (one contract per agent); shared analyst output schema; library duplicates.
