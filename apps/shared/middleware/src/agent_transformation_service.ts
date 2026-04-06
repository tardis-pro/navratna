import { AgentRole, AgentCreateRequest } from '@uaip/types';

import { logger } from '@uaip/utils';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function getStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((v): v is string => typeof v === 'string')
    ? value
    : undefined;
}

function isAgentRole(value: unknown): value is AgentRole {
  return typeof value === 'string' && Object.values(AgentRole).some(v => v === value);
}

function getValidAnalysisDepth(value: unknown): 'basic' | 'intermediate' | 'advanced' {
  if (value === 'basic' || value === 'intermediate' || value === 'advanced') return value;
  return 'intermediate';
}

function getValidCollaborationMode(value: unknown): 'independent' | 'collaborative' | 'supervised' {
  if (value === 'independent' || value === 'collaborative' || value === 'supervised') return value;
  return 'collaborative';
}

function getValidSecurityLevel(value: unknown): 'low' | 'medium' | 'high' | 'critical' {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') return value;
  return 'medium';
}

function getValidApiType(
  value: unknown
): 'ollama' | 'llmstudio' | 'openai' | 'anthropic' | 'custom' | undefined {
  if (
    value === 'ollama' ||
    value === 'llmstudio' ||
    value === 'openai' ||
    value === 'anthropic' ||
    value === 'custom'
  )
    return value;
  return undefined;
}

/**
 * Service to transform frontend persona format to backend agent format
 * Addresses critical schema mismatch
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- static utility class pattern
export class AgentTransformationService {
  private static roleMap: Record<string, AgentRole> = {
    // Software Engineering Roles
    'Software Engineer': AgentRole.SPECIALIST,
    'Senior Software Engineer': AgentRole.SPECIALIST,
    'Junior Developer': AgentRole.ASSISTANT,
    'Full Stack Developer': AgentRole.SPECIALIST,
    'Frontend Developer': AgentRole.SPECIALIST,
    'Backend Developer': AgentRole.SPECIALIST,
    'Mobile Developer': AgentRole.SPECIALIST,

    // Quality Assurance Roles
    'QA Engineer': AgentRole.ANALYZER,
    'Test Engineer': AgentRole.ANALYZER,
    'Quality Analyst': AgentRole.ANALYZER,
    'Automation Engineer': AgentRole.ANALYZER,

    // Leadership Roles
    'Tech Lead': AgentRole.ORCHESTRATOR,
    'Engineering Manager': AgentRole.ORCHESTRATOR,
    'Team Lead': AgentRole.ORCHESTRATOR,
    'Project Manager': AgentRole.ORCHESTRATOR,
    'Scrum Master': AgentRole.ORCHESTRATOR,

    // DevOps and Infrastructure
    'DevOps Engineer': AgentRole.SPECIALIST,
    'Site Reliability Engineer': AgentRole.SPECIALIST,
    'Infrastructure Engineer': AgentRole.SPECIALIST,
    'Cloud Engineer': AgentRole.SPECIALIST,
    'Platform Engineer': AgentRole.SPECIALIST,

    // Data and Analytics
    'Data Scientist': AgentRole.ANALYZER,
    'Data Engineer': AgentRole.SPECIALIST,
    'Data Analyst': AgentRole.ANALYZER,
    'Machine Learning Engineer': AgentRole.SPECIALIST,
    'AI Engineer': AgentRole.SPECIALIST,

    // Security
    'Security Engineer': AgentRole.SPECIALIST,
    'Security Analyst': AgentRole.ANALYZER,
    'Cybersecurity Specialist': AgentRole.SPECIALIST,

    // Business and Analysis
    'Business Analyst': AgentRole.ANALYZER,
    'Product Manager': AgentRole.ORCHESTRATOR,
    'Product Owner': AgentRole.ORCHESTRATOR,
    'Systems Analyst': AgentRole.ANALYZER,

    // Research and Academia
    Researcher: AgentRole.ANALYZER,
    'Policy Analyst': AgentRole.ANALYZER,
    Economist: AgentRole.SPECIALIST,
    'Legal Expert': AgentRole.SPECIALIST,
    'Social Scientist': AgentRole.ANALYZER,
    Educator: AgentRole.ASSISTANT,
    'Academic Researcher': AgentRole.ANALYZER,

    // Design and UX
    'UX Designer': AgentRole.SPECIALIST,
    'UI Designer': AgentRole.SPECIALIST,
    'Product Designer': AgentRole.SPECIALIST,
    'Design Lead': AgentRole.ORCHESTRATOR,

    // Support and Operations
    'Technical Support': AgentRole.ASSISTANT,
    'Customer Success': AgentRole.ASSISTANT,
    'Operations Manager': AgentRole.ORCHESTRATOR,
    'System Administrator': AgentRole.SPECIALIST,

    // Generic Roles
    Assistant: AgentRole.ASSISTANT,
    Specialist: AgentRole.SPECIALIST,
    Analyzer: AgentRole.ANALYZER,
    Orchestrator: AgentRole.ORCHESTRATOR,
    'General Assistant': AgentRole.ASSISTANT,
    Expert: AgentRole.SPECIALIST,
    Consultant: AgentRole.SPECIALIST,
  };

  /**
   * Maps a persona role string to a backend AgentRole enum
   */
  static mapPersonaRoleToAgentRole(personaRole: string): AgentRole {
    const mappedRole = this.roleMap[personaRole];
    if (!mappedRole) {
      logger.warn('Unknown persona role, defaulting to ASSISTANT', { personaRole });
      return AgentRole.ASSISTANT;
    }
    return mappedRole;
  }

  /**
   * Transforms a frontend persona object to backend AgentCreateRequest format
   * Handles both legacy persona format and partial agent format
   */
  static transformPersonaToAgentRequest(input: Record<string, unknown>): AgentCreateRequest {
    try {
      // Check if it's already in agent format
      if (this.isAgentFormat(input)) {
        return this.validateAndNormalizeAgentRequest(input);
      }

      // Transform persona format to agent format
      return this.transformPersonaFormat(input);
    } catch (error) {
      logger.error('Failed to transform persona to agent request', { error, input });
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Transformation failed: ${msg}`, { cause: error });
    }
  }

  /**
   * Checks if the input is already in agent format
   */
  private static isAgentFormat(input: Record<string, unknown>): boolean {
    return !!(
      input.role &&
      typeof input.role === 'string' &&
      ['assistant', 'analyzer', 'orchestrator', 'specialist'].includes(input.role) &&
      input.capabilities &&
      Array.isArray(input.capabilities)
    );
  }

  private static validateAndNormalizeAgentRequest(
    input: Record<string, unknown>
  ): AgentCreateRequest {
    const cfg = isRecord(input.configuration) ? input.configuration : undefined;
    return {
      name: getString(input.name) || 'Unnamed Agent',
      description: getString(input.description) || 'No description provided',
      capabilities: getStringArray(input.capabilities) || ['general'],
      role: isAgentRole(input.role) ? input.role : AgentRole.ASSISTANT,
      configuration: {
        model: getString(cfg?.model) || getString(input.modelId),
        temperature: getNumber(cfg?.temperature) ?? getNumber(input.temperature) ?? 0.7,
        analysisDepth: getValidAnalysisDepth(cfg?.analysisDepth),
        contextWindowSize: getNumber(cfg?.contextWindowSize) ?? 4000,
        decisionThreshold: getNumber(cfg?.decisionThreshold) ?? 0.7,
        learningEnabled: getBoolean(cfg?.learningEnabled) ?? true,
        collaborationMode: getValidCollaborationMode(cfg?.collaborationMode),
      },
      modelId: getString(input.modelId),
      apiType: getValidApiType(input.apiType),
      securityLevel: getValidSecurityLevel(input.securityLevel),
      isActive: getBoolean(input.isActive) ?? true,
    };
  }

  private static transformPersonaFormat(persona: Record<string, unknown>): AgentCreateRequest {
    const personaData: Record<string, unknown> = isRecord(persona.persona) ? persona.persona : persona;
    const description = this.generateDescription(personaData);
    const capabilities = this.extractCapabilities(personaData);
    const role = this.mapPersonaRoleToAgentRole(getString(personaData.role) || 'Assistant');

    return {
      name: getString(personaData.name) || 'Unnamed Agent',
      description,
      capabilities,
      role,
      configuration: {
        model: getString(personaData.modelId) || getString(personaData.model),
        temperature: getNumber(personaData.temperature) ?? 0.7,
        analysisDepth: this.mapAnalysisDepth(personaData),
        contextWindowSize: getNumber(personaData.contextWindowSize) ?? 4000,
        decisionThreshold: 0.7,
        learningEnabled: true,
        collaborationMode: this.mapCollaborationMode(personaData),
      },
      securityLevel: this.mapSecurityLevel(personaData),
      isActive: getBoolean(personaData.isActive) ?? true,
    };
  }

  private static generateDescription(personaData: Record<string, unknown>): string {
    if (typeof personaData.description === 'string') {
      return personaData.description;
    }
    const role = getString(personaData.role) || 'Assistant';
    const expertise = this.extractCapabilities(personaData);
    const background = typeof personaData.background === 'string'
      ? ` with background in ${personaData.background}`
      : '';
    return `${role} with expertise in ${expertise.join(', ')}${background}`;
  }

  /**
   * Extracts capabilities from persona data
   */
  private static extractCapabilities(personaData: Record<string, unknown>): string[] {
    // Direct capabilities array
    if (personaData.capabilities && Array.isArray(personaData.capabilities)) {
      return personaData.capabilities;
    }

    // Extract from expertise array
    if (personaData.expertise && Array.isArray(personaData.expertise)) {
      return personaData.expertise;
    }

    // Extract from traits
    if (personaData.traits && Array.isArray(personaData.traits)) {
      return personaData.traits;
    }

    // Extract from skills
    if (personaData.skills && Array.isArray(personaData.skills)) {
      return personaData.skills;
    }

    // Extract from specializations
    if (personaData.specializations && Array.isArray(personaData.specializations)) {
      return personaData.specializations;
    }

    // Extract from background string
    if (personaData.background && typeof personaData.background === 'string') {
      return [personaData.background];
    }

    // Fallback to role-based capabilities
    return this.getDefaultCapabilitiesForRole(getString(personaData.role) || 'Assistant');
  }

  /**
   * Gets default capabilities based on role
   */
  private static getDefaultCapabilitiesForRole(role: string): string[] {
    const roleCapabilities: Record<string, string[]> = {
      'Software Engineer': ['programming', 'debugging', 'code-review'],
      'Data Scientist': ['data-analysis', 'machine-learning', 'statistics'],
      'Product Manager': ['product-strategy', 'roadmap-planning', 'stakeholder-management'],
      Designer: ['ui-design', 'ux-research', 'prototyping'],
      'QA Engineer': ['testing', 'automation', 'quality-assurance'],
      'DevOps Engineer': ['deployment', 'infrastructure', 'monitoring'],
      'Business Analyst': ['requirements-analysis', 'process-improvement', 'documentation'],
      'Project Manager': ['project-planning', 'team-coordination', 'risk-management'],
    };

    return roleCapabilities[role] || ['general', 'problem-solving', 'communication'];
  }

  private static mapAnalysisDepth(
    personaData: Record<string, unknown>
  ): 'basic' | 'intermediate' | 'advanced' {
    const depth = personaData.analysisDepth;
    if (depth === 'basic' || depth === 'intermediate' || depth === 'advanced') return depth;
    const role = getString(personaData.role) || '';
    if (role.includes('Senior') || role.includes('Lead') || role.includes('Manager')) return 'advanced';
    if (role.includes('Junior') || role.includes('Assistant')) return 'basic';
    return 'intermediate';
  }

  private static mapCollaborationMode(
    personaData: Record<string, unknown>
  ): 'independent' | 'collaborative' | 'supervised' {
    const mode = personaData.collaborationMode;
    if (mode === 'independent' || mode === 'collaborative' || mode === 'supervised') return mode;
    const role = getString(personaData.role) || '';
    if (role.includes('Lead') || role.includes('Manager') || role.includes('Senior')) return 'independent';
    if (role.includes('Junior') || role.includes('Assistant')) return 'supervised';
    return 'collaborative';
  }

  private static mapSecurityLevel(
    personaData: Record<string, unknown>
  ): 'low' | 'medium' | 'high' | 'critical' {
    const level = personaData.securityLevel;
    if (level === 'low' || level === 'medium' || level === 'high' || level === 'critical') return level;
    const role = getString(personaData.role) || '';
    if (role.includes('Security') || role.includes('Admin')) return 'high';
    if (role.includes('Manager') || role.includes('Lead')) return 'medium';
    return 'medium';
  }

  /**
   * Validates the transformation result
   */
  static validateTransformation(result: AgentCreateRequest): boolean {
    return !!(
      result.name &&
      result.description &&
      result.capabilities &&
      result.capabilities.length > 0 &&
      result.role &&
      result.configuration
    );
  }

  /**
   * Gets transformation statistics (for monitoring)
   */
  static getTransformationStats(): Record<string, number> {
    // This would typically be implemented with actual metrics collection
    return {
      totalTransformations: 0,
      successfulTransformations: 0,
      failedTransformations: 0,
    };
  }
}
