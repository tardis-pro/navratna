#!/usr/bin/env bash
# Run a command inside a `tardis dev` release with the deployed service's env.
#
#   tardis dev 'bash scripts/with_stack_env.sh bun some/migration.ts --apply' -s navratna-gateway
#
# WHY THIS EXISTS: a dev release does NOT inherit the deployed service's
# environment. It gets Kubernetes service-link vars instead — POSTGRES_PORT
# arrives as `tcp://10.43.x.x:5432`, which is not a port — and no POSTGRES_URL at
# all. On top of that @uaip/config validates JWT_SECRET eagerly at import, so
# even a migration that signs nothing fails to load without it.
#
# Values are read from the uploaded .tardis/stack.yml rather than passed on the
# command line, which would put the database password into `tardis dev status`
# output and the pod spec.
set -uo pipefail

read_env() { grep -m1 "  $1:" .tardis/stack.yml | sed "s/.*$1: *\"//; s/\"$//"; }

POSTGRES_URL=$(read_env POSTGRES_URL)
REDIS_URL=$(read_env REDIS_URL)
export POSTGRES_URL REDIS_URL

# The bullmq client is built from discrete redis vars, not the URL.
REDIS_HOST=$(printf '%s' "$REDIS_URL" | sed 's|redis://||; s|.*@||; s|:.*||')
REDIS_PORT=$(printf '%s' "$REDIS_URL" | sed 's|.*:||')
REDIS_PASSWORD=$(printf '%s' "$REDIS_URL" | sed -n 's|redis://:\([^@]*\)@.*|\1|p')
export REDIS_HOST REDIS_PORT REDIS_PASSWORD

for name in JWT_SECRET JWT_REFRESH_SECRET DELETION_HASH_SALT; do
  value=$(read_env "$name")
  [ -n "$value" ] && export "${name}=${value}"
done

echo "SE| postgres $(printf '%s' "$POSTGRES_URL" | sed 's|.*@||')  redis ${REDIS_HOST}:${REDIS_PORT}  jwt $( [ -n "${JWT_SECRET:-}" ] && echo ok || echo MISSING )"
echo "SE| running: $*"
"$@"
status=$?
echo "SE| exit=$status"
# Hold the process open so tardis dev does not read the exit as a crash and
# restart-loop the command.
sleep 900
