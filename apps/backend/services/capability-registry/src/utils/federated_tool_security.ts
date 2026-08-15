/**
 * What security level a federated tool is registered at.
 *
 * Lives apart from federation_registry_service so the rule can be read and tested
 * without dragging in the database clients that service imports.
 *
 * Everything not named here stays 'medium'. That is not a considered per-tool
 * policy — it is the value syncTools has always stamped on every federated tool,
 * and getRequiredSecurityLevel() falls back to MEDIUM for anything unrecognised
 * besides, so 143 of the 147 registered tools carry it. The effect was that
 * platform-initiated work could not read its own project's diagnostics: the
 * system actor resolves to level 1 by design (an inactive user always does, and
 * EnsureSystemActor keeps that account inactive precisely so it cannot be logged
 * into), leaving a scheduled run one level below a read-only metrics query.
 *
 * Narrow on purpose. These four return findings, log lines, HTTP status
 * breakdowns and a release list — they change nothing. Write-capable tools on the
 * same server (create_task, restart, rollback, write_dev_file) are deliberately
 * NOT here: a caller that cannot be logged into should be able to look, not to
 * act. Reaching those needs a run to carry a real owner identity, which is a
 * separate decision from this one.
 */
const READ_ONLY_EVIDENCE_TOOLS: ReadonlySet<string> = new Set([
  'find_anomalies',
  'recent_errors',
  'http_errors',
  'release_history',
]);

/**
 * Applied at sync time rather than to the stored rows, so a later re-sync cannot
 * quietly restore the old level.
 *
 * Takes the producer-local tool name, not the `federation:<subdomainId>:<name>`
 * registry id.
 */
export function federatedToolSecurityLevel(toolName: string): 'low' | 'medium' {
  return READ_ONLY_EVIDENCE_TOOLS.has(toolName) ? 'low' : 'medium';
}
