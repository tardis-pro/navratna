import { PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Base entity class that provides common fields for all entities
 * Implements the BaseEntity pattern with string IDs
 */
export abstract class BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
} 