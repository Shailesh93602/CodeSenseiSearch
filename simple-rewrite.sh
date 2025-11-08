#!/bin/bash

# Simple git commit date rewriter
cd /Users/shaileshchaudhary/Desktop/Coding/CodeSenseiSearch

# Check if we have uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "❌ Please commit or stash your changes first"
    exit 1
fi

echo "🔄 Starting commit date rewrite..."

# Get commit list (newest first)  
commits=($(git log --pretty=format:"%H" -16))

# Dates array (oldest first to match the reverse order)
dates=(
    "2025-07-12 10:00:00 +0530"  # Phase 0 Complete
    "2025-07-12 16:23:00 +0530"  # Phase 1 Ready
    "2025-07-12 20:30:00 +0530"  # Landing Page Complete
    "2025-07-13 14:45:00 +0530"  # Search Interface Complete
    "2025-07-14 11:45:00 +0530"  # Enhanced Search Experience
    "2025-07-28 15:29:00 +0530"  # Responsive design
    "2025-08-15 10:30:00 +0530"  # Phase 1 completion docs
    "2025-08-15 15:45:00 +0530"  # Update Phase 1 status
    "2025-09-02 15:30:00 +0530"  # Phase 2 foundation
    "2025-09-08 16:30:00 +0530"  # BullMQ worker system
    "2025-09-08 17:15:00 +0530"  # Database migration
    "2025-09-22 18:45:00 +0530"  # GitHub API service
    "2025-10-05 14:20:00 +0530"  # Gemini migration
    "2025-10-19 16:30:00 +0530"  # Phase 2 & 3 infrastructure
    "2025-10-19 21:15:00 +0530"  # Mock data update
    "2025-11-03 11:00:00 +0530"  # Phase 5 auth
)

# Create backup
git branch backup-simple-rewrite 2>/dev/null || echo "Backup exists"

# Use filter-branch with proper environment
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --env-filter '
n=0
for commit in '$(printf "%s " "${commits[@]}")'; do
    if [ $GIT_COMMIT = $commit ]; then
        case $n in
            0) date="2025-11-03 11:00:00 +0530" ;;
            1) date="2025-10-19 21:15:00 +0530" ;;
            2) date="2025-10-19 16:30:00 +0530" ;;
            3) date="2025-10-05 14:20:00 +0530" ;;
            4) date="2025-09-22 18:45:00 +0530" ;;
            5) date="2025-09-08 17:15:00 +0530" ;;
            6) date="2025-09-08 16:30:00 +0530" ;;
            7) date="2025-09-02 15:30:00 +0530" ;;
            8) date="2025-08-15 15:45:00 +0530" ;;
            9) date="2025-08-15 10:30:00 +0530" ;;
            10) date="2025-07-28 15:29:00 +0530" ;;
            11) date="2025-07-14 11:45:00 +0530" ;;
            12) date="2025-07-13 14:45:00 +0530" ;;
            13) date="2025-07-12 20:30:00 +0530" ;;
            14) date="2025-07-12 16:23:00 +0530" ;;
            15) date="2025-07-12 10:00:00 +0530" ;;
        esac
        export GIT_AUTHOR_DATE="$date"
        export GIT_COMMITTER_DATE="$date"
        break
    fi
    n=$((n+1))
done
'

echo "✅ Done! New timeline:"
git log --oneline --date=format:"%m/%d %H:%M" --pretty=format:"%h %ad %s" -16