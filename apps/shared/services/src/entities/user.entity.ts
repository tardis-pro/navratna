import { SecurityLevel } from '@uaip/types';

export interface UserEntity {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  role: string;
  passwordHash?: string;
  isActive: boolean;
  isOAuthUser?: boolean;
  securityClearance?: SecurityLevel;
  createdAt: Date;
  updatedAt: Date;
}
