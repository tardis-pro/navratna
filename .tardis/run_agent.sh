#!/usr/bin/env bash
# The coding agent, behind one seam.
#
# Everything around this script — fetching the task, injecting context, making
# the branch, committing, pushing, opening the PR, reporting the verdict — is
# fixed. The choice of model and CLI is not, and it will change: jcode today, a
# local model on the GPU eventually. So the whole choice lives here, in one file
# that takes a prompt and a directory and returns an exit code.
#
# THE CONTRACT, which the harness depends on:
#
#   * non-interactive, with a useful exit code. Anything that opens a prompt or
#     waits for a key hangs a CI job until it times out.
#   * takes INJECTED context rather than crawling the repo. This is the whole
#     cheap-tokens argument: `codegraph explore` already emits the relevant
#     symbols, their blast radius and their covering tests, so paying a model to
#     rediscover that by reading files is the single largest avoidable cost on a
#     260k-line repo.
#   * WRITES FILES ONLY. It must not run git, push, or open a PR. The harness
#     does all of that, because that is what keeps "the agent proposed a change"
#     and "the change reached a branch" as two separately auditable facts.
#   * swappable, which is why nothing above this file names jcode.
#
# ON THE DEFAULT COMMAND: jcode takes its prompt as a STRING ARGUMENT —
# `jcode run "…"` — and has no --prompt-file flag. An earlier version of this
# file guessed `jcode run --prompt-file {prompt}` and said so honestly; the guess
# was wrong, which is why it is now handled explicitly below rather than through
# the template.
#
# That distinction is the whole reason jcode is special-cased. The {prompt}
# placeholder substitutes a PATH, and a path is what most agents want. jcode
# wants the CONTENT, and content cannot go through the template safely: the
# command line is word-split before exec, so a multi-line prompt would arrive as
# hundreds of separate arguments. Reading the file and passing it as one quoted
# argument is the only correct way to hand it over.
#
# TARDIS_AGENT_CMD remains the supported override for anything else, with
# {prompt} (path) and {workdir} substituted and nothing else.
#
# Run it EPHEMERALLY. `jcode run` per task, not `jcode serve`: the persistent
# server holds embeddings, a file-watch graph and session state, which earns its
# keep when an agent works continuously on one repo and does not when the fleet
# is bursty across five. A long-lived server would put a stateful service on a
# box with ~7 GB free and add another thing to back up, to buy warmth that a
# 14 ms boot makes unnecessary.
set -euo pipefail

PROMPT="${1:-}"
WORKDIR="${2:-$PWD}"

[ -n "$PROMPT" ] || { echo "usage: run_agent.sh <prompt-file> [workdir]" >&2; exit 2; }
[ -f "$PROMPT" ] || { echo "run_agent.sh: no prompt file at $PROMPT" >&2; exit 2; }
[ -d "$WORKDIR" ] || { echo "run_agent.sh: no working directory at $WORKDIR" >&2; exit 2; }

# Written as two statements, not `${TARDIS_AGENT_CMD:-jcode ... {prompt}}`.
# The default contains a closing brace, which ends the parameter expansion right
# there — bash takes the default as `... {prompt` and appends a literal `}` to
# whatever the operator actually set. The override then arrives with a stray
# brace glued to its last argument, which is exactly the kind of failure that
# looks like the agent mangling a path.
AGENT_CMD="${TARDIS_AGENT_CMD:-}"
[ -n "$AGENT_CMD" ] || AGENT_CMD='jcode run {prompt}'
BIN="${AGENT_CMD%% *}"

# FAIL, DO NOT SKIP.
#
# A missing agent that exits 0 produces a job that runs, commits nothing, and
# reports success — which is indistinguishable from "the model had nothing to
# change" and is the exact failure mode this platform keeps finding in itself. An
# absent tool is an error.
if ! command -v "$BIN" >/dev/null 2>&1; then
  cat >&2 <<EOF
run_agent.sh: coding agent '$BIN' is not installed on this runner.

This job cannot propose a change without it. Either install the agent on the
runner image, or point TARDIS_AGENT_CMD at one that is present:

  TARDIS_AGENT_CMD='my-agent --prompt {prompt} --dir {workdir}'

Placeholders: {prompt} = the prompt file, {workdir} = the checkout.
EOF
  exit 127
fi

echo "run_agent.sh: $BIN, working in $WORKDIR"
cd "$WORKDIR"

# jcode reads its prompt as one argument. Quoted deliberately: the prompt holds
# newlines, code snippets and log excerpts, and any of those unquoted would be
# split into separate arguments or, worse, interpreted.
if [ "$BIN" = jcode ] && [ "$AGENT_CMD" = 'jcode run {prompt}' ]; then
  exec jcode run "$(cat "$PROMPT")"
fi

CMD="${AGENT_CMD//\{prompt\}/$PROMPT}"
CMD="${CMD//\{workdir\}/$WORKDIR}"
# Deliberately word-split: AGENT_CMD is a command line, supplied by the operator
# through CI configuration, not by anything the model produced.
# shellcheck disable=SC2086
exec $CMD
