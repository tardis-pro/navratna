import { drizzleService } from '@uaip/shared-services/drizzleService';
import { shortLinks } from '@uaip/shared-services/drizzle/intelligence';
import { eq, and, ilike, or } from 'drizzle-orm';
import { logger } from '@uaip/utils';
import * as bcrypt from 'bcryptjs';
import QRCode from 'qrcode';

export { LinkType, LinkStatus } from '@uaip/shared-services/drizzle/intelligence';
export type { ShortLink as ShortLinkEntity } from '@uaip/shared-services/drizzle/intelligence';

import type { ShortLink } from '@uaip/shared-services/drizzle/intelligence';

type LinkType = 'artifact' | 'project_file' | 'document' | 'external';
type LinkStatus = 'active' | 'expired' | 'disabled' | 'deleted';

export interface LinkAnalytics {
  totalClicks?: number;
  uniqueClicks?: number;
  lastClickedAt?: Date;
  referrers?: Record<string, number>;
  countries?: Record<string, number>;
  devices?: Record<string, number>;
  browsers?: Record<string, number>;
  clickHistory?: Array<{
    timestamp: Date;
    userAgent?: string;
    ip?: string;
    referer?: string;
    userId?: string;
  }>;
}

interface GetUserLinksOptions {
  page?: number;
  limit?: number;
  type?: string;
  search?: string;
}

interface LinkUpdateData {
  title?: string;
  description?: string;
  originalUrl?: string;
  tags?: string[];
  expiresAt?: Date;
  status?: LinkStatus;
}

interface LinkAnalyticsResponse {
  id: string;
  shortCode: string;
  totalClicks: number;
  analytics: LinkAnalytics;
  createdAt: Date;
  lastClickAt: Date | null;
  status: string;
}

interface ClickData {
  userId?: string;
  userAgent?: string;
  ip?: string;
  referer?: string;
}

const BCRYPT_ROUNDS = 12;

export class ShortLinkService {
  private get db() {
    return drizzleService.intelligence;
  }

  async createShortLink(
    originalUrl: string,
    createdById: string,
    options: {
      title?: string;
      description?: string;
      type?: LinkType;
      customCode?: string;
      expiresAt?: Date;
      password?: string;
      maxClicks?: number;
      tags?: string[];
      artifactId?: string;
      projectFileId?: string;
      generateQR?: boolean;
    } = {}
  ): Promise<ShortLink> {
    const shortCode = options.customCode || (await this.generateUniqueCode());

    if (options.customCode) {
      const existing = await this.db
        .select({ id: shortLinks.id })
        .from(shortLinks)
        .where(eq(shortLinks.shortCode, shortCode))
        .limit(1);
      if (existing.length > 0) throw new Error('Custom short code already exists');
    }

    const hashedPassword = options.password
      ? await bcrypt.hash(options.password, BCRYPT_ROUNDS)
      : undefined;

    const [created] = await this.db
      .insert(shortLinks)
      .values({
        shortCode,
        originalUrl,
        title: options.title,
        description: options.description,
        type: options.type ?? 'external',
        status: 'active',
        createdById,
        clickCount: 0,
        expiresAt: options.expiresAt,
        password: hashedPassword,
        tags: options.tags ?? [],
        artifactId: options.artifactId,
        projectFileId: options.projectFileId ? options.projectFileId as unknown as string : undefined,
        accessRestrictions: { maxClicks: options.maxClicks },
        analytics: { totalClicks: 0, uniqueClicks: 0 },
        trackClicks: true,
        isPublic: true,
      })
      .returning();

    if (options.generateQR) {
      await this.generateQRCode(created.id);
    }

    logger.info(`Short link created: ${shortCode} -> ${originalUrl}`);
    return created;
  }

  async getShortLink(shortCode: string): Promise<ShortLink | null> {
    const [link] = await this.db
      .select()
      .from(shortLinks)
      .where(and(eq(shortLinks.shortCode, shortCode), eq(shortLinks.status, 'active')))
      .limit(1);
    return link ?? null;
  }

  async resolveShortLink(
    shortCode: string,
    options: {
      password?: string;
      userId?: string;
      userAgent?: string;
      ip?: string;
      referer?: string;
    } = {}
  ): Promise<{ url: string; requiresPassword?: boolean }> {
    const link = await this.getShortLink(shortCode);
    if (!link) throw new Error('Short link not found');

    if (link.expiresAt && new Date() > link.expiresAt) {
      await this.db
        .update(shortLinks)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(shortLinks.id, link.id));
      throw new Error('Short link has expired');
    }

    if (link.password) {
      if (!options.password) return { url: '', requiresPassword: true };
      const match = await bcrypt.compare(options.password, link.password);
      if (!match) throw new Error('Invalid password');
    }

    await this.recordClick(link.id, options);
    return { url: link.originalUrl };
  }

  async getUserLinks(userId: string, options: GetUserLinksOptions = {}): Promise<ShortLink[]> {
    const { page = 1, limit = 20, type, search } = options;
    const offset = (page - 1) * limit;

    const conditions = [eq(shortLinks.createdById, userId)];
    if (type) conditions.push(eq(shortLinks.type, type));
    if (search) {
      conditions.push(
        or(
          ilike(shortLinks.title as Parameters<typeof ilike>[0], `%${search}%`),
          ilike(shortLinks.originalUrl, `%${search}%`)
        ) as Parameters<typeof and>[0]
      );
    }

    return this.db
      .select()
      .from(shortLinks)
      .where(and(...conditions))
      .orderBy(shortLinks.createdAt)
      .limit(limit)
      .offset(offset);
  }

  async getLinkById(linkId: string, userId: string): Promise<ShortLink | null> {
    const [link] = await this.db
      .select()
      .from(shortLinks)
      .where(and(eq(shortLinks.id, linkId), eq(shortLinks.createdById, userId)))
      .limit(1);
    return link ?? null;
  }

  async updateLink(linkId: string, userId: string, updates: LinkUpdateData): Promise<ShortLink> {
    const link = await this.getLinkById(linkId, userId);
    if (!link) throw new Error('Link not found');

    const [updated] = await this.db
      .update(shortLinks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(shortLinks.id, linkId))
      .returning();

    return updated;
  }

  async deleteLink(linkId: string, userId: string): Promise<void> {
    const link = await this.getLinkById(linkId, userId);
    if (!link) throw new Error('Link not found');

    await this.db
      .update(shortLinks)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(eq(shortLinks.id, linkId));

    logger.info(`Short link deleted: ${linkId}`);
  }

  async generateQRCode(linkId: string, userId?: string): Promise<string> {
    const link = userId
      ? await this.getLinkById(linkId, userId)
      : await this.db
          .select()
          .from(shortLinks)
          .where(eq(shortLinks.id, linkId))
          .limit(1)
          .then(([r]) => r ?? null);

    if (!link) throw new Error('Link not found');

    const shortUrl = `${process.env.SHORT_LINK_DOMAIN || 'https://s.uaip.dev'}/${link.shortCode}`;
    const qrCodeDataURL = await QRCode.toDataURL(shortUrl, {
      width: 256,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    });

    await this.db
      .update(shortLinks)
      .set({ qrCode: qrCodeDataURL, updatedAt: new Date() })
      .where(eq(shortLinks.id, linkId));

    return qrCodeDataURL;
  }

  async getLinkAnalytics(linkId: string, userId: string): Promise<LinkAnalyticsResponse> {
    const link = await this.getLinkById(linkId, userId);
    if (!link) throw new Error('Link not found');

    return {
      id: link.id,
      shortCode: link.shortCode,
      totalClicks: link.clickCount,
      analytics: (link.analytics as LinkAnalytics) ?? {},
      createdAt: link.createdAt,
      lastClickAt: link.lastClickedAt ?? null,
      status: link.status,
    };
  }

  private async generateUniqueCode(length = 6): Promise<string> {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

    for (let attempt = 0; attempt < 10; attempt++) {
      const code = Array.from(
        { length: length + Math.floor(attempt / 5) },
        () => chars[Math.floor(Math.random() * chars.length)]
      ).join('');

      const existing = await this.db
        .select({ id: shortLinks.id })
        .from(shortLinks)
        .where(eq(shortLinks.shortCode, code))
        .limit(1);

      if (existing.length === 0) return code;
    }

    throw new Error('Failed to generate unique short code');
  }

  private async recordClick(linkId: string, clickData: ClickData): Promise<void> {
    try {
      const [link] = await this.db
        .select()
        .from(shortLinks)
        .where(eq(shortLinks.id, linkId))
        .limit(1);

      if (!link) return;

      const existing = (link.analytics as LinkAnalytics) ?? {};
      const updatedAnalytics: LinkAnalytics = {
        ...existing,
        totalClicks: (existing.totalClicks ?? 0) + 1,
        lastClickedAt: new Date(),
        clickHistory: [
          ...(existing.clickHistory ?? []).slice(-99),
          {
            timestamp: new Date(),
            userAgent: clickData.userAgent,
            ip: clickData.ip,
            referer: clickData.referer,
            userId: clickData.userId,
          },
        ],
      };

      await this.db
        .update(shortLinks)
        .set({
          clickCount: link.clickCount + 1,
          lastClickedAt: new Date(),
          analytics: updatedAnalytics,
          updatedAt: new Date(),
        })
        .where(eq(shortLinks.id, linkId));
    } catch (error) {
      logger.error('Error recording click:', error);
    }
  }
}
