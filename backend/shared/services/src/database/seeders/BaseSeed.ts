export abstract class BaseSeed {
  protected entityName: string;

  constructor(entityName: string) {
    this.entityName = entityName;
  }

  protected getRandomItem<U>(array: U[]): U {
    return array[Math.floor(Math.random() * array.length)];
  }

  protected getRandomItems<U>(array: U[], count: number): U[] {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, array.length));
  }
}
