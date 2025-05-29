# UAIP Backend Monorepo Restructure Plan

## Current Issues Identified

1. **Duplicate Services**: Agent-intelligence has local services that exist in shared/services
2. **Incorrect Imports**: Mixing local and shared imports incorrectly
3. **TypeScript Configuration**: Poor project references and path mapping
4. **Dependency Duplication**: Package dependencies spread across services unnecessarily
5. **Build Order**: No proper dependency chain for incremental builds

## Target Architecture

```
uaip-backend/
├── shared/
│   ├── types/                 # @uaip/types package
│   ├── services/             # @uaip/shared-services package  
│   ├── middleware/           # @uaip/middleware package
│   ├── utils/               # @uaip/utils package
│   └── config/              # @uaip/config package
├── services/
│   ├── agent-intelligence/   # @uaip/agent-intelligence
│   ├── orchestration-pipeline/ # @uaip/orchestration-pipeline
│   ├── capability-registry/  # @uaip/capability-registry
│   └── security-gateway/     # @uaip/security-gateway
└── api-gateway/             # @uaip/api-gateway
```

## Implementation Steps

### Phase 1: Fix Shared Package Structure

1. **Update shared/types package.json**
   - Ensure proper workspace configuration
   - Set up build scripts

2. **Create shared packages for services, middleware, utils**
   - Each as separate workspace package
   - Proper dependencies and exports

3. **Update TypeScript configurations**
   - Root tsconfig with proper project references
   - Shared packages with composite builds
   - Services referencing shared packages

### Phase 2: Fix Agent Intelligence Service

1. **Remove duplicate services**
   - Delete local services that exist in shared/
   - Update imports to use shared packages

2. **Fix TypeScript configuration**
   - Update tsconfig to reference shared packages
   - Fix path mapping
   - Enable project references

3. **Update package.json**
   - Remove duplicate dependencies
   - Add workspace references to shared packages
   - Update build scripts

### Phase 3: Verify and Test

1. **Build verification**
   - Ensure incremental builds work
   - Test service isolation
   - Verify proper imports

2. **Runtime testing**
   - Test service startup
   - Verify shared service integration
   - Check logging and middleware

## Benefits

- **DRY Principle**: No code duplication across services
- **Type Safety**: Proper TypeScript project references
- **Build Efficiency**: Incremental builds with dependency caching
- **Service Isolation**: Each service can run independently
- **Maintainability**: Centralized shared components
- **Scalability**: Easy to add new services 