// Jest globals are available automatically

import { AgentTransformationService } from '../../agentTransformationService.js';

// Mock dependencies
jest.mock('@uaip/utils');
jest.mock('@uaip/types', () => ({
  AgentRole: {
    ASSISTANT: 'assistant',
    SPECIALIST: 'specialist',
    ANALYZER: 'analyzer',
    ORCHESTRATOR: 'orchestrator'
  }
}));

describe('AgentTransformationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('mapPersonaRoleToAgentRole', () => {
    it('should map Software Engineer to SPECIALIST', () => {
      const result = AgentTransformationService.mapPersonaRoleToAgentRole('Software Engineer');
      expect(result).toBe('specialist');
    });

    it('should map Tech Lead to ORCHESTRATOR', () => {
      const result = AgentTransformationService.mapPersonaRoleToAgentRole('Tech Lead');
      expect(result).toBe('orchestrator');
    });

    it('should map QA Engineer to ANALYZER', () => {
      const result = AgentTransformationService.mapPersonaRoleToAgentRole('QA Engineer');
      expect(result).toBe('analyzer');
    });

    it('should map Junior Developer to ASSISTANT', () => {
      const result = AgentTransformationService.mapPersonaRoleToAgentRole('Junior Developer');
      expect(result).toBe('assistant');
    });

    it('should default to ASSISTANT for unknown role', () => {
      const result = AgentTransformationService.mapPersonaRoleToAgentRole('Unknown Role');
      expect(result).toBe('assistant');
    });

    it('should handle empty string role', () => {
      const result = AgentTransformationService.mapPersonaRoleToAgentRole('');
      expect(result).toBe('assistant');
    });
  });

  describe('transformPersonaToAgentRequest', () => {
    it('should transform persona format to agent request', () => {
      const personaInput = {
        name: 'John Developer',
        role: 'Software Engineer',
        expertise: ['JavaScript', 'React', 'Node.js'],
        background: 'Frontend development',
        modelId: 'gpt-4',
        temperature: 0.8
      };

      const result = AgentTransformationService.transformPersonaToAgentRequest(personaInput);

      expect(result).toEqual(expect.objectContaining({
        name: 'John Developer',
        description: expect.stringContaining('Software Engineer'),
        capabilities: ['JavaScript', 'React', 'Node.js'],
        role: 'specialist',
        securityLevel: 'medium',
        isActive: true,
        configuration: expect.objectContaining({
          model: 'gpt-4',
          temperature: 0.8,
          analysisDepth: 'intermediate',
          collaborationMode: 'collaborative'
        })
      }));
    });

    it('should handle nested persona object', () => {
      const inputWithNestedPersona = {
        persona: {
          name: 'Jane Analyst',
          role: 'Data Scientist',
          expertise: ['Python', 'Machine Learning'],
          modelId: 'claude-3'
        }
      };

      const result = AgentTransformationService.transformPersonaToAgentRequest(inputWithNestedPersona);

      expect(result.name).toBe('Jane Analyst');
      expect(result.role).toBe('analyzer');
      expect(result.capabilities).toEqual(['Python', 'Machine Learning']);
    });

    it('should handle agent format input', () => {
      const agentInput = {
        name: 'Test Agent',
        description: 'A test agent',
        role: 'specialist',
        capabilities: ['programming', 'testing'],
        configuration: {
          model: 'gpt-4',
          temperature: 0.7
        }
      };

      const result = AgentTransformationService.transformPersonaToAgentRequest(agentInput);

      expect(result).toEqual(expect.objectContaining({
        name: 'Test Agent',
        description: 'A test agent',
        role: 'specialist',
        capabilities: ['programming', 'testing']
      }));
    });

    it('should generate default values for missing fields', () => {
      const minimalInput = {
        name: 'Minimal Agent'
      };

      const result = AgentTransformationService.transformPersonaToAgentRequest(minimalInput);

      expect(result.name).toBe('Minimal Agent');
      expect(result.description).toContain('Assistant');
      expect(result.role).toBe('assistant');
      expect(result.capabilities).toEqual(['general', 'problem-solving', 'communication']);
      expect(result.securityLevel).toBe('medium');
      expect(result.isActive).toBe(true);
    });

    it('should extract capabilities from different sources', () => {
      const inputWithTraits = {
        name: 'Test',
        role: 'Designer',
        traits: ['creative', 'detail-oriented', 'user-focused']
      };

      const result = AgentTransformationService.transformPersonaToAgentRequest(inputWithTraits);
      expect(result.capabilities).toEqual(['creative', 'detail-oriented', 'user-focused']);

      const inputWithSkills = {
        name: 'Test',
        role: 'Developer',
        skills: ['Python', 'Django', 'PostgreSQL']
      };

      const result2 = AgentTransformationService.transformPersonaToAgentRequest(inputWithSkills);
      expect(result2.capabilities).toEqual(['Python', 'Django', 'PostgreSQL']);
    });

    it('should map analysis depth based on role seniority', () => {
      const seniorInput = {
        name: 'Senior Dev',
        role: 'Senior Software Engineer',
        expertise: ['Java']
      };

      const result = AgentTransformationService.transformPersonaToAgentRequest(seniorInput);
      expect(result.configuration.analysisDepth).toBe('advanced');

      const juniorInput = {
        name: 'Junior Dev',
        role: 'Junior Developer',
        expertise: ['JavaScript']
      };

      const result2 = AgentTransformationService.transformPersonaToAgentRequest(juniorInput);
      expect(result2.configuration.analysisDepth).toBe('basic');
    });

    it('should map collaboration mode based on role', () => {
      const leadInput = {
        name: 'Team Lead',
        role: 'Tech Lead',
        expertise: ['Leadership']
      };

      const result = AgentTransformationService.transformPersonaToAgentRequest(leadInput);
      expect(result.configuration.collaborationMode).toBe('independent');

      const assistantInput = {
        name: 'Assistant',
        role: 'Junior Developer',
        expertise: ['Basic coding']
      };

      const result2 = AgentTransformationService.transformPersonaToAgentRequest(assistantInput);
      expect(result2.configuration.collaborationMode).toBe('supervised');
    });

    it('should map security level based on role', () => {
      const securityInput = {
        name: 'Security Expert',
        role: 'Security Engineer',
        expertise: ['Cybersecurity']
      };

      const result = AgentTransformationService.transformPersonaToAgentRequest(securityInput);
      expect(result.securityLevel).toBe('high');

      const managerInput = {
        name: 'Manager',
        role: 'Engineering Manager',
        expertise: ['Management']
      };

      const result2 = AgentTransformationService.transformPersonaToAgentRequest(managerInput);
      expect(result2.securityLevel).toBe('medium');
    });

    it('should handle transformation errors', () => {
      const invalidInput = null;

      expect(() => {
        AgentTransformationService.transformPersonaToAgentRequest(invalidInput);
      }).toThrow();
    });
  });

  describe('validateTransformation', () => {
    it('should validate complete transformation result', () => {
      const validResult = {
        name: 'Test Agent',
        description: 'A test agent',
        capabilities: ['programming'],
        role: 'specialist',
        configuration: {
          model: 'gpt-4',
          temperature: 0.7
        }
      };

      const result = AgentTransformationService.validateTransformation(validResult as any);
      expect(result).toBe(true);
    });

    it('should reject incomplete transformation result', () => {
      const incompleteResult = {
        name: 'Test Agent'
        // Missing required fields
      };

      const result = AgentTransformationService.validateTransformation(incompleteResult as any);
      expect(result).toBe(false);
    });

    it('should reject result with empty capabilities', () => {
      const resultWithEmptyCapabilities = {
        name: 'Test Agent',
        description: 'A test agent',
        capabilities: [],
        role: 'specialist',
        configuration: {}
      };

      const result = AgentTransformationService.validateTransformation(resultWithEmptyCapabilities as any);
      expect(result).toBe(false);
    });
  });

  describe('getTransformationStats', () => {
    it('should return transformation statistics object', () => {
      const stats = AgentTransformationService.getTransformationStats();

      expect(stats).toEqual(expect.objectContaining({
        totalTransformations: expect.any(Number),
        successfulTransformations: expect.any(Number),
        failedTransformations: expect.any(Number)
      }));
    });
  });

  describe('edge cases', () => {
    it('should handle input with background string as capability', () => {
      const input = {
        name: 'Test',
        role: 'Consultant',
        background: 'Financial services'
      };

      const result = AgentTransformationService.transformPersonaToAgentRequest(input);
      expect(result.capabilities).toEqual(['Financial services']);
    });

    it('should handle multiple capability sources', () => {
      const input = {
        name: 'Test',
        role: 'Full Stack Developer',
        capabilities: ['JavaScript'],
        expertise: ['React'], // Should prefer direct capabilities over expertise
        skills: ['Node.js']
      };

      const result = AgentTransformationService.transformPersonaToAgentRequest(input);
      expect(result.capabilities).toEqual(['JavaScript']);
    });

    it('should generate description from role and capabilities', () => {
      const input = {
        name: 'Test Developer',
        role: 'Backend Developer',
        expertise: ['Python', 'Django']
      };

      const result = AgentTransformationService.transformPersonaToAgentRequest(input);
      expect(result.description).toContain('Backend Developer');
      expect(result.description).toContain('Python');
      expect(result.description).toContain('Django');
    });

    it('should handle specializations as capabilities', () => {
      const input = {
        name: 'Specialist',
        role: 'Data Scientist',
        specializations: ['NLP', 'Computer Vision', 'Deep Learning']
      };

      const result = AgentTransformationService.transformPersonaToAgentRequest(input);
      expect(result.capabilities).toEqual(['NLP', 'Computer Vision', 'Deep Learning']);
    });
  });
});