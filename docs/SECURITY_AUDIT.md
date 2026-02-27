# Dev Startup Security Audit & Test Status

## Removed Redundant Scripts

The following scripts were removed as `dev-start.sh` already provides all necessary functionality:

- `scripts/start-backend.sh` - redundant
- `scripts/start-navratna.sh` - redundant

## Security Enhancements to `dev-start.sh`

### 1. JWT_SECRET Validation

```bash
# Now enforces minimum 32-character length
if [ ${#jwt_secret} -lt 32 ]; then
    log_error "JWT_SECRET is too short (minimum 32 characters)"
    exit 1
fi
```

### 2. Input Validation (Command Injection Prevention)

```bash
# New validate_service_name() function
validate_service_name() {
    # Reject dangerous characters
    if [[ "$service_name" =~ [;&|>$`\\] ]]; then
        log_error "Invalid service name: contains forbidden characters"
        exit 1
    fi
    # Reject names starting with dash
    if [[ "$service_name" == -* ]]; then
        log_error "Invalid service name: cannot start with dash"
        exit 1
    fi
}
```

### 3. Database Password Strength Check

```bash
# Warn if password is too short or matches default
if [[ "$db_password" == "uaip_password" ]] || [ ${#db_password} -lt 12 ]; then
    log_warning "POSTGRES_PASSWORD appears weak"
fi
```

### 4. Production Security Validation

```bash
# Warn if using dev secrets in non-dev environment
if [ "${NODE_ENV:-development}" != "development" ]; then
    if [[ "$jwt_secret" == *"dev"* ]] || [[ "$jwt_secret" == *"secret"* ]]; then
        log_error "JWT_SECRET appears to be a default/weak value in production"
        exit 1
    fi
fi
```

## Known Security Concerns

1. **API Keys in .env**: API keys are stored in `.env` file
   - Mitigation: Add `.env` to `.gitignore`
   - Recommendation: Use secrets management in production (AWS Secrets Manager, HashiCorp Vault)

2. **Default Dev Passwords**: Development uses simple passwords
   - Mitigation: Only use in local/dev environments
   - Recommendation: Use strong passwords in production

3. **No TLS in Dev**: Services communicate plaintext
   - over Mitigation: Acceptable for local development
   - Recommendation: Enable TLS for production

## Test Suite Status

### Tests Not Working (Pre-existing Issues)

**Location**: `backend/services/security-gateway/src/__tests__/integration/`

**Issues**:

1. **TypeScript Compilation Errors**: Test expectations don't match entity definitions
   - Example: Test expects `expiresAt` but entity has `tokenExpiresAt`
   - Example: Test expects `agentId` on `OAuthStateEntity` but property name differs

2. **Jest ESM Configuration**: Test files use ESM imports but Jest config has issues
   - Error: `SyntaxError: Cannot use import statement outside a module`
   - Cause: `.js` files in `dist/` being imported instead of `.ts` sources

3. **Entity Type Mismatches**:
   - `AgentOAuthConnectionEntity.usageStats` doesn't have `requestsThisHour` property
   - `OAuthStateEntity` doesn't have `agentId` property
   - Various missing entity properties

### Recommended Fixes

1. Update test expectations to match actual entity definitions
2. Fix Jest configuration for proper ESM transpilation
3. Add missing properties to entity definitions (if tests are correct)
4. Update type definitions to be consistent

### Working Tests

- Backend services start successfully
- Health checks return `healthy` status
- Database connections work
- Event bus (RabbitMQ) connections work
- All 7 backend services are operational

## Service Status (Verified)

| Service                  | Port | Status  | Health                               |
| ------------------------ | ---- | ------- | ------------------------------------ |
| Agent Intelligence       | 3001 | Running | ✅ ok                                |
| Security Gateway         | 3004 | Running | ✅ healthy (db + eventBus connected) |
| Orchestration Pipeline   | 3002 | Running | ✅ healthy                           |
| Discussion Orchestration | 3005 | Running | ✅ healthy                           |
| Capability Registry      | 3003 | Running | -                                    |
| Artifact Service         | 3006 | Running | -                                    |
| LLM Service              | 3007 | Running | -                                    |

## Usage

```bash
# Start with security validation
./dev-start.sh --daemon

# Check status
./dev-start.sh status

# View logs
./dev-start.sh logs security-gateway --follow

# Stop all
./dev-start.sh stop
```

## Security Recommendations for Production

1. **Generate strong secrets**:

   ```bash
   JWT_SECRET=$(openssl rand -base64 32)
   ENCRYPTION_KEY=$(openssl rand -base64 32)
   ```

2. **Use TLS for all services**: Enable HTTPS/TLS for API endpoints

3. **Rotate credentials regularly**: Implement credential rotation policy

4. **Enable audit logging**: Ensure all security events are logged

5. **Use secrets management**: Move API keys to vault/secrets manager

6. **Network isolation**: Use Docker networks to isolate services

7. **Rate limiting**: Configure rate limits for all API endpoints

8. **Input validation**: Sanitize all user inputs

9. **Output encoding**: Prevent XSS in API responses

10. **Security headers**: Add security headers (HSTS, CSP, etc.)
