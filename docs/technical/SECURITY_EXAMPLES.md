# Enhanced Security System Examples

## Overview

This document provides practical examples of how to use the enhanced security system with OAuth providers and AI agents. The examples demonstrate authentication flows, security validation, and monitoring capabilities.

## OAuth Provider Configuration

### GitHub Provider Setup

```typescript
import { OAuthProviderConfig, OAuthProviderType, AgentCapability } from '@uaip/types/security';

const githubProviderConfig: OAuthProviderConfig = {
  id: 'github-provider-1',
  name: 'GitHub Enterprise',
  type: OAuthProviderType.GITHUB,
  clientId: 'your-github-client-id',
  clientSecret: 'encrypted-client-secret',
  redirectUri: 'https://your-app.com/oauth/callback',
  scope: ['repo', 'user:email', 'read:org'],
  authorizationUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  userInfoUrl: 'https://api.github.com/user',
  isEnabled: true,
  priority: 1,
  securityConfig: {
    requirePKCE: true,
    requireState: true,
    allowedDomains: ['yourcompany.com'],
    minimumSecurityLevel: 'medium',
    allowedUserTypes: ['human', 'agent']
  },
  agentConfig: {
    allowAgentAccess: true,
    requiredCapabilities: [AgentCapability.CODE_REPOSITORY],
    permissions: ['clone', 'pull', 'push', 'create_branch', 'create_pr'],
    rateLimit: {
      requests: 1000,
      windowMs: 3600000 // 1 hour
    },
    monitoring: {
      logAllRequests: true,
      alertOnSuspiciousActivity: true,
      maxDailyRequests: 500
    }
  }
};
```

### Gmail Provider Setup

```typescript
const gmailProviderConfig: OAuthProviderConfig = {
  id: 'gmail-provider-1',
  name: 'Gmail Integration',
  type: OAuthProviderType.GMAIL,
  clientId: 'your-gmail-client-id',
  clientSecret: 'encrypted-client-secret',
  redirectUri: 'https://your-app.com/oauth/callback',
  scope: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email'
  ],
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
  isEnabled: true,
  agentConfig: {
    allowAgentAccess: true,
    requiredCapabilities: [AgentCapability.EMAIL_ACCESS],
    permissions: ['read', 'send', 'search'],
    rateLimit: {
      requests: 100,
      windowMs: 86400000 // 24 hours
    },
    monitoring: {
      logAllRequests: true,
      alertOnSuspiciousActivity: true,
      maxDailyRequests: 50
    }
  }
};
```

## Agent Authentication Examples

### Agent Registration and Authentication

```typescript
import { EnhancedAuthService, AgentAuthRequest } from '../services/enhancedAuthService';
import { UserType, AgentCapability } from '@uaip/types/security';

// Create an agent user
const agentUser: EnhancedUser = {
  id: 'agent-001',
  email: 'ai-agent@yourcompany.com',
  name: 'Code Assistant Agent',
  role: 'ai-agent',
  userType: UserType.AGENT,
  securityClearance: SecurityLevel.MEDIUM,
  isActive: true,
  agentConfig: {
    capabilities: [
      AgentCapability.CODE_REPOSITORY,
      AgentCapability.EMAIL_ACCESS,
      AgentCapability.NOTE_TAKING
    ],
    maxConcurrentSessions: 3,
    allowedProviders: [OAuthProviderType.GITHUB, OAuthProviderType.GMAIL],
    securityLevel: SecurityLevel.MEDIUM,
    monitoring: {
      logLevel: 'detailed',
      alertOnNewProvider: true,
      alertOnUnusualActivity: true,
      maxDailyOperations: 200
    },
    restrictions: {
      allowedOperationTypes: ['read', 'write', 'create'],
      maxFileSize: 10485760, // 10MB
      allowedFileTypes: ['.js', '.ts', '.md', '.txt', '.json']
    }
  }
};

// Agent authentication request
const authRequest: AgentAuthRequest = {
  agentId: 'agent-001',
  agentToken: 'secure-agent-token-here',
  capabilities: [
    AgentCapability.CODE_REPOSITORY,
    AgentCapability.EMAIL_ACCESS
  ],
  requestedScopes: ['repo:read', 'email:read']
};

// Authenticate the agent
const authResult = await enhancedAuthService.authenticateAgent(
  authRequest,
  '192.168.1.100',
  'AgentClient/1.0'
);

if (authResult.success) {
  console.log('Agent authenticated successfully');
  console.log('Access Token:', authResult.tokens?.accessToken);
  console.log('Agent Capabilities:', authResult.user?.agentConfig?.capabilities);
}
```

## OAuth Flow Examples

### Human User OAuth Flow

```typescript
// 1. Initiate OAuth authorization
const authorizationRequest = {
  provider_id: 'github-provider-1',
  redirect_uri: 'https://your-app.com/oauth/callback',
  user_type: UserType.HUMAN,
  scope: ['repo', 'user:email']
};

const response = await fetch('/api/oauth/authorize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(authorizationRequest)
});

const { authorization_url, state } = await response.json();

// 2. Redirect user to authorization URL
window.location.href = authorization_url;

// 3. Handle callback (after user authorizes)
const callbackData = {
  code: 'authorization-code-from-provider',
  state: 'state-from-step-1',
  redirect_uri: 'https://your-app.com/oauth/callback'
};

const callbackResponse = await fetch('/api/oauth/callback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(callbackData)
});

const authResult = await callbackResponse.json();
if (authResult.success) {
  console.log('User authenticated:', authResult.user);
  console.log('MFA Required:', authResult.mfa_required);
}
```

### Agent OAuth Connection

```typescript
// Agent connecting to GitHub
const agentOAuthRequest = {
  provider_id: 'github-provider-1',
  redirect_uri: 'https://your-app.com/agent/oauth/callback',
  user_type: UserType.AGENT,
  agent_capabilities: [AgentCapability.CODE_REPOSITORY]
};

// After OAuth flow completion, create agent connection
const connectionId = await oauthProviderService.createAgentOAuthConnection(
  'agent-001',
  'github-provider-1',
  {
    access_token: 'github-access-token',
    refresh_token: 'github-refresh-token',
    expires_in: 3600,
    token_type: 'Bearer',
    scope: 'repo user:email'
  },
  [AgentCapability.CODE_REPOSITORY],
  ['clone', 'pull', 'push', 'create_branch']
);

console.log('Agent connected to GitHub:', connectionId);
```

## Security Validation Examples

### Enhanced Security Validation

```typescript
import { EnhancedSecurityValidationRequest } from '@uaip/types/security';

// Create enhanced security context for agent
const enhancedSecurityContext: EnhancedSecurityContext = {
  userId: 'agent-001',
  sessionId: 'session-123',
  userType: UserType.AGENT,
  ipAddress: '192.168.1.100',
  userAgent: 'AgentClient/1.0',
  role: 'ai-agent',
  permissions: ['read', 'write', 'execute'],
  securityLevel: SecurityLevel.MEDIUM,
  lastAuthentication: new Date(),
  mfaVerified: false,
  riskScore: 3.5,
  authenticationMethod: AuthenticationMethod.AGENT_TOKEN,
  oauthProvider: OAuthProviderType.GITHUB,
  agentCapabilities: [AgentCapability.CODE_REPOSITORY],
  deviceTrusted: false,
  locationTrusted: true,
  agentContext: {
    agentId: 'agent-001',
    agentName: 'Code Assistant Agent',
    capabilities: [AgentCapability.CODE_REPOSITORY],
    connectedProviders: [{
      providerId: 'github-provider-1',
      providerType: OAuthProviderType.GITHUB,
      capabilities: [AgentCapability.CODE_REPOSITORY],
      lastUsed: new Date()
    }],
    operationLimits: {
      maxDailyOperations: 200,
      currentDailyOperations: 45,
      maxConcurrentOperations: 3,
      currentConcurrentOperations: 1
    }
  }
};

// Security validation request
const validationRequest: EnhancedSecurityValidationRequest = {
  operation: {
    type: 'git_push',
    resource: 'repository',
    action: 'push',
    context: {
      repository: 'my-project',
      branch: 'feature/new-feature',
      files: ['src/app.js', 'README.md']
    }
  },
  securityContext: enhancedSecurityContext,
  requestMetadata: {
    requestId: 'req-123',
    source: 'agent-client',
    priority: 'normal'
  }
};

// Validate security
const validationResult = await enhancedSecurityGatewayService.validateEnhancedSecurity(
  validationRequest
);

console.log('Operation allowed:', validationResult.allowed);
console.log('Approval required:', validationResult.approvalRequired);
console.log('Risk level:', validationResult.riskLevel);
console.log('MFA required:', validationResult.mfaRequired);
console.log('Agent restrictions:', validationResult.agentRestrictions);
```

## Agent Operations Examples

### GitHub Operations

```typescript
// List repositories for agent
const repos = await oauthProviderService.getGitHubRepos(
  'agent-001',
  'github-provider-1'
);

console.log('Available repositories:', repos.length);

// Using the API endpoint
const githubRequest = {
  operation: 'list_repos',
  parameters: {
    type: 'private',
    sort: 'updated'
  }
};

const response = await fetch('/api/oauth/agent/github/github-provider-1', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer agent-access-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(githubRequest)
});

const result = await response.json();
if (result.success) {
  console.log('GitHub operation successful:', result.data);
}
```

### Gmail Operations

```typescript
// Search emails for agent
const emails = await oauthProviderService.getGmailMessages(
  'agent-001',
  'gmail-provider-1',
  'from:support@example.com'
);

console.log('Found emails:', emails.length);

// Using the API endpoint
const gmailRequest = {
  operation: 'search_messages',
  query: 'is:unread from:important@company.com',
  parameters: {
    maxResults: 10
  }
};

const response = await fetch('/api/oauth/agent/gmail/gmail-provider-1', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer agent-access-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(gmailRequest)
});

const result = await response.json();
if (result.success) {
  console.log('Gmail operation successful:', result.data);
}
```

## Monitoring and Audit Examples

### Agent Activity Monitoring

```typescript
// Record agent operation
await oauthProviderService.recordAgentOperation(
  'agent-001',
  'github-provider-1',
  'list_repos',
  true // success
);

// Get agent usage statistics
const connection = await databaseService.findOne('agent_oauth_connections', {
  agentId: 'agent-001',
  providerId: 'github-provider-1'
});

console.log('Usage stats:', connection.usageStats);
// Output: {
//   totalRequests: 156,
//   dailyRequests: 23,
//   lastResetDate: '2024-01-15T00:00:00Z',
//   errors: 2,
//   rateLimitHits: 0
// }
```

### Security Audit Events

```typescript
// Query security events for agent
const auditEvents = await auditService.queryEvents({
  agentId: 'agent-001',
  eventTypes: [
    AuditEventType.AGENT_OPERATION_SUCCESS,
    AuditEventType.AGENT_OPERATION_FAILED,
    AuditEventType.PERMISSION_DENIED
  ],
  startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
  limit: 100
});

console.log('Recent agent events:', auditEvents.length);

// Example audit event
const sampleEvent = {
  id: 'audit-001',
  eventType: AuditEventType.AGENT_OPERATION_SUCCESS,
  agentId: 'agent-001',
  timestamp: new Date(),
  details: {
    operation: 'git_clone',
    repository: 'my-project',
    provider: 'github',
    duration: 1250, // ms
    filesProcessed: 45
  }
};
```

## Error Handling Examples

### OAuth Error Handling

```typescript
try {
  const authResult = await enhancedAuthService.authenticateWithOAuth(
    code,
    state,
    redirectUri,
    ipAddress,
    userAgent
  );
  
  if (!authResult.success) {
    console.error('OAuth authentication failed:', authResult.error);
    
    // Handle specific error cases
    switch (authResult.error) {
      case 'invalid_grant':
        console.log('Authorization code expired or invalid');
        break;
      case 'access_denied':
        console.log('User denied authorization');
        break;
      case 'invalid_client':
        console.log('OAuth client configuration error');
        break;
      default:
        console.log('Unknown OAuth error');
    }
  }
} catch (error) {
  console.error('OAuth flow error:', error.message);
  
  // Log security event
  await auditService.logEvent({
    eventType: AuditEventType.OAUTH_ERROR,
    details: {
      error: error.message,
      code,
      state,
      ipAddress,
      userAgent
    }
  });
}
```

### Agent Operation Error Handling

```typescript
try {
  const validation = await oauthProviderService.validateAgentOperation(
    'agent-001',
    'github-provider-1',
    'push_code',
    AgentCapability.CODE_REPOSITORY
  );
  
  if (!validation.allowed) {
    console.error('Agent operation denied:', validation.reason);
    
    // Handle specific denial reasons
    switch (validation.reason) {
      case 'Missing capability: code_repository':
        console.log('Agent lacks required capability');
        break;
      case 'Daily rate limit exceeded':
        console.log('Agent has exceeded daily operation limit');
        console.log('Reset time:', validation.rateLimit?.resetTime);
        break;
      case 'Operation not permitted: push_code':
        console.log('Agent does not have permission for this operation');
        break;
      default:
        console.log('Operation denied for unknown reason');
    }
    
    return;
  }
  
  // Proceed with operation
  const result = await performGitPushOperation();
  
} catch (error) {
  console.error('Agent operation error:', error.message);
  
  // Record failed operation
  await oauthProviderService.recordAgentOperation(
    'agent-001',
    'github-provider-1',
    'push_code',
    false,
    error.message
  );
}
```

## Best Practices

### Security Configuration

```typescript
// 1. Always use PKCE for OAuth flows
const oauthConfig = {
  requirePKCE: true,
  requireState: true,
  // ... other config
};

// 2. Implement proper token encryption
const encryptedToken = await encryptToken(accessToken, encryptionKey);

// 3. Set appropriate rate limits for agents
const agentRateLimit = {
  requests: 100,
  windowMs: 3600000, // 1 hour
  burstLimit: 10 // Allow short bursts
};

// 4. Monitor agent operations continuously
const monitoringConfig = {
  logAllRequests: true,
  alertOnSuspiciousActivity: true,
  maxDailyRequests: 500,
  errorThreshold: 0.05 // 5% error rate
};
```

### Error Recovery

```typescript
// Implement exponential backoff for rate limited operations
async function retryWithBackoff(operation: () => Promise<any>, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error.message.includes('rate limit') && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`Rate limited, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

// Usage
const repos = await retryWithBackoff(() => 
  oauthProviderService.getGitHubRepos('agent-001', 'github-provider-1')
);
```

This enhanced security system provides comprehensive protection while enabling powerful agent capabilities and seamless OAuth integration. The examples above demonstrate how to implement secure authentication, authorization, and monitoring for both human users and AI agents. 