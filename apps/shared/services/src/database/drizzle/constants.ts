export const ADMIN_ORG_ID = '00000000-0000-0000-0000-000000000001';
export const ADMIN_ORG_SLUG = 'admin';
export const ADMIN_ORG_NAME = 'UAIP Admin';

// These must be SEEDED rows — operations.agent_id has no cross-plane FK, so an
// unseeded id is an orphan CrossPlaneGuard cannot tell apart from a typo.
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-0000000000a1';
export const SYSTEM_PERSONA_ID = '00000000-0000-0000-0000-0000000000a2';
export const SYSTEM_AGENT_ID = '00000000-0000-0000-0000-0000000000a3';
export const SYSTEM_USER_EMAIL = 'system@uaip.internal';
export const SYSTEM_AGENT_NAME = 'System';
