#!/usr/bin/env bash
# Daily pull/push of the main checkout against origin/main.
# Run by the Windows scheduled task "MacroFX git daily sync" (06:30, see bottom of file).
#
# Safe by design: never stashes, never resets --hard, never force-pushes, never
# commits other sessions' uncommitted work. If anything looks off it stops and
# says why in .git/daily-sync.log.
#
# The one clean-up it does: an uncommitted file whose content is byte-identical to a
# version already committed on main (a session committed it from another checkout,
# or main has since moved on) is backed up to .git/daily-sync-backup/<date>/ and
# dropped, because it otherwise blocks every pull.
#
# Everything runs inside main() so bash has parsed the whole script before it starts:
# editing this file while a run is in progress can't corrupt that run.

main() {
  REPO="$(cd "$(dirname "$0")/.." && pwd)"
  cd "$REPO" || exit 1
  LOG="$REPO/.git/daily-sync.log"
  log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
  fail() { log "FAIL: $*"; exit 1; }

  GITDIR="$(git rev-parse --git-dir)"
  for f in MERGE_HEAD REBASE_HEAD CHERRY_PICK_HEAD; do
    [ -e "$GITDIR/$f" ] && fail "a $f is in progress - left alone"
  done
  { [ -d "$GITDIR/rebase-merge" ] || [ -d "$GITDIR/rebase-apply" ]; } && fail "a rebase is in progress - left alone"

  # index.lock: another git (VS Code, a session) is busy - wait up to 2 min
  for i in $(seq 1 24); do [ -e "$GITDIR/index.lock" ] || break; sleep 5; done
  [ -e "$GITDIR/index.lock" ] && fail "index.lock held for 2 min - skipped"

  # network can lag after the PC wakes: retry for up to ~10 min
  for i in 1 2 3 4 5 6 7 8 9 10; do
    git fetch -q origin 2>/dev/null && break
    [ "$i" = 10 ] && fail "fetch failed 10 times (no network?)"
    sleep 60
  done

  # Keep the branch tracking origin/main so VS Code's Sync button does the same thing
  [ "$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null)" = "origin/main" ] || {
    git branch -q --set-upstream-to=origin/main && log "upstream reset to origin/main"; }

  # Drop uncommitted copies already committed on main (backed up first). Batched:
  # one tree listing + one log + one hash pass, not git calls per file.
  TMP="$(mktemp -d)"
  git status --porcelain -uall | grep -E '^( M|\?\?) ' | cut -c4- > "$TMP/dirty"
  if [ -s "$TMP/dirty" ]; then
    # every "path<TAB>blob" main has had: its current tree + versions in the incoming commits
    { git ls-tree -r origin/main | awk -F'\t' '{split($1,a," "); print $2 "\t" a[3]}'
      git log --format= --raw --no-abbrev --no-renames HEAD..origin/main | awk -F'\t' 'NF==2{split($1,a," "); print $2 "\t" a[4]}'
    } | sort -u > "$TMP/known"
    awk -F'\t' 'NR==FNR{p[$1]=1; next} ($0 in p)' "$TMP/known" "$TMP/dirty" > "$TMP/cand"
    if [ -s "$TMP/cand" ]; then
      git hash-object --stdin-paths < "$TMP/cand" > "$TMP/hash"
      paste "$TMP/cand" "$TMP/hash" | grep -Fxf "$TMP/known" | cut -f1 > "$TMP/drop"
      BK="$GITDIR/daily-sync-backup/$(date +%Y-%m-%d)"
      n=0
      while IFS= read -r f; do
        mkdir -p "$BK/$(dirname "$f")" && cp "$f" "$BK/$f" || continue
        if git ls-files --error-unmatch -- "$f" >/dev/null 2>&1; then git checkout -q -- "$f"; else rm -f "$f"; fi
        echo "    $f" >> "$LOG"; n=$((n+1))
      done < "$TMP/drop"
      [ "$n" -gt 0 ] && log "dropped $n local copie(s) already committed on main (listed above; backup in $BK)"
    fi
  fi
  rm -rf "$TMP"

  read -r AHEAD BEHIND < <(git rev-list --left-right --count HEAD...origin/main)
  if [ "$BEHIND" -gt 0 ]; then
    if ! git merge -q --no-edit --no-progress origin/main >> "$LOG" 2>&1; then
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
  exit 0
}

main "$@"

# Scheduled task (created once, PowerShell):
#   Register-ScheduledTask -TaskName 'MacroFX git daily sync' -Trigger (New-ScheduledTaskTrigger -Daily -At 6:30am)
#     -Action (New-ScheduledTaskAction -Execute 'C:\Program Files\Git\bin\bash.exe' -Argument '-lc "./scripts/git_daily_sync.sh"' -WorkingDirectory <repo>)
#     -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries)
