import type {
  ExtensionRegistryEntry,
  ExtensionInstallation,
  MCPExtensionManifest,
  ExtensionInjectionResult,
  HotReloadSession,
} from './types.js';

export class ExtensionRegistryService {
  async listExtensions(filters?: {
    verified?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<ReadonlyArray<ExtensionRegistryEntry>> {
    throw new Error('Not implemented — FOLLOW-UP-B');
  }

  async publishExtension(
    manifest: MCPExtensionManifest,
    publishedBy: string,
  ): Promise<ExtensionRegistryEntry> {
    throw new Error('Not implemented — FOLLOW-UP-B');
  }

  async installExtension(
    extensionId: string,
    version: string,
    installedBy: string,
  ): Promise<ExtensionInstallation> {
    throw new Error('Not implemented — FOLLOW-UP-B');
  }

  async uninstallExtension(installationId: string): Promise<void> {
    throw new Error('Not implemented — FOLLOW-UP-B');
  }

  async injectExtension(
    installation: ExtensionInstallation,
  ): Promise<ExtensionInjectionResult> {
    throw new Error('Not implemented — FOLLOW-UP-A (sandbox) + FOLLOW-UP-B');
  }

  async startHotReloadSession(
    extensionId: string,
    devServerUrl: string,
    navratnaTargetUrl: string,
  ): Promise<HotReloadSession> {
    throw new Error('Not implemented — FOLLOW-UP-E (MCP Forge CLI)');
  }

  async stopHotReloadSession(sessionId: string): Promise<void> {
    throw new Error('Not implemented — FOLLOW-UP-E');
  }
}
