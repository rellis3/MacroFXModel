#!/usr/bin/env bash
# Daily pull/push of the main checkout against origin/main.
# Run by the Windows scheduled task "MacroFX git daily sync" (06:30, see bottom of file).
#
# Safe by design: never stashes, never resets --hard, never force-pushes, never
# commits other sessions' uncommitted work. If anything looks off it stops and
# says why in .git/daily-sync.log.
#
# Why it doesn't just run `git merge`: sessions often leave uncommitted copies of files
# that were then committed to main from another checkout. `git merge` refuses to run
# over them, and deleting them first so git can recreate them is NOT safe in a OneDrive
# folder: OneDrive replays the delete minutes/hours later and wipes the recreated files
# (2026-11-26: 122 committed files lost from the folder that way). So the pull is done
# inside git (merge-tree -> commit -> index) and the working tree is only ever updated
# IN PLACE, path by path, and only where the local file is a version git already knows:
#   - the file as it is on HEAD (untouched)            -> updated to the new version
#   - already the new version                          -> left alone (nothing written)
#   - an older version committed in the incoming commits (stale copy) -> backed up, updated
#   - anything else (someone's live edit)              -> whole pull aborted, nothing changed
#
# Everything runs inside main() so bash has parsed the whole script before it starts:
# editing this file while a run is in progress can't corrupt that run.

main() {
  REPO="$(cd "$(dirname "$0")/.." && pwd)"
  cd "$REPO" || exit 1
  LOG="$(git rev-parse --absolute-git-dir)/daily-sync.log"
  log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
  fail() { log "FAIL: $*"; rm -rf "$TMP"; exit 1; }
  TMP="$(mktemp -d)"

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

  # staged changes belong to someone mid-commit: leave everything alone
  git diff --cached --quiet || fail "the index has staged changes (someone mid-commit) - left alone"

  read -r AHEAD BEHIND < <(git rev-list --left-right --count HEAD...origin/main)
  if [ "$BEHIND" -gt 0 ]; then
    OLD="$(git rev-parse HEAD)"
    # 1. the merged commit, built without touching the working tree
    if git merge-base --is-ancestor HEAD origin/main; then
      NEW="$(git rev-parse origin/main)"
    else
      TREE="$(git merge-tree --write-tree HEAD origin/main 2>/dev/null)" || fail "main conflicts with local commits - needs a hand merge"
      NEW="$(git commit-tree "$TREE" -p HEAD -p origin/main -m "Merge origin/main (daily sync)")" || fail "commit-tree failed"
    fi

    # 2. paths the pull changes, with their HEAD and new blobs
    git diff --no-renames --raw --no-abbrev "$OLD" "$NEW" | awk -F'\t' '{split($1,a," "); print $2 "\t" a[3] "\t" a[4]}' > "$TMP/changed"
    # every blob each path has had in the incoming commits (older committed versions)
    git log --format= --raw --no-abbrev --no-renames "$OLD..origin/main" | awk -F'\t' 'NF==2{split($1,a," "); print $2 "\t" a[4]}' | sort -u > "$TMP/seen"
    cut -f1 "$TMP/changed" > "$TMP/paths"
    # current local blob per path ("-" when the file is absent); one hash pass
    : > "$TMP/have"
    while IFS= read -r p; do [ -f "$p" ] && echo "$p" >> "$TMP/exist"; done < "$TMP/paths"
    [ -s "$TMP/exist" ] && paste "$TMP/exist" <(git hash-object --stdin-paths < "$TMP/exist") > "$TMP/have"
    Z=0000000000000000000000000000000000000000
    awk -F'\t' -v Z="$Z" -v OUT="$TMP" '
      FILENAME==ARGV[1] { have[$1]=$2; next }
      FILENAME==ARGV[2] { seen[$1 "\t" $2]=1; next }
      {
        p=$1; old=$2; new=$3; h=(p in have) ? have[p] : "-"
        if (new == Z) {                                   # main deleted it
          if (h == "-")        next                       # already gone
          else if (h == old)   print p > (OUT "/del")
          else                 print p > (OUT "/block")
        } else {
          if (h == new)        next                       # already the new version: write nothing
          else if (h == "-" && old == Z) print p > (OUT "/write")      # new file
          else if (h == old)   print p > (OUT "/write")                # untouched -> update
          else if (seen[p "\t" h]) { print p > (OUT "/write"); print p > (OUT "/stale") }
          else                 print p > (OUT "/block")                # live edit, or deleted locally
        }
      }' "$TMP/have" "$TMP/seen" "$TMP/changed"

    if [ -s "$TMP/block" ]; then
      log "would overwrite local work in:"; sed 's/^/    /' "$TMP/block" >> "$LOG"
      fail "pull skipped: $(wc -l < "$TMP/block") file(s) above have uncommitted changes main also changes - nothing touched"
    fi

    # 3. back up stale copies, then move HEAD + index, then write files in place
    if [ -s "$TMP/stale" ]; then
      BK="$GITDIR/daily-sync-backup/$(date +%Y-%m-%d)"
      while IFS= read -r p; do mkdir -p "$BK/$(dirname "$p")" && cp "$p" "$BK/$p"; done < "$TMP/stale"
      log "replaced $(wc -l < "$TMP/stale") stale local copie(s) of files main has since updated (backup in $BK)"
    fi
    git read-tree -m -i "$OLD" "$NEW" || fail "read-tree failed - nothing changed"
    git update-ref -m "daily sync: pull origin/main" HEAD "$NEW" "$OLD" || { git read-tree "$OLD"; fail "update-ref failed - put back"; }
    if [ -s "$TMP/write" ]; then
      tr '\n' '\0' < "$TMP/write" | git checkout-index -f -z --stdin || log "WARN: some files could not be written - run git status"
    fi
    git update-index -q --refresh >/dev/null 2>&1
    [ -s "$TMP/del" ] && while IFS= read -r p; do rm -f -- "$p"; done < "$TMP/del"
    log "pulled $BEHIND commit(s) from main ($(wc -l < "$TMP/write" 2>/dev/null || echo 0) file(s) written in place, $(cat "$TMP/del" 2>/dev/null | wc -l) removed by main)"
  fi

  read -r AHEAD BEHIND < <(git rev-list --left-right --count HEAD...origin/main)
  if [ "$AHEAD" -gt 0 ]; then
    # pre-push hook runs the guard tests; a failure stops the push
    git push -q origin HEAD:main >> "$LOG" 2>&1 || fail "push of $AHEAD commit(s) to main refused (guard tests or race) - will retry tomorrow"
    log "pushed $AHEAD commit(s) to main"
  fi

  rm -rf "$TMP"
  DIRTY=$(git status --porcelain | wc -l)
  log "OK in sync with main ($(git rev-parse --short HEAD)); $DIRTY uncommitted file(s) left for their owners"
  exit 0
}

main "$@"

# Scheduled task (created once, PowerShell):
#   Register-ScheduledTask -TaskName 'MacroFX git daily sync' -Trigger (New-ScheduledTaskTrigger -Daily -At 6:30am)
#     -Action (New-ScheduledTaskAction -Execute 'C:\Program Files\Git\bin\bash.exe' -Argument '-lc "./scripts/git_daily_sync.sh"' -WorkingDirectory <repo>)
#     -Settings (New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries)
