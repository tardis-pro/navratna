/**
 * Deployment types for TARDIS multi-platform deployment system.
 *
 * Used by the DeploymentOrchestrator and platform-specific adapters
 * (Fly.io, AWS ECS/Lambda, Cloudflare Workers/Pages, RunPod, K8s, Docker Compose).
 */

export type DeploymentPlatform =
  | 'fly'
  | 'aws-ecs'
  | 'aws-lambda'
  | 'cf-workers'
  | 'cf-pages'
  | 'runpod'
  | 'k8s'
  | 'docker-compose';

export type DeploymentStatus =
  | 'provisioned'
  | 'deploying'
  | 'healthy'
  | 'degraded'
  | 'down'
  | 'failed'
  | 'rolled_back';

export interface DeploymentConfig {
  appName: string;
  subdomain: string;
  platform: DeploymentPlatform;
  image?: string;
  buildContext?: string;
  dockerfile?: string;
  envVars: Record<string, string>;
  secrets: string[];
  healthEndpoint: string;
  port: number;
  scaling?: { min: number; max: number };
  region?: string;
  resources?: { cpu: string; memory: string };
}

export interface DeploymentResult {
  id: string;
  status: DeploymentStatus;
  url: string;
  version: string;
  deployedAt: Date;
  healthCheckPassed: boolean;
}

export interface DeploymentHealthStatus {
  healthy: boolean;
  statusCode: number;
  responseTimeMs: number;
  body?: unknown;
  checkedAt: Date;
}

export interface DeploymentAdapter {
  readonly platform: string;
  provision(config: DeploymentConfig): Promise<DeploymentResult>;
  deploy(config: DeploymentConfig, image: string): Promise<DeploymentResult>;
  healthCheck(url: string, endpoint: string): Promise<DeploymentHealthStatus>;
  rollback(appName: string, version: string): Promise<DeploymentResult>;
  destroy(appName: string): Promise<void>;
  getLogs(appName: string, lines?: number): Promise<string[]>;
  scale(appName: string, replicas: number): Promise<void>;
  getStatus(appName: string): Promise<DeploymentResult>;
}
