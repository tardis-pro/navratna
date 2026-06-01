---
title: Change Management Policy
version: 1.0
owner: Security Team
effective_date: 2026-06-01
review_date: 2027-06-01
soc2_controls: [CC8.1]
---

## Purpose

This policy governs how changes to UAIP production systems are proposed, reviewed, approved, deployed, and verified. It ensures that all changes are traceable, that security-affecting changes receive additional scrutiny, and that the platform can be rolled back to a known-good state if a change causes harm.

## Scope

This policy applies to all changes to production systems, including application code, database schema, infrastructure configuration, agent definitions, security controls, and third-party integrations. It also governs changes proposed and executed by the self-building agent loop.

## Change Request Process

All changes to production systems follow this sequence:

### 1. Propose

The change author opens a pull request (PR) against the target branch (`main` or `original-main`). The PR must include:

- A clear description of what is changing and why.
- The expected impact on system behavior, performance, and security.
- A test plan demonstrating the change has been validated in a non-production environment.
- For database migrations: a rollback script that restores the previous schema state.
- For security-affecting changes: a threat model or security impact assessment.

No direct commits to `main` or `original-main` are permitted. Force pushes to protected branches are disabled at the repository level.

### 2. Review

PRs are reviewed by qualified team members before merging:

- **Standard changes** (no security impact): 1 required approval from a `developer` or above.
- **Security-affecting changes** (authentication, authorization, encryption, audit logging, tenant isolation, RLS policies, Neo4j access controls, Qdrant collection permissions): 2 required approvals, at least one of which must be from a `security_auditor`, `admin`, or `super_admin`.
- **Database migration PRs**: Must include a rollback script. The reviewer must confirm the rollback script has been tested in a staging environment.

Automated CI checks must pass before a PR can be merged. CI checks include: linting (oxlint), type checking, unit tests, integration tests, and dependency vulnerability scanning.

### 3. Approve

Approval is recorded in the version control system. Approvers are responsible for the correctness and security of the changes they approve. Approvals from the change author do not count toward the required approval count.

### 4. Deploy

Merging to `main` triggers the deployment pipeline. Deployments are automated and follow the sequence: build, test, stage, promote to production. No manual production deployments are permitted outside of this pipeline except during declared incidents with Security Team authorization.

### 5. Verify

Within **10 minutes** of a production deployment, the deploying engineer must confirm that the health endpoint (`/health`) returns a 200 status and that key system metrics (error rate, latency, queue depth) are within normal bounds. If verification fails, the rollback procedure is initiated immediately.

### 6. Rollback

If a deployment causes a degradation in service quality or a security regression, the rollback procedure is:

1. Revert the merge commit in version control.
2. Trigger a redeployment of the previous version via the pipeline.
3. For database migrations: execute the rollback script against the production database.
4. Confirm health endpoint returns 200 and metrics are normal.
5. Create a post-deployment incident ticket documenting what failed and why.

## Self-Building Agent Loop

UAIP includes a self-building agent loop that allows agents to propose changes to their own configuration, capabilities, and integration points. Because this loop can modify production behavior, it is subject to the same change management controls as human-authored changes.

The self-building agent loop follows this sequence:

1. **Propose**: The agent generates a change proposal in structured format, including the rationale, expected impact, and any risks identified.
2. **Admin Approve**: The proposal is surfaced to an `admin` or `super_admin` for review. The agent cannot proceed without explicit human approval. Approval is logged to `audit_events` with event type `AGENT_CHANGE_APPROVED`.
3. **Execute**: The approved change is applied by the agent within the scope defined in the approval.
4. **Verify**: The agent runs its own verification suite and reports results. A human reviewer confirms the verification output.
5. **Audit**: The complete proposal, approval, execution, and verification record is written to `composition_audit_events` as an immutable entry in the hash chain.

Agents may not approve their own change proposals. The `agent_manager` role may approve agent changes within their tenant scope; changes that affect cross-tenant behavior or platform-level configuration require `admin` or `super_admin` approval.

## Change Freeze Periods

A change freeze is declared during SOC 2 audit observation periods. During a change freeze:

- No changes to production systems are permitted except for P1 security patches.
- P1 security patches require approval from the Security Team Lead and CTO.
- All changes during a freeze are documented with the emergency justification.

The Security Team announces change freeze periods at least 5 business days in advance. The current SOC 2 audit observation period dates are communicated to all engineering staff at the start of each audit cycle.

## TLS and HSTS Prerequisites

**Important constraint**: HTTP Strict Transport Security (HSTS) cannot be enabled until the nginx reverse proxy is configured to terminate TLS. As of the effective date of this policy, the UAIP production environment operates on port 80 only, with TLS termination handled upstream by the load balancer in some deployment configurations.

Before enabling HSTS headers in the nginx configuration, the following prerequisites must be met:

1. A valid TLS certificate must be provisioned and installed on the nginx instance.
2. nginx must be configured to listen on port 443 and redirect port 80 to 443.
3. The HSTS header (`Strict-Transport-Security: max-age=31536000; includeSubDomains`) must be added only after confirming that all subdomains support HTTPS.
4. The change must go through the standard security-affecting change review process (2 approvals).

Enabling HSTS prematurely on a non-TLS endpoint will break all HTTP access to the platform. This change is tracked as a prerequisite for SOC 2 Type II readiness.

## Audit Trail

All change management activities are logged to `audit_events`. The following events are recorded:

- PR creation, approval, and merge.
- Deployment initiation and completion.
- Rollback events.
- Agent change proposals, approvals, and executions.
- Change freeze declarations and exceptions.

These records are retained per the Data Retention Policy (90-day active, 7-year archive).

## References

- SOC 2 Trust Services Criteria: CC8.1 (Change Management)
- UAIP Data Retention Policy
- UAIP Access Control Policy (role definitions and approval authority)
- UAIP Incident Response Policy (P1 emergency change procedure)
