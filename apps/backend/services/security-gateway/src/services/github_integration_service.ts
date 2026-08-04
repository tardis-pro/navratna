import { logger } from '@uaip/utils';
import { ApiError } from '@uaip/utils';
import { OAuthService } from '@uaip/shared-services';
import { OAuthProviderService } from './oauth_provider_service.js';
import { OAuthProviderType, type GitHubRepo } from '@uaip/types';

/**
 * Encapsulates GitHub operations for a user/project context.
 *
 * User GitHub OAuth tokens are stored in `agent_oauth_connections` where the
 * `agentId` field is overloaded to also hold the user id.  This matches the
 * existing convention used by `OAuthProviderService.getGitHubRepos`.
 */
export class GitHubIntegrationService {
  private oauthProviderService: OAuthProviderService;
  private oauthService: OAuthService;

  constructor(
    oauthProviderService: OAuthProviderService,
    oauthService: OAuthService = OAuthService.getInstance()
  ) {
    this.oauthProviderService = oauthProviderService;
    this.oauthService = oauthService;
  }

  /**
   * Return the enabled GitHub OAuth provider configuration, or null if none
   * is configured.
   */
  async getGitHubProvider() {
    return this.oauthService.findOAuthProviderByType(OAuthProviderType.GITHUB);
  }

  /**
   * List repositories accessible to the connected user.  If GitHub is not
   * connected (no provider or no token) we surface a typed error so the UI
   * can send the user through OAuth.
   */
  async listUserRepos(userId: string): Promise<GitHubRepo[]> {
    const provider = await this.ensureGitHubProvider();
    const repos = await this.oauthProviderService.getGitHubRepos(userId, provider.id);
    return Array.isArray(repos) ? (repos as GitHubRepo[]) : [];
  }

  /**
   * Return a single repository that the user has access to, matched by full
   * name (e.g. "owner/repo").
   */
  async getUserRepo(userId: string, repoFullName: string): Promise<GitHubRepo> {
    const provider = await this.ensureGitHubProvider();
    const repo = await this.oauthProviderService.getGitHubRepo(
      userId,
      provider.id,
      repoFullName
    );

    if (!repo || typeof repo !== 'object' || !('full_name' in repo)) {
      throw new ApiError(404, `Repository ${repoFullName} not found or not accessible`, 'GITHUB_REPO_NOT_FOUND');
    }

    return repo as GitHubRepo;
  }

  /**
   * Best-effort lookup of a user's accessible repo by its numeric GitHub id.
   */
  async findUserRepoById(userId: string, repoId: number): Promise<GitHubRepo | null> {
    const repos = await this.listUserRepos(userId);
    return repos.find((repo) => repo.id === repoId) ?? null;
  }

  private async ensureGitHubProvider() {
    const provider = await this.getGitHubProvider();
    if (!provider) {
      throw new ApiError(
        400,
        'GitHub OAuth provider is not configured on this workspace',
        'GITHUB_PROVIDER_NOT_CONFIGURED'
      );
    }
    return provider;
  }
}
