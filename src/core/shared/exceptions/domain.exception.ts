export class DomainException extends Error {
  constructor(
    public readonly key: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(key);
    this.name = this.constructor.name;
  }
}
