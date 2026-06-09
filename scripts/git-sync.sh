#!/bin/bash
# Automatic git sync for the Card System repo.
# Commits local changes, rebases on remote, and pushes — safe to run on a timer.
set -uo pipefail

REPO="/Users/willylin/Desktop/vibe_coding/obsidian_card_sys"
BRANCH="main"
LOG="$REPO/.git/git-sync.log"
# launchd runs with a minimal env; make sure git + keychain helper are found.
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin:$PATH"

ts()  { date "+%Y-%m-%d %H:%M:%S"; }
log() { echo "[$(ts)] $*" >> "$LOG"; }

cd "$REPO" || { log "ERROR: cannot cd to repo"; exit 1; }

# Only ever touch the expected branch.
cur="$(git rev-parse --abbrev-ref HEAD)"
if [ "$cur" != "$BRANCH" ]; then
  log "skip: on branch '$cur', not '$BRANCH'"
  exit 0
fi

# Only sync when there is an actual change. A clean working tree = nothing to
# do, so exit immediately (no commit, no network pull, no push).
if [ -z "$(git status --porcelain)" ]; then
  exit 0
fi

# Stage everything and commit only if there is something to commit.
git add -A
if ! git diff --cached --quiet; then
  git commit -m "chore: auto-sync $(ts)" >> "$LOG" 2>&1 && log "committed local changes"
fi

# Integrate remote changes safely; abort on conflict instead of leaving a mess.
if ! git pull --rebase --autostash origin "$BRANCH" >> "$LOG" 2>&1; then
  log "ERROR: pull --rebase failed (likely conflict) — aborting rebase, leaving repo clean"
  git rebase --abort >> "$LOG" 2>&1
  exit 1
fi

# Push if we are ahead of origin.
if [ -n "$(git log --oneline origin/$BRANCH..$BRANCH 2>/dev/null)" ]; then
  if git push origin "$BRANCH" >> "$LOG" 2>&1; then
    log "push ok"
  else
    log "ERROR: push failed"
    exit 1
  fi
else
  log "nothing to push (in sync)"
fi
