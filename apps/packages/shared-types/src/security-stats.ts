export type SecuritySystemStatus = 'healthy' | 'warning' | 'critical';

export interface SecurityStatsResponse {
  activeSessions: number;
  failedLoginsLastHour: number;
  criticalEventsUnresolved: number;
  openVulnerabilities: number;
  dataEncryptedPercent: number;
  systemStatus: SecuritySystemStatus;
  trends: {
    failedLoginsVsPreviousHour: number;
    criticalEventsVsPreviousDay: number;
  };
  fetchedAt: string;
}

export interface UserRateLimitState {
  count: number;
  resetAt: number;
}
