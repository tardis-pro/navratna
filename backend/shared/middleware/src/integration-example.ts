// Example of how to integrate error logging into your services
// This file shows usage patterns - copy these into your actual service files

import { createErrorLogger, withErrorTracking, withSyncErrorTracking } from './errorLogger';
import {
  DatabaseConnectionError,
  ValidationError,
  AuthenticationError,
  BusinessLogicError,
} from './errorLogger';

// 1. Create service-specific error logger
const errorLogger = createErrorLogger('your-service-name');

// 2. Example: Database operation with error tracking
export async function getUserById(userId: string) {
  return withErrorTracking(
    async () => {
      const user = await database.findUser(userId);
      if (!user) {
        throw new BusinessLogicError('getUserById', `User ${userId} not found`);
      }
      return user;
    },
    errorLogger,
    {
      endpoint: '/api/v1/users/:id',
      userId,
      metadata: { operation: 'getUserById' },
    }
  );
}

// 3. Example: Validation with custom error tracking
export function validateUserInput(userData: any) {
  try {
    if (!userData.email) {
      throw new ValidationError('email', userData.email, 'string');
    }
    if (!userData.password || userData.password.length < 8) {
      throw new ValidationError('password', userData.password, 'string(min 8 chars)');
    }
    return true;
  } catch (error) {
    errorLogger.error(error as Error, {
      endpoint: '/api/v1/users/validate',
      metadata: {
        inputFields: Object.keys(userData),
        validationStep: 'user_input',
      },
    });
    throw error;
  }
}

// 4. Example: Authentication error handling
export async function authenticateUser(token: string) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      const authError = new AuthenticationError('Invalid JWT token');
      errorLogger.error(authError, {
        endpoint: '/api/v1/auth/verify',
        metadata: {
          tokenLength: token.length,
          errorType: error.name,
        },
      });
      throw authError;
    }
    throw error;
  }
}

// 5. Example: External API call with error tracking
export async function callExternalService(apiUrl: string, data: any) {
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new ExternalServiceError('external-api', 'POST', response.status);
    }

    return await response.json();
  } catch (error) {
    errorLogger.error(error as Error, {
      endpoint: '/api/v1/external/call',
      metadata: {
        externalUrl: apiUrl,
        requestSize: JSON.stringify(data).length,
        operation: 'external_api_call',
      },
    });
    throw error;
  }
}

// 6. Example: Database connection error handling
export async function connectToDatabase() {
  try {
    await database.connect();
    logger.info('Database connected successfully');
  } catch (error) {
    const dbError = new DatabaseConnectionError('postgresql', error as Error);
    errorLogger.critical(dbError, {
      endpoint: 'database_connection',
      metadata: {
        connectionAttempt: Date.now(),
        databaseType: 'postgresql',
      },
    });
    throw dbError;
  }
}

// 7. Example: Express route handler with error tracking
export const handleUserCreation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate input
    validateUserInput(req.body);

    // Create user with error tracking
    const user = await withErrorTracking(() => userService.createUser(req.body), errorLogger, {
      endpoint: req.route?.path,
      userId: req.user?.id,
      metadata: { operation: 'user_creation' },
    });

    res.status(201).json({ user });
  } catch (error) {
    // Error is already logged by middleware and withErrorTracking
    next(error);
  }
};

// 8. Example: Business logic with warning-level errors
export async function processUserPreferences(userId: string, preferences: any) {
  try {
    const user = await getUserById(userId);

    // Some business logic that might have non-critical issues
    if (preferences.theme && !['light', 'dark'].includes(preferences.theme)) {
      const warning = new ValidationError('theme', preferences.theme, 'light|dark');
      errorLogger.warning(warning, {
        endpoint: '/api/v1/users/preferences',
        userId,
        metadata: {
          operation: 'theme_validation',
          fallbackUsed: true,
        },
      });
      preferences.theme = 'light'; // fallback
    }

    return await userService.updatePreferences(userId, preferences);
  } catch (error) {
    errorLogger.business(error as Error, {
      endpoint: '/api/v1/users/preferences',
      userId,
      metadata: { operation: 'preferences_update' },
    });
    throw error;
  }
}

// 9. Integration with your existing logger
export function setupErrorLogging() {
  // This should be called in your service initialization
  const serviceName = process.env.SERVICE_NAME || 'unknown-service';
  const errorLogger = createErrorLogger(serviceName);

  // Make error logger available globally in your service
  (global as any).errorLogger = errorLogger;

  logger.info(`Error logging initialized for service: ${serviceName}`);
}

// 10. Usage in your existing BaseService
export class YourService extends BaseService {
  private errorLogger = createErrorLogger('your-service');

  protected async handleError(error: Error, context?: any) {
    this.errorLogger.error(error, {
      endpoint: context?.endpoint,
      userId: context?.userId,
      metadata: context?.metadata,
    });
  }

  protected async handleCriticalError(error: Error, context?: any) {
    this.errorLogger.critical(error, {
      endpoint: context?.endpoint,
      metadata: { ...context?.metadata, critical: true },
    });
  }
}
