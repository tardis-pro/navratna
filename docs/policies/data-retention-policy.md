---
title: Data Retention Policy
version: 1.0
owner: Security Team
effective_date: 2026-06-01
review_date: 2027-06-01
soc2_controls: [CC6.5, A1.2]
---

## Purpose

This policy defines how long different categories of data are retained in the Navratna UAIP platform, when and how data is purged, and how GDPR erasure requests are handled. It ensures that data is not retained longer than necessary for its purpose and that retention periods are enforced through automated mechanisms.

## Scope

This policy applies to all data stored in UAIP systems, including PostgreSQL databases, Neo4j graph stores, Qdrant vector stores, object storage, and log aggregation systems.

## Retention Schedule

### Audit and Compliance Data

| Data Category | Active Retention | Archive Retention | Purge Mechanism |
|---------------|-----------------|-------------------|-----------------|
| `audit_events` table | 90 days (hot storage) | 7 years (cold storage) | Automated sweep (Section 3.6 of SOC 2 plan) moves records older than 90 days to cold storage; records older than 7 years are permanently deleted |
| `composition_audit_events` table | 1 year (active, immutable) | 7 years (cold storage) | Immutable hash chain; records cannot be modified; cold migration at 1 year |
| GDPR erasure certificates | N/A | 7 years | Manual review required before deletion |
| Incident response records | Duration of incident + 90 days active | 7 years | Archived after incident closure |

The `audit_events` automated sweep runs daily at 02:00 UTC. It identifies records older than 90 days, exports them to cold storage (encrypted at rest), and removes them from the hot database. The sweep is logged and its completion status is recorded in the `audit_events` table itself under event type `RETENTION_SWEEP_COMPLETED`.

The `composition_audit_events` table uses a cryptographic hash chain where each record includes the hash of the previous record. This makes retroactive modification detectable. Records in this table are never deleted during the active retention period; they are migrated to cold storage after 1 year and permanently deleted after 7 years.

### User and Authentication Data

| Data Category | Retention Period | Purge Trigger |
|---------------|-----------------|---------------|
| User PII (name, email, profile) | Until GDPR erasure request + 30-day grace period | Erasure request processed within 30 days |
| Access tokens | Per `config.jwt.accessTokenExpiry` (default: 15 minutes) | Automatic expiry; revoked tokens blacklisted until natural expiry |
| Refresh tokens | Per `config.jwt.refreshTokenExpiry` (default: 7 days) | Automatic expiry; revoked immediately on deprovisioning |
| Password hashes | Until account deletion | Deleted with account |
| MFA secrets | Until account deletion or MFA reset | Deleted with account |
| Session records | 30 days after session end | Automated purge |

### Agent and Memory Data

| Data Category | Retention Period | Purge Mechanism |
|---------------|-----------------|-----------------|
| Agent memories (Qdrant vectors) | 6 months default; configurable per tenant | Automated relevance-decay purge at threshold 0.15 |
| Agent configuration | Until agent deletion + 90 days | Soft delete with 90-day recovery window |
| Agent execution logs | 30 days active | Automated purge |
| Neo4j graph relationships | Until agent or user deletion | Cascading delete on entity removal |

The relevance-decay purge runs on a scheduled basis and removes agent memories whose relevance score has decayed below the threshold of **0.15**. This threshold is configurable per tenant but cannot be set below 0.05 without Security Team approval. The purge is logged to `audit_events` with event type `MEMORY_DECAY_PURGE`.

### LLM and Processing Data

| Data Category | Retention Period | Notes |
|---------------|-----------------|-------|
| LLM request logs | 30 days active | Includes prompt, model, token counts; excludes raw completions by default |
| LLM response cache | 24 hours | Evicted automatically; not persisted to cold storage |
| Stem separation outputs | 7 days | Temporary processing artifacts |
| Analysis pipeline outputs | 90 days | Retained for audit and reproducibility |

### Tenant and Organizational Data

| Data Category | Retention Period | Notes |
|---------------|-----------------|-------|
| Tenant configuration | Until tenant deletion + 1 year | 1-year recovery window for accidental deletion |
| Billing records | 7 years | Legal requirement |
| Contract documents | Duration of contract + 7 years | Legal requirement |

## GDPR Erasure Requests

When a user submits a GDPR erasure request (right to be forgotten), the following process applies:

1. The request is logged in the incident management system with a timestamp.
2. The Security Team verifies the requester's identity within 5 business days.
3. All PII associated with the user is identified across PostgreSQL, Neo4j, and Qdrant.
4. PII is deleted or anonymized within **30 days** of the verified request.
5. A GDPR erasure certificate is generated, signed by the Security Team Lead, and stored in cold storage for 7 years.
6. The user is notified of completion.

Data that cannot be erased due to legal obligations (e.g., audit records required for regulatory compliance, billing records) is documented in the erasure certificate with the legal basis for retention.

Agent memories associated with the user are purged from Qdrant. Neo4j graph nodes representing the user are deleted, with cascading deletion of associated relationships. PostgreSQL records are anonymized (PII fields set to null or replaced with a pseudonymous identifier) rather than deleted where referential integrity requires it.

## Cold Storage Requirements

Cold storage for archived data must meet the following requirements:

- Encrypted at rest using AES-256.
- Access restricted to `super_admin` and `security_auditor` roles.
- Access to cold storage is logged to `audit_events`.
- Cold storage is geographically redundant with a minimum of two copies in separate availability zones.
- Restoration from cold storage must be tested annually.

## Automated Enforcement

Retention enforcement is automated through the following mechanisms:

- **Daily audit sweep**: Moves `audit_events` records older than 90 days to cold storage.
- **Relevance-decay purge**: Removes agent memories below the 0.15 threshold on a scheduled basis.
- **Token expiry**: Access and refresh tokens expire automatically per JWT configuration.
- **Session cleanup**: Expired sessions are purged from the database daily.

All automated purge operations are logged to `audit_events` and are visible to `security_auditor` role users. Failures in automated purge operations trigger a P3 incident.

## Exceptions

Any exception to this policy (e.g., extended retention for litigation hold) requires written approval from Legal and the Security Team Lead. Exceptions are documented with a business justification, an expiry date, and the specific data categories affected.

## References

- SOC 2 Trust Services Criteria: CC6.5 (Disposal of Data), A1.2 (Availability Commitments)
- GDPR Articles 17 (Right to Erasure), 30 (Records of Processing Activities)
- UAIP SOC 2 Implementation Plan, Section 3.4 (Memory Decay), Section 3.6 (Audit Retention Sweep)
