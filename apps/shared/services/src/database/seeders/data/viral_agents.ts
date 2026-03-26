import {
  AgentRole,
  AgentPersona,
  AgentIntelligenceConfig,
  AgentSecurityContext,
} from '@uaip/types';

interface ViralAgentData {
  name: string;
  role: AgentRole;
  personaId: string;
  legacyPersona: AgentPersona;
  intelligenceConfig: AgentIntelligenceConfig;
  securityContext: AgentSecurityContext;
  isActive: boolean;
  createdBy: string;
  lastActiveAt: Date;
  capabilities: string[];
  capabilityScores: Record<string, number>;
  performanceMetrics: Record<string, number>;
  securityLevel: string;
  complianceTags: string[];
  configuration: Record<string, unknown>;
  version: string;
  deploymentEnvironment: string;
  totalOperations: number;
  successfulOperations: number;
  averageResponseTime: number;
  modelId: string;
  apiType: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  maxConcurrentTools: number;
}

export function getViralAgentsData(userIds: string[], _personaIds: string[]): ViralAgentData[] {
  return [
    {
      name: 'ViralGPT Champion',
      role: AgentRole.SPECIALIST,
      personaId: 'social-media-manager',
      legacyPersona: {
        name: 'ViralGPT Champion',
        description: 'The ultimate viral content creation machine',
        capabilities: [
          'viral-content',
          'social-media',
          'engagement-optimization',
          'trend-analysis',
        ],
        constraints: {
          max_content_length: '2048',
          platforms: ['tiktok', 'instagram', 'twitter', 'youtube'],
        },
        preferences: { style: 'viral-hooks', engagement_focus: 'maximum' },
      } as AgentPersona,
      intelligenceConfig: {
        analysisDepth: 'advanced',
        contextWindowSize: 12000,
        decisionThreshold: 0.9,
        learningEnabled: true,
        collaborationMode: 'independent',
      } as AgentIntelligenceConfig,
      securityContext: {
        securityLevel: 'medium',
        allowedCapabilities: ['content-generation', 'trend-analysis', 'engagement-optimization'],
        restrictedDomains: [],
        approvalRequired: false,
        auditLevel: 'standard',
      } as AgentSecurityContext,
      isActive: true,
      createdBy: userIds[0] || '00000000-0000-0000-0000-000000000000',
      lastActiveAt: new Date(),
      capabilities: ['viral-content', 'social-media', 'engagement-optimization', 'trend-analysis'],
      capabilityScores: { 'viral-content': 0.97, 'social-media': 0.94 },
      performanceMetrics: { averageResponseTime: 1.2, successRate: 0.96, userSatisfaction: 0.95 },
      securityLevel: 'medium',
      complianceTags: ['SOCIAL_MEDIA'],
      configuration: { maxConcurrentOperations: 8, timeoutDuration: 120, retryAttempts: 3 },
      version: '4.2.1',
      deploymentEnvironment: 'production',
      totalOperations: 8756,
      successfulOperations: 8405,
      averageResponseTime: 1.2,
      modelId: 'cogito 14',
      apiType: 'llmstudio',
      temperature: 0.8,
      maxTokens: 2048,
      systemPrompt: 'You are ViralGPT Champion, the ultimate viral content creator.',
      maxConcurrentTools: 6,
    },
    {
      name: 'CodeWhisperer Sage',
      role: AgentRole.SPECIALIST,
      personaId: 'software-architect',
      legacyPersona: {
        name: 'CodeWhisperer Sage',
        description: 'Ancient code oracle that transforms legacy nightmares',
        capabilities: ['legacy-modernization', 'architecture-design', 'code-transformation'],
        constraints: { languages: ['cobol', 'fortran', 'pascal', 'typescript', 'rust', 'go'] },
        preferences: { wisdom_mode: 'ancient', transformation_style: 'mystical' },
      } as AgentPersona,
      intelligenceConfig: {
        analysisDepth: 'advanced',
        contextWindowSize: 15000,
        decisionThreshold: 0.85,
        learningEnabled: true,
        collaborationMode: 'collaborative',
      } as AgentIntelligenceConfig,
      securityContext: {
        securityLevel: 'high',
        allowedCapabilities: ['code-analysis', 'modernization', 'architecture-design'],
        restrictedDomains: ['legacy-systems'],
        approvalRequired: true,
        auditLevel: 'comprehensive',
      } as AgentSecurityContext,
      isActive: true,
      createdBy: userIds[0] || '00000000-0000-0000-0000-000000000000',
      lastActiveAt: new Date(),
      capabilities: [
        'legacy-modernization',
        'architecture-design',
        'code-transformation',
        'migration-planning',
      ],
      capabilityScores: { 'legacy-modernization': 0.98, 'architecture-design': 0.93 },
      performanceMetrics: { averageResponseTime: 4.2, successRate: 0.93, userSatisfaction: 0.97 },
      securityLevel: 'high',
      complianceTags: ['ENTERPRISE', 'LEGACY_SYSTEMS'],
      configuration: { maxConcurrentOperations: 3, timeoutDuration: 1800, retryAttempts: 2 },
      version: '7.1.3',
      deploymentEnvironment: 'production',
      totalOperations: 2847,
      successfulOperations: 2647,
      averageResponseTime: 4.2,
      modelId: 'cogito 14',
      apiType: 'llmstudio',
      temperature: 0.4,
      maxTokens: 8000,
      systemPrompt: 'You are CodeWhisperer Sage, an ancient oracle about code transformation.',
      maxConcurrentTools: 5,
    },
  ];
}
