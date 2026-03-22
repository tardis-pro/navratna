import { AgentRole, AgentCreateRequest } from '@uaip/types';

import { logger } from '@uaip/utils';

/**
 * Service to transform frontend persona format to backend agent format
 * Addresses critical schema mismatch identified in TypeORM migration plan
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
    return (
      input.role &&
      ['assistant', 'analyzer', 'orchestrator', 'specialist'].includes(input.role) &&
      input.capabilities &&
      Array.isArray(input.capabilities)
    );
  }

  /**
   * Validates and normalizes an agent request
   */
  private static validateAndNormalizeAgentRequest(
    input: Record<string, unknown>
  ): AgentCreateRequest {
    const cfg = input.configuration as Record<string, unknown> | undefined;
    return {
      name: (input.name as string) || 'Unnamed Agent',
      description: (input.description as string) || 'No description provided',
      capabilities: (input.capabilities as string[]) || ['general'],
      role: (input.role as AgentRole) || AgentRole.ASSISTANT,
      configuration: {
        model: (cfg?.model as string) || (input.modelId as string),
        temperature: (cfg?.temperature as number) || (input.temperature as number) || 0.7,
        analysisDepth: (cfg?.analysisDepth as string) || 'intermediate',
        contextWindowSize: (cfg?.contextWindowSize as number) || 4000,
        decisionThreshold: (cfg?.decisionThreshold as number) || 0.7,
        learningEnabled: (cfg?.learningEnabled as boolean) ?? true,
        collaborationMode: (cfg?.collaborationMode as string) || 'collaborative',
      },
      // Model configuration fields
      modelId: input.modelId as string,
      apiType: input.apiType as string,
      securityLevel: (input.securityLevel as string) || 'medium',
      isActive: (input.isActive as boolean) ?? true,
    };
  }

  /**
   * Transforms persona format to agent request format
   */
  private static transformPersonaFormat(persona: Record<string, unknown>): AgentCreateRequest {
    // Extract persona data (handle nested persona object)
    const personaData = (persona.persona || persona) as Record<string, unknown>;

    // Generate description from available fields
    const description = this.generateDescription(personaData);

    // Extract capabilities from expertise or traits
    const capabilities = this.extractCapabilities(personaData);

    // Map role
    const role = this.mapPersonaRoleToAgentRole((personaData.role as string) || 'Assistant');

    return {
      name: (personaData.name as string) || 'Unnamed Agent',
      description,
      capabilities,
      role,
      configuration: {
        model: (personaData.modelId as string) || (personaData.model as string),
        temperature: (personaData.temperature as number) || 0.7,
        analysisDepth: this.mapAnalysisDepth(personaData),
        contextWindowSize: (personaData.contextWindowSize as number) || 4000,
        decisionThreshold: 0.7,
        learningEnabled: true,
        collaborationMode: this.mapCollaborationMode(personaData),
      },
      securityLevel: this.mapSecurityLevel(personaData),
      isActive: (personaData.isActive as boolean) ?? true,
    };
  }

  /**
   * Generates a description from persona data
   */
  private static generateDescription(personaData: Record<string, unknown>): string {
    if (personaData.description) {
      return personaData.description as string;
    }

    const role = (personaData.role as string) || 'Assistant';
    const expertise = this.extractCapabilities(personaData);
    const background = personaData.background
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
    return this.getDefaultCapabilitiesForRole((personaData.role as string) || 'Assistant');
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

  /**
   * Maps analysis depth from persona data
   */
  private static mapAnalysisDepth(
    personaData: Record<string, unknown>
  ): 'basic' | 'intermediate' | 'advanced' {
    if (personaData.analysisDepth) {
      return personaData.analysisDepth as 'basic' | 'intermediate' | 'advanced';
    }

    // Infer from role
    const role = (personaData.role as string) || '';
    if (role.includes('Senior') || role.includes('Lead') || role.includes('Manager')) {
      return 'advanced';
    }
    if (role.includes('Junior') || role.includes('Assistant')) {
      return 'basic';
    }
    return 'intermediate';
  }

  /**
   * Maps collaboration mode from persona data
   */
  private static mapCollaborationMode(
    personaData: Record<string, unknown>
  ): 'independent' | 'collaborative' | 'supervised' {
    if (personaData.collaborationMode) {
      return personaData.collaborationMode as 'independent' | 'collaborative' | 'supervised';
    }

    // Infer from role
    const role = (personaData.role as string) || '';
    if (role.includes('Lead') || role.includes('Manager') || role.includes('Senior')) {
      return 'independent';
    }
    if (role.includes('Junior') || role.includes('Assistant')) {
      return 'supervised';
    }
    return 'collaborative';
  }

  /**
   * Maps security level from persona data
   */
  private static mapSecurityLevel(
    personaData: Record<string, unknown>
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (personaData.securityLevel) {
      return personaData.securityLevel as 'low' | 'medium' | 'high' | 'critical';
    }

    // Infer from role
    const role = (personaData.role as string) || '';
    if (role.includes('Security') || role.includes('Admin')) {
      return 'high';
    }
    if (role.includes('Manager') || role.includes('Lead')) {
      return 'medium';
    }
    return 'medium'; // Default to medium security
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
