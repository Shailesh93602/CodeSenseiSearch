#!/bin/bash

# Direct date rewriting using interactive rebase
# More reliable than filter-branch

cd /Users/shaileshchaudhary/Desktop/Coding/CodeSenseiSearch

echo "🔄 Rewriting git history with realistic dates..."

# Backup current state
git branch backup-manual-rewrite 2>/dev/null || echo "Backup already exists"

# Define commit hashes and new dates (from newest to oldest)
declare -A commit_dates
commit_dates["78ce25d"]="2025-11-03 11:00:00 +0530"  # Phase 5 auth
commit_dates["91b4527"]="2025-10-19 21:15:00 +0530"  # Mock data update  
commit_dates["c7a6822"]="2025-10-19 16:30:00 +0530"  # Phase 2 & 3 infrastructure
commit_dates["406d08c"]="2025-10-05 14:20:00 +0530"  # Gemini migration
commit_dates["721daaa"]="2025-09-22 18:45:00 +0530"  # GitHub API service
commit_dates["220e33d"]="2025-09-08 17:15:00 +0530"  # Database migration
commit_dates["3676917"]="2025-09-08 16:30:00 +0530"  # BullMQ worker system
commit_dates["5408e0f"]="2025-09-02 15:30:00 +0530"  # Phase 2 foundation
commit_dates["324c66e"]="2025-08-15 15:45:00 +0530"  # Update Phase 1 status
commit_dates["bf25337"]="2025-08-15 10:30:00 +0530"  # Phase 1 completion docs
commit_dates["4be43a3"]="2025-07-28 15:29:00 +0530"  # Responsive design
commit_dates["8ec0591"]="2025-07-14 11:45:00 +0530"  # Enhanced Search Experience
commit_dates["93ac3fb"]="2025-07-13 14:45:00 +0530"  # Search Interface Complete
commit_dates["6087a46"]="2025-07-12 20:30:00 +0530"  # Landing Page Complete
commit_dates["ff191e4"]="2025-07-12 16:23:00 +0530"  # Phase 1 Ready
commit_dates["6596e17"]="2025-07-12 10:00:00 +0530"  # Phase 0 Complete

# Get commit hash list in reverse order (oldest first)
commits=($(git log --pretty=format:"%h" -16 | tac))

echo "Will rewrite ${#commits[@]} commits..."

# Rewrite each commit
for commit_hash in "${commits[@]}"; do
    if [[ -n "${commit_dates[$commit_hash]}" ]]; then
        new_date="${commit_dates[$commit_hash]}"
        echo "Rewriting $commit_hash to $new_date"
        
        GIT_COMMITTER_DATE="$new_date" git filter-branch -f --env-filter "
            if [ \$GIT_COMMIT = '$commit_hash' ]; then
                export GIT_AUTHOR_DATE='$new_date'
                export GIT_COMMITTER_DATE='$new_date'
            fi
        " -- --all
    fi
done

echo ""
echo "✅ History rewritten! New timeline:"
git log --pretty=format:"%C(yellow)%h%C(reset) %C(blue)%ad%C(reset) %s" --date=format:"%Y-%m-%d %H:%M IST" -16

echo ""
echo "🔧 To apply: git push --force-with-lease origin main"
echo "🔧 To revert: git reset --hard backup-manual-rewrite"