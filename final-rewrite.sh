#!/bin/bash

cd /Users/shaileshchaudhary/Desktop/Coding/CodeSenseiSearch

# Backup
git branch backup-final 2>/dev/null || true

echo "🔄 Rewriting commit dates..."

# Direct filter-branch with explicit commit mappings
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --env-filter '
case $GIT_COMMIT in
    78ce25d*) export GIT_AUTHOR_DATE="2025-11-03 11:00:00 +0530"; export GIT_COMMITTER_DATE="2025-11-03 11:00:00 +0530" ;;
    91b4527*) export GIT_AUTHOR_DATE="2025-10-19 21:15:00 +0530"; export GIT_COMMITTER_DATE="2025-10-19 21:15:00 +0530" ;;
    c7a6822*) export GIT_AUTHOR_DATE="2025-10-19 16:30:00 +0530"; export GIT_COMMITTER_DATE="2025-10-19 16:30:00 +0530" ;;
    406d08c*) export GIT_AUTHOR_DATE="2025-10-05 14:20:00 +0530"; export GIT_COMMITTER_DATE="2025-10-05 14:20:00 +0530" ;;
    721daaa*) export GIT_AUTHOR_DATE="2025-09-22 18:45:00 +0530"; export GIT_COMMITTER_DATE="2025-09-22 18:45:00 +0530" ;;
    220e33d*) export GIT_AUTHOR_DATE="2025-09-08 17:15:00 +0530"; export GIT_COMMITTER_DATE="2025-09-08 17:15:00 +0530" ;;
    3676917*) export GIT_AUTHOR_DATE="2025-09-08 16:30:00 +0530"; export GIT_COMMITTER_DATE="2025-09-08 16:30:00 +0530" ;;
    5408e0f*) export GIT_AUTHOR_DATE="2025-09-02 15:30:00 +0530"; export GIT_COMMITTER_DATE="2025-09-02 15:30:00 +0530" ;;
    324c66e*) export GIT_AUTHOR_DATE="2025-08-15 15:45:00 +0530"; export GIT_COMMITTER_DATE="2025-08-15 15:45:00 +0530" ;;
    bf25337*) export GIT_AUTHOR_DATE="2025-08-15 10:30:00 +0530"; export GIT_COMMITTER_DATE="2025-08-15 10:30:00 +0530" ;;
    4be43a3*) export GIT_AUTHOR_DATE="2025-07-28 15:29:00 +0530"; export GIT_COMMITTER_DATE="2025-07-28 15:29:00 +0530" ;;
    8ec0591*) export GIT_AUTHOR_DATE="2025-07-14 11:45:00 +0530"; export GIT_COMMITTER_DATE="2025-07-14 11:45:00 +0530" ;;
    93ac3fb*) export GIT_AUTHOR_DATE="2025-07-13 14:45:00 +0530"; export GIT_COMMITTER_DATE="2025-07-13 14:45:00 +0530" ;;
    6087a46*) export GIT_AUTHOR_DATE="2025-07-12 20:30:00 +0530"; export GIT_COMMITTER_DATE="2025-07-12 20:30:00 +0530" ;;
    ff191e4*) export GIT_AUTHOR_DATE="2025-07-12 16:23:00 +0530"; export GIT_COMMITTER_DATE="2025-07-12 16:23:00 +0530" ;;
    6596e17*) export GIT_AUTHOR_DATE="2025-07-12 10:00:00 +0530"; export GIT_COMMITTER_DATE="2025-07-12 10:00:00 +0530" ;;
esac
' -- --all

echo ""
echo "✅ Rewrite complete! Timeline:"
git log --pretty=format:"%h %ad %s" --date=format:"%Y-%m-%d %H:%M" -16
echo ""
echo "To push: git push --force-with-lease origin main"