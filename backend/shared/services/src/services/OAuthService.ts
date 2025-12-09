import { Repository } from 'typeorm';
import { TypeOrmService } from '../typeormService.js';
import { OAuthProviderEntity } from '../entities/oauthProvider.entity.js';
import { OAuthStateEntity } from '../entities/oauthState.entity.js';
import { AgentOAuthConnectionEntity } from '../entities/agentOAuthConnection.entity.js';
import { OAuthProviderType, UserType, AgentCapability } from '@uaip/types';
import * as crypto from 'crypto';

export class OAuthService {
  private static instance: OAuthService;
  private typeormService: TypeOrmService;

  private oauthProviderRepository: Repository<OAuthProviderEntity> | null = null;
  private oauthStateRepository: Repository<OAuthStateEntity> | null = null;
  private agentOAuthConnectionRepository: Repository<AgentOAuthConnectionEntity> | null = null;

  private constructor() {
    this.typeormService = TypeOrmService.getInstance();
  }

  public static getInstance(): OAuthService {
    if (!OAuthService.instance) {
      OAuthService.instance = new OAuthService();
    }
    return OAuthService.instance;
  }

  public getOAuthProviderRepository(): Repository<OAuthProviderEntity> {
    if (!this.oauthProviderRepository) {
      this.oauthProviderRepository = this.typeormService
        .getDataSource()
        .getRepository(OAuthProviderEntity);
    }
    return this.oauthProviderRepository;
  }

  public getOAuthStateRepository(): Repository<OAuthStateEntity> {
    if (!this.oauthStateRepository) {
      this.oauthStateRepository = this.typeormService
        .getDataSource()
        .getRepository(OAuthStateEntity);
    }
    return this.oauthStateRepository;
  }

  public getAgentOAuthConnectionRepository(): Repository<AgentOAuthConnectionEntity> {
    if (!this.agentOAuthConnectionRepository) {
      this.agentOAuthConnectionRepository = this.typeormService
        .getDataSource()
        .getRepository(AgentOAuthConnectionEntity);
    }
    return this.agentOAuthConnectionRepository;
  }

  // OAuth Provider operations
  public async createOAuthProvider(data: {
    name: string;
    type: OAuthProviderType;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scope: string[];
    authorizationUrl: string;
    tokenUrl: string;
    userInfoUrl?: string;
    revokeUrl?: string;
    isEnabled?: boolean;
  }): Promise<OAuthProviderEntity> {
    const providerRepo = this.getOAuthProviderRepository();
    const provider = providerRepo.create({
      ...data,
      isEnabled: data.isEnabled ?? true,
    });

    return await providerRepo.save(provider);
  }

  public async findOAuthProvider(id: string): Promise<OAuthProviderEntity | null> {
    return await this.getOAuthProviderRepository().findOne({
      where: { id },
    });
  }

  public async findOAuthProviderByType(
    type: OAuthProviderType
  ): Promise<OAuthProviderEntity | null> {
    return await this.getOAuthProviderRepository().findOne({
      where: { type, isEnabled: true },
    });
  }

  public async findEnabledOAuthProviders(): Promise<OAuthProviderEntity[]> {
    return await this.getOAuthProviderRepository().find({
      where: { isEnabled: true },
    });
  }

  // OAuth State operations
  public async createOAuthState(data: {
    providerId: string;
    redirectUri: string;
    userType?: UserType;
    agentCapabilities?: AgentCapability[];
    codeVerifier?: string;
    nonce?: string;
  }): Promise<OAuthStateEntity> {
    const state = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 600000); // 10 minutes

    const stateRepo = this.getOAuthStateRepository();
    const stateEntity = stateRepo.create({
      state,
      providerId: data.providerId,
      redirectUri: data.redirectUri,
      userType: data.userType || UserType.HUMAN,
      agentCapabilities: data.agentCapabilities,
      codeVerifier: data.codeVerifier,
      nonce: data.nonce,
      expiresAt,
    });

    return await stateRepo.save(stateEntity);
  }

  public async findOAuthState(state: string): Promise<OAuthStateEntity | null> {
    return await this.getOAuthStateRepository().findOne({
      where: { state },
    });
  }

  public async verifyAndConsumeOAuthState(state: string): Promise<OAuthStateEntity | null> {
    const stateEntity = await this.findOAuthState(state);

    if (!stateEntity || stateEntity.expiresAt < new Date()) {
      return null;
    }

    // Delete the state after use (one-time use)
    await this.getOAuthStateRepository().delete({ state });

    return stateEntity;
  }

  public async cleanupExpiredStates(): Promise<void> {
    await this.getOAuthStateRepository()
      .createQueryBuilder()
      .delete()
      .where('expiresAt < :now', { now: new Date() })
      .execute();
  }

  // Agent OAuth Connection operations
  public async createAgentOAuthConnection(data: {
    agentId: string;
    providerId: string;
    providerType: OAuthProviderType;
    capabilities: AgentCapability[];
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
    scope: string[];
  }): Promise<AgentOAuthConnectionEntity> {
    const connectionRepo = this.getAgentOAuthConnectionRepository();
    const connection = connectionRepo.create({
      agentId: data.agentId,
      providerId: data.providerId,
      providerType: data.providerType,
      capabilities: data.capabilities,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      tokenExpiresAt: data.tokenExpiresAt,
      scope: data.scope,
      isActive: true,
      lastUsedAt: new Date(),
    });

    return await connectionRepo.save(connection);
  }

  public async findAgentOAuthConnections(agentId: string): Promise<AgentOAuthConnectionEntity[]> {
    return await this.getAgentOAuthConnectionRepository().find({
      where: { agentId, isActive: true },
    });
  }

  public async findAgentOAuthConnection(
    agentId: string,
    providerId: string
  ): Promise<AgentOAuthConnectionEntity | null> {
    return await this.getAgentOAuthConnectionRepository().findOne({
      where: { agentId, providerId, isActive: true },
    });
  }

  public async updateOAuthConnectionToken(
    connectionId: string,
    data: {
      accessToken: string;
      refreshToken?: string;
      tokenExpiresAt?: Date;
    }
  ): Promise<boolean> {
    const result = await this.getAgentOAuthConnectionRepository().update(connectionId, {
      ...data,
      lastUsedAt: new Date(),
    });
    return result.affected !== 0;
  }

  public async deactivateOAuthConnection(connectionId: string): Promise<boolean> {
    const result = await this.getAgentOAuthConnectionRepository().update(connectionId, {
      isActive: false,
    });
    return result.affected !== 0;
  }

  public async isOAuthConnectionValid(connectionId: string): Promise<boolean> {
    const connection = await this.getAgentOAuthConnectionRepository().findOne({
      where: { id: connectionId, isActive: true },
    });

    if (!connection) {
      return false;
    }

    // Check if token is expired
    if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date()) {
      return false;
    }

    return true;
  }
}
