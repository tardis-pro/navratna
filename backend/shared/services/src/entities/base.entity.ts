import { PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Base entity class that provides common fields for all entities
 * Implements the BaseEntity pattern from the migration plan
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
} 