# Frontend API Configuration

This directory contains the API configuration for the UAIP frontend application.

## Environment Variables

The frontend uses Vite environment variables. Create a `.env.local` file in the project root to override defaults:

```bash
# API Base URL (leave empty to use Vite proxy - recommended for development)
VITE_API_BASE_URL=

# Individual service URLs (optional - only needed if not using proxy)
VITE_AGENT_SERVICE_URL=http://localhost:3001
VITE_CAPABILITY_SERVICE_URL=http://localhost:3003
VITE_ORCHESTRATION_SERVICE_URL=http://localhost:3002
```

## Configuration Modes

### Development with Proxy (Default - Recommended)

- Set `VITE_API_BASE_URL=` (empty string)
- All API calls go through Vite proxy to avoid CORS
- Proxy forwards to API Gateway at `localhost:8081`

### Development without Proxy

- Set `VITE_API_BASE_URL=http://localhost:8081`
- Direct calls to API Gateway
- Requires proper CORS configuration on backend

### Production

- Set `VITE_API_BASE_URL=https://your-api-domain.com`
- Or leave empty to use same origin as frontend

## Files

- `apiConfig.ts` - Main configuration file with environment detection
- `README.md` - This documentation file

## Usage

```typescript
import { uaipAPI } from '@/services/uaip-api';

// Check backend availability
const isAvailable = await uaipAPI.isBackendAvailable();

// Get environment info
const envInfo = uaipAPI.getEnvironmentInfo();
console.log('Proxy enabled:', envInfo.proxyEnabled);
console.log('Base URL:', envInfo.baseURL);
```

## Troubleshooting

1. **CORS Errors**: Use proxy mode (default) or ensure backend has proper CORS headers
2. **Connection Refused**: Check if backend services are running
3. **Environment Variables**: Ensure they start with `VITE_` prefix for Vite to include them
