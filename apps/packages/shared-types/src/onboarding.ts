// Onboarding Types for TARDIS Stack Detection & Repo Onboarding
// Used by stack_detector, config_generator, and onboarding_routes

export type DetectedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'ruby'
  | 'java'
  | 'elixir'
  | 'unknown';

export type DetectedRuntime =
  | 'bun'
  | 'node'
  | 'deno'
  | 'python'
  | 'go'
  | 'rust'
  | 'ruby'
  | 'jvm'
  | 'beam'
  | 'unknown';

export type DeployPlatform = 'fly' | 'cloudflare-workers' | 'cloudflare-pages';

export type ExistingDeployPlatform =
  | 'fly'
  | 'vercel'
  | 'cloudflare'
  | 'heroku'
  | 'railway'
  | null;

export interface StackProfile {
  language: DetectedLanguage;
  runtime: DetectedRuntime;
  framework: string | null;
  databases: string[];
  port: number | null;
  hasDockerfile: boolean;
  hasHealthEndpoint: boolean;
  envVars: string[];
  apiRoutes: string[];
  existingDeploy: ExistingDeployPlatform;
  buildCommand: string | null;
  startCommand: string | null;
  testCommand: string | null;
}

export interface OnboardingConfig {
  repoUrl: string;
  platform: DeployPlatform;
  subdomain: string;
  /** Override detected stack profile values */
  overrides?: Partial<StackProfile>;
}

export interface GeneratedConfigs {
  /** Map of file path (relative to repo root) to file contents */
  files: Record<string, string>;
  /** The detected or provided stack profile used for generation */
  stackProfile: StackProfile;
  /** The target deploy platform */
  platform: DeployPlatform;
  /** The configured subdomain */
  subdomain: string;
}

export interface OnboardingDetectRequest {
  repoUrl: string;
}

export interface OnboardingDetectResponse {
  success: boolean;
  data?: StackProfile;
  error?: string;
}

export interface OnboardingGenerateRequest {
  stackProfile: StackProfile;
  platform: DeployPlatform;
  subdomain: string;
}

export interface OnboardingGenerateResponse {
  success: boolean;
  data?: GeneratedConfigs;
  error?: string;
}

export interface OnboardingFullRequest {
  repoUrl: string;
  platform: DeployPlatform;
  subdomain: string;
}

export interface OnboardingFullResponse {
  success: boolean;
  data?: GeneratedConfigs;
  error?: string;
}
