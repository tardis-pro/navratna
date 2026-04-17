/**
 * MCP Extension Ecosystem — Type Definitions
 *
 * Types for @uaip/mcp-forge SDK, Extension Registry, and Sandbox.
 * PM-38: MCP Extension Ecosystem
 *
 * Implementation tickets:
 *   FOLLOW-UP-A: isolated-vm sandbox
 *   FOLLOW-UP-B: Extension Registry API
 *   FOLLOW-UP-C: Stripe Connect revenue-share
 *   FOLLOW-UP-D: Widget extension system
 */

/** Semantic version string, e.g. "1.2.3" */
type SemVer = `${number}.${number}.${number}`;

/** Capability grant — which UAIP data stores and events an extension may access */
export interface ExtensionCapabilityGrant {
  /** Access to PostgreSQL data stores */
  readonly dataStores: ReadonlyArray<
    'conversations' | 'agents' | 'capabilities' | 'users' | 'knowledge'
  >;
  /** Access to Neo4j knowledge graph */
  readonly knowledgeGraph: boolean;
  /** Access to Qdrant vector store */
  readonly vectorStore: boolean;
  /** Allowlisted outbound network hosts (empty = no external network) */
  readonly networkWhitelist: ReadonlyArray<string>;
  /** Can emit UAIP events */
  readonly canEmitEvents: boolean;
  /** Can subscribe to UAIP event bus topics */
  readonly eventSubscriptions: ReadonlyArray<string>;
}

/** Resource limits for sandboxed MCP server execution */
export interface ExtensionSandboxConfig {
  /** Max CPU time per tool invocation in milliseconds */
  readonly cpuTimeLimitMs: number;
  /** Max V8 heap in bytes */
  readonly memoryLimitBytes: number;
  /** Capability grants — explicit permission model */
  readonly capabilityGrants: ExtensionCapabilityGrant;
  /** Max concurrent tool invocations */
  readonly maxConcurrentCalls: number;
  /** Enable filesystem access (almost always false for untrusted extensions) */
  readonly filesystemAccess: false;
}

/** Pricing model for extension marketplace */
export type ExtensionPricingModel =
  | { readonly type: 'free' }
  | { readonly type: 'per-call'; readonly priceUsdCents: number }
  | { readonly type: 'subscription'; readonly monthlyUsdCents: number }
  | { readonly type: 'revenue-share'; readonly authorSharePercent: number };

/** Tool declaration within an extension */
export interface MCPExtensionTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>; // JSON Schema
  readonly outputSchema: Record<string, unknown>; // JSON Schema
  /** Estimated latency class for UX hints */
  readonly latencyClass: 'fast' | 'moderate' | 'slow';
}

/** Widget extension declaration — MaterializableBlock-compatible React component */
export interface MCPExtensionWidget {
  readonly widgetId: string;
  readonly displayName: string;
  /** Entry point URL served by the extension bundle */
  readonly bundleUrl: string;
  /** Supported MaterializableBlock sizes */
  readonly supportedSizes: ReadonlyArray<'compact' | 'standard' | 'expanded'>;
  /** Whether widget requires iframe sandbox (true for untrusted 3rd-party) */
  readonly requiresIframeSandbox: boolean;
}

/**
 * MCPExtensionManifest — the package.json-equivalent for UAIP extensions.
 * Declared in the extension's root as `mcp-extension.json`.
 */
export interface MCPExtensionManifest {
  readonly id: string; // e.g. "acme/weather-tools"
  readonly name: string;
  readonly version: SemVer;
  readonly description: string;
  readonly author: {
    readonly name: string;
    readonly email: string;
    readonly stripeConnectAccountId?: string;
  };
  readonly license: string;
  readonly tools: ReadonlyArray<MCPExtensionTool>;
  readonly widgets?: ReadonlyArray<MCPExtensionWidget>;
  readonly sandbox: ExtensionSandboxConfig;
  readonly pricing: ExtensionPricingModel;
  /** Minimum navratna version required */
  readonly minNavratnaVersion: SemVer;
  /** Declared MCP server entry point (relative path) */
  readonly serverEntry: string;
}

/** Extension Registry entry — marketplace metadata */
export interface ExtensionRegistryEntry {
  readonly manifest: MCPExtensionManifest;
  readonly registryId: string;
  readonly publishedAt: Date;
  readonly updatedAt: Date;
  readonly downloadCount: number;
  readonly averageRating: number | null;
  readonly reviewCount: number;
  readonly verified: boolean;
  readonly deprecationNotice: string | null;
  /** Compatible navratna versions (semver range) */
  readonly compatibilityRange: string;
}

/** Installation record — tracks which extensions are installed in a navratna instance */
export interface ExtensionInstallation {
  readonly installationId: string;
  readonly extensionId: string;
  readonly installedVersion: SemVer;
  readonly installedAt: Date;
  readonly installedBy: string; // user ID
  readonly status: 'active' | 'disabled' | 'error';
  readonly lastHealthCheck: Date | null;
  readonly errorMessage: string | null;
}

/** Hot-reload session — tracks developer's live dev server session */
export interface HotReloadSession {
  readonly sessionId: string;
  readonly extensionId: string;
  readonly devServerUrl: string;
  readonly navratnaTargetUrl: string;
  readonly startedAt: Date;
  readonly lastReloadAt: Date | null;
  readonly reloadCount: number;
  readonly status: 'connected' | 'disconnected' | 'error';
}

/** Result of injecting an extension into a running navratna instance */
export type ExtensionInjectionResult =
  | {
      readonly success: true;
      readonly extensionId: string;
      readonly injectedTools: ReadonlyArray<string>;
      readonly injectedAt: Date;
    }
  | {
      readonly success: false;
      readonly extensionId: string;
      readonly error: string;
      readonly errorCode:
        | 'SANDBOX_VIOLATION'
        | 'SCHEMA_INVALID'
        | 'PERMISSION_DENIED'
        | 'VERSION_INCOMPATIBLE'
        | 'INJECTION_FAILED';
    };
