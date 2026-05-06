import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { PREDEFINED_TONES } from '../../../../../core/linkedin-post/domain/value-objects/tone-of-voice.vo';

export class GeneratePostDto {
  @ApiProperty({
    title: 'Company Description',
    description:
      'Description of the company: sector, core values, brand tone, and target audience. ' +
      'The richer and more precise the description, the more relevant the generated post will be.',
    maxLength: 2000,
    minLength: 1,
    example:
      'TechFlow est une PME française spécialisée dans la transformation numérique des PME industrielles. ' +
      'Fondée en 2018, elle accompagne ses clients avec une approche pragmatique, centrée sur la valeur ajoutée immédiate. ' +
      'Valeurs : innovation ancrée, proximité client, impact durable. Cible : DSI et dirigeants de PME industrielles (100-500 salariés).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  companyDescription: string;

  @ApiProperty({
    title: 'Publication Brief',
    description:
      'Short description of what the LinkedIn post should communicate. ' +
      'Examples: "hiring announcement for a DevOps engineer", "client success story in the agri-food sector", ' +
      '"announcement of a new partnership with a major account".',
    maxLength: 500,
    minLength: 1,
    example:
      'Annonce de recrutement : nous cherchons un ingénieur DevOps senior pour renforcer notre équipe infrastructure.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  brief: string;

  @ApiProperty({
    title: 'Tone of Voice',
    description:
      `Communication tone to adopt for the LinkedIn post. Predefined values receive a rich,
` +
      `localised description; any other non-empty string is forwarded verbatim to the LLM.

` +
      `| Value | Description |
` +
      `|-------|-------------|
` +
      `| \`professional\` | Formal, structured, credible – ideal for B2B and executive audiences |
` +
      `| \`casual\` | Accessible, warm, human – ideal for employer branding and culture content |
` +
      `| \`inspiring\` | Motivating, ambitious, engaging – ideal for vision and impact stories |
` +
      `| \`expert\` | Technical, precise, authoritative – ideal for thought leadership |
` +
      `| *custom* | Any string, e.g. \`"empathetic and bold"\` |`,
    enum: Object.values(PREDEFINED_TONES),
    default: PREDEFINED_TONES.PROFESSIONAL,
    example: PREDEFINED_TONES.PROFESSIONAL,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tone: string;
}

