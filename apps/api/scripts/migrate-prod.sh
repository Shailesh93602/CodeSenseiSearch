#!/usr/bin/env bash
# Apply Prisma migrations against the production Supabase DB using
# credentials from .env.prod.
#
# Why a bash script instead of the simpler `dotenv -e .env.prod -- prisma`
# pattern: Prisma auto-loads .env on every invocation, and that auto-load
# can clash with local-dev .env values that don't have DIRECT_URL set
# (Supabase requires both DATABASE_URL pooled + DIRECT_URL unpooled).
#
# This script:
#   1. sources .env.prod via plain bash so the values land in the env
#      that the spawned Prisma process inherits
#   2. temporarily moves any existing .env out of the way so Prisma
#      doesn't auto-load it and override our values
#   3. restores .env on exit no matter what
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

# Load the env file into the current shell — `set -a` exports
# everything until `set +a`.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [ -z "${DATABASE_URL:-}" ] || [ -z "${DIRECT_URL:-}" ]; then
  echo "Error: DATABASE_URL or DIRECT_URL is empty in $ENV_FILE"
  echo "Both are required for Supabase migrations (pgbouncer needs the"
  echo "direct connection on port 5432 to handle prepared statements)."
  exit 1
fi

# Move .env out of the way so Prisma's auto-load doesn't clash with
# the values we just sourced from .env.prod.
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
