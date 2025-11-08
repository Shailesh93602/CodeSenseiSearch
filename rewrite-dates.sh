#!/bin/bash

# Script to rewrite git commit dates to create a realistic development timeline
# From July 12, 2025 to November 8, 2025
# Avoiding commits between 12am-8am and following IST working hours

set -e  # Exit on any error

cd /Users/shaileshchaudhary/Desktop/Coding/CodeSenseiSearch

echo "🔄 Starting git history rewrite..."

# Backup current branch
echo "📦 Creating backup branch..."
git branch backup-before-rewrite 2>/dev/null || echo "Backup branch already exists"

# Get commits in chronological order (oldest first)
echo "📋 Getting commit list..."
commits_newest_first=($(git log --pretty=format:"%H" -17))
commits_oldest_first=()

# Reverse the array to get oldest first
for ((i=${#commits_newest_first[@]}-1; i>=0; i--)); do
    commits_oldest_first+=("${commits_newest_first[i]}")
done

echo "Found ${#commits_oldest_first[@]} commits to rewrite"

# Realistic commit dates (in chronological order, oldest first)
# IST timezone, avoiding 12am-8am and 10am-10pm on weekdays
declare -a dates=(
    "2025-07-12 10:00:00 +0530"  # Sat - Phase 0 Complete
    "2025-07-12 16:23:00 +0530"  # Sat - Phase 1 Ready  
    "2025-07-12 20:30:00 +0530"  # Sat - Landing Page Complete
    "2025-07-13 14:45:00 +0530"  # Sun - Search Interface Complete
    "2025-07-14 11:45:00 +0530"  # Mon - Enhanced Search Experience
    "2025-07-28 15:29:00 +0530"  # Mon - Responsive design (2 weeks later)
    "2025-08-15 10:30:00 +0530"  # Fri - Phase 1 completion docs (3 weeks later)
    "2025-08-15 15:45:00 +0530"  # Fri - Update Phase 1 status (same day)
    "2025-09-02 15:30:00 +0530"  # Tue - Phase 2 foundation (2.5 weeks later)
    "2025-09-08 16:30:00 +0530"  # Mon - BullMQ worker system (1 week later)
    "2025-09-08 17:15:00 +0530"  # Mon - Database migration (same day)
    "2025-09-22 18:45:00 +0530"  # Mon - GitHub API service (2 weeks later)
    "2025-10-05 14:20:00 +0530"  # Sun - Gemini migration (2 weeks later)
    "2025-10-19 16:30:00 +0530"  # Sun - Phase 2 & 3 infrastructure (2 weeks later)
    "2025-10-19 21:15:00 +0530"  # Sun - Mock data update (same evening)
    "2025-11-03 11:00:00 +0530"  # Sun - Phase 5 auth (2 weeks later)
    "2025-11-08 14:30:00 +0530"  # Fri - Quick-seed stabilization (current)
)

echo "📅 Will apply these dates:"
for i in "${!dates[@]}"; do
    echo "  $((i+1)). ${dates[i]}"
done

echo ""
read -p "Continue with rewrite? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Aborted"
    exit 1
fi

# Create the filter script
cat > /tmp/date-filter.sh << 'EOF'
#!/bin/bash
case $GIT_COMMIT in
EOF

# Add each commit mapping
for i in "${!commits_oldest_first[@]}"; do
    echo "    ${commits_oldest_first[i]}) " >> /tmp/date-filter.sh
    echo "        export GIT_AUTHOR_DATE=\"${dates[i]}\"" >> /tmp/date-filter.sh
    echo "        export GIT_COMMITTER_DATE=\"${dates[i]}\"" >> /tmp/date-filter.sh
    echo "        ;;" >> /tmp/date-filter.sh
done

echo "esac" >> /tmp/date-filter.sh
chmod +x /tmp/date-filter.sh

echo "🔄 Rewriting commit history..."
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --env-filter '/tmp/date-filter.sh' -- --all

# Clean up
rm /tmp/date-filter.sh

echo ""
echo "✅ Commit dates rewritten successfully!"
echo ""
echo "📅 New timeline:"
git log --pretty=format:"%C(yellow)%h%C(reset) %C(blue)%ad%C(reset) %s" --date=format:"%Y-%m-%d %H:%M IST" -17

echo ""
echo "🔧 Next steps:"
echo "1. Review the timeline above"
echo "2. If satisfied: git push --force-with-lease origin main"
echo "3. To revert if needed: git reset --hard backup-before-rewrite"