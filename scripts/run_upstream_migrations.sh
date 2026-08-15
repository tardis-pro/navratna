#!/usr/bin/env bash
# Runs the remaining upstream migrations inside a `tardis dev` release.
#
# The dev release does NOT inherit the deployed service's environment — it gets
# Kubernetes service-link vars instead (POSTGRES_PORT=tcp://10.43.x.x:5432) and
# no POSTGRES_URL — so the connection details are read here from the uploaded
# .tardis/stack.yml rather than passed on the command line, which would put the
# password into `tardis dev status` output and the pod spec.
#
#   bash scripts/run_upstream_migrations.sh            # dry run
#   bash scripts/run_upstream_migrations.sh --apply    # apply
set -uo pipefail

APPLY="${1:-}"

POSTGRES_URL=$(grep -m1 'POSTGRES_URL:' .tardis/stack.yml | sed 's/.*POSTGRES_URL: *"//; s/"$//')
REDIS_URL=$(grep -m1 'REDIS_URL:' .tardis/stack.yml | sed 's/.*REDIS_URL: *"//; s/"$//')
export POSTGRES_URL REDIS_URL

# The bullmq cleanup builds its client from config.redis.{host,port,password},
# which is populated from discrete vars, so derive them from the URL.
REDIS_HOST=$(printf '%s' "$REDIS_URL" | sed 's|redis://||; s|.*@||; s|:.*||')
REDIS_PORT=$(printf '%s' "$REDIS_URL" | sed 's|.*:||')
REDIS_PASSWORD=$(printf '%s' "$REDIS_URL" | sed -n 's|redis://:\([^@]*\)@.*|\1|p')
export REDIS_HOST REDIS_PORT REDIS_PASSWORD

# @uaip/config validates eagerly at import time and throws without these, even
# though a migration signs nothing. Taken from stack.yml rather than faked so the
# process behaves exactly as the deployed service would.
for name in JWT_SECRET JWT_REFRESH_SECRET DELETION_HASH_SALT; do
  value=$(grep -m1 "  ${name}:" .tardis/stack.yml | sed "s/.*${name}: *\"//; s/\"$//")
  [ -n "$value" ] && export "${name}=${value}"
done

echo "LM| postgres host: $(printf '%s' "$POSTGRES_URL" | sed 's|.*@||')"
echo "LM| jwt secret: $( [ -n "${JWT_SECRET:-}" ] && echo present || echo MISSING )"
echo "LM| redis host: ${REDIS_HOST}:${REDIS_PORT} (password $( [ -n "$REDIS_PASSWORD" ] && echo set || echo unset ))"

echo "LM| ===== link project to mcp server ====="
bun apps/shared/services/src/database/migrations/link_project_to_mcp_server.ts \
  --slug navratna --name Navratna --server-key navratna
echo "LM| link exit=$?"

echo "LM| ===== bullmq v5 repeat keys ====="
if [ "$APPLY" = "--apply" ]; then
  bun apps/shared/services/src/database/migrations/purge_bullmq_v5_repeat_keys.ts --apply
else
  bun apps/shared/services/src/database/migrations/purge_bullmq_v5_repeat_keys.ts
fi
echo "LM| redis exit=$?"

echo "LM| ===== DONE ====="
# Hold the process open so tardis dev does not treat the exit as a crash and
# restart-loop the whole thing.
sleep 900
