---
title: Access Control Policy
version: 1.0
owner: Security Team
effective_date: 2026-06-01
review_date: 2027-06-01
soc2_controls: [CC6.1, CC6.2, CC6.3]
---

## Purpose

This policy establishes the requirements for granting, managing, and revoking access to the Navratna Unified Agent Intelligence Platform (UAIP). It ensures that access is granted on a least-privilege basis, that privileged roles require multi-factor authentication, and that access is reviewed and revoked in a timely manner.

## Scope

This policy applies to all human users, service accounts, and automated agents that access UAIP systems, APIs, databases, or administrative interfaces.

## Role Definitions

UAIP implements a seven-tier role hierarchy defined in the `UserRole` enum. Each role carries a distinct set of permissions and accountability obligations.

| Role | Description | Privilege Level |
|------|-------------|-----------------|
| `super_admin` | Full platform control, including user management, system configuration, and kill-switch authority | Highest |
| `admin` | Tenant and user administration, agent deployment approval, configuration management | High |
| `security_auditor` | Read-only access to audit logs, security events, and compliance reports; cannot modify data | High (read-only) |
| `agent_manager` | Create, configure, and deploy agents within assigned tenant scope | Medium |
| `developer` | Build and test agents in sandbox environments; no production deployment without approval | Medium |
| `analyst` | Query agent outputs, view dashboards, and export reports within tenant scope | Low |
| `viewer` | Read-only access to dashboards and approved reports; no data export | Lowest |

## Multi-Factor Authentication Requirements

MFA is mandatory for the following roles due to their elevated privilege level:

- `super_admin`: Hardware token (TOTP or FIDO2) required at every session initiation.
- `admin`: TOTP or FIDO2 required at every session initiation.
- `security_auditor`: TOTP or FIDO2 required at every session initiation.

MFA is strongly recommended but not currently enforced for `agent_manager` and `developer` roles. This requirement will be extended to all roles in a future policy revision.

Sessions for MFA-required roles expire after 8 hours of inactivity. Re-authentication is required after expiry.

## Least-Privilege Access Matrix

The following table defines the operations each role may perform. Any operation not listed for a role is implicitly denied.

| Operation | super_admin | admin | security_auditor | agent_manager | developer | analyst | viewer |
|-----------|:-----------:|:-----:|:----------------:|:-------------:|:---------:|:-------:|:------:|
| Create/delete users | Yes | Yes (own tenant) | No | No | No | No | No |
| Assign roles | Yes | Yes (own tenant, below admin) | No | No | No | No | No |
| Deploy agents to production | Yes | Yes | No | Yes | No | No | No |
| Create/modify agents | Yes | Yes | No | Yes | Yes (sandbox) | No | No |
| View audit logs | Yes | Yes (own tenant) | Yes (all) | No | No | No | No |
| Export data | Yes | Yes | Yes (audit only) | No | No | Yes | No |
| View dashboards | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Modify system configuration | Yes | Yes (own tenant) | No | No | No | No | No |
| Invoke kill-switch | Yes | No | No | No | No | No | No |
| Approve agent changes | Yes | Yes | No | Yes | No | No | No |

Access to Neo4j graph data and Qdrant vector stores is governed by the same role boundaries enforced at the API layer. Row-level security (RLS) in PostgreSQL ensures tenant data isolation is enforced at the database layer, independent of application-layer checks.

## Provisioning

New user accounts are created only upon receipt of a formal access request approved by an `admin` or `super_admin`. The request must specify:

- The user's name and organizational affiliation.
- The requested role and justification.
- The tenant scope (if applicable).
- The expected duration of access (permanent or time-limited).

Service accounts for automated agents or integrations require the same approval process. Service account credentials are stored in the secrets manager and are never embedded in source code.

## Deprovisioning SLA

When a user is offboarded (resignation, termination, contract end, or role change), access must be revoked within **24 hours** of the offboarding event being confirmed by HR or the user's manager.

The deprovisioning process includes:

1. Disabling the user account in the identity provider.
2. Revoking all active access tokens and refresh tokens via the token revocation mechanism (see Section 3.2 of the SOC 2 implementation plan).
3. Removing the user from all tenant memberships.
4. Archiving the user's audit trail for the 7-year retention period.

For `admin` and `super_admin` accounts, deprovisioning must be completed within **4 hours** and must be confirmed by a second `super_admin`.

## Quarterly Access Review

The Security Team conducts a formal access review every calendar quarter. The review covers:

- All active user accounts and their assigned roles.
- Service accounts and their associated permissions.
- Any accounts that have not been used in the past 90 days (candidates for suspension).
- Any role assignments that appear inconsistent with the user's current responsibilities.

Review findings are documented and remediated within 10 business days. Accounts flagged for removal that are not remediated within this window are automatically suspended pending investigation.

## Access Token Revocation

UAIP implements a token revocation mechanism that allows immediate invalidation of access tokens and refresh tokens for any user or service account. This mechanism is invoked:

- During deprovisioning.
- When a security incident is detected involving the account.
- When a user reports a compromised credential.
- By `super_admin` via the kill-switch for emergency platform-wide revocation.

Revoked tokens are recorded in the token blacklist and checked on every authenticated request. The blacklist is replicated across all API gateway instances to ensure consistent enforcement.

## Exceptions

Any exception to this policy requires written approval from the Security Team and must be documented with a business justification, a defined expiry date, and compensating controls. Exceptions are reviewed at the next quarterly access review.

## Enforcement

Violations of this policy may result in immediate account suspension, escalation to Legal, and disciplinary action up to and including termination of employment or contract.

## References

- SOC 2 Trust Services Criteria: CC6.1 (Logical and Physical Access Controls), CC6.2 (Prior to Issuing System Credentials), CC6.3 (Role-Based Access)
- UAIP SOC 2 Implementation Plan, Section 3.2 (Token Revocation)
- UAIP `UserRole` enum definition in `packages/types/src/auth.ts`
