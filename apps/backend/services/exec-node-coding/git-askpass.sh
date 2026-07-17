#!/bin/sh
set -eu

case "${1:-}" in
  *Username*) printf '%s\n' 'x-access-token' ;;
  *) printf '%s\n' "${UAIP_GIT_TOKEN:?missing UAIP_GIT_TOKEN}" ;;
esac
