import { BaseRepository } from '../base/BaseRepository.js';
import { OAuthProviderEntity } from '../../entities/oauthProvider.entity.js';
import { OAuthStateEntity } from '../../entities/oauthState.entity.js';
import { logger } from '@uaip/utils';

export class OAuthProviderRepository extends BaseRepository<OAuthProviderEntity> {
    constructor() {
        super(OAuthProviderEntity);
    }

    /**
     * Create a new OAuth provider
     */
    public async createOAuthProvider(data: {
        name: string;
        clientId: string;
        clientSecret: string;
        redirectUri: string;
        isEnabled?: boolean;
    }): Promise<OAuthProviderEntity> {
        const provider = this.repository.create({
            ...data,
            isEnabled: data.isEnabled ?? true
        });
        return await this.repository.save(provider);
    }

    /**
     * Get OAuth provider by name
     */
    public async getProviderByName(name: string): Promise<OAuthProviderEntity | null> {
        return await this.repository.findOne({ where: { name } });
    }

    /**
     * Get active OAuth providers
     */
    public async getActiveProviders(): Promise<OAuthProviderEntity[]> {
        return await this.repository.find({ where: { isEnabled: true } });
    }

    /**
     * Update OAuth provider
     */
    public async updateProvider(id: string, updates: Partial<OAuthProviderEntity>): Promise<OAuthProviderEntity | null> {
        await this.repository.update(id, {
            ...updates,
            updatedAt: new Date()
        });
        return await this.repository.findOne({ where: { id } });
    }
}

export class OAuthStateRepository extends BaseRepository<OAuthStateEntity> {
    constructor() {
        super(OAuthStateEntity);
    }

    /**
     * Create OAuth state for verification
     */
    public async createOAuthState(data: {
        state: string;
        provider: string;
        redirectUri: string;
        expiresAt: Date;
    }): Promise<OAuthStateEntity> {
        const stateEntity = this.repository.create(data);
        return await this.repository.save(stateEntity);
    }

    /**
     * Get OAuth state by state value
     */
    public async getOAuthState(state: string): Promise<OAuthStateEntity | null> {
        return await this.repository.findOne({ where: { state } });
    }

    /**
     * Verify and consume OAuth state
     */
    public async verifyAndConsumeState(state: string, providerId: string): Promise<OAuthStateEntity | null> {
        const stateEntity = await this.repository.findOne({
            where: { state, providerId }
        });

        if (!stateEntity || stateEntity.expiresAt < new Date()) {
            return null;
        }

        // Delete the state after use (one-time use)
        await this.repository.delete({ state });

        return stateEntity;
    }

    /**
     * Clean up expired OAuth states
     */
    public async cleanupExpiredStates(): Promise<void> {
        try {
            await this.repository
                .createQueryBuilder()
                .delete()
                .where('expiresAt < :now', { now: new Date() })
                .execute();
            logger.info('Expired OAuth states cleaned up');
        } catch (error) {
            logger.error('Failed to cleanup expired OAuth states', { error });
        }
    }
}
