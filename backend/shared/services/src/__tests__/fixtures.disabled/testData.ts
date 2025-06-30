import { AgentRole, AgentStatus, OperationType, OperationStatus, ToolCategory, SecurityLevel, PersonaStatus, PersonaVisibility, DiscussionStatus, AuditEventType } from '@uaip/types';

export const TEST_DATA = {
  users: {
    validUser: {
      email: 'test@example.com',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      passwordHash: 'hashed_password_123',
      isActive: true,
      isVerified: true,
      roles: ['user'],
      preferences: { theme: 'dark', notifications: true },
      metadata: { source: 'test' }
    },
    adminUser: {
      email: 'admin@example.com',
      username: 'admin',
      firstName: 'Admin',
      lastName: 'User',
      passwordHash: 'admin_hashed_password',
      isActive: true,
      isVerified: true,
      roles: ['admin', 'user'],
      preferences: { theme: 'light', notifications: true },
      metadata: { source: 'system' }
    },
    inactiveUser: {
      email: 'inactive@example.com',
      username: 'inactive',
      firstName: 'Inactive',
      lastName: 'User',
      passwordHash: 'inactive_password',
      isActive: false,
      isVerified: true,
      roles: ['user'],
      preferences: {},
      metadata: {}
    }
  },

  agents: {
    analysisAgent: {
      name: 'Analysis Agent',
      description: 'Specialized in data analysis and insights',
      role: AgentRole.SPECIALIST,
      status: AgentStatus.ACTIVE,
      capabilities: ['data_analysis', 'statistical_modeling', 'visualization'],
      configuration: {
        model: 'gpt-4',
        temperature: 0.3,
        maxTokens: 4000,
        systemPrompt: 'You are an expert data analyst.'
      },
      metadata: { department: 'analytics', version: '1.0' }
    },
    orchestratorAgent: {
      name: 'Orchestrator Agent',
      description: 'Coordinates complex multi-step operations',
      role: AgentRole.ORCHESTRATOR,
      status: AgentStatus.ACTIVE,
      capabilities: ['workflow_management', 'task_coordination', 'resource_allocation'],
      configuration: {
        model: 'gpt-4',
        temperature: 0.5,
        maxTokens: 6000,
        systemPrompt: 'You are a workflow orchestrator.'
      },
      metadata: { department: 'operations', version: '2.1' }
    },
    inactiveAgent: {
      name: 'Inactive Agent',
      description: 'Currently disabled agent',
      role: AgentRole.SPECIALIST,
      status: AgentStatus.INACTIVE,
      capabilities: ['basic_chat'],
      configuration: {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2000
      },
      metadata: { deprecated: true }
    }
  },

  operations: {
    pendingOperation: {
      name: 'Data Analysis Task',
      description: 'Analyze customer behavior data',
      type: OperationType.ANALYSIS,
      status: OperationStatus.PENDING,
      priority: 8,
      input: {
        dataset: 'customer_behavior_2024',
        metrics: ['retention', 'churn', 'ltv'],
        timeframe: '6_months'
      },
      metadata: { department: 'marketing', requestedBy: 'analyst_team' }
    },
    runningOperation: {
      name: 'Document Generation',
      description: 'Generate comprehensive project documentation',
      type: OperationType.SYNTHESIS,
      status: OperationStatus.RUNNING,
      priority: 6,
      input: {
        projectId: 'proj_123',
        sections: ['overview', 'architecture', 'api_docs'],
        format: 'markdown'
      },
      metadata: { department: 'engineering', automated: true }
    },
    completedOperation: {
      name: 'Code Review',
      description: 'Review pull request for security vulnerabilities',
      type: OperationType.VALIDATION,
      status: OperationStatus.COMPLETED,
      priority: 9,
      input: {
        pullRequestId: 'pr_456',
        checkTypes: ['security', 'performance', 'best_practices']
      },
      output: {
        findings: [
          { type: 'security', severity: 'medium', description: 'Potential SQL injection' },
          { type: 'performance', severity: 'low', description: 'Inefficient query' }
        ],
        approved: false,
        recommendations: ['Use parameterized queries', 'Add query optimization']
      },
      metadata: { reviewer: 'security_team', automated: false }
    }
  },

  tools: {
    utilityTool: {
      name: 'string_formatter',
      displayName: 'String Formatter',
      description: 'Formats and manipulates text strings',
      category: ToolCategory.UTILITY,
      version: '1.2.0',
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to format' },
          operation: { type: 'string', enum: ['uppercase', 'lowercase', 'capitalize', 'trim'] },
          options: { type: 'object', properties: { preserveSpaces: { type: 'boolean' } } }
        },
        required: ['text', 'operation']
      },
      implementation: `
        function stringFormatter(params) {
          const { text, operation, options = {} } = params;
          let result = text;
          
          switch (operation) {
            case 'uppercase': result = text.toUpperCase(); break;
            case 'lowercase': result = text.toLowerCase(); break;
            case 'capitalize': result = text.charAt(0).toUpperCase() + text.slice(1); break;
            case 'trim': result = text.trim(); break;
          }
          
          return { formatted: result, original: text };
        }
      `,
      securityLevel: SecurityLevel.LOW,
      isActive: true,
      metadata: { author: 'system', tags: ['text', 'formatting'] }
    },
    analysisTool: {
      name: 'data_analyzer',
      displayName: 'Data Analyzer',
      description: 'Performs statistical analysis on datasets',
      category: ToolCategory.ANALYSIS,
      version: '2.0.1',
      schema: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { type: 'number' } },
          analysisType: { type: 'string', enum: ['mean', 'median', 'mode', 'std', 'all'] },
          includeOutliers: { type: 'boolean', default: true }
        },
        required: ['data', 'analysisType']
      },
      implementation: `
        function dataAnalyzer(params) {
          const { data, analysisType, includeOutliers = true } = params;
          const results = {};
          
          if (!includeOutliers) {
            // Remove outliers logic would go here
          }
          
          if (analysisType === 'mean' || analysisType === 'all') {
            results.mean = data.reduce((a, b) => a + b, 0) / data.length;
          }
          
          // Additional analysis logic...
          
          return results;
        }
      `,
      securityLevel: SecurityLevel.MEDIUM,
      isActive: true,
      metadata: { author: 'analytics_team', tags: ['statistics', 'analysis'] }
    },
    systemTool: {
      name: 'system_monitor',
      displayName: 'System Monitor',
      description: 'Monitors system resources and performance',
      category: ToolCategory.SYSTEM,
      version: '1.0.0',
      schema: {
        type: 'object',
        properties: {
          metrics: { type: 'array', items: { type: 'string' } },
          interval: { type: 'number', minimum: 1000 }
        },
        required: ['metrics']
      },
      implementation: `
        function systemMonitor(params) {
          // System monitoring implementation
          return { status: 'monitoring', metrics: params.metrics };
        }
      `,
      securityLevel: SecurityLevel.HIGH,
      isActive: true,
      metadata: { author: 'ops_team', tags: ['monitoring', 'system'] }
    }
  },

  personas: {
    expertPersona: {
      name: 'Technical Expert',
      description: 'Expert in software architecture and system design',
      systemPrompt: 'You are a senior software architect with 15 years of experience. Provide detailed technical guidance and best practices.',
      status: PersonaStatus.ACTIVE,
      visibility: PersonaVisibility.PUBLIC,
      configuration: {
        model: 'gpt-4',
        temperature: 0.4,
        maxTokens: 4000,
        topP: 0.9
      },
      capabilities: ['architecture_design', 'code_review', 'technical_documentation'],
      metadata: { expertise: 'backend_systems', experience_level: 'senior' }
    },
    creativePerson: {
      name: 'Creative Writer',
      description: 'Specializes in creative writing and storytelling',
      systemPrompt: 'You are a creative writer with expertise in various literary forms. Help with writing, editing, and storytelling.',
      status: PersonaStatus.ACTIVE,
      visibility: PersonaVisibility.PUBLIC,
      configuration: {
        model: 'gpt-4',
        temperature: 0.8,
        maxTokens: 3000,
        topP: 0.95
      },
      capabilities: ['creative_writing', 'editing', 'storytelling'],
      metadata: { genres: ['fiction', 'poetry', 'screenwriting'] }
    },
    privatePersona: {
      name: 'Personal Assistant',
      description: 'Private personal assistant for individual user',
      systemPrompt: 'You are a helpful personal assistant. Be concise and actionable.',
      status: PersonaStatus.ACTIVE,
      visibility: PersonaVisibility.PRIVATE,
      configuration: {
        model: 'gpt-3.5-turbo',
        temperature: 0.6,
        maxTokens: 2000
      },
      capabilities: ['task_management', 'scheduling', 'reminders'],
      metadata: { usage: 'personal', privacy_level: 'high' }
    }
  },

  discussions: {
    activeDiscussion: {
      title: 'Architecture Review Meeting',
      description: 'Review the proposed microservices architecture',
      status: DiscussionStatus.ACTIVE,
      configuration: {
        maxParticipants: 8,
        allowAnonymous: false,
        recordTranscript: true,
        autoSummary: true
      },
      metadata: { department: 'engineering', meeting_type: 'technical_review' }
    },
    scheduledDiscussion: {
      title: 'Sprint Planning Session',
      description: 'Plan upcoming sprint deliverables and timeline',
      status: DiscussionStatus.SCHEDULED,
      configuration: {
        maxParticipants: 12,
        allowAnonymous: false,
        recordTranscript: true,
        autoSummary: true,
        scheduledStart: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      },
      metadata: { sprint: 'sprint_24', team: 'backend_team' }
    },
    completedDiscussion: {
      title: 'Post-Mortem Analysis',
      description: 'Analysis of last week\'s outage and preventive measures',
      status: DiscussionStatus.COMPLETED,
      configuration: {
        maxParticipants: 6,
        allowAnonymous: true,
        recordTranscript: true,
        autoSummary: true
      },
      metadata: { incident_id: 'inc_789', severity: 'high' }
    }
  },

  auditEvents: {
    userLogin: {
      eventType: AuditEventType.USER_ACTION,
      entityType: 'User',
      action: 'LOGIN',
      details: {
        loginMethod: 'email_password',
        location: 'San Francisco, CA',
        device: 'Chrome/120.0 on macOS'
      },
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      metadata: { session_id: 'sess_123', mfa_used: false }
    },
    operationCreated: {
      eventType: AuditEventType.SYSTEM_EVENT,
      entityType: 'Operation',
      action: 'CREATE',
      details: {
        operationType: 'ANALYSIS',
        priority: 7,
        estimatedDuration: '30 minutes'
      },
      ipAddress: '10.0.1.50',
      userAgent: 'UAIP-System/1.0',
      metadata: { automated: true, trigger: 'schedule' }
    },
    securityAlert: {
      eventType: AuditEventType.SECURITY_EVENT,
      entityType: 'User',
      action: 'FAILED_LOGIN_ATTEMPT',
      details: {
        attemptCount: 3,
        reason: 'invalid_password',
        lockoutTriggered: true,
        lockoutDuration: '15 minutes'
      },
      ipAddress: '203.0.113.45',
      userAgent: 'Python-requests/2.31.0',
      metadata: { threat_level: 'medium', blocked: true }
    }
  },

  configurations: {
    database: {
      postgres: {
        host: 'localhost',
        port: 5432,
        user: 'test_user',
        password: 'test_password',
        database: 'test_db',
        synchronize: false,
        logging: false,
        ssl: false
      },
      redis: {
        host: 'localhost',
        port: 6379,
        db: 1
      },
      neo4j: {
        uri: 'bolt://localhost:7687',
        username: 'neo4j',
        password: 'test_password'
      }
    },
    services: {
      llm: {
        defaultProvider: 'openai',
        providers: {
          openai: {
            apiKey: 'test_key',
            model: 'gpt-4',
            maxTokens: 4000
          }
        }
      },
      cache: {
        defaultTTL: 3600,
        maxSize: 1000,
        enabled: true
      }
    }
  }
};

export const INVALID_TEST_DATA = {
  users: {
    invalidEmail: {
      email: 'not-an-email',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User'
    },
    missingRequired: {
      firstName: 'Test',
      lastName: 'User'
    },
    emptyFields: {
      email: '',
      username: '',
      firstName: '',
      lastName: ''
    }
  },
  operations: {
    invalidType: {
      name: 'Invalid Operation',
      type: 'INVALID_TYPE',
      status: OperationStatus.PENDING
    },
    missingInput: {
      name: 'No Input Operation',
      type: OperationType.ANALYSIS,
      status: OperationStatus.PENDING
    }
  }
};