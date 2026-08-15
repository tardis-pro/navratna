# exec-node-coding — UNUSABLE ON THIS DEPLOYMENT

**Status: quarantined, 2026-08-15. Do not wire this up.**

This package is genuinely good work, and that is precisely why it needs this
notice. Someone evaluating it on quality will conclude it is ready. It is not
usable here, and the reasons are structural rather than bugs to be fixed in
passing.

## What it does well

- A microVM per coding session, not a shared sandbox.
- A two-phase nftables egress jail: deny-all, then a narrow allowlist opened only
  after the session's scope is known.
- Scoped RS256 tokens, minted per session with a short TTL.
- Credential redaction on the way out of the node.
- `secure_git_clone.ts` verifies the resolved remote against the expected URL, so
  a swapped clone target is caught rather than trusted.

## Why it cannot be used here

1. **Fly.io machine driver.** `FlyMachineDriver`
   (`capability-registry/src/services/execution_mesh/fly_machine_driver.ts`) is
   the only machine backend. It requires `FLY_API_TOKEN`, `FLY_CODING_APP`,
   `FLY_CODING_IMAGE` and `FLY_CODING_PRIMARY_REGION`. This deployment is
   local-only; there is no Fly account in the path and no alternative driver.

2. **GitHub-only clone.** `src/session/secure_git_clone.ts` builds the expected
   remote as `https://github.com/${repositoryFullName}.git` and refuses anything
   else. That check is correct and worth keeping — but it makes a Gitea-hosted
   repository unclonable by construction, and this homelab runs Gitea.

3. **GitHub App credential path.** Session credentials come from
   `GitHubAppTokenBroker` (installation access tokens). There is no Gitea
   equivalent wired in.

The coding tier already fails closed on (1): `capability-registry/src/feature.ts`
checks `CODING_TIER_ENV` and skips the coding routes when any variable is
missing, rather than crashing the gateway. So an unconfigured deploy is safe —
the hazard is someone configuring it and finding out about (2) and (3) later.

## What would have to change

A machine driver that is not Fly, a clone-URL policy parameterised by forge host
rather than hardcoded to github.com, and a Gitea credential broker. That is a
project, not a patch.

## Related dead code

Both are quarantined for the same reason and are currently unreachable:

- `capability-registry/src/services/coding_agent_executor_service.ts` —
  `CodingAgentExecutor` is never constructed on any live path.
- `capability-registry/src/services/github_coding_extension.ts` —
  `GitHubCodingExtension` is never instantiated.

If you are about to use any of the above, check first whether the three blockers
have actually been resolved. They had not been as of the date at the top of this
file.
