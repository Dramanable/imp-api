export class GeneratedPost {
  constructor(
    public readonly post: string,
    public readonly intentionNote: string,
    public readonly generatedAt: Date = new Date(),
  ) {}
}
