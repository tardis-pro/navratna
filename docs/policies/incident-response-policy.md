---
title: Incident Response Policy
version: 1.0
owner: Security Team
effective_date: 2026-06-01
review_date: 2027-06-01
soc2_controls: [CC7.3, CC7.4]
---

## Purpose

This policy defines how the Navratna UAIP team identifies, classifies, responds to, and learns from security incidents. It establishes severity tiers, response time commitments, communication obligations, and post-incident review requirements to ensure that incidents are handled consistently and that affected parties are notified appropriately.

## Scope

This policy applies to all security events affecting UAIP systems, including but not limited to: unauthorized access, data breaches, cross-tenant data exposure, service disruptions caused by malicious activity, and anomalous agent behavior that may indicate compromise.

## Severity Classification

### P1 — Critical

A P1 incident involves confirmed or highly probable harm to data confidentiality, integrity, or availability at a scale that affects multiple users or tenants.

Automatic P1 triggers include:

- **Cross-tenant data exposure**: Any confirmed or suspected access by one tenant to another tenant's data, agent configurations, memories, or audit logs. The 6-hourly cross-tenant probe daemon (see Vulnerability Management Policy) automatically escalates a probe violation to P1 status without requiring human triage.
- Confirmed exfiltration of user PII or authentication credentials.
- Compromise of a `super_admin` or `admin` account.
- Ransomware or destructive malware on any production system.
- Breach of the PostgreSQL RLS boundary or Neo4j tenant isolation.

### P2 — High

A P2 incident involves a confirmed security event with limited scope or a suspected P1 that has not yet been confirmed.

Examples:

- Unauthorized access to a single tenant's data by an internal user without authorization.
- Exploitation of a known vulnerability in a production dependency.
- Anomalous agent behavior that may indicate prompt injection or jailbreak.
- Loss of a non-production system containing sensitive data.

### P3 — Medium

A P3 incident involves a security anomaly that has not resulted in confirmed data exposure but requires investigation.

Examples:

- Repeated failed authentication attempts suggesting a credential stuffing attack.
- Unexpected privilege escalation attempt blocked by access controls.
- Dependency with a CVSS score between 7.0 and 8.9 found in production without a patch plan.

### P4 — Low

A P4 incident involves a low-impact anomaly that warrants logging and monitoring but does not require immediate escalation.

Examples:

- A single failed login from an unusual geographic location.
- A minor configuration drift detected by automated scanning.
- An informational security advisory with no immediate exploitability.

## Response SLAs

| Severity | Acknowledge | Contain | Notify Affected Parties |
|----------|-------------|---------|------------------------|
| P1 | Within 1 hour | Within 4 hours | Within 24 hours |
| P2 | Within 4 hours | Within 24 hours | Within 72 hours (if data exposed) |
| P3 | Within 24 hours | Within 7 days | Not required unless data exposed |
| P4 | Within 72 hours | Within 30 days | Not required |

"Acknowledge" means a named responder has taken ownership of the incident in the incident tracking system. "Contain" means the attack vector has been closed or the affected system has been isolated. "Notify" means affected tenants and, where legally required, regulatory bodies have been informed.

## Communication Tree

### P1 Escalation Path

1. **Detecting engineer or automated system** creates a P1 incident ticket immediately.
2. **On-call Security Team member** is paged within 5 minutes via PagerDuty.
3. **Security Team Lead** is notified within 15 minutes.
4. **CTO and Legal** are notified within 30 minutes.
5. **Affected tenants** are notified within 24 hours with a factual summary of what occurred, what data was affected, and what remediation steps have been taken.
6. **Regulatory bodies** (e.g., supervisory authority under GDPR Article 33) are notified within 72 hours if personal data was involved.

### P2 Escalation Path

1. Detecting engineer creates a P2 incident ticket.
2. Security Team Lead is notified within 4 hours.
3. CTO is notified if the incident involves a production system or customer data.
4. Affected tenants are notified within 72 hours if their data was accessed without authorization.

### P3 and P4

P3 and P4 incidents are tracked in the incident management system and assigned to the Security Team for investigation. No external notification is required unless the investigation reveals the incident was more severe than initially classified.

## Cross-Tenant Probe Violations

The 6-hourly cross-tenant probe daemon continuously verifies that tenant isolation boundaries are intact across PostgreSQL (RLS), Neo4j (tenant-scoped graph queries), and Qdrant (collection-level access controls). Any probe violation is automatically classified as P1 and triggers the P1 escalation path without requiring human triage.

The probe results are logged to the `audit_events` table with event type `CROSS_TENANT_PROBE_VIOLATION`. These records are immutable and retained for 7 years per the Data Retention Policy.

## Incident Response Procedure

### Detection and Triage

1. The incident is detected via automated monitoring, a user report, or a security audit finding.
2. The detecting party creates an incident ticket with: timestamp, description, affected systems, initial severity assessment, and any evidence collected.
3. The on-call responder reviews the ticket and confirms or adjusts the severity classification within the acknowledge SLA.

### Containment

1. The responder isolates affected systems or accounts as needed (e.g., revoking tokens, disabling accounts, blocking IP ranges).
2. For P1 incidents involving cross-tenant exposure, the `super_admin` kill-switch may be invoked to revoke all active sessions platform-wide.
3. Evidence is preserved before any remediation steps that might overwrite logs or system state.

### Eradication and Recovery

1. The root cause is identified and the vulnerability or misconfiguration is remediated.
2. Affected systems are restored from known-good backups or redeployed from source.
3. The fix is verified in a staging environment before production deployment.
4. The incident ticket is updated with the root cause, remediation steps, and verification evidence.

### Post-Incident Review

For P1 and P2 incidents, a post-incident review (PIR) must be completed within **5 business days** of containment. The PIR documents:

- A timeline of the incident from detection to resolution.
- Root cause analysis.
- What controls failed or were absent.
- Remediation actions taken.
- Preventive measures to reduce recurrence.
- Any policy or process changes required.

PIR reports are stored in the incident management system and reviewed by the Security Team Lead and CTO. Findings that require policy changes are tracked as action items with assigned owners and due dates.

## Evidence Preservation

All incident-related evidence must be preserved for a minimum of 7 years, consistent with the Data Retention Policy. Evidence includes:

- Audit log exports from the `audit_events` table.
- System logs from affected services.
- Network flow records.
- Screenshots or recordings of anomalous behavior.
- Communications related to the incident response.

Evidence must not be modified or deleted during or after an investigation without written approval from the Security Team Lead and Legal.

## References

- SOC 2 Trust Services Criteria: CC7.3 (Incident Response), CC7.4 (Incident Notification)
- UAIP Data Retention Policy
- UAIP Vulnerability Management Policy (cross-tenant probe daemon)
- GDPR Article 33 (Notification of a personal data breach to the supervisory authority)
