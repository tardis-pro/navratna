import { TypeOrmService } from '@uaip/shared-services';
import { ShortLinkEntity, LinkType, LinkStatus } from '@uaip/shared-services';
import { logger } from '@uaip/utils';
import * as crypto from 'crypto';
import QRCode from 'qrcode';
import { Repository } from 'typeorm';


export class ShortLinkService {
  private typeormService: TypeOrmService;
  private shortLinkRepository: Repository<ShortLinkEntity>;

  constructor() {
    this.typeormService = TypeOrmService.getInstance();
    this.shortLinkRepository = this.typeormService.getDataSource().getRepository(ShortLinkEntity);
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
  ): Promise<ShortLinkEntity> {
    try {
      // Generate short code
      const shortCode = options.customCode || await this.generateUniqueCode();

      // Validate custom code availability
      if (options.customCode) {
        const existing = await this.shortLinkRepository.findOne({ where: { shortCode } });
        if (existing) {
          throw new Error('Custom short code already exists');
        }
      }

      // Hash password if provided
      let hashedPassword: string | undefined;
      if (options.password) {
        hashedPassword = crypto.createHash('sha256').update(options.password).digest('hex');
      }

      // Create short link
      const shortLinkData = {
        shortCode,
        originalUrl,
        title: options.title,
        description: options.description,
        type: options.type || 'external',
        status: 'active',
        createdById,
        clickCount: 0,
        expiresAt: options.expiresAt,
        password: hashedPassword,
        tags: options.tags || [],
        artifactId: options.artifactId,
        projectFileId: options.projectFileId,
        accessRestrictions: {
          maxClicks: options.maxClicks
        },
        analytics: {
          totalClicks: 0,
          uniqueClicks: 0
        }
      };

      const shortLink = this.shortLinkRepository.create({
        shortCode,
        originalUrl,
        title: options.title,
        description: options.description,
        type: (options.type as LinkType) || LinkType.EXTERNAL,
        status: LinkStatus.ACTIVE,
        createdById,
        clickCount: 0,
        expiresAt: options.expiresAt,
        password: hashedPassword,
        tags: options.tags || [],
        artifactId: options.artifactId,
        projectFileId: options.projectFileId,
        accessRestrictions: {
          maxClicks: options.maxClicks
        },
        analytics: {
          totalClicks: 0,
          uniqueClicks: 0
        },
        trackClicks: true,
        isPublic: true
      });

      const savedLink = await this.shortLinkRepository.save(shortLink);

      // Generate QR code if requested
      if (options.generateQR) {
        await this.generateQRCode(savedLink.id);
      }

      logger.info(`Short link created: ${shortCode} -> ${originalUrl}`);
      return savedLink;
    } catch (error) {
      logger.error('Error creating short link:', error);
      throw error;
    }
  }

  async getShortLink(shortCode: string): Promise<ShortLinkEntity | null> {
    try {
      return await this.shortLinkRepository.findOne({
        where: { shortCode, status: LinkStatus.ACTIVE },
        relations: ['createdBy', 'artifact']
      });
    } catch (error) {
      logger.error('Error getting short link:', error);
      throw new Error('Failed to get short link');
    }
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
    try {
      const shortLink = await this.getShortLink(shortCode);
      
      if (!shortLink) {
        throw new Error('Short link not found');
      }

      // Check if expired
      if (shortLink.expiresAt && new Date() > shortLink.expiresAt) {
        await this.shortLinkRepository.update(shortLink.id, { status: LinkStatus.EXPIRED });
        throw new Error('Short link has expired');
      }

      // Check password protection
      if (shortLink.password) {
        if (!options.password) {
          return { url: '', requiresPassword: true };
        }
        const hashedPassword = crypto.createHash('sha256').update(options.password).digest('hex');
        if (hashedPassword !== shortLink.password) {
          throw new Error('Invalid password');
        }
      }

      // Record analytics
      await this.recordClick(shortLink.id, options);

      return { url: shortLink.originalUrl };
    } catch (error) {
      logger.error('Error resolving short link:', error);
      throw error;
    }
  }

  async getUserLinks(userId: string, options: any = {}): Promise<ShortLinkEntity[]> {
    try {
      const { page = 1, limit = 20, type, search } = options;
      const skip = (page - 1) * limit;

      const queryBuilder = this.shortLinkRepository.createQueryBuilder('link')
        .where('link.createdById = :userId', { userId })
        .orderBy('link.createdAt', 'DESC')
        .skip(skip)
        .take(limit);

      if (type) {
        queryBuilder.andWhere('link.type = :type', { type });
      }

      if (search) {
        queryBuilder.andWhere(
          '(link.title ILIKE :search OR link.description ILIKE :search OR link.originalUrl ILIKE :search)',
          { search: `%${search}%` }
        );
      }

      return await queryBuilder.getMany();
    } catch (error) {
      logger.error('Error getting user links:', error);
      throw new Error('Failed to get user links');
    }
  }

  async getLinkById(linkId: string, userId: string): Promise<ShortLinkEntity | null> {
    try {
      return await this.shortLinkRepository.findOne({
        where: { id: linkId, createdById: userId }
      });
    } catch (error) {
      logger.error('Error getting link by ID:', error);
      throw new Error('Failed to get link');
    }
  }

  async updateLink(linkId: string, userId: string, updates: any): Promise<ShortLinkEntity> {
    try {
      const link = await this.getLinkById(linkId, userId);
      if (!link) {
        throw new Error('Link not found');
      }

      await this.shortLinkRepository.update(linkId, {
        ...updates,
        updatedAt: new Date()
      });

      const updatedLink = await this.shortLinkRepository.findOne({ where: { id: linkId } });
      if (!updatedLink) {
        throw new Error('Failed to retrieve updated link');
      }

      return updatedLink;
    } catch (error) {
      logger.error('Error updating link:', error);
      throw error;
    }
  }

  async deleteLink(linkId: string, userId: string): Promise<void> {
    try {
      const link = await this.getLinkById(linkId, userId);
      if (!link) {
        throw new Error('Link not found');
      }

      await this.shortLinkRepository.update(linkId, {
        status: LinkStatus.DELETED,
        updatedAt: new Date()
      });

      logger.info(`Short link deleted: ${linkId}`);
    } catch (error) {
      logger.error('Error deleting link:', error);
      throw error;
    }
  }

  async generateQRCode(linkId: string, userId?: string): Promise<string> {
    try {
      let link: ShortLinkEntity | null;
      
      if (userId) {
        link = await this.getLinkById(linkId, userId);
      } else {
        link = await this.shortLinkRepository.findOne({ where: { id: linkId } });
      }

      if (!link) {
        throw new Error('Link not found');
      }

      const shortUrl = `${process.env.SHORT_LINK_DOMAIN || 'https://s.uaip.dev'}/${link.shortCode}`;
      const qrCodeDataURL = await QRCode.toDataURL(shortUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // Save QR code to link
      await this.shortLinkRepository.update(linkId, {
        qrCode: qrCodeDataURL,
        updatedAt: new Date()
      });

      return qrCodeDataURL;
    } catch (error) {
      logger.error('Error generating QR code:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  async getLinkAnalytics(linkId: string, userId: string): Promise<any> {
    try {
      const link = await this.getLinkById(linkId, userId);
      if (!link) {
        throw new Error('Link not found');
      }

      return {
        id: link.id,
        shortCode: link.shortCode,
        totalClicks: link.clickCount,
        analytics: link.analytics,
        createdAt: link.createdAt,
        lastClickAt: link.lastClickedAt,
        status: link.status
      };
    } catch (error) {
      logger.error('Error getting link analytics:', error);
      throw new Error('Failed to get analytics');
    }
  }

  private async generateUniqueCode(length: number = 6): Promise<string> {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      let code = '';
      for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      // Check if code already exists
      const existing = await this.shortLinkRepository.findOne({ where: { shortCode: code } });
      if (!existing) {
        return code;
      }

      attempts++;
      if (attempts > 5) {
        length++;
      }
    }

    throw new Error('Failed to generate unique short code');
  }

  private async recordClick(linkId: string, clickData: any): Promise<void> {
    try {
      const link = await this.shortLinkRepository.findOne({ where: { id: linkId } });
      if (!link) {
        return;
      }

      const updatedAnalytics = {
        ...link.analytics,
        totalClicks: (link.analytics?.totalClicks || 0) + 1,
        lastClick: new Date(),
        clickHistory: [
          ...(link.analytics?.clickHistory || []).slice(-99),
          {
            timestamp: new Date(),
            userAgent: clickData.userAgent,
            ip: clickData.ip,
            referer: clickData.referer,
            userId: clickData.userId
          }
        ]
      };

      await this.shortLinkRepository.update(linkId, {
        clickCount: link.clickCount + 1,
        lastClickedAt: new Date(),
        analytics: updatedAnalytics,
        updatedAt: new Date()
      });

      logger.debug(`Click recorded for link ${linkId}`);
    } catch (error) {
      logger.error('Error recording click:', error);
      // Don't throw error for analytics - shouldn't block URL resolution
    }
  }
}