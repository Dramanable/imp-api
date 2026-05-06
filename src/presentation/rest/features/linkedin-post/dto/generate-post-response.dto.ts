import { ApiProperty } from '@nestjs/swagger';

export class GeneratePostResponseDto {
  @ApiProperty({
    title: 'LinkedIn Post',
    description:
      'The generated LinkedIn post. Always ≤ 1,300 characters (LinkedIn platform limit). ' +
      'Ready to be copied and published.',
    maxLength: 1300,
    example:
      '🚀 Nous recrutons un ingénieur DevOps senior !\n\n' +
      'Chez TechFlow, nous accélérons la transformation numérique des PME industrielles depuis 2018. ' +
      "Aujourd'hui, nous cherchons un profil passionné pour rejoindre notre équipe infrastructure et " +
      "construire des pipelines CI/CD robustes, scalables et orientés valeur.\n\n" +
      '✅ Ce que nous offrons :\n' +
      '→ Une équipe soudée et en croissance\n' +
      '→ Des projets concrets avec impact immédiat\n' +
      '→ Flexibilité full-remote\n\n' +
      '💬 Vous maîtrisez Kubernetes, Terraform et avez envie de challenges ? Parlez-nous en commentaire ou en DM.\n\n' +
      '#DevOps #Recrutement #Numérique #PME',
  })
  post: string;

  @ApiProperty({
    title: 'Editorial Intention Note',
    description:
      'A 2-4 sentence note explaining the editorial and creative choices made for this post: ' +
      'the type of hook, the structural choices, the calls to action, and the alignment with the requested tone.',
    example:
      "L'accroche emoji + chiffre crée un signal visuel fort dans le fil d'actualité LinkedIn, maximisant le taux de stop-scroll. " +
      "Le corps du post utilise une liste à puces pour les bénéfices, facilitant la lecture sur mobile. " +
      "L'appel à l'action double (commentaire + DM) augmente les chances d'engagement.",
  })
  intentionNote: string;

  @ApiProperty({
    title: 'Served from Cache',
    description:
      'Indicates whether this response was served from the server-side in-memory cache. ' +
      'Cached responses are identical to freshly generated ones and incur no LLM cost.',
    example: false,
  })
  fromCache: boolean;
}

