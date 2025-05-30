# Frontend API Integration Fixes

## Issues Identified and Fixed

### 1. **URL Construction Problem** ❌ → ✅
**Problem**: The API client was using `SERVICE_ENDPOINTS` directly in URLs, but these endpoints were empty strings in development (when proxy is enabled), resulting in malformed URLs like `undefined/api/v1/agents`.

**Solution**: 
- Replaced `SERVICE_ENDPOINTS` with `API_ROUTES` that contain the actual API paths
- Introduced `buildAPIURL()` function for proper URL construction
- All URLs now properly route through the API Gateway

### 2. **Proxy vs Direct Access Confusion** ❌ → ✅
**Problem**: Inconsistent handling of proxy vs direct service access, with overlapping configuration options.

**Solution**:
- Simplified configuration with clear proxy detection via `isProxyEnabled()`
- Unified URL construction through `buildAPIURL()` function
- Proper fallback to API Gateway URL when proxy is disabled

### 3. **Nginx Route Mismatch** ❌ → ✅
**Problem**: Frontend URL construction didn't match nginx routing expectations.

**Solution**:
- API routes now match nginx configuration exactly:
  - `/api/v1/agents` → Agent Intelligence Service
  - `/api/v1/operations` → Orchestration Pipeline Service  
  - `/api/v1/capabilities` → Capability Registry Service
  - `/health` → Health check endpoint

### 4. **Health Check Inconsistency** ❌ → ✅
**Problem**: Health checks used different URL patterns than main API calls.

**Solution**:
- Health checks now use the same `buildAPIURL()` function
- Consistent routing through API Gateway
- Proper URL construction in both proxy and direct modes

### 5. **Configuration Redundancy** ❌ → ✅
**Problem**: Overlapping and confusing environment settings between `API_BASE_URL`, `SERVICE_ENDPOINTS`, and proxy settings.

**Solution**:
- Streamlined configuration with clear separation of concerns
- `API_ROUTES` for route definitions
- `API_GATEWAY_CONFIG` for gateway settings
- `DIRECT_SERVICE_URLS` for development debugging only

## New Architecture

### Configuration Structure
```typescript
// API Routes (matches nginx.conf)
export const API_ROUTES = {
  AGENTS: '/api/v1/agents',
  OPERATIONS: '/api/v1/operations', 
  CAPABILITIES: '/api/v1/capabilities',
  HEALTH: '/health',
} as const;

// URL Construction
export const buildAPIURL = (route: string) => {
  const baseURL = getEffectiveAPIBaseURL();
  // Handles both proxy mode (empty baseURL) and direct mode
  return baseURL === '' ? route : `${baseURL}${route}`;
};
```

### API Client Updates
```typescript
// Before (broken)
return this.request<Agent>(`${SERVICE_ENDPOINTS.AGENT_INTELLIGENCE}/api/v1/agents`);

// After (fixed)
return this.request<Agent>(buildAPIURL(API_ROUTES.AGENTS));
```

### Environment Detection
```typescript
// Development with proxy (default)
isProxyEnabled() === true  → URLs: "/api/v1/agents"
getEffectiveAPIBaseURL() === ""

// Development without proxy  
isProxyEnabled() === false → URLs: "http://localhost:8081/api/v1/agents"
getEffectiveAPIBaseURL() === "http://localhost:8081"

// Production
isProxyEnabled() === true  → URLs: "https://yourdomain.com/api/v1/agents"
getEffectiveAPIBaseURL() === "https://yourdomain.com"
```

## Benefits

1. **Correct URL Construction**: All API calls now generate proper URLs
2. **Nginx Compatibility**: Frontend routes match nginx configuration exactly
3. **Environment Flexibility**: Works in both proxy and direct modes
4. **Debugging Support**: Clear logging and environment info
5. **Type Safety**: Proper TypeScript types throughout
6. **Maintainability**: Clean, documented configuration structure

## Testing

### Development Mode (Proxy Enabled)
```bash
# Start backend services
cd backend && docker-compose up

# Start frontend (in separate terminal)
npm run dev

# Check browser console for:
# "[UAIP API] Backend services are available and healthy!"
```

### Development Mode (Proxy Disabled)
```bash
# Set environment variable
export VITE_API_BASE_URL="http://localhost:8081"

# Start frontend
npm run dev

# URLs will be: http://localhost:8081/api/v1/agents
```

### Health Check Verification
```bash
# Test health endpoint directly
curl http://localhost:8081/health

# Should return: "healthy"
```

## Migration Notes

### For Existing Components
- No changes needed - the API client interface remains the same
- All existing `uaipAPI.client.agents.get()` calls work unchanged
- Health checks now work properly

### For New Development
- Use `API_ROUTES` constants for route definitions
- Use `buildAPIURL()` for any custom URL construction
- Check `uaipAPI.getEnvironmentInfo()` for debugging

## Nginx Configuration Verification

The nginx configuration correctly routes:
- `GET /health` → Returns "healthy" 
- `POST /api/v1/agents` → `agent-intelligence:3001/api/v1/agents`
- `GET /api/v1/operations/{id}/status` → `orchestration-pipeline:3002/api/v1/operations/{id}/status`
- `GET /api/v1/capabilities/search` → `capability-registry:3003/api/v1/capabilities/search`

All frontend API calls now properly align with this routing configuration. 