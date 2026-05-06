import { Injectable } from '@nestjs/common';
import { IInputSanitizer } from '../../../core/linkedin-post/domain/services/input-sanitizer.service.interface';
import { PromptInjectionException } from '../../../core/linkedin-post/domain/exceptions/prompt-injection.exception';

/**
 * Patterns that are characteristic of prompt injection attempts.
 *
 * The list covers the most common attack vectors:
 * - Instructions to ignore the system prompt
 * - Role-switching commands (e.g. "act as DAN", "you are now X")
 * - Direct injection of LLM control sequences
 * - Requests to reveal or override internal instructions
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|above|prior|system)\s+(instructions?|prompts?|context)/i,
  /forget\s+(all\s+)?(previous|above|prior|system)\s+(instructions?|prompts?|context)/i,
  /disregard\s+(all\s+)?(previous|above|prior|system)\s+(instructions?|prompts?|context)/i,
  /override\s+(the\s+)?(system\s+)?(prompt|instructions?)/i,
  /\byou\s+are\s+now\b/i,
  /\bact\s+as\b/i,
  /\bjailbreak\b/i,
  /\bdan\s+mode\b/i,
  /\bdo\s+anything\s+now\b/i,
  /\bsystem\s*:\s*/i,
  /\bpretend\s+(you\s+are|to\s+be)\b/i,
  /\breveal\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
  /\bprint\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
  // Excessive repetition of control characters can be used for buffer confusion
  /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]{2,}/,
];

/** Maximum allowed ratio of special characters to total characters. */
const MAX_SPECIAL_CHAR_RATIO = 0.3;

@Injectable()
export class InputSanitizerService implements IInputSanitizer {
  validate(companyDescription: string, brief: string): void {
    this.checkField(companyDescription, 'companyDescription');
    this.checkField(brief, 'brief');
  }

  private checkField(value: string, fieldName: string): void {
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(value)) {
        throw new PromptInjectionException(
          'linkedin-post.validation.prompt_injection_detected',
          { field: fieldName },
        );
      }
    }

    const specialChars = (value.match(/[^a-zA-Z0-9\u00C0-\u024F\s.,;:!?'"()\-–—]/g) ?? []).length;
    if (value.length > 0 && specialChars / value.length > MAX_SPECIAL_CHAR_RATIO) {
      throw new PromptInjectionException(
        'linkedin-post.validation.prompt_injection_detected',
        { field: fieldName, reason: 'excessive_special_characters' },
      );
    }
  }
}
