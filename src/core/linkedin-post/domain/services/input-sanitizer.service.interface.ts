/**
 * Port for a service that validates user-supplied text inputs before they are
 * forwarded to the LLM.
 *
 * Implementations MUST throw a {@link PromptInjectionException} when suspicious
 * content is detected. A clean return means the inputs are safe to use.
 */
export interface IInputSanitizer {
  /**
   * Validates `companyDescription` and `brief` for prompt injection patterns.
   *
   * @throws {PromptInjectionException} if any input contains suspicious content.
   */
  validate(companyDescription: string, brief: string): void;
}

/** NestJS DI injection token for the input sanitizer service. */
export const INPUT_SANITIZER = Symbol('INPUT_SANITIZER');
