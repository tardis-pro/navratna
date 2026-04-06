/**
 * Abstract base class for domain services.
 * Provides singleton management and lazy repository initialization,
 * eliminating ~40 lines of boilerplate per service.
 *
 * Usage:
 * ```typescript
 * export class MyService extends BaseDomainService {
 *   protected constructor() { super(); }
 *   public static getInstance(): MyService {
 *     return BaseDomainService.resolve<MyService>(MyService);
 *   }
 *   public getMyRepo(): MyRepository {
 *     return this.getRepository('myRepo', () => new MyRepository());
 *   }
 * }
 * ```
 */
export abstract class BaseDomainService {
  private static instances = new Map<string, BaseDomainService>();
  private repositories = new Map<string, BaseDomainService | object>();

  protected constructor() {}

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  protected static resolve<T extends BaseDomainService>(ctor: Function): T {
    const key = ctor.name;
    if (!BaseDomainService.instances.has(key)) {
      const TypedCtor = ctor as new () => T;
      BaseDomainService.instances.set(key, new TypedCtor());
    }
    const instance = BaseDomainService.instances.get(key);
    if (instance === undefined) {
      throw new Error(`Failed to resolve service: ${key}`);
    }
    // instance was stored as T (a BaseDomainService subclass); safe to narrow
    return instance as T;
  }

  protected getRepository<T extends object>(key: string, factory: () => T): T {
    if (!this.repositories.has(key)) {
      this.repositories.set(key, factory());
    }
    const repo = this.repositories.get(key);
    if (repo === undefined) {
      throw new Error(`Repository not found for key: ${key}`);
    }
    // repo was stored as T by factory above; safe to narrow
    return repo as T;
  }

  /**
   * Reset all singleton instances. Useful for testing.
   */
  public static resetInstances(): void {
    BaseDomainService.instances.clear();
  }
}
