#!/usr/bin/env bash
# Daily pull/push of the main checkout against origin/main.
# Run by the Windows scheduled task "MacroFX git daily sync" (see bottom of file).
#
# Safe by design: never stashes, never resets --hard, never force-pushes, never
# commits other sessions' uncommitted work. If anything looks off it stops and
# says why in .git/daily-sync.log.
#
# The one clean-up it does: an uncommitted file whose content is byte-identical to a
# version already committed on main (a session committed it from another checkout,
# or main has since moved on) is backed up to
# .git/daily-sync-backup/<date>/ and dropped, because it otherwise blocks every pull.

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO" || exit 1
LOG="$REPO/.git/daily-sync.log"
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
fail() { log "FAIL: $*"; exit 1; }

GITDIR="$(git rev-parse --git-dir)"
for f in MERGE_HEAD REBASE_HEAD CHERRY_PICK_HEAD; do
  [ -e "$GITDIR/$f" ] && fail "a $f is in progress - left alone"
done
[ -d "$GITDIR/rebase-merge" ] || [ -d "$GITDIR/rebase-apply" ] && fail "a rebase is in progress - left alone"

# index.lock: another git (VS Code, a session) is busy - wait up to 2 min
for i in $(seq 1 24); do [ -e "$GITDIR/index.lock" ] || break; sleep 5; done
[ -e "$GITDIR/index.lock" ] && fail "index.lock held for 2 min - skipped"

git fetch -q origin || fail "fetch failed"

# Keep the branch tracking origin/main so VS Code's Sync button does the same thing
[ "$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null)" = "origin/main" ] || {
  git branch -q --set-upstream-to=origin/main && log "upstream reset to origin/main"; }

# Drop uncommitted copies that are identical to origin/main (backed up first)
BK="$GITDIR/daily-sync-backup/$(date +%Y-%m-%d)"
git status --porcelain -uall | while IFS= read -r line; do
  st="${line:0:2}"; f="${line:3}"
  case "$st" in " M"|"??") ;; *) continue ;; esac
  have="$(git hash-object "$f" 2>/dev/null)" || continue
  # safe to drop if this exact content is already committed on main: the current
  # version, or any version from the incoming commits (committed, then superseded)
  match=""
  for c in origin/main $(git rev-list HEAD..origin/main -- "$f" 2>/dev/null); do
    [ "$(git rev-parse -q --verify "$c:$f" 2>/dev/null)" = "$have" ] && { match=1; break; }
  done
  [ -n "$match" ] || continue
  mkdir -p "$BK/$(dirname "$f")" && cp "$f" "$BK/$f" || continue
  if [ "$st" = "??" ]; then rm -f "$f"; else git checkout -q -- "$f"; fi
  log "dropped local copy identical to main: $f"
done

read -r AHEAD BEHIND < <(git rev-list --left-right --count HEAD...origin/main)

if [ "$BEHIND" -gt 0 ]; then
  if ! git merge -q --no-edit origin/main >> "$LOG" 2>&1; then
    git merge --abort 2>/dev/null
    fail "merge of origin/main did not go through (conflict or uncommitted files in the way) - aborted, nothing changed"
  fi
  log "pulled $BEHIND commit(s) from main"
fi

read -r AHEAD BEHIND < <(git rev-list --left-right --count HEAD...origin/main)
if [ "$AHEAD" -gt 0 ]; then
  # pre-push hook runs the guard tests; a failure stops the push
  git push -q origin HEAD:main >> "$LOG" 2>&1 || fail "push of $AHEAD commit(s) to main refused (guard tests or race) - will retry tomorrow"
  log "pushed $AHEAD commit(s) to main"
fi

DIRTY=$(git status --porcelain | wc -l)
log "OK in sync with main ($(git rev-parse --short HEAD)); $DIRTY uncommitted file(s) left for their owners"

# Scheduled task (created once):
#   schtasks /Create /TN "MacroFX git daily sync" /SC DAILY /ST 06:30 /F ^
#     /TR "\"C:\Program Files\Git\bin\bash.exe\" -lc '\"<repo>/scripts/git_daily_sync.sh\"'"
