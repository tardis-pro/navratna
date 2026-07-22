import type {
  ExtensionRegistryEntry,
  ExtensionInstallation,
  MCPExtensionManifest,
  ExtensionInjectionResult,
  HotReloadSession,
} from './types.js';

export class ExtensionRegistryService {
  private readonly registry = new Map<string, ExtensionRegistryEntry>();
  private readonly installations = new Map<string, ExtensionInstallation>();
  private readonly hotReloadSessions = new Map<string, HotReloadSession>();

  async listExtensions(filters?: {
    verified?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<ReadonlyArray<ExtensionRegistryEntry>> {
    let entries = Array.from(this.registry.values());
    if (filters?.verified !== undefined) {
      entries = entries.filter((entry) => entry.verified === filters.verified);
    }
    if (filters?.search) {
      const search = filters.search.toLowerCase();
      entries = entries.filter((entry) =>
        entry.manifest.name.toLowerCase().includes(search) ||
        entry.manifest.description.toLowerCase().includes(search)
      );
    }
    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? entries.length;
    return entries.slice(offset, offset + limit);
  }

  async publishExtension(
    manifest: MCPExtensionManifest,
    publishedBy: string,
  ): Promise<ExtensionRegistryEntry> {
    const now = new Date();
    const entry: ExtensionRegistryEntry = {
      manifest,
      registryId: `${manifest.id}@${manifest.version}`,
      publishedAt: now,
      updatedAt: now,
      downloadCount: 0,
      averageRating: null,
      reviewCount: 0,
      verified: publishedBy === manifest.author.email,
      deprecationNotice: null,
      compatibilityRange: `>=${manifest.minNavratnaVersion}`,
    };
    this.registry.set(entry.registryId, entry);
    return entry;
  }

  async installExtension(
    extensionId: string,
    version: string,
    installedBy: string,
  ): Promise<ExtensionInstallation> {
    const entry = Array.from(this.registry.values()).find((candidate) =>
      candidate.manifest.id === extensionId && candidate.manifest.version === version
    );
    if (!entry) {
      throw new Error(`Extension not found: ${extensionId}@${version}`);
    }
    const installation: ExtensionInstallation = {
      installationId: `${extensionId}:${installedBy}:${Date.now()}`,
      extensionId,
      installedVersion: entry.manifest.version,
      installedAt: new Date(),
      installedBy,
      status: 'active',
      lastHealthCheck: null,
      errorMessage: null,
    };
    this.installations.set(installation.installationId, installation);
    return installation;
  }

  async uninstallExtension(installationId: string): Promise<void> {
    this.installations.delete(installationId);
  }

  async injectExtension(
    installation: ExtensionInstallation,
  ): Promise<ExtensionInjectionResult> {
    const entry = Array.from(this.registry.values()).find((candidate) =>
      candidate.manifest.id === installation.extensionId &&
      candidate.manifest.version === installation.installedVersion
    );
    if (!entry) {
      return {
        success: false,
        extensionId: installation.extensionId,
        error: 'Installed extension manifest not found',
        errorCode: 'INJECTION_FAILED',
      };
    }
    return {
      success: true,
      extensionId: installation.extensionId,
      injectedTools: entry.manifest.tools.map((tool) => tool.name),
      injectedAt: new Date(),
    };
  }

  async startHotReloadSession(
    extensionId: string,
    devServerUrl: string,
    navratnaTargetUrl: string,
  ): Promise<HotReloadSession> {
    const session: HotReloadSession = {
      sessionId: `${extensionId}:${Date.now()}`,
      extensionId,
      devServerUrl,
      navratnaTargetUrl,
      startedAt: new Date(),
      lastReloadAt: null,
      reloadCount: 0,
      status: 'connected',
    };
    this.hotReloadSessions.set(session.sessionId, session);
    return session;
  }

  async stopHotReloadSession(sessionId: string): Promise<void> {
    const session = this.hotReloadSessions.get(sessionId);
    if (!session) return;
    this.hotReloadSessions.set(sessionId, {
      ...session,
      status: 'disconnected',
      lastReloadAt: new Date(),
    });
  }
}
