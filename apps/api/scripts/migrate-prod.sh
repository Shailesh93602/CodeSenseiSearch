#!/usr/bin/env bash
# Apply Prisma migrations against the production Supabase DB using
# credentials from .env.prod.
#
# Why a bash script instead of the simpler `dotenv -e .env.prod -- prisma`
# pattern: Prisma auto-loads .env on every invocation, and that auto-load
# can clash with local-dev .env values that don't have DIRECT_URL set
# (Supabase requires both DATABASE_URL pooled + DIRECT_URL unpooled).
#
# Why we parse instead of `source .env.prod`: env files coming from
# `vercel env pull` or copy-pasted dashboard output often contain
# non-KEY=VALUE noise ("Environment Variables loaded...", headers,
# comments with colons) that bash's `source` would try to execute.
# This parser only accepts `KEY=VALUE` lines, ignoring everything else.
#
# Usage:
#   pnpm --filter api db:deploy:prod          # default file: .env.prod
#   pnpm --filter api db:deploy:prod .env.staging  # override

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${1:-.env.prod}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found in apps/api/."
  echo "  cp .env.prod.example .env.prod"
  echo "  # then paste your Supabase DB password into both URLs"
  exit 1
fi

# Parse KEY=VALUE lines safely. Skip comments, blanks, and any line
# that doesn't match `^[A-Z_][A-Z0-9_]*=`. Strip surrounding single
# or double quotes from the value. Export the variables so the
# Prisma child process inherits them.
line_num=0
skipped=0
while IFS= read -r line || [ -n "$line" ]; do
  line_num=$((line_num + 1))

  # Strip trailing CR from Windows-style line endings.
  line="${line%$'\r'}"

  # Skip blanks and comments.
  case "$line" in
    ''|'#'*) continue ;;
  esac

  # Only accept KEY=VALUE where KEY is a valid env-var identifier.
  if ! [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  key="${line%%=*}"
  value="${line#*=}"

  # Strip matched surrounding quotes.
  if [[ "$value" == \"*\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' ]]; then
    value="${value:1:${#value}-2}"
  fi

  # shellcheck disable=SC2163
  export "$key=$value"
done < "$ENV_FILE"

if [ "$skipped" -gt 0 ]; then
  echo "ℹ  Skipped $skipped non-KEY=VALUE line(s) in $ENV_FILE"
fi

if [ -z "${DATABASE_URL:-}" ] || [ -z "${DIRECT_URL:-}" ]; then
  echo "Error: DATABASE_URL or DIRECT_URL is empty in $ENV_FILE"
  echo "Both are required for Supabase migrations (pgbouncer needs the"
  echo "direct connection on port 5432 to handle prepared statements)."
  exit 1
fi

# Move .env out of the way so Prisma's auto-load doesn't clash with
# the values we just parsed from .env.prod.
RESTORE_ENV=false
if [ -f .env ]; then
  mv .env .env.local-backup-during-migrate
  RESTORE_ENV=true
fi
trap 'if [ "$RESTORE_ENV" = true ]; then mv .env.local-backup-during-migrate .env; fi' EXIT

# Mask the password in the echo'd URL so it doesn't end up in any
# CI log or scrollback.
masked=$(echo "$DATABASE_URL" | sed -E 's#:[^:@]+@#:****@#')
echo "→ Running prisma migrate deploy against:"
echo "  $masked"
echo

pnpm exec prisma migrate deploy
