import { MoreThan, LessThan } from 'typeorm';
import { BaseRepository } from '../base/BaseRepository.js';
import { UserPresenceEntity, PresenceStatus } from '../../entities/user-presence.entity.js';

export class UserPresenceRepository extends BaseRepository<UserPresenceEntity> {
  constructor() {
    super(UserPresenceEntity);
  }

  async findByUserId(userId: string): Promise<UserPresenceEntity | null> {
    return await this.repository.findOne({
      where: { userId },
      relations: ['user']
    });
  }

  async updatePresence(
    userId: string, 
    status: PresenceStatus, 
    customStatus?: string,
    deviceId?: string
  ): Promise<UserPresenceEntity> {
    let presence = await this.findByUserId(userId);

    if (presence) {
      presence.status = status;
      presence.customStatus = customStatus;
      presence.lastSeenAt = new Date();
      
      // Handle device tracking
      if (deviceId) {
        const devices = presence.activeDevices || [];
        if (!devices.includes(deviceId)) {
          devices.push(deviceId);
          presence.activeDevices = devices;
        }
      }

      // Set status expiration for temporary statuses
      if (status === PresenceStatus.AWAY || status === PresenceStatus.BUSY) {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1); // Auto-reset after 1 hour
        presence.statusExpiresAt = expiresAt;
      } else {
        presence.statusExpiresAt = null;
      }
    } else {
      presence = this.repository.create({
        userId,
        status,
        customStatus,
        lastSeenAt: new Date(),
        activeDevices: deviceId ? [deviceId] : []
      });
    }

    return await this.repository.save(presence);
  }

  async setOffline(userId: string, deviceId?: string): Promise<UserPresenceEntity | null> {
    const presence = await this.findByUserId(userId);
    if (!presence) return null;

    if (deviceId) {
      // Remove specific device
      const devices = presence.activeDevices || [];
      presence.activeDevices = devices.filter(id => id !== deviceId);
      
      // If no active devices remain, set offline
      if (presence.activeDevices.length === 0) {
        presence.status = PresenceStatus.OFFLINE;
      }
    } else {
      // Set completely offline
      presence.status = PresenceStatus.OFFLINE;
      presence.activeDevices = [];
    }

    presence.lastSeenAt = new Date();
    return await this.repository.save(presence);
  }

  async findOnlineUsers(limit: number = 100): Promise<UserPresenceEntity[]> {
    return await this.repository.find({
      where: [
        { status: PresenceStatus.ONLINE },
        { status: PresenceStatus.AWAY },
        { status: PresenceStatus.BUSY }
      ],
      relations: ['user'],
      order: { lastSeenAt: 'DESC' },
      take: limit
    });
  }

  async findUsersByStatus(status: PresenceStatus, limit: number = 100): Promise<UserPresenceEntity[]> {
    return await this.repository.find({
      where: { status },
      relations: ['user'],
      order: { lastSeenAt: 'DESC' },
      take: limit
    });
  }

  async findRecentlyActive(minutes: number = 30, limit: number = 100): Promise<UserPresenceEntity[]> {
    const since = new Date();
    since.setMinutes(since.getMinutes() - minutes);

    return await this.repository.find({
      where: {
        lastSeenAt: MoreThan(since)
      },
      relations: ['user'],
      order: { lastSeenAt: 'DESC' },
      take: limit
    });
  }

  async cleanupExpiredStatuses(): Promise<number> {
    const now = new Date();
    const result = await this.repository.update(
      {
        statusExpiresAt: LessThan(now)
      },
      {
        status: PresenceStatus.ONLINE,
        statusExpiresAt: null,
        customStatus: null
      }
    );

    return result.affected || 0;
  }

  async setInvisible(userId: string): Promise<UserPresenceEntity> {
    return await this.updatePresence(userId, PresenceStatus.INVISIBLE);
  }

  async setCustomStatus(userId: string, customStatus: string, duration?: number): Promise<UserPresenceEntity | null> {
    const presence = await this.findByUserId(userId);
    if (!presence) return null;

    presence.customStatus = customStatus;
    presence.lastSeenAt = new Date();

    if (duration) {
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + duration);
      presence.statusExpiresAt = expiresAt;
    }

    return await this.repository.save(presence);
  }

  async clearCustomStatus(userId: string): Promise<UserPresenceEntity | null> {
    const presence = await this.findByUserId(userId);
    if (!presence) return null;

    presence.customStatus = null;
    presence.statusExpiresAt = null;
    return await this.repository.save(presence);
  }

  async getUserPresenceStats(): Promise<{
    online: number;
    away: number;
    busy: number;
    offline: number;
    invisible: number;
    total: number;
  }> {
    const [online, away, busy, offline, invisible, total] = await Promise.all([
      this.repository.count({ where: { status: PresenceStatus.ONLINE } }),
      this.repository.count({ where: { status: PresenceStatus.AWAY } }),
      this.repository.count({ where: { status: PresenceStatus.BUSY } }),
      this.repository.count({ where: { status: PresenceStatus.OFFLINE } }),
      this.repository.count({ where: { status: PresenceStatus.INVISIBLE } }),
      this.repository.count()
    ]);

    return { online, away, busy, offline, invisible, total };
  }

  async findUsersWithCustomStatus(limit: number = 50): Promise<UserPresenceEntity[]> {
    return await this.repository.find({
      where: {
        customStatus: MoreThan('')
      },
      relations: ['user'],
      order: { lastSeenAt: 'DESC' },
      take: limit
    });
  }

  async heartbeat(userId: string, deviceId?: string): Promise<void> {
    const presence = await this.findByUserId(userId);
    if (presence) {
      presence.lastSeenAt = new Date();
      
      if (deviceId) {
        const devices = presence.activeDevices || [];
        if (!devices.includes(deviceId)) {
          devices.push(deviceId);
          presence.activeDevices = devices;
        }
      }

      await this.repository.save(presence);
    }
  }

  async cleanupInactiveUsers(inactiveHours: number = 24): Promise<number> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - inactiveHours);

    const result = await this.repository.update(
      {
        lastSeenAt: LessThan(cutoff),
        status: MoreThan(PresenceStatus.OFFLINE)
      },
      {
        status: PresenceStatus.OFFLINE,
        activeDevices: []
      }
    );

    return result.affected || 0;
  }
}