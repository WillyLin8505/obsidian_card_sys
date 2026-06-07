#!/bin/sh
# One-command sync: add all changes, commit with timestamp, push
git add -A

if git diff --cached --quiet; then
  echo "Nothing to commit, pushing anyway..."
  git push origin HEAD
else
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
  git commit -m "sync: $TIMESTAMP"
  # post-commit hook will auto-push
fi
