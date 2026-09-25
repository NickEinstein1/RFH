#!/usr/bin/env bash
# Apply RFH schema to a Supabase Postgres database.
# Usage:
#   export DIRECT_URL="postgresql://postgres.[ref]:[PASSWORD]@db.[ref].supabase.co:5432/postgres"
#   ./scripts/supabase-apply-schema.sh
#
# Or with local Supabase CLI:
#   npx supabase start && npx supabase db reset

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIG="$(ls -1 "$ROOT"/supabase/migrations/*_rfh_init.sql | head -1)"

if [[ -z "${DIRECT_URL:-}" && -z "${DATABASE_URL:-}" ]]; then
  echo "Set DIRECT_URL (or DATABASE_URL) to your Supabase Postgres connection string."
  echo "Dashboard → Project Settings → Database → Connection string (URI, direct)."
  exit 1
fi

URL="${DIRECT_URL:-$DATABASE_URL}"
# Strip prisma query params that psql rejects
URL_PSQL="$(echo "$URL" | sed -E 's/[?&](schema|pgbouncer|connection_limit)=[^&]*//g; s/\?$//')"

echo "Applying $MIG"
psql "$URL_PSQL" -v ON_ERROR_STOP=1 -f "$MIG"
echo "Done. Next: point apps/api/.env DATABASE_URL + DIRECT_URL at Supabase, then:"
echo "  npm run db:generate && npm run db:seed"
