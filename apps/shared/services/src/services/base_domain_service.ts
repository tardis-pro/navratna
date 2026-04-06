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
  private repositories = new Map<string, unknown>();

  protected constructor() {}

  /**
   * Get or create the singleton instance for a service class.
   * Uses Function type to accommodate protected constructors in subclasses.
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  protected static resolve<T extends BaseDomainService>(ctor: Function): T {
    const key = ctor.name;
    if (!BaseDomainService.instances.has(key)) {
      // @ts-expect-error -- ctor is a constructor function; instantiation is safe at runtime
      BaseDomainService.instances.set(key, new ctor());
    }
    // @ts-expect-error -- Map stores unknown; value was set as T above
    return BaseDomainService.instances.get(key);
  }

  /**
   * Lazy-initialize and cache a repository by key.
   * Replaces the repetitive null-check getter pattern.
   */
  protected getRepository<T>(key: string, factory: () => T): T {
    if (!this.repositories.has(key)) {
      this.repositories.set(key, factory());
    }
    // @ts-expect-error -- Map stores unknown; value was set as T by factory above
    return this.repositories.get(key);
  }

  /**
   * Reset all singleton instances. Useful for testing.
   */
  public static resetInstances(): void {
    BaseDomainService.instances.clear();
  }
}
