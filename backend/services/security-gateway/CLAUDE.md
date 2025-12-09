# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Security Gateway Service Overview

The Security Gateway is the **authentication, authorization, and security orchestration hub** for the Council of Nycea UAIP platform. It runs on port 3004 and handles all security-related operations including JWT validation, OAuth provider management, approval workflows, audit logging, and agent security validation.

## Architecture

### Core Responsibilities

- **Authentication**: JWT token validation, MFA (TOTP, SMS, hardware tokens), session management
- **Authorization**: Role-based access control (RBAC), capability-based permissions for AI agents
- **OAuth Integration**: Multi-provider OAuth flows (GitHub, Gmail, Zoho, Microsoft, Custom)
- **Approval Workflows**: Human approval requirements for high-risk operations
- **Audit & Compliance**: Comprehensive security event logging and audit trails
- **Agent Security**: AI agent capability validation and security assessment

### Key Components

#### Service Layer (`src/services/`)

- **SecurityGatewayService**: Core security validation and risk assessment
- **EnhancedAuthService**: JWT validation, MFA, session management
- **OAuthProviderService**: Multi-provider OAuth integration with PKCE
- **ApprovalWorkflowService**: Workflow orchestration with cron jobs
- **AuditService**: Security event logging and compliance tracking
- **NotificationService**: Security alert notifications

#### Route Layer (`src/routes/`)

- **authRoutes**: Login, logout, MFA, session management
- **securityRoutes**: Security validation, risk assessment
- **oauthRoutes**: OAuth provider management and flows
- **approvalRoutes**: Approval workflow management
- **auditRoutes**: Audit log access and reporting
- **userRoutes**: User management and preferences
- **knowledgeRoutes**: Personal knowledge CRUD operations

## Development Commands

### Build and Development

```bash
# Development with hot reload
pnpm dev

# Build TypeScript
pnpm build

# Clean build artifacts
pnpm clean
```

### Testing

```bash
# Run all tests
pnpm test

# Watch mode for development
pnpm test:watch

# Coverage reporting (70% threshold)
pnpm test:coverage

# Integration tests only
pnpm test:integration

# Specific integration test suites
pnpm test:integration:oauth
pnpm test:integration:security
```

### Linting

```bash
# Lint TypeScript files
pnpm lint

# Auto-fix linting issues
pnpm lint:fix
```

## Key Patterns and Architecture

### Service Initialization

The service extends `BaseService` from `@uaip/shared-services` and follows a structured initialization pattern:

1. Database and event bus connection
2. Service dependency injection
3. Route setup with middleware
4. Event subscription setup (standard + enterprise)
5. Cron job initialization

### Event-Driven Architecture

- **Standard Event Bus**: Internal service communication via RabbitMQ
- **Enterprise Event Bus**: Enhanced compliance and audit features
- **WebSocket Authentication**: Real-time auth validation for other services

### Security Validation Flow

1. **Risk Assessment**: Multi-factor scoring based on user type, auth method, capabilities
2. **Policy Evaluation**: Dynamic security policy matching and enforcement
3. **Approval Requirements**: Automatic approval workflow triggering for high-risk operations
4. **Audit Logging**: Comprehensive security event tracking

### OAuth Integration

- **PKCE Implementation**: Secure OAuth flows with Proof Key for Code Exchange
- **Multi-Provider Support**: Extensible provider system with per-provider configurations
- **Agent-Specific Connections**: OAuth connections tied to AI agent capabilities

## Testing Architecture

### Test Structure

- **Unit Tests** (`src/__tests__/unit/`): Service logic testing with comprehensive mocking
- **Integration Tests** (`src/__tests__/integration/`): End-to-end flows with real database
- **Security Demo Tests**: Security validation demonstrations and examples

### Test Configuration

- **Jest with TypeScript**: ESM support with ts-jest preset
- **Coverage Threshold**: 70% minimum across branches, functions, lines, statements
- **Module Mapping**: Workspace imports properly resolved for testing
- **Mock Services**: Comprehensive mock implementations in `utils/mockServices.ts`

### Running Specific Tests

```bash
# OAuth flow integration tests
jest src/__tests__/integration/oauth-flow.integration.test.ts --runInBand --forceExit

# Security validation tests
jest src/__tests__/integration/security-validation.integration.test.ts --runInBand --forceExit

# Enhanced security integration
jest src/__tests__/integration/enhancedSecurityIntegration.test.ts --runInBand --forceExit
```

## Import Patterns

### Workspace Dependencies

```typescript
// Shared services and utilities
import { BaseService } from '@uaip/shared-services';
import { validateJWTToken } from '@uaip/middleware';
import { SecurityLevel, Operation } from '@uaip/types';
import { logger } from '@uaip/utils';

// Local imports within service
import { SecurityGatewayService } from '@/services/securityGatewayService.js';
import authRoutes from '@/routes/authRoutes.js';
```

### Path Mapping

- `@/services/*`: Maps to `src/services/*`
- `@/routes/*`: Maps to `src/routes/*`

## Security Features

### Multi-Factor Authentication

- **TOTP**: Time-based One-Time Passwords with QR code generation
- **SMS**: SMS-based verification
- **Hardware Tokens**: Hardware security key support
- **Biometric**: Biometric authentication integration

### Agent Capability System

Fine-grained permissions for AI agents:

- `CODE_REPOSITORY`: Repository access and code operations
- `EMAIL_ACCESS`: Email reading and sending capabilities
- `FILE_MANAGEMENT`: File system operations
- `API_ACCESS`: External API integration
- `DATABASE_ACCESS`: Database operation permissions

### Risk Assessment Framework

Multi-factor risk scoring considers:

- User type (human vs agent)
- Authentication method strength
- OAuth provider trust level
- Operation type and resource sensitivity
- Device and location trust factors
- Time-based factors (off-hours, weekends)

### Approval Workflows

- **Automatic Triggering**: High-risk operations automatically require approval
- **Role-Based Approvers**: Configurable approval chains based on operation type
- **Escalation Paths**: Time-based escalation for pending approvals
- **Audit Integration**: All approval decisions logged for compliance

## Development Guidelines

### Service Development

- Extend `BaseService` for consistent initialization patterns
- Use dependency injection for service dependencies
- Implement proper error handling with `ApiError` from `@uaip/utils`
- Follow event-driven patterns for inter-service communication

### Testing Requirements

- Write unit tests for all business logic
- Create integration tests for complete workflows
- Maintain 70% code coverage minimum
- Use proper mocking for external dependencies

### Security Considerations

- Never log sensitive information (tokens, passwords, API keys)
- Use secure random generation for tokens and secrets
- Implement proper rate limiting for all endpoints
- Follow principle of least privilege for permissions
- Validate all inputs with Zod schemas

## File Structure

```
src/
├── services/           # Business logic layer
├── routes/            # Express route handlers
└── __tests__/         # Test suites
    ├── unit/          # Unit tests
    ├── integration/   # Integration tests
    └── utils/         # Test utilities and mocks
```

## Configuration

- Service runs on port 3004 (configurable via `config.services.securityGateway.port`)
- Enterprise event bus enabled for compliance features
- TypeScript with ESM modules and strict mode disabled for compatibility
- Jest configuration optimized for workspace imports and coverage reporting
