import * as bcrypt from 'bcryptjs';
import { getControlDb } from '../drizzle/clients/index';
import { users } from '../../database/drizzle/schemas/control_schema';
import { SecurityLevel } from '@uaip/types';

interface SeedUser {
  email: string;
  firstName: string;
  lastName: string;
  department: string;
  role: string;
  passwordHash: string;
  securityClearance: SecurityLevel;
  isActive: boolean;
}

export class UserSeed {
  private db = getControlDb();

  async seed(): Promise<(typeof users.$inferSelect)[]> {
    const seedData = await this.getSeedData();

    for (const user of seedData) {
      await this.db.insert(users).values(user).onConflictDoNothing();
    }

    return await this.db.select().from(users);
  }

  private async getSeedData(): Promise<SeedUser[]> {
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
      {
        email: 'admin1@uaip.dev',
        firstName: 'System',
        lastName: 'Administrator',
        department: 'IT Operations',
        role: 'admin',
        passwordHash: adminHash,
        securityClearance: SecurityLevel.CRITICAL,
        isActive: true,
      },
      {
        email: 'manager1@uaip.dev',
        firstName: 'Operations',
        lastName: 'Manager',
        department: 'Operations',
        role: 'moderator',
        passwordHash: managerHash,
        securityClearance: SecurityLevel.HIGH,
        isActive: true,
      },
      {
        email: 'analyst1@uaip.dev',
        firstName: 'Data',
        lastName: 'Analyst',
        department: 'Analytics',
        role: 'user',
        passwordHash: analystHash,
        securityClearance: SecurityLevel.MEDIUM,
        isActive: true,
      },
      {
        email: 'developer1@uaip.dev',
        firstName: 'Software',
        lastName: 'Developer',
        department: 'Engineering',
        role: 'user',
        passwordHash: devHash,
        securityClearance: SecurityLevel.MEDIUM,
        isActive: true,
      },
      {
        email: 'codemaster@uaip.dev',
        firstName: 'Elite',
        lastName: 'CodeMaster',
        department: 'AI Research',
        role: 'user',
        passwordHash: viralHash,
        securityClearance: SecurityLevel.HIGH,
        isActive: true,
      },
      {
        email: 'creativeguru@uaip.dev',
        firstName: 'Creative',
        lastName: 'ArtistAI',
        department: 'Content Creation',
        role: 'user',
        passwordHash: createHash,
        securityClearance: SecurityLevel.MEDIUM,
        isActive: true,
      },
      {
        email: 'socialguru@uaip.dev',
        firstName: 'Social',
        lastName: 'Influencer',
        department: 'Community',
        role: 'user',
        passwordHash: socialHash,
        securityClearance: SecurityLevel.MEDIUM,
        isActive: true,
      },
      {
        email: 'guest1@uaip.dev',
        firstName: 'Guest',
        lastName: 'User',
        department: 'External',
        role: 'guest',
        passwordHash: guestHash,
        securityClearance: SecurityLevel.LOW,
        isActive: true,
      },
      {
        email: 'devgenius@uaip.dev',
        firstName: 'Dev',
        lastName: 'Genius',
        department: 'Engineering',
        role: 'user',
        passwordHash: geniusHash,
        securityClearance: SecurityLevel.HIGH,
        isActive: true,
      },
    ];
  }
}
