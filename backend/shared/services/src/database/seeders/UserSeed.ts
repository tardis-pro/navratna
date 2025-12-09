import { DataSource, DeepPartial } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { BaseSeed } from './BaseSeed.js';
import { UserEntity } from '../../entities/user.entity.js';
import { SecurityLevel } from '@uaip/types';

/**
 * User seeder with roles matching frontend expectations
 */
export class UserSeed extends BaseSeed<UserEntity> {
  constructor(dataSource: DataSource) {
    super(dataSource, dataSource.getRepository(UserEntity), 'Users');
  }

  getUniqueField(): keyof UserEntity {
    return 'email';
  }

  async getSeedData(): Promise<DeepPartial<UserEntity>[]> {
    // Hash passwords to match Login.tsx demo credentials
    const adminHash = await bcrypt.hash('admin123!', 12);
    const managerHash = await bcrypt.hash('manager123!', 12);
    const analystHash = await bcrypt.hash('analyst123!', 12);
    const devHash = await bcrypt.hash('dev123!', 10);
    const guestHash = await bcrypt.hash('guest123!', 10);
    const viralHash = await bcrypt.hash('viral123!', 10);
    const createHash = await bcrypt.hash('create123!', 10);
    const socialHash = await bcrypt.hash('social123!', 10);
    const geniusHash = await bcrypt.hash('genius123!', 10);

    return [
      // System Accounts (Red category in Login.tsx)
      {
        email: 'admin1@uaip.dev',
        firstName: 'System',
        lastName: 'Administrator',
        department: 'IT Operations',
        role: 'admin', // Maps to RoleBasedDesktopConfig admin level
        passwordHash: adminHash,
        securityClearance: SecurityLevel.CRITICAL,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date(),
      },
      {
        email: 'manager1@uaip.dev',
        firstName: 'Operations',
        lastName: 'Manager',
        department: 'Operations',
        role: 'moderator', // Maps to RoleBasedDesktopConfig moderator level
        passwordHash: managerHash,
        securityClearance: SecurityLevel.HIGH,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date(),
      },

      // Professional Roles (Blue category in Login.tsx)
      {
        email: 'analyst1@uaip.dev',
        firstName: 'Data',
        lastName: 'Analyst',
        department: 'Analytics',
        role: 'user', // Maps to RoleBasedDesktopConfig user level
        passwordHash: analystHash,
        securityClearance: SecurityLevel.MEDIUM,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date(),
      },
      {
        email: 'developer1@uaip.dev',
        firstName: 'Software',
        lastName: 'Developer',
        department: 'Engineering',
        role: 'user', // Maps to RoleBasedDesktopConfig user level
        passwordHash: devHash,
        securityClearance: SecurityLevel.MEDIUM,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date(),
      },

      // Specialized Users (Purple category in Login.tsx)
      {
        email: 'codemaster@uaip.dev',
        firstName: 'Elite',
        lastName: 'CodeMaster',
        department: 'AI Research',
        role: 'user', // Maps to RoleBasedDesktopConfig user level
        passwordHash: viralHash,
        securityClearance: SecurityLevel.HIGH,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date(),
      },
      {
        email: 'creativeguru@uaip.dev',
        firstName: 'Creative',
        lastName: 'ArtistAI',
        department: 'Content Creation',
        role: 'user', // Maps to RoleBasedDesktopConfig user level
        passwordHash: createHash,
        securityClearance: SecurityLevel.MEDIUM,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date(),
      },
      {
        email: 'socialguru@uaip.dev',
        firstName: 'Social',
        lastName: 'Influencer',
        department: 'Community',
        role: 'user', // Maps to RoleBasedDesktopConfig user level
        passwordHash: socialHash,
        securityClearance: SecurityLevel.MEDIUM,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date(),
      },

      // Guest Access (Green category in Login.tsx)
      {
        email: 'guest1@uaip.dev',
        firstName: 'Guest',
        lastName: 'User',
        department: 'External',
        role: 'guest', // Maps to RoleBasedDesktopConfig guest level
        passwordHash: guestHash,
        securityClearance: SecurityLevel.LOW,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date(),
      },
      {
        email: 'devgenius@uaip.dev',
        firstName: 'Dev',
        lastName: 'Genius',
        department: 'Engineering',
        role: 'user', // Maps to RoleBasedDesktopConfig user level
        passwordHash: geniusHash,
        securityClearance: SecurityLevel.HIGH,
        isActive: true,
        failedLoginAttempts: 0,
        passwordChangedAt: new Date(),
        lastLoginAt: new Date(),
      },
    ];
  }
}
