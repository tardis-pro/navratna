#!/bin/bash
set -euo pipefail

readonly WORKSPACE=/workspace
readonly SESSIONS_DIR=/workspace/.navratna/sessions
readonly APP_MAIN=/app/apps/backend/services/exec-node-coding/dist/index.js
readonly NFT_RULESET=/usr/local/share/uaip/nft-ruleset.nft
readonly EGRESS_MAIN=/usr/local/share/uaip/egress_bin.js
readonly APP_UID=1001
readonly APP_GID=1001
readonly EGRESS_UID=1002
readonly EGRESS_GID=1002

APP_PID=''
EGRESS_PID=''
SHUTTING_DOWN=0

fatal() {
  printf 'FATAL: %s\n' "$*" >&2
  exit 1
}

validate_directory() {
  local path="$1"
  [ ! -L "${path}" ] || fatal "${path} is a symbolic link"
  if [ -e "${path}" ]; then
    [ -d "${path}" ] || fatal "${path} exists but is not a directory"
  fi
}

wait_for_proxy() {
  local remaining=100
  while [ "${remaining}" -gt 0 ]; do
    if [ -n "${EGRESS_PID}" ] && ! kill -0 "${EGRESS_PID}" 2>/dev/null; then
      return 1
    fi
    if exec 3<>/dev/tcp/127.0.0.1/15443 2>/dev/null; then
      exec 3<&-
      exec 3>&-
      return 0
    fi
    sleep 0.05
    remaining=$((remaining - 1))
  done
  return 1
}

terminate_children() {
  [ "${SHUTTING_DOWN}" -eq 0 ] || return
  SHUTTING_DOWN=1
  [ -z "${APP_PID}" ] || kill -TERM "${APP_PID}" 2>/dev/null || true
  [ -z "${EGRESS_PID}" ] || kill -TERM "${EGRESS_PID}" 2>/dev/null || true
}

trap 'terminate_children' TERM INT

[ "$(id -u)" = '0' ] || fatal 'entrypoint must start as root'
[ -d "${WORKSPACE}" ] || fatal "${WORKSPACE} does not exist"
validate_directory "${WORKSPACE}"
validate_directory "${WORKSPACE}/.navratna"
validate_directory "${SESSIONS_DIR}"
if [ ! -d "${WORKSPACE}/.navratna" ]; then
  install -d -o "${APP_UID}" -g "${APP_GID}" -m 0750 "${WORKSPACE}/.navratna"
fi
if [ ! -d "${SESSIONS_DIR}" ]; then
  install -d -o "${APP_UID}" -g "${APP_GID}" -m 0750 "${SESSIONS_DIR}"
fi
chown --no-dereference "${APP_UID}:${APP_GID}" "${WORKSPACE}/.navratna" "${SESSIONS_DIR}"
chmod 0750 "${WORKSPACE}/.navratna" "${SESSIONS_DIR}"
chown "${APP_UID}:${APP_GID}" "${WORKSPACE}"
chmod 0750 "${WORKSPACE}"

[ -r "${NFT_RULESET}" ] || fatal "missing nftables ruleset ${NFT_RULESET}"
[ -r "${EGRESS_MAIN}" ] || fatal "missing egress service ${EGRESS_MAIN}"
[ -r "${APP_MAIN}" ] || fatal "missing app service ${APP_MAIN}"
/usr/sbin/nft -f "${NFT_RULESET}" || fatal 'failed to apply nftables ruleset'

readonly PROXY_URL=http://127.0.0.1:15443
readonly NO_PROXY_VALUE='127.0.0.1,::1,*.internal'

gosu "${EGRESS_UID}:${EGRESS_GID}" /usr/local/bin/bun "${EGRESS_MAIN}" >>/var/log/egress.log 2>&1 &
EGRESS_PID=$!
wait_for_proxy || fatal 'egress CONNECT proxy failed readiness check'

# Keep bash as the direct child of tini so it can supervise and reap both
# long-lived children. The untrusted app receives no private key and no token.
gosu "${APP_UID}:${APP_GID}" env \
  HTTPS_PROXY="${PROXY_URL}" \
  HTTP_PROXY="${PROXY_URL}" \
  ALL_PROXY="${PROXY_URL}" \
  NO_PROXY="${NO_PROXY_VALUE}" \
  UAIP_EGRESS_PROXY="${PROXY_URL}" \
  /usr/local/bin/bun "${APP_MAIN}" &
APP_PID=$!

while true; do
  set +e
  wait -n "${APP_PID}" "${EGRESS_PID}"
  status=$?
  set -e
  terminate_children
  wait "${APP_PID}" 2>/dev/null || true
  wait "${EGRESS_PID}" 2>/dev/null || true
  exit "${status}"
done
