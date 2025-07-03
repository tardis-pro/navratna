/**
 * Service Access Matrix - Zero Trust Implementation
 * Phase 0: Enterprise Database Compartmentalization
 * 
 * Defines which services can access which databases and with what permissions
 * Implements Zero Trust principles with least privilege access
 */

export enum DatabaseTier {
  SECURITY = 'security',        // Level 4 Restricted
  APPLICATION = 'application',  // Level 3 Confidential  
  ANALYTICS = 'analytics',      // Level 2 Internal
  OPERATIONS = 'operations',    // Level 2 Internal
  DMZ = 'dmz'                  // Level 1 Public
}

export enum AccessLevel {
  READ = 'READ',
  WRITE = 'WRITE',
  DELETE = 'DELETE',
  ADMIN = 'ADMIN',
  AUDIT = 'AUDIT'
}

export interface DatabaseConnection {
  type: 'postgresql' | 'neo4j' | 'qdrant' | 'redis' | 'rabbitmq';
  tier: DatabaseTier;
  instance: string;
  port: number;
  permissions: AccessLevel[];
  encryption: 'required' | 'optional' | 'none';
  auditLevel: 'comprehensive' | 'standard' | 'minimal';
}

export interface ServiceAccess {
  serviceName: string;
  securityLevel: number;  // 1-5 security clearance level
  databases: DatabaseConnection[];
  networkSegments: string[];
  complianceFlags: string[];
}

/**
 * Zero Trust Service Access Matrix
 *
 * Defines precise access control for each service based on:
 * - Security level requirements
 * - Business need-to-know
 * - Compliance requirements (SOC 2, HIPAA, PCI DSS)
 * - Network segmentation
 */
export const SERVICE_ACCESS_MATRIX: Record<string, ServiceAccess> = {
  // =============================================================================
  // LEVEL 4 RESTRICTED - SECURITY TIER
  // =============================================================================

  'security-gateway': {
    serviceName: 'security-gateway',
    securityLevel: 4,
    databases: [
      {
        type: 'postgresql',
        tier: DatabaseTier.SECURITY,
        instance: 'postgres-security',
        port: 5433,
        permissions: [AccessLevel.READ, AccessLevel.WRITE, AccessLevel.AUDIT],
        encryption: 'required',
        auditLevel: 'comprehensive'
      },
      {
        type: 'neo4j',
        tier: DatabaseTier.SECURITY,
        instance: 'neo4j-security',
        port: 7687,
        permissions: [AccessLevel.READ, AccessLevel.WRITE, AccessLevel.AUDIT],
        encryption: 'required',
        auditLevel: 'comprehensive'
      },
      {
        type: 'qdrant',
        tier: DatabaseTier.SECURITY,
        instance: 'qdrant-security',
        port: 6333,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'required',
        auditLevel: 'comprehensive'
      },
      {
        type: 'redis',
        tier: DatabaseTier.SECURITY,
        instance: 'redis-security',
        port: 6380,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'required',
        auditLevel: 'comprehensive'
      }
    ],
    networkSegments: ['uaip-security-network', 'uaip-management-network'],
    complianceFlags: ['SOC2_CC6_1', 'HIPAA_164_312', 'PCI_DSS_7', 'ISO27001_A_9']
  },

  // =============================================================================
  // LEVEL 3 CONFIDENTIAL - APPLICATION TIER
  // =============================================================================

  'agent-intelligence': {
    serviceName: 'agent-intelligence',
    securityLevel: 3,
    databases: [
      {
        type: 'postgresql',
        tier: DatabaseTier.APPLICATION,
        instance: 'postgres-application',
        port: 5432,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'required',
        auditLevel: 'standard'
      },
      {
        type: 'neo4j',
        tier: DatabaseTier.APPLICATION,
        instance: 'neo4j-knowledge',
        port: 7688,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'standard'
      },
      {
        type: 'neo4j',
        tier: DatabaseTier.APPLICATION,
        instance: 'neo4j-agent',
        port: 7689,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'standard'
      },
      {
        type: 'qdrant',
        tier: DatabaseTier.APPLICATION,
        instance: 'qdrant-knowledge',
        port: 6335,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'standard'
      },
      {
        type: 'qdrant',
        tier: DatabaseTier.APPLICATION,
        instance: 'qdrant-agent',
        port: 6337,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'standard'
      },
      {
        type: 'redis',
        tier: DatabaseTier.APPLICATION,
        instance: 'redis-application',
        port: 6379,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'standard'
      }
    ],
    networkSegments: ['uaip-application-network'],
    complianceFlags: ['SOC2_CC6_6', 'HIPAA_164_312_C', 'DATA_CLASS_3']
  },

  'capability-registry': {
    serviceName: 'capability-registry',
    securityLevel: 3,
    databases: [
      {
        type: 'postgresql',
        tier: DatabaseTier.APPLICATION,
        instance: 'postgres-application',
        port: 5432,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'required',
        auditLevel: 'standard'
      },
      {
        type: 'qdrant',
        tier: DatabaseTier.APPLICATION,
        instance: 'qdrant-knowledge',
        port: 6335,
        permissions: [AccessLevel.READ],
        encryption: 'optional',
        auditLevel: 'standard'
      },
      {
        type: 'redis',
        tier: DatabaseTier.APPLICATION,
        instance: 'redis-application',
        port: 6379,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'standard'
      }
    ],
    networkSegments: ['uaip-application-network'],
    complianceFlags: ['SOC2_CC6_6', 'DATA_CLASS_3']
  },

  'discussion-orchestration': {
    serviceName: 'discussion-orchestration',
    securityLevel: 3,
    databases: [
      {
        type: 'postgresql',
        tier: DatabaseTier.APPLICATION,
        instance: 'postgres-application',
        port: 5432,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'required',
        auditLevel: 'standard'
      },
      {
        type: 'redis',
        tier: DatabaseTier.APPLICATION,
        instance: 'redis-application',
        port: 6379,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'standard'
      }
    ],
    networkSegments: ['uaip-application-network'],
    complianceFlags: ['SOC2_CC6_6', 'DATA_CLASS_3']
  },

  'artifact-service': {
    serviceName: 'artifact-service',
    securityLevel: 3,
    databases: [
      {
        type: 'postgresql',
        tier: DatabaseTier.APPLICATION,
        instance: 'postgres-application',
        port: 5432,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'required',
        auditLevel: 'standard'
      },
      {
        type: 'redis',
        tier: DatabaseTier.APPLICATION,
        instance: 'redis-application',
        port: 6379,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'standard'
      }
    ],
    networkSegments: ['uaip-application-network'],
    complianceFlags: ['SOC2_CC6_6', 'DATA_CLASS_3']
  },

  'llm-service': {
    serviceName: 'llm-service',
    securityLevel: 3,
    databases: [
      {
        type: 'postgresql',
        tier: DatabaseTier.APPLICATION,
        instance: 'postgres-application',
        port: 5432,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'required',
        auditLevel: 'standard'
      },
      {
        type: 'redis',
        tier: DatabaseTier.APPLICATION,
        instance: 'redis-application',
        port: 6379,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'standard'
      }
    ],
    networkSegments: ['uaip-application-network'],
    complianceFlags: ['SOC2_CC6_6', 'DATA_CLASS_3']
  },

  // =============================================================================
  // LEVEL 2/3 HYBRID - OPERATIONS TIER
  // =============================================================================

  'orchestration-pipeline': {
    serviceName: 'orchestration-pipeline',
    securityLevel: 3,
    databases: [
      {
        type: 'postgresql',
        tier: DatabaseTier.APPLICATION,
        instance: 'postgres-application',
        port: 5432,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'required',
        auditLevel: 'standard'
      },
      {
        type: 'postgresql',
        tier: DatabaseTier.OPERATIONS,
        instance: 'postgres-operations',
        port: 5435,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'standard'
      },
      {
        type: 'neo4j',
        tier: DatabaseTier.OPERATIONS,
        instance: 'neo4j-operations',
        port: 7690,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'standard'
      },
      {
        type: 'redis',
        tier: DatabaseTier.APPLICATION,
        instance: 'redis-application',
        port: 6379,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'standard'
      }
    ],
    networkSegments: ['uaip-application-network', 'uaip-analytics-network'],
    complianceFlags: ['SOC2_CC6_6', 'DATA_CLASS_3', 'DATA_CLASS_2']
  },

  // =============================================================================
  // LEVEL 2 INTERNAL - ANALYTICS TIER  
  // =============================================================================

  'analytics-service': {
    serviceName: 'analytics-service',
    securityLevel: 2,
    databases: [
      {
        type: 'postgresql',
        tier: DatabaseTier.ANALYTICS,
        instance: 'postgres-analytics',
        port: 5434,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'minimal'
      },
      {
        type: 'qdrant',
        tier: DatabaseTier.ANALYTICS,
        instance: 'qdrant-analytics',
        port: 6339,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'minimal'
      }
    ],
    networkSegments: ['uaip-analytics-network'],
    complianceFlags: ['DATA_CLASS_2']
  },

  'reporting-service': {
    serviceName: 'reporting-service',
    securityLevel: 2,
    databases: [
      {
        type: 'postgresql',
        tier: DatabaseTier.ANALYTICS,
        instance: 'postgres-analytics',
        port: 5434,
        permissions: [AccessLevel.READ],
        encryption: 'optional',
        auditLevel: 'minimal'
      },
      {
        type: 'postgresql',
        tier: DatabaseTier.OPERATIONS,
        instance: 'postgres-operations',
        port: 5435,
        permissions: [AccessLevel.READ],
        encryption: 'optional',
        auditLevel: 'minimal'
      }
    ],
    networkSegments: ['uaip-analytics-network'],
    complianceFlags: ['DATA_CLASS_2']
  }
};

/**
 * Network Segment Definitions
 * Zero Trust Network Architecture with 5-level segmentation
 */
export const NETWORK_SEGMENTS = {
  'uaip-security-network': {
    level: 4,
    subnet: '172.20.1.0/24',
    isolation: 'internal',
    description: 'Level 4 Restricted - Security services only',
    allowedServices: ['security-gateway'],
    firewallRules: ['deny-all-external', 'allow-management-internal']
  },
  'uaip-management-network': {
    level: 4,
    subnet: '172.20.2.0/24',
    isolation: 'controlled',
    description: 'Level 4 Management - Admin access only',
    allowedServices: ['security-gateway', 'monitoring', 'backup'],
    firewallRules: ['admin-access-only', 'audit-all-traffic']
  },
  'uaip-application-network': {
    level: 3,
    subnet: '172.20.3.0/24',
    isolation: 'segmented',
    description: 'Level 3 Confidential - Business services',
    allowedServices: ['agent-intelligence', 'capability-registry', 'discussion-orchestration', 'artifact-service', 'llm-service', 'orchestration-pipeline'],
    firewallRules: ['inter-service-communication', 'external-api-controlled']
  },
  'uaip-analytics-network': {
    level: 2,
    subnet: '172.20.4.0/24',
    isolation: 'monitored',
    description: 'Level 2 Internal - Read-only services',
    allowedServices: ['analytics-service', 'reporting-service', 'orchestration-pipeline'],
    firewallRules: ['read-only-access', 'data-export-controlled']
  },
  'uaip-dmz-network': {
    level: 1,
    subnet: '172.20.5.0/24',
    isolation: 'public',
    description: 'Level 1 Public - DMZ services',
    allowedServices: ['api-gateway', 'frontend', 'load-balancer'],
    firewallRules: ['public-access', 'ddos-protection', 'rate-limiting']
  }
};

/**
 * Compliance Control Mapping
 * Maps access controls to compliance frameworks
 */
export const COMPLIANCE_CONTROLS = {
  SOC2_CC6_1: {
    description: 'Logical access controls',
    requirements: ['role-based-access', 'least-privilege', 'periodic-review'],
    applicableServices: ['security-gateway', 'agent-intelligence', 'capability-registry']
  },
  SOC2_CC6_6: {
    description: 'Data classification and handling',
    requirements: ['data-classification', 'encryption-at-rest', 'secure-transmission'],
    applicableServices: ['agent-intelligence', 'capability-registry', 'discussion-orchestration']
  },
  HIPAA_164_312: {
    description: 'Technical safeguards',
    requirements: ['access-control', 'audit-controls', 'integrity', 'person-authentication', 'transmission-security'],
    applicableServices: ['security-gateway']
  },
  PCI_DSS_7: {
    description: 'Restrict access by business need to know',
    requirements: ['role-based-access', 'default-deny', 'access-control-systems'],
    applicableServices: ['security-gateway']
  },
  ISO27001_A_9: {
    description: 'Access control',
    requirements: ['access-control-policy', 'user-access-management', 'privileged-access-rights'],
    applicableServices: ['security-gateway']
  }
};

/**
 * Standard Development Service Access Matrix
 *
 * Simplified access control for development environments
 * Maps docker-compose service names to standard database instances
 */
export const STANDARD_SERVICE_ACCESS_MATRIX: Record<string, ServiceAccess> = {
  'agent-intelligence': {
    serviceName: 'agent-intelligence',
    securityLevel: 2,
    databases: [
      {
        type: 'postgresql',
        tier: DatabaseTier.APPLICATION,
        instance: 'postgres', // Docker container name
        port: 5432,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'minimal'
      },
      {
        type: 'neo4j',
        tier: DatabaseTier.APPLICATION,
        instance: 'neo4j',
        port: 7687,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'minimal'
      },
      {
        type: 'redis',
        tier: DatabaseTier.APPLICATION,
        instance: 'redis',
        port: 6379,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'minimal'
      },
      {
        type: 'qdrant',
        tier: DatabaseTier.APPLICATION,
        instance: 'qdrant',
        port: 6333,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'minimal'
      }
    ],
    networkSegments: ['uaip-network'],
    complianceFlags: ['DEV_MODE']
  },

  'capability-registry': {
    serviceName: 'capability-registry',
    securityLevel: 2,
    databases: [
      {
        type: 'postgresql',
        tier: DatabaseTier.APPLICATION,
        instance: 'postgres',
        port: 5432,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'minimal'
      },
      {
        type: 'redis',
        tier: DatabaseTier.APPLICATION,
        instance: 'redis',
        port: 6379,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'minimal'
      },
      {
        type: 'qdrant',
        tier: DatabaseTier.APPLICATION,
        instance: 'qdrant',
        port: 6333,
        permissions: [AccessLevel.READ],
        encryption: 'optional',
        auditLevel: 'minimal'
      }
    ],
    networkSegments: ['uaip-network'],
    complianceFlags: ['DEV_MODE']
  },

  'orchestration-pipeline': {
    serviceName: 'orchestration-pipeline',
    securityLevel: 2,
    databases: [
      {
        type: 'postgresql',
        tier: DatabaseTier.APPLICATION,
        instance: 'postgres',
        port: 5432,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'minimal'
      },
      {
        type: 'redis',
        tier: DatabaseTier.APPLICATION,
        instance: 'redis',
        port: 6379,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'minimal'
      },
      {
        type: 'rabbitmq',
        tier: DatabaseTier.APPLICATION,
        instance: 'rabbitmq',
        port: 5672,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'minimal'
      }
    ],
    networkSegments: ['uaip-network'],
    complianceFlags: ['DEV_MODE']
  },

  'discussion-orchestration': {
    serviceName: 'discussion-orchestration',
    securityLevel: 2,
    databases: [
      {
        type: 'postgresql',
        tier: DatabaseTier.APPLICATION,
        instance: 'postgres',
        port: 5432,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'minimal'
      },
      {
        type: 'redis',
        tier: DatabaseTier.APPLICATION,
        instance: 'redis',
        port: 6379,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'minimal'
      },
      {
        type: 'rabbitmq',
        tier: DatabaseTier.APPLICATION,
        instance: 'rabbitmq',
        port: 5672,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'minimal'
      }
    ],
    networkSegments: ['uaip-network'],
    complianceFlags: ['DEV_MODE']
  },

  'security-gateway': {
    serviceName: 'security-gateway',
    securityLevel: 3,
    databases: [
      {
        type: 'postgresql',
        tier: DatabaseTier.APPLICATION,
        instance: 'postgres',
        port: 5432,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'minimal'
      },
      {
        type: 'redis',
        tier: DatabaseTier.APPLICATION,
        instance: 'redis',
        port: 6379,
        permissions: [AccessLevel.READ, AccessLevel.WRITE],
        encryption: 'optional',
        auditLevel: 'minimal'
      }
    ],
    networkSegments: ['uaip-network'],
    complianceFlags: ['DEV_MODE']
  }
};

/**
 * Validates if a service has access to a specific database
 */
export function validateServiceAccess(
  serviceName: string,
  databaseType: string,
  databaseInstance: string,
  requestedPermission: AccessLevel,
  useEnterpriseMatrix: boolean = true
): boolean {
  // Choose the appropriate access matrix
  const accessMatrix = useEnterpriseMatrix ? SERVICE_ACCESS_MATRIX : STANDARD_SERVICE_ACCESS_MATRIX;

  const serviceAccess = accessMatrix[serviceName];
  if (!serviceAccess) {
    return false;
  }

  const dbAccess = serviceAccess.databases.find(
    db => db.type === databaseType && db.instance === databaseInstance
  );

  if (!dbAccess) {
    return false;
  }

  return dbAccess.permissions.includes(requestedPermission);
}

/**
 * Gets database connection string for a service
 */
export function getDatabaseConnectionString(
  serviceName: string,
  databaseType: string,
  databaseInstance: string
): string | null {
  const serviceAccess = SERVICE_ACCESS_MATRIX[serviceName];
  if (!serviceAccess) {
    return null;
  }

  const dbAccess = serviceAccess.databases.find(
    db => db.type === databaseType && db.instance === databaseInstance
  );

  if (!dbAccess) {
    return null;
  }

  // Return appropriate connection string based on database type
  switch (databaseType) {
    case 'postgresql':
      const sslMode = dbAccess.encryption === 'required' ? '?sslmode=require' : '';
      return `postgresql://${getCredentialsForService(serviceName, databaseInstance)}@${databaseInstance}:${dbAccess.port}/${getDatabaseName(dbAccess.tier)}${sslMode}`;

    case 'neo4j':
      const protocol = dbAccess.encryption === 'required' ? 'bolt+s' : 'bolt';
      return `${protocol}://${getCredentialsForService(serviceName, databaseInstance)}@${databaseInstance}:${dbAccess.port}`;

    case 'qdrant':
      const scheme = dbAccess.encryption === 'required' ? 'https' : 'http';
      return `${scheme}://${databaseInstance}:${dbAccess.port}`;

    case 'redis':
      return `redis://:${getPasswordForService(serviceName, databaseInstance)}@${databaseInstance}:${dbAccess.port}`;

    default:
      return null;
  }
}

/**
 * Helper functions for connection string generation
 */
function getCredentialsForService(serviceName: string, databaseInstance: string): string {
  // In production, these would come from secure credential management
  const credentialMap: Record<string, string> = {
    'postgres-security': 'uaip_security_user:${POSTGRES_SECURITY_PASSWORD}',
    'postgres-application': 'uaip_app_user:${POSTGRES_APPLICATION_PASSWORD}',
    'postgres-analytics': 'uaip_analytics_user:${POSTGRES_ANALYTICS_PASSWORD}',
    'postgres-operations': 'uaip_ops_user:${POSTGRES_OPERATIONS_PASSWORD}',
    'neo4j-security': 'neo4j:${NEO4J_SECURITY_PASSWORD}',
    'neo4j-knowledge': 'neo4j:${NEO4J_KNOWLEDGE_PASSWORD}',
    'neo4j-agent': 'neo4j:${NEO4J_AGENT_PASSWORD}',
    'neo4j-operations': 'neo4j:${NEO4J_OPERATIONS_PASSWORD}'
  };

  return credentialMap[databaseInstance] || '';
}

function getPasswordForService(serviceName: string, databaseInstance: string): string {
  const passwordMap: Record<string, string> = {
    'redis-security': '${REDIS_SECURITY_PASSWORD}',
    'redis-application': '${REDIS_APPLICATION_PASSWORD}'
  };

  return passwordMap[databaseInstance] || '';
}

function getDatabaseName(tier: DatabaseTier): string {
  const dbNameMap: Record<DatabaseTier, string> = {
    [DatabaseTier.SECURITY]: 'uaip_security',
    [DatabaseTier.APPLICATION]: 'uaip_application',
    [DatabaseTier.ANALYTICS]: 'uaip_analytics',
    [DatabaseTier.OPERATIONS]: 'uaip_operations',
    [DatabaseTier.DMZ]: 'uaip_dmz'
  };

  return dbNameMap[tier];
}