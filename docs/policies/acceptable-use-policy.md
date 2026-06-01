---
title: Acceptable Use Policy
version: 1.0
owner: Security Team
effective_date: 2026-06-01
review_date: 2027-06-01
soc2_controls: [CC1.4, CC2.2]
---

## Purpose

This policy defines the acceptable and prohibited uses of the Navratna Unified Agent Intelligence Platform (UAIP). It establishes the boundaries within which users, developers, and agents may operate, and it defines the consequences of violations. The goal is to ensure that UAIP's capabilities are used for legitimate purposes and that the platform's integrity, security, and tenant isolation are preserved.

## Scope

This policy applies to all users of UAIP, including employees, contractors, tenants, and any automated agents or systems that interact with the platform. It covers all UAIP interfaces: the web application, REST APIs, agent execution environment, and administrative tools.

## Permitted Uses

UAIP is designed for the following purposes:

- Building, deploying, and operating AI agents for legitimate business automation, research, and productivity use cases.
- Analyzing and processing data within the scope of the user's tenant and role permissions.
- Integrating UAIP with authorized third-party systems via the API, subject to the tenant's integration agreements.
- Testing and evaluating agent capabilities in sandbox environments designated for that purpose.
- Accessing audit logs and compliance reports within the scope of the user's role (see Access Control Policy).

## Prohibited Uses

The following uses of UAIP are strictly prohibited:

### Harmful Content and Harassment

- Creating or deploying agents that generate, distribute, or facilitate harassment, hate speech, or targeted abuse of individuals.
- Using UAIP to produce child sexual abuse material (CSAM) or any content that sexualizes minors. This is an absolute prohibition with no exceptions.
- Deploying agents designed to intimidate, threaten, or coerce individuals.

### Security and Fraud

- Attempting to circumvent UAIP's fraud detection, rate limiting, or abuse prevention systems.
- Using UAIP to conduct phishing attacks, social engineering campaigns, or credential harvesting.
- Creating agents designed to exploit vulnerabilities in UAIP itself or in third-party systems.
- Attempting to access data belonging to another tenant, whether through the API, direct database access, or any other means.
- Using UAIP to generate malware, ransomware, or other malicious code.

### Data Exfiltration

- Using agents to extract, copy, or transmit data outside of authorized channels or beyond the scope of the user's role permissions.
- Attempting to exfiltrate agent memories, tenant configurations, or audit logs belonging to other tenants.
- Using the API to bulk-export data in ways that circumvent the platform's data governance controls.

### Unauthorized Privilege Escalation

- Attempting to obtain permissions beyond those assigned to the user's role.
- Using prompt injection or other techniques to cause an agent to perform actions outside its authorized scope.
- Attempting to impersonate another user, tenant, or service account.

### Resource Abuse

- Using UAIP to mine cryptocurrency or perform computationally intensive tasks unrelated to the platform's intended purpose.
- Deliberately generating excessive API traffic to degrade service quality for other tenants.
- Circumventing usage quotas or billing controls.

## Data Handling Obligations

All users are responsible for handling data in accordance with applicable laws and the terms of their tenant agreement. Specific obligations include:

- **PII handling**: Personal data must be processed only for the purposes disclosed to data subjects. Users must not upload PII to UAIP unless their tenant agreement explicitly permits it and appropriate data processing agreements are in place.
- **Tenant isolation**: Users must not attempt to access, infer, or reconstruct data belonging to other tenants. The platform enforces isolation through PostgreSQL RLS, Neo4j tenant-scoped queries, and Qdrant collection-level access controls, but users are also obligated not to attempt to circumvent these controls.
- **Credential hygiene**: API keys, access tokens, and other credentials must not be shared, embedded in source code, or stored in insecure locations. Compromised credentials must be reported to the Security Team immediately.
- **Audit awareness**: All actions taken within UAIP are logged to `audit_events`. Users should assume that all their actions are recorded and may be reviewed by the Security Team or `security_auditor` role users.

## ADMIN_ZERO Privileges and Kill-Switch Authority

The `super_admin` role carries ADMIN_ZERO privileges, which include the authority to:

- Revoke all active sessions platform-wide via the kill-switch.
- Disable any user account, tenant, or agent without prior notice in response to a confirmed security incident.
- Access audit logs across all tenants for security investigation purposes.

The kill-switch is a last-resort control intended for use during P1 incidents. Its use is logged to `audit_events` and requires post-incident documentation within 24 hours explaining the justification.

`super_admin` accounts are subject to the strictest access controls (hardware MFA, 8-hour session expiry, quarterly access review) precisely because of the power they carry. The number of active `super_admin` accounts is minimized and reviewed quarterly.

## Violation Escalation

Violations of this policy are classified using the same severity tiers as the Incident Response Policy:

- **P1/P2 violations** (e.g., confirmed cross-tenant data access, CSAM, active data exfiltration): The Security Team escalates to Legal within **24 hours**. The user's account is suspended immediately pending investigation. Law enforcement may be notified where legally required.
- **P3 violations** (e.g., repeated unauthorized access attempts, policy circumvention): The Security Team investigates and may suspend the account pending review. The user's manager or tenant administrator is notified.
- **P4 violations** (e.g., minor policy deviations, accidental misuse): The Security Team documents the violation and issues a warning to the user.

All violations are logged to `audit_events` and retained for 7 years per the Data Retention Policy.

## Acknowledgment

All users must acknowledge this policy before being granted access to UAIP. Acknowledgment is recorded in the user's account record. Continued use of the platform constitutes ongoing acceptance of this policy.

## References

- SOC 2 Trust Services Criteria: CC1.4 (Commitment to Competence), CC2.2 (Internal Communication of Objectives)
- UAIP Access Control Policy (role definitions, MFA requirements)
- UAIP Incident Response Policy (violation escalation procedure)
- UAIP Data Retention Policy (audit log retention)
- UAIP Change Management Policy (agent change approval requirements)
