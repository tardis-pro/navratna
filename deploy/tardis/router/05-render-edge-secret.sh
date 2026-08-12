#!/bin/sh
# Rendered before nginx starts (nginx-unprivileged runs /docker-entrypoint.d/*).
# The edge secret comes from the environment, not the image, and /etc/nginx is
# not writable by an arbitrary non-root uid — so render the include to /tmp,
# which the platform's runtime profile always provides as scratch.
set -e
printf 'proxy_set_header X-Edge-Auth "%s";\n' "${EDGE_AUTH_SECRET:-}" > /tmp/edge_secret.conf
echo "edge_secret.conf rendered"
