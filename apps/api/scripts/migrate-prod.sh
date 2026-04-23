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

# First positional arg is the env file (default .env.prod). Everything
# after is passed through to `prisma migrate`. Defaults to `deploy`.
ENV_FILE="${1:-.env.prod}"
shift || true
PRISMA_ARGS=("$@")
if [ "${#PRISMA_ARGS[@]}" -eq 0 ]; then
  PRISMA_ARGS=("deploy")
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found in apps/api/."
  echo "  cp .env.prod.example .env.prod"
  echo "  # then paste your Supabase DB password into both URLs"
  exit 1
fi

# Parse KEY=VALUE lines safely. Skip comments, blanks, and any line
# that doesn't match. Tolerates:
#   - leading whitespace (copy-pasted indented lines)
#   - optional `export ` prefix (bash export syntax)
#   - whitespace around the `=`
#   - quoted or unquoted values
#   - \r line endings (Windows / copy from a .docx)
# Export the variables so the Prisma child process inherits them.
line_num=0
matched=0
skipped=0
matched_keys=()
while IFS= read -r line || [ -n "$line" ]; do
  line_num=$((line_num + 1))

  # Strip trailing CR from Windows-style line endings.
  line="${line%$'\r'}"

  # Trim leading whitespace.
  line="${line#"${line%%[![:space:]]*}"}"

  # Skip blanks and comments.
  case "$line" in
    ''|'#'*) continue ;;
  esac

  # Strip optional `export ` prefix.
  if [[ "$line" == export[[:space:]]* ]]; then
    line="${line#export}"
    line="${line#"${line%%[![:space:]]*}"}"
  fi

  # Match KEY[space]*=[space]*VALUE where KEY is a valid identifier.
  if [[ ! "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$ ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  key="${BASH_REMATCH[1]}"
  value="${BASH_REMATCH[2]}"

  # Strip matched surrounding quotes.
  if [[ "$value" == \"*\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' ]]; then
    value="${value:1:${#value}-2}"
  fi

  # Trim trailing whitespace on unquoted values (common when users paste
  # tabulated `name  value` pairs — the trailing column becomes garbage
  # suffix whitespace).
  value="${value%"${value##*[![:space:]]}"}"

  # shellcheck disable=SC2163
  export "$key=$value"
  matched=$((matched + 1))
  matched_keys+=("$key")
done < "$ENV_FILE"

echo "ℹ  Parsed $ENV_FILE: matched=$matched skipped=$skipped"
if [ "$matched" -gt 0 ]; then
  echo "   Keys: ${matched_keys[*]}"
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
echo "→ Running prisma migrate ${PRISMA_ARGS[*]} against:"
echo "  $masked"
echo

pnpm exec prisma migrate "${PRISMA_ARGS[@]}"
