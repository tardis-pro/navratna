import { DataSource, Repository, DeepPartial } from 'typeorm';

/**
 * Base class for all seeders with common functionality
 */
export abstract class BaseSeed<T> {
  protected dataSource: DataSource;
  protected repository: Repository<T>;
  protected entityName: string;

  constructor(dataSource: DataSource, repository: Repository<T>, entityName: string) {
    this.dataSource = dataSource;
    this.repository = repository;
    this.entityName = entityName;
  }

  /**
   * Abstract method to be implemented by each seeder
   */
  abstract getSeedData(): Promise<DeepPartial<T>[]>;

  /**
   * Abstract method to get unique identifier field name
   */
  abstract getUniqueField(): keyof T;

  /**
   * Seed entities using simple upsert logic
   */
  async seed(): Promise<T[]> {
    console.log(`🌱 Seeding ${this.entityName}...`);

    try {
      const seedData = await this.getSeedData();
      const uniqueField = this.getUniqueField();

      if (seedData.length === 0) {
        console.log(`   ℹ️ No seed data for ${this.entityName}`);
        return [];
      }

      // First try TypeORM's upsert functionality
      try {
        await this.repository.upsert(seedData as any[], {
          conflictPaths: [uniqueField as string],
          skipUpdateIfNoValuesChanged: true
        });
        console.log(`   ✅ ${this.entityName} seeding completed: ${seedData.length} entities processed (upsert)`);
      } catch (upsertError) {
        console.warn(`   ⚠️ Upsert failed for ${this.entityName}, falling back to manual upsert:`, upsertError.message);
        
        // Fallback: Manual upsert logic
        for (const item of seedData) {
          try {
            const existingEntity = await this.findByField(uniqueField, (item as any)[uniqueField]);
            
            if (existingEntity) {
              // Update existing entity
              await this.repository.update(
                { [uniqueField]: (item as any)[uniqueField] } as any,
                item as any
              );
            } else {
              // Create new entity
              await this.repository.save(this.repository.create(item as any));
            }
          } catch (itemError) {
            // Skip individual items that fail, but log the error
            console.warn(`   ⚠️ Failed to process ${this.entityName} item:`, itemError.message);
            continue;
          }
        }
        console.log(`   ✅ ${this.entityName} seeding completed: ${seedData.length} entities processed (manual fallback)`);
      }

      // Return all entities of this type (simple approach)
      const allEntities = await this.repository.find();
      return allEntities;
    } catch (error) {
      console.error(`   ❌ ${this.entityName} seeding failed:`, error);
      // Don't throw the error - allow other seeders to continue
      console.warn(`   ⚠️ Continuing without ${this.entityName} seeding...`);
      
      // Return existing entities if any
      try {
        return await this.repository.find();
      } catch (findError) {
        console.warn(`   ⚠️ Could not retrieve existing ${this.entityName}:`, findError.message);
        return [];
      }
    }
  }

  /**
   * Helper method to find entities by field value
   */
  protected async findByField(field: keyof T, value: any): Promise<T | null> {
    return await this.repository.findOne({
      where: { [field]: value } as any
    });
  }

  /**
   * Helper method to find multiple entities by field values
   */
  protected async findManyByField(field: keyof T, values: any[]): Promise<T[]> {
    return await this.repository.find({
      where: values.map(value => ({ [field]: value })) as any
    });
  }

  /**
   * Helper method to get random item from array
   */
  protected getRandomItem<U>(array: U[]): U {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * Helper method to get random items from array
   */
  protected getRandomItems<U>(array: U[], count: number): U[] {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, array.length));
  }
}
