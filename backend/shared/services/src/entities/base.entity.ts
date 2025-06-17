import { PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Base entity class that provides common fields for all entities
 * Implements the BaseEntity pattern with 64-bit auto-increment IDs
 */
export abstract class BaseEntity {
  @Index({ unique: true })
  id: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
} 