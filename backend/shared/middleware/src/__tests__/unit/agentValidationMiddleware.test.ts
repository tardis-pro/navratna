// Jest globals are available automatically

import { Request, Response, NextFunction } from 'express';
import { AgentValidationMiddleware } from '../../agentValidationMiddleware.js';

// Mock dependencies
jest.mock('@uaip/utils');
jest.mock('@uaip/types');

// Mock AgentTransformationService with proper methods
jest.mock('../../agentTransformationService.js', () => ({
  AgentTransformationService: {
    transformPersonaToAgentRequest: jest.fn((data) => ({
      name: data.name,
      role: 'SPECIALIST',
      capabilities: ['test-capability'],
      securityLevel: 'MEDIUM'
    })),
    getTransformationStats: jest.fn(() => ({ transformations: 0 }))
  }
}));

// Mock Express objects
const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
  body: {},
  query: {},
  params: {},
  validationMeta: undefined,
  ...overrides
} as any);

const createMockResponse = (): Response => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis()
} as any);

const createMockNext = (): NextFunction => jest.fn();

describe('AgentValidationMiddleware', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = createMockRequest() as any;
    res = createMockResponse() as any;
    next = createMockNext();
    jest.clearAllMocks();
  });

  describe('validateAgentCreation', () => {
    it('should validate valid agent creation request', () => {
      req.body = {
        name: 'Test Agent',
        description: 'A test agent',
        role: 'SPECIALIST',
        capabilities: ['programming', 'testing'],
        securityLevel: 'medium'
      };

      // Mock the schema validation to pass
      const mockSchema = {
        parse: jest.fn().mockReturnValue(req.body)
      };
      
      // Mock the imports
      require('@uaip/types').AgentCreateRequestSchema = mockSchema;

      // Mock the business rules validation to avoid errors
      const originalValidateBusinessRules = AgentValidationMiddleware['validateBusinessRules'];
      AgentValidationMiddleware['validateBusinessRules'] = jest.fn();

      AgentValidationMiddleware.validateAgentCreation(req, res, next);

      // Restore original method
      AgentValidationMiddleware['validateBusinessRules'] = originalValidateBusinessRules;

      expect(next).toHaveBeenCalledWith();
      expect(req.validationMeta).toBeDefined();
      expect(req.validationMeta?.transformationApplied).toBe(false);
    });

    it('should handle persona transformation', () => {
      req.body = {
        name: 'Test Persona',
        role: 'Software Engineer',
        expertise: ['JavaScript', 'React'],
        background: 'Frontend development'
      };

      // Mock transformation service
      const mockTransformationService = require('../../agentTransformationService.js');
      mockTransformationService.AgentTransformationService = {
        transformPersonaToAgentRequest: jest.fn().mockReturnValue({
          name: 'Test Persona',
          description: 'Software Engineer with expertise in JavaScript, React',
          role: 'specialist',
          capabilities: ['JavaScript', 'React'],
          securityLevel: 'medium'
        }),
        getTransformationStats: jest.fn().mockReturnValue({})
      };

      // Mock the schema validation to pass
      const mockSchema = {
        parse: jest.fn().mockReturnValue(req.body)
      };
      require('@uaip/types').AgentCreateRequestSchema = mockSchema;

      // Mock the business rules validation to avoid errors
      const originalValidateBusinessRules = AgentValidationMiddleware['validateBusinessRules'];
      AgentValidationMiddleware['validateBusinessRules'] = jest.fn();

      AgentValidationMiddleware.validateAgentCreation(req, res, next);

      // Restore original method
      AgentValidationMiddleware['validateBusinessRules'] = originalValidateBusinessRules;

      expect(next).toHaveBeenCalledWith();
      expect(req.validationMeta?.transformationApplied).toBe(true);
    });

    it('should reject invalid request body', () => {
      req.body = null;

      AgentValidationMiddleware.validateAgentCreation(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should handle validation errors', () => {
      req.body = {
        name: 'Test Agent'
        // Missing required fields
      };

      // Mock schema to throw validation error
      const mockError = new Error('Validation failed');
      mockError.name = 'ZodError';
      (mockError as any).errors = [
        {
          path: ['role'],
          message: 'Role is required',
          code: 'invalid_type'
        }
      ];

      const mockSchema = {
        parse: jest.fn().mockImplementation(() => {
          throw mockError;
        })
      };
      require('@uaip/types').AgentCreateRequestSchema = mockSchema;

      AgentValidationMiddleware.validateAgentCreation(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe('validateAgentUpdate', () => {
    it('should validate agent update request', () => {
      req.body = {
        name: 'Updated Agent',
        description: 'Updated description'
      };

      // Mock the schema validation to pass
      const mockSchema = {
        parse: jest.fn().mockReturnValue(req.body)
      };
      require('@uaip/types').AgentUpdateSchema = mockSchema;

      AgentValidationMiddleware.validateAgentUpdate(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.validationMeta?.transformationApplied).toBe(false);
      expect(req.validationMeta?.originalFormat).toBe('agent-update');
    });

    it('should reject invalid update request body', () => {
      req.body = null;

      AgentValidationMiddleware.validateAgentUpdate(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should handle update validation errors', () => {
      req.body = {
        role: 'invalid-role'
      };

      // Mock schema to throw validation error
      const mockError = new Error('Invalid role');
      mockError.name = 'ZodError';
      (mockError as any).errors = [
        {
          path: ['role'],
          message: 'Invalid role',
          code: 'invalid_enum_value'
        }
      ];

      const mockSchema = {
        parse: jest.fn().mockImplementation(() => {
          throw mockError;
        })
      };
      require('@uaip/types').AgentUpdateSchema = mockSchema;

      AgentValidationMiddleware.validateAgentUpdate(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe('validateAgentQuery', () => {
    it('should validate query parameters', () => {
      req.query = {
        role: 'specialist',
        isActive: 'true',
        limit: '10',
        sortBy: 'name',
        sortOrder: 'asc'
      };

      // Mock AgentRole enum
      require('@uaip/types').AgentRole = {
        SPECIALIST: 'specialist',
        ORCHESTRATOR: 'orchestrator',
        ANALYZER: 'analyzer',
        ASSISTANT: 'assistant'
      };

      AgentValidationMiddleware.validateAgentQuery(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect((req as any).validatedQuery).toBeDefined();
      expect(req.validationMeta?.originalFormat).toBe('query-parameters');
    });

    it('should handle invalid query parameters', () => {
      req.query = {
        limit: 'invalid-number'
      };

      // Mock AgentRole enum
      require('@uaip/types').AgentRole = {
        SPECIALIST: 'specialist',
        ORCHESTRATOR: 'orchestrator',
        ANALYZER: 'analyzer',
        ASSISTANT: 'assistant'
      };

      AgentValidationMiddleware.validateAgentQuery(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should transform string boolean to boolean', () => {
      req.query = {
        isActive: 'true'
      };

      // Mock AgentRole enum
      require('@uaip/types').AgentRole = {
        SPECIALIST: 'specialist',
        ORCHESTRATOR: 'orchestrator',
        ANALYZER: 'analyzer',
        ASSISTANT: 'assistant'
      };

      AgentValidationMiddleware.validateAgentQuery(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect((req as any).validatedQuery.isActive).toBe(true);
    });

    it('should transform capabilities string to array', () => {
      req.query = {
        capabilities: 'programming,testing,debugging'
      };

      // Mock AgentRole enum
      require('@uaip/types').AgentRole = {
        SPECIALIST: 'specialist',
        ORCHESTRATOR: 'orchestrator',
        ANALYZER: 'analyzer',
        ASSISTANT: 'assistant'
      };

      AgentValidationMiddleware.validateAgentQuery(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect((req as any).validatedQuery.capabilities).toEqual(['programming', 'testing', 'debugging']);
    });
  });

  describe('private static methods', () => {
    // These tests would normally access private methods through the public interface
    // or by testing their effects through the public methods

    it('should detect persona transformation need', () => {
      const personaInput = {
        name: 'Test',
        role: 'Software Engineer', // Not an AgentRole enum value
        expertise: ['JavaScript']
      };

      req.body = personaInput;

      // Mock transformation service
      const mockTransformationService = require('../../agentTransformationService.js');
      mockTransformationService.AgentTransformationService = {
        transformPersonaToAgentRequest: jest.fn().mockReturnValue({
          name: 'Test',
          description: 'Test description',
          role: 'specialist',
          capabilities: ['JavaScript'],
          securityLevel: 'medium'
        }),
        getTransformationStats: jest.fn().mockReturnValue({})
      };

      const mockSchema = {
        parse: jest.fn().mockReturnValue(req.body)
      };
      require('@uaip/types').AgentCreateRequestSchema = mockSchema;

      AgentValidationMiddleware.validateAgentCreation(req, res, next);

      expect(mockTransformationService.AgentTransformationService.transformPersonaToAgentRequest)
        .toHaveBeenCalledWith(personaInput);
    });

    it('should handle business rules validation', () => {
      req.body = {
        name: 'Test Agent',
        description: 'A test agent',
        role: 'specialist',
        capabilities: ['programming'],
        securityLevel: 'medium',
        configuration: {
          temperature: 0.8
        }
      };

      const mockSchema = {
        parse: jest.fn().mockReturnValue(req.body)
      };
      require('@uaip/types').AgentCreateRequestSchema = mockSchema;

      // Mock AgentRole enum
      require('@uaip/types').AgentRole = {
        SPECIALIST: 'specialist',
        ORCHESTRATOR: 'orchestrator',
        ANALYZER: 'analyzer',
        ASSISTANT: 'assistant'
      };

      AgentValidationMiddleware.validateAgentCreation(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });
});