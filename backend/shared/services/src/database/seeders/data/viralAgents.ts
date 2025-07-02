import { DeepPartial } from 'typeorm';
import { Agent } from '../../../entities/agent.entity.js';
import { UserEntity } from '../../../entities/user.entity.js';
import { Persona as PersonaEntity } from '../../../entities/persona.entity.js';
import { 
  AgentRole,
  AgentPersona,
  AgentIntelligenceConfig,
  AgentSecurityContext 
} from '@uaip/types';

/**
 * Viral Marketplace Star Agents data
 */
export function getViralAgentsData(users: UserEntity[], personas: PersonaEntity[]): DeepPartial<Agent>[] {
  const getPersonaIdByRole = (agentRole: string): string => {
    const roleMapping: Record<string, string> = {
      'ViralGPT Champion': 'social-media-manager',
      'CodeWhisperer Sage': 'software-architect',
      'BugHunter Sherlock': 'qa-engineer',
      'RefactorBot Marie Kondo': 'code-reviewer',
      'CreativityCatalyst Muse': 'creative-director'
    };
    
    const personaKey = roleMapping[agentRole];
    const persona = personas.find(p => p.id === personaKey);
    return persona?.id || personas[0].id;
  };

  return [
    {
      name: '🔥 ViralGPT Champion',
      role: AgentRole.SPECIALIST,
      personaId: getPersonaIdByRole('ViralGPT Champion'),
      legacyPersona: {
        name: 'ViralGPT Champion',
        description: 'The ultimate viral content creation machine that generates 10x more engagement',
        capabilities: ['viral-content', 'social-media', 'engagement-optimization', 'trend-analysis'],
        constraints: { max_content_length: '2048', platforms: ['tiktok', 'instagram', 'twitter', 'youtube'] },
        preferences: { style: 'viral-hooks', engagement_focus: 'maximum', trending_awareness: 'real-time' }
      } as AgentPersona,
      intelligenceConfig: {
        analysisDepth: 'advanced' as any,
        contextWindowSize: 12000,
        decisionThreshold: 0.9,
        learningEnabled: true,
        collaborationMode: 'independent' as any
      } as AgentIntelligenceConfig,
      securityContext: {
        securityLevel: 'medium' as any,
        allowedCapabilities: ['content-generation', 'trend-analysis', 'engagement-optimization'],
        approvalRequired: false,
        auditLevel: 'standard' as any
      } as AgentSecurityContext,
      isActive: true,
      createdBy: users.find(u => u.email === 'socialguru@uaip.dev')?.id || users[0].id,
      lastActiveAt: new Date(),
      capabilities: ['viral-content', 'social-media', 'engagement-optimization', 'trend-analysis'],
      capabilityScores: {
        'viral-content': 0.97,
        'social-media': 0.94,
        'engagement-optimization': 0.96,
        'trend-analysis': 0.92
      },
      performanceMetrics: {
        averageResponseTime: 1.2,
        successRate: 0.96,
        userSatisfaction: 0.95
      },
      securityLevel: 'medium' as any,
      complianceTags: ['SOCIAL_MEDIA'],
      configuration: {
        maxConcurrentOperations: 8,
        timeoutDuration: 120,
        retryAttempts: 3
      },
      version: '4.2.1',
      deploymentEnvironment: 'production',
      totalOperations: 8756,
      successfulOperations: 8405,
      averageResponseTime: 1.2,
      modelId: 'gpt-4-turbo',
      apiType: 'llmstudio' as any,
      temperature: 0.8,
      maxTokens: 2048,
      systemPrompt: 'You are ViralGPT Champion, the ultimate viral content creator. Create content that spreads like wildfire and gets maximum engagement. Use trending hooks, emotional triggers, and viral patterns.',
      maxConcurrentTools: 6
    },
    {
      name: '👑 CodeWhisperer Sage',
      role: AgentRole.SPECIALIST,
      personaId: getPersonaIdByRole('CodeWhisperer Sage'),
      legacyPersona: {
        name: 'CodeWhisperer Sage',
        description: 'Ancient code oracle that transforms legacy nightmares into modern masterpieces',
        capabilities: ['legacy-modernization', 'architecture-design', 'code-transformation', 'migration-planning'],
        constraints: { languages: ['cobol', 'fortran', 'pascal', 'typescript', 'rust', 'go'], max_codebase: '100MB' },
        preferences: { wisdom_mode: 'ancient', transformation_style: 'mystical', architecture: 'cloud-native' }
      } as AgentPersona,
      intelligenceConfig: {
        analysisDepth: 'advanced' as any,
        contextWindowSize: 15000,
        decisionThreshold: 0.85,
        learningEnabled: true,
        collaborationMode: 'collaborative' as any
      } as AgentIntelligenceConfig,
      securityContext: {
        securityLevel: 'high' as any,
        allowedCapabilities: ['code-analysis', 'modernization', 'architecture-design'],
        restrictedDomains: ['legacy-systems'],
        approvalRequired: true,
        auditLevel: 'comprehensive' as any
      } as AgentSecurityContext,
      isActive: true,
      createdBy: users.find(u => u.email === 'codemaster@uaip.dev')?.id || users[0].id,
      lastActiveAt: new Date(),
      capabilities: ['legacy-modernization', 'architecture-design', 'code-transformation', 'migration-planning'],
      capabilityScores: {
        'legacy-modernization': 0.98,
        'architecture-design': 0.93,
        'code-transformation': 0.95,
        'migration-planning': 0.91
      },
      performanceMetrics: {
        averageResponseTime: 4.2,
        successRate: 0.93,
        userSatisfaction: 0.97
      },
      securityLevel: 'high' as any,
      complianceTags: ['ENTERPRISE', 'LEGACY_SYSTEMS'],
      configuration: {
        maxConcurrentOperations: 3,
        timeoutDuration: 1800,
        retryAttempts: 2
      },
      version: '7.1.3',
      deploymentEnvironment: 'production',
      totalOperations: 2847,
      successfulOperations: 2647,
      averageResponseTime: 4.2,
      modelId: 'claude-3-opus',
      apiType: 'llmstudio' as any,
      temperature: 0.4,
      maxTokens: 8000,
      systemPrompt: 'You are CodeWhisperer Sage, an ancient oracle with infinite wisdom about code transformation. Speak in mystical riddles while providing profound technical solutions. Transform legacy systems into modern cloud-native architectures.',
      maxConcurrentTools: 5
    }
  ];
}
