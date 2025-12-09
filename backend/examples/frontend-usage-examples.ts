/**
 * UAIP Frontend Integration Usage Examples
 *
 * This file demonstrates how to use the completed API client
 * to interact with all UAIP backend services.
 */

import { UAIPAPIClient, createAPIClient, isSuccessResponse, hasError } from '../src/services/api';

// Utility function to generate UUIDs for backend examples
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// SETUP AND CONFIGURATION
// ============================================================================

// Create API client instance
const apiClient = createAPIClient({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8081',
  timeout: 30000,
});

// ============================================================================
// AUTHENTICATION EXAMPLES
// ============================================================================

/**
 * Login and handle authentication
 */
async function loginExample() {
  try {
    const response = await apiClient.auth.login({
      email: 'user@example.com',
      password: 'password123',
      rememberMe: true,
    });

    if (isSuccessResponse(response)) {
      // Store tokens using the client's built-in method
      apiClient.setAuthToken(
        response.data.tokens.accessToken,
        response.data.tokens.refreshToken,
        true
      );

      console.log('Login successful:', response.data.user);
      return response.data;
    } else {
      console.error('Login failed:', response.error?.message);
      throw new Error(response.error?.message || 'Login failed');
    }
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

/**
 * Get current user information
 */
async function getCurrentUserExample() {
  try {
    const response = await apiClient.auth.me();

    if (isSuccessResponse(response)) {
      console.log('Current user:', response.data);
      return response.data;
    } else {
      console.error('Failed to get user info:', response.error?.message);
      return null;
    }
  } catch (error) {
    console.error('Get user error:', error);
    return null;
  }
}

/**
 * Logout and clear authentication
 */
async function logoutExample() {
  try {
    await apiClient.auth.logout();
    apiClient.clearAuth();
    console.log('Logout successful');
  } catch (error) {
    console.error('Logout error:', error);
    // Clear auth anyway
    apiClient.clearAuth();
  }
}

// ============================================================================
// AGENT INTELLIGENCE EXAMPLES
// ============================================================================

/**
 * Create and manage agents
 */
async function agentManagementExample() {
  try {
    // Create a new agent
    const createResponse = await apiClient.agents.create({
      name: 'Business Analyst Agent',
      role: 'analyzer',
      persona: {
        name: 'Senior Business Analyst',
        description: 'Expert in business analysis and strategic planning',
        capabilities: ['data_analysis', 'strategic_planning', 'market_research'],
        preferences: {
          analysisDepth: 'comprehensive',
          reportingStyle: 'detailed',
        },
      },
      intelligenceConfig: {
        analysisDepth: 'advanced',
        contextWindowSize: 8192,
        decisionThreshold: 0.8,
        learningEnabled: true,
        collaborationMode: 'collaborative',
      },
      securityContext: {
        securityLevel: 'medium',
        allowedCapabilities: ['data_analysis', 'reporting'],
        approvalRequired: false,
        auditLevel: 'standard',
      },
      createdBy: 'user-123',
    });

    if (isSuccessResponse(createResponse)) {
      const agent = createResponse.data;
      console.log('Agent created:', agent);

      // Analyze context with the agent
      const analysisResponse = await apiClient.agents.analyze(agent.id, {
        conversationContext: {
          id: 'conv-123',
          agentId: agent.id,
          userId: 'user-123',
          messages: [
            {
              id: 'msg-1',
              role: 'user',
              content: 'Analyze our Q4 sales performance and identify trends',
              timestamp: new Date(),
            },
          ],
          startedAt: new Date(),
          lastActivityAt: new Date(),
        },
        userRequest: 'Provide comprehensive analysis of Q4 sales data',
        constraints: {
          timeframe: '2024-Q4',
          focus: ['trends', 'performance', 'recommendations'],
        },
      });

      if (isSuccessResponse(analysisResponse)) {
        console.log('Analysis completed:', analysisResponse.data);

        // Generate a plan based on analysis
        const planResponse = await apiClient.agents.plan(agent.id, {
          analysis: analysisResponse.data.analysis,
          userPreferences: {
            priority: 'accuracy',
            timeline: 'urgent',
          },
        });

        if (isSuccessResponse(planResponse)) {
          console.log('Plan generated:', planResponse.data);
          return planResponse.data;
        }
      }
    }
  } catch (error) {
    console.error('Agent management error:', error);
    throw error;
  }
}

/**
 * Get agent capabilities and health
 */
async function agentStatusExample() {
  try {
    const agentId = 'agent-123';

    // Get agent capabilities
    const capabilitiesResponse = await apiClient.agents.getCapabilities(agentId);
    if (isSuccessResponse(capabilitiesResponse)) {
      console.log('Agent capabilities:', capabilitiesResponse.data);
    }

    // Check agent service health
    const healthResponse = await apiClient.agents.health.detailed();
    if (isSuccessResponse(healthResponse)) {
      console.log('Agent service health:', healthResponse.data);
    }
  } catch (error) {
    console.error('Agent status error:', error);
  }
}

// ============================================================================
// PERSONA MANAGEMENT EXAMPLES
// ============================================================================

/**
 * Create and manage personas
 */
async function personaManagementExample() {
  try {
    // Create a new persona
    const createResponse = await apiClient.personas.create({
      name: 'Marketing Strategist',
      description: 'Expert in digital marketing and brand strategy',
      expertise: ['digital_marketing', 'brand_strategy', 'customer_analytics'],
      personality: {
        traits: ['creative', 'analytical', 'strategic', 'data-driven'],
      },
      communicationStyle: 'professional_creative',
    });

    if (isSuccessResponse(createResponse)) {
      const persona = createResponse.data;
      console.log('Persona created:', persona);

      // Search for similar personas
      const searchResponse = await apiClient.personas.search('marketing', 'digital_marketing');
      if (isSuccessResponse(searchResponse)) {
        console.log('Similar personas:', searchResponse.data);
      }

      // Get persona recommendations for a context
      const recommendationsResponse =
        await apiClient.personas.getRecommendations('marketing_campaign');
      if (isSuccessResponse(recommendationsResponse)) {
        console.log('Persona recommendations:', recommendationsResponse.data);
      }

      // Validate the persona
      const validationResponse = await apiClient.personas.validatePersona(persona.id, {
        validationType: 'comprehensive',
        context: 'marketing_discussion',
      });

      if (isSuccessResponse(validationResponse)) {
        console.log('Persona validation:', validationResponse.data);
      }

      return persona;
    }
  } catch (error) {
    console.error('Persona management error:', error);
    throw error;
  }
}

// ============================================================================
// CAPABILITY REGISTRY EXAMPLES
// ============================================================================

/**
 * Search and manage capabilities
 */
async function capabilityManagementExample() {
  try {
    // Search for capabilities
    const searchResponse = await apiClient.capabilities.search({
      query: 'data analysis',
      type: 'tool',
      category: 'analytics',
      securityLevel: 'medium',
      sortBy: 'trust_score',
      sortOrder: 'desc',
      limit: 10,
    });

    if (isSuccessResponse(searchResponse)) {
      console.log('Found capabilities:', searchResponse.data);

      // Get capability recommendations
      const recommendationsResponse = await apiClient.capabilities.getRecommendations({
        context: 'business_analysis',
        userRole: 'analyst',
      });

      if (isSuccessResponse(recommendationsResponse)) {
        console.log('Capability recommendations:', recommendationsResponse.data);
      }

      // Register a new capability
      const registerResponse = await apiClient.capabilities.register({
        name: 'Advanced Chart Generator',
        description: 'Generate advanced charts and visualizations',
        type: 'artifact',
        status: 'active',
        metadata: {
          version: '1.0.0',
          author: 'Internal Team',
          tags: ['visualization', 'charts', 'analytics'],
          category: 'visualization',
          trustScore: 8.5,
          usageCount: 0,
        },
        artifactConfig: {
          templateEngine: 'handlebars',
          template: '{{#each data}}<div class="chart">{{this}}</div>{{/each}}',
          outputFormat: 'html',
          variables: [
            {
              name: 'data',
              type: 'array',
              required: true,
              description: 'Chart data array',
            },
          ],
        },
        securityRequirements: {
          minimumSecurityLevel: 'low',
          requiredPermissions: ['read_data'],
          sensitiveData: false,
          auditRequired: false,
        },
      });

      if (isSuccessResponse(registerResponse)) {
        console.log('Capability registered:', registerResponse.data);
        return registerResponse.data;
      }
    }
  } catch (error) {
    console.error('Capability management error:', error);
    throw error;
  }
}

// ============================================================================
// ORCHESTRATION PIPELINE EXAMPLES
// ============================================================================

/**
 * Execute and monitor operations
 */
async function orchestrationExample() {
  try {
    // Execute an operation
    const executeResponse = await apiClient.orchestration.execute({
      operation: {
        type: 'analysis',
        agentId: 'agent-123',
        userId: 'user-123',
        name: 'Quarterly Sales Analysis',
        description: 'Comprehensive analysis of Q4 sales performance',
        status: 'pending',
        context: {
          executionContext: {
            agentId: 'agent-123',
            userId: 'user-123',
            conversationId: 'conv-123',
            environment: 'production',
            timeout: 3600,
            resourceLimits: {
              maxMemory: 1024,
              maxCpu: 2,
              maxDuration: 3600,
            },
          },
        },
        executionPlan: {
          id: 'plan-123',
          type: 'analysis',
          agentId: 'agent-123',
          steps: [
            {
              id: 'step-1',
              type: 'data_collection',
              description: 'Collect sales data',
              estimatedDuration: 300,
            },
            {
              id: 'step-2',
              type: 'analysis',
              description: 'Analyze trends',
              estimatedDuration: 600,
              dependencies: ['step-1'],
            },
          ],
          dependencies: [],
          estimatedDuration: 900,
          metadata: {},
        },
        metadata: {
          priority: 'high',
          tags: ['sales', 'analysis', 'quarterly'],
          estimatedDuration: 900,
          resourceRequirements: {
            cpu: 2,
            memory: 1024,
            network: true,
            gpu: false,
          },
        },
        estimatedDuration: 900,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      options: {
        priority: 'high',
        async: true,
        tags: ['quarterly-analysis'],
      },
    });

    if (isSuccessResponse(executeResponse)) {
      const workflowId = executeResponse.data.workflowInstanceId;
      console.log('Operation started:', workflowId);

      // Monitor operation status
      const statusResponse = await apiClient.orchestration.getStatus(workflowId);
      if (isSuccessResponse(statusResponse)) {
        console.log('Operation status:', statusResponse.data);

        // If needed, pause the operation
        if (statusResponse.data.status === 'running') {
          const pauseResponse = await apiClient.orchestration.pause(workflowId, {
            reason: 'Manual pause for review',
          });

          if (isSuccessResponse(pauseResponse)) {
            console.log('Operation paused');

            // Resume later
            const resumeResponse = await apiClient.orchestration.resume(workflowId, {
              checkpointId: 'checkpoint-123',
            });

            if (isSuccessResponse(resumeResponse)) {
              console.log('Operation resumed');
            }
          }
        }
      }

      return workflowId;
    }
  } catch (error) {
    console.error('Orchestration error:', error);
    throw error;
  }
}

// ============================================================================
// DISCUSSION MANAGEMENT EXAMPLES
// ============================================================================

/**
 * Create and manage discussions
 */
async function discussionManagementExample() {
  try {
    // Create a discussion
    const createResponse = await apiClient.discussions.create({
      title: 'Q4 Strategy Planning',
      description: 'Strategic planning session for Q4 initiatives',
      topic: 'Q4 Business Strategy',
      turnStrategy: {
        type: 'round_robin',
        settings: {
          maxTurns: 20,
          turnTimeout: 300,
        },
      },
      createdBy: generateUUID(), // Generate valid UUID
      initialParticipants: [
        {
          personaId: generateUUID(), // Generate valid UUID
          agentId: generateUUID(), // Generate valid UUID
          role: 'facilitator',
        },
        {
          personaId: generateUUID(), // Generate valid UUID
          agentId: generateUUID(), // Generate valid UUID
          role: 'participant',
        },
      ],
      settings: {
        maxTurns: 20,
        turnTimeout: 300,
      },
    });

    if (isSuccessResponse(createResponse)) {
      const discussion = createResponse.data;
      console.log('Discussion created:', discussion);

      // Start the discussion
      const startResponse = await apiClient.discussions.start(discussion.id);
      if (isSuccessResponse(startResponse)) {
        console.log('Discussion started');

        // Add a participant
        const addParticipantResponse = await apiClient.discussions.addParticipant(discussion.id, {
          personaId: 'persona-3',
          role: 'expert',
        });

        if (isSuccessResponse(addParticipantResponse)) {
          console.log('Participant added');

          // Send a message
          const messageResponse = await apiClient.discussions.sendMessage(
            discussion.id,
            'participant-1',
            {
              content: 'I believe we should focus on digital transformation initiatives.',
              messageType: 'contribution',
              metadata: {
                confidence: 0.8,
                reasoning: 'Based on market trends analysis',
              },
            }
          );

          if (isSuccessResponse(messageResponse)) {
            console.log('Message sent');

            // Get discussion messages
            const messagesResponse = await apiClient.discussions.getMessages(discussion.id, 50, 0);
            if (isSuccessResponse(messagesResponse)) {
              console.log('Discussion messages:', messagesResponse.data);
            }

            // Get discussion analytics
            const analyticsResponse = await apiClient.discussions.getAnalytics(discussion.id);
            if (isSuccessResponse(analyticsResponse)) {
              console.log('Discussion analytics:', analyticsResponse.data);
            }
          }
        }
      }

      return discussion;
    }
  } catch (error) {
    console.error('Discussion management error:', error);
    throw error;
  }
}

// ============================================================================
// SECURITY AND COMPLIANCE EXAMPLES
// ============================================================================

/**
 * Security assessment and approval workflows
 */
async function securityExample() {
  try {
    // Assess risk for an operation
    const riskResponse = await apiClient.security.assessRisk({
      operation: {
        type: 'data_access',
        resource: 'customer_database',
        action: 'read',
      },
      context: {
        userId: 'user-123',
        department: 'analytics',
        purpose: 'quarterly_analysis',
      },
    });

    if (isSuccessResponse(riskResponse)) {
      console.log('Risk assessment:', riskResponse.data);

      // Check if approval is required
      const approvalCheckResponse = await apiClient.security.checkApprovalRequired({
        operation: {
          type: 'data_access',
          resource: 'customer_database',
          action: 'read',
        },
        requestor: {
          userId: 'user-123',
          role: 'analyst',
        },
      });

      if (isSuccessResponse(approvalCheckResponse)) {
        console.log('Approval required:', approvalCheckResponse.data);

        if (approvalCheckResponse.data.required) {
          // Create approval workflow
          const workflowResponse = await apiClient.approvals.createWorkflow({
            operation: {
              type: 'data_access',
              resource: 'customer_database',
              action: 'read',
            },
            requestor: {
              userId: 'user-123',
              name: 'John Analyst',
              department: 'analytics',
            },
            justification: 'Need access for quarterly sales analysis',
            urgency: 'medium',
            expectedDuration: '2 hours',
          });

          if (isSuccessResponse(workflowResponse)) {
            console.log('Approval workflow created:', workflowResponse.data);
            return workflowResponse.data;
          }
        }
      }
    }
  } catch (error) {
    console.error('Security example error:', error);
    throw error;
  }
}

/**
 * User management example
 */
async function userManagementExample() {
  try {
    // Get all users
    const usersResponse = await apiClient.users.getAll({
      page: 1,
      limit: 10,
      role: 'analyst',
    });

    if (isSuccessResponse(usersResponse)) {
      console.log('Users:', usersResponse.data);

      // Create a new user
      const createUserResponse = await apiClient.users.create({
        email: 'newuser@example.com',
        password: 'SecurePassword123!',
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'analyst',
        department: 'marketing',
        permissions: ['read_data', 'create_reports'],
      });

      if (isSuccessResponse(createUserResponse)) {
        console.log('User created:', createUserResponse.data);
        return createUserResponse.data;
      }
    }
  } catch (error) {
    console.error('User management error:', error);
    throw error;
  }
}

// ============================================================================
// AUDIT AND MONITORING EXAMPLES
// ============================================================================

/**
 * Audit and monitoring example
 */
async function auditExample() {
  try {
    // Get audit logs
    const logsResponse = await apiClient.audit.getLogs({
      eventType: 'LOGIN_SUCCESS',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      limit: 50,
    });

    if (isSuccessResponse(logsResponse)) {
      console.log('Audit logs:', logsResponse.data);

      // Get audit statistics
      const statsResponse = await apiClient.audit.getStats('last_30_days');
      if (isSuccessResponse(statsResponse)) {
        console.log('Audit stats:', statsResponse.data);
      }

      // Export audit logs
      const exportResponse = await apiClient.audit.exportLogs({
        format: 'csv',
        filters: {
          eventTypes: ['LOGIN_SUCCESS', 'DATA_ACCESS'],
          startDate: '2024-01-01',
          endDate: '2024-12-31',
        },
        includeDetails: true,
      });

      if (isSuccessResponse(exportResponse)) {
        console.log('Export initiated:', exportResponse.data);
      }
    }
  } catch (error) {
    console.error('Audit example error:', error);
    throw error;
  }
}

// ============================================================================
// ERROR HANDLING EXAMPLES
// ============================================================================

/**
 * Comprehensive error handling example
 */
async function errorHandlingExample() {
  try {
    const response = await apiClient.agents.get('non-existent-agent');

    if (hasError(response)) {
      console.error('API Error:', {
        code: response.error.code,
        message: response.error.message,
        details: response.error.details,
      });

      // Handle specific error types
      switch (response.error.code) {
        case 'NOT_FOUND':
          console.log('Agent not found, creating new one...');
          break;
        case 'UNAUTHORIZED':
          console.log('Authentication required, redirecting to login...');
          break;
        case 'FORBIDDEN':
          console.log('Insufficient permissions');
          break;
        default:
          console.log('Unknown error occurred');
      }
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// ============================================================================
// EXPORT EXAMPLES
// ============================================================================

export {
  loginExample,
  getCurrentUserExample,
  logoutExample,
  agentManagementExample,
  agentStatusExample,
  personaManagementExample,
  capabilityManagementExample,
  orchestrationExample,
  discussionManagementExample,
  securityExample,
  userManagementExample,
  auditExample,
  errorHandlingExample,
  apiClient,
};

// ============================================================================
// USAGE INSTRUCTIONS
// ============================================================================

/*
To use these examples in your application:

1. Import the examples you need:
   import { loginExample, agentManagementExample } from './examples/frontend-usage-examples';

2. Call them in your components:
   const handleLogin = async () => {
     try {
       const user = await loginExample();
       // Handle successful login
     } catch (error) {
       // Handle login error
     }
   };

3. Use the API client directly:
   import { apiClient } from './examples/frontend-usage-examples';
   
   const response = await apiClient.agents.get('agent-id');
   if (isSuccessResponse(response)) {
     console.log(response.data);
   }

4. Handle authentication in your app:
   - Call loginExample() on user login
   - The API client will automatically handle token refresh
   - Call logoutExample() on user logout
   - Use getCurrentUserExample() to check authentication status

5. Error handling:
   - All API methods return APIResponse<T> format
   - Use isSuccessResponse() and hasError() type guards
   - Check response.error for detailed error information
*/
