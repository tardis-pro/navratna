// Type extensions for Express Request interface
declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: {
        id: string;
        email: string;
        role: string;
        sessionId?: string;
        permissions?: string[];
      };
      startTime?: number;
    }
  }
}

export {};
