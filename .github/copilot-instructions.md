# Instructions for GitHub Copilot - Backend API

## ⚡ **PERFORMANCE**

1. **Group Operations** - Read all → Edit all → Build once
2. **Parallelize** - Read/create multiple files simultaneously
3. **Be Direct** - Act first, explain after if needed

---

## 🚀 **ENVIRONNEMENT DE DÉVELOPPEMENT**

### ⛔ LE SERVEUR TOURNE DANS DOCKER - JAMAIS `npm run start:dev`

```bash
# Démarrer les services
docker compose up -d

# Voir les logs
docker compose logs -f backend

# Rebuild après changements de code
docker compose up -d --build backend

# Exécuter les seeds
docker compose exec backend npx ts-node --project tsconfig.seed.json seed/platform-sectors.seed.ts
```

---

## 🎯 **PROJECT CONTEXT**

**Project:** Multi-tenant Marketplace API (SaaS B2B)
**Stack:** NestJS 11 + Fastify + TypeORM (PostgreSQL) + MongoDB + Redis + BullMQ
**Architecture:** Clean Architecture + DDD
**Security:** HTTP-Only Cookie Authentication + CSRF Protection
**Domains:** Platform (SaaS team) | Tenant (BTP, Transport, Beauty, Health, Agro)

---

## 🏗️ **CLEAN ARCHITECTURE**

```
src/
├── core/                    # 🔵 DOMAIN + APPLICATION (Pure TypeScript)
│   ├── shared/              # Shared domain (Email VO, Pagination, etc.)
│   ├── platform/            # Platform domain (SaaS team users)
│   │   ├── domain/          # Entities, VOs, Repositories interfaces
│   │   └── application/     # Use Cases (Plain TS classes)
│   └── tenant/              # Tenant domains
│       ├── auth/            # Tenant authentication
│       ├── btp/             # Construction sector
│       └── transport/       # Logistics sector
├── infrastructure/          # 🟠 ADAPTERS (NestJS DI)
│   ├── shared/              # JWT, Password, ID generators
│   ├── platform/            # Platform repositories
│   └── tenant/              # Tenant repositories
├── presentation/            # 🔴 REST API
│   └── rest/
│       ├── features/        # Controllers by domain
│       ├── security/        # Guards, Strategies
│       └── types/           # Fastify type extensions
├── generated/               # Generated code (Swagger types)
└── test/
    └── e2e/                 # Tests E2E (OBLIGATOIRES)
```

---

## 🔴 **RÈGLES CRITIQUES (TOLÉRANCE ZÉRO)**

### 1. **RÉUTILISATION DES TYPES DU CORE**

```typescript
// ✅ CORRECT - Utiliser les types, enums et objets existants du core
import { PlatformRole } from '@core/platform/domain/value-objects/platform-role.vo';
import { TenantStatus } from '@core/platform/domain/value-objects/tenant/tenant-status.vo';
import { MultilingualText } from '@core/platform/domain/entities/sector';
import { PaginationParams, PaginatedResult } from '@core/shared/pagination';
import { Email } from '@core/shared/value-objects/email.vo';

// ❌ INTERDIT - Dupliquer les types qui existent dans le core
type PlatformRole = 'SAAS_SUPER_ADMIN' | 'SAAS_ADMIN'; // ❌ EXISTE DÉJÀ
interface MultilingualText {
  fr: string;
  en: string;
} // ❌ EXISTE DÉJÀ
enum Status {
  ACTIVE = 'ACTIVE',
} // ❌ UTILISER L'EXISTANT
```

### 2. **RÔLES ET PERMISSIONS DANS LES USE-CASES**

```typescript
// ✅ CORRECT - Vérification des permissions DANS le use-case
export class UpdateTenantUseCase {
  async execute(dto: UpdateTenantDto): Promise<UpdateTenantResult> {
    // 1. Vérifier les permissions AVANT toute logique métier
    this.checkPermission(dto.platformUserRoles, dto.platformUserId);

    // 2. Ensuite la logique métier...
  }

  private checkPermission(roles: PlatformRole[], userId: string): void {
    const canUpdate = roles.some((r) =>
      [PlatformRole.SAAS_SUPER_ADMIN, PlatformRole.SAAS_ADMIN].includes(r),
    );
    if (!canUpdate) {
      throw new PlatformPermissionDeniedException(
        'platform.tenant.permission_denied',
        { userId, action: 'update', requiredRole: 'SAAS_ADMIN' },
      );
    }
  }
}

// ❌ INTERDIT - Pas de vérification de permissions
export class UpdateTenantUseCase {
  async execute(dto: UpdateTenantDto): Promise<UpdateTenantResult> {
    // Directement la logique sans vérifier qui a le droit ❌
    return this.tenantRepository.update(dto);
  }
}
```

### 3. **i18n - TOUT MESSAGE CLIENT TRADUIT**

```typescript
// ✅ CORRECT - Clés de traduction (i18n/fr/ et i18n/en/)
throw new DomainException('user.not_found', { userId });
throw new UserNotFoundException('platform.user.not_found', { userId });
return { message: this.i18n.translate('user.created_successfully') };

// Format des clés: domain.entity.error_type
// Exemples: user.not_found, token.expired, auth.invalid_credentials

// ❌ INTERDIT - Messages hardcodés en français ou anglais
throw new Error('User not found');
throw new Error('Utilisateur non trouvé');
return { message: 'User created successfully' };
return { message: 'Création réussie' };
```

### 4. **EXCEPTIONS - JAMAIS `new Error()`**

```typescript
// ✅ CORRECT - Exceptions du domaine avec clé i18n
throw new UserNotFoundException('platform.user.not_found', { userId });
throw new InvalidEmailException('shared.email.invalid', { email });
throw new PlatformPermissionDeniedException(
  'platform.permission_denied',
  context,
);
throw new TenantNotFoundException('platform.tenant.not_found', { tenantId });

// ❌ INTERDIT - new Error() ou messages hardcodés
throw new Error('Something went wrong');
throw new Error(`User ${id} not found`);
throw new Error('Validation failed');
```

### 5. **OBSERVABILITÉ ET TRAÇABILITÉ**

```typescript
// ✅ CORRECT - Logger avec correlationId et contexte structuré
export class CreateOrderUseCase {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly logger: ILogger,
  ) {}

  async execute(dto: CreateOrderDto): Promise<CreateOrderResult> {
    const { correlationId, userId, ipAddress, userAgent } = dto;

    // Log de début avec contexte complet
    this.logger.debug('Creating order', {
      action: 'CreateOrder',
      userId,
      correlationId,
    });

    const order = await this.orderRepository.save(newOrder);

    // Log de succès avec résultat
    this.logger.info('Order created successfully', {
      action: 'CreateOrder',
      orderId: order.id,
      userId,
      correlationId,
    });

    return result;
  }
}

// ❌ INTERDIT
console.log('Creating order');
this.logger.info('Done');
this.logger.error('Error'); // Sans contexte
```

### 6. **PAGINATION - OBLIGATOIRE POUR TOUTE LISTE**

```typescript
// ✅ CORRECT - Repository TOUJOURS paginé
interface IUserRepository {
  findAll(
    pagination: PaginationParams,
    filters?: UserFilters,
  ): Promise<PaginatedResult<User>>;

  findByTenantId(
    tenantId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<User>>;
}

// ✅ CORRECT - Use case retourne le format de pagination standard
interface ListUsersResult {
  items: UserListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// ❌ INTERDIT - Retourner une liste brute sans pagination
findAll(): Promise<User[]>;
findByStatus(status: string): Promise<User[]>;
```

### 7. **CONTROLLERS - POST /list POUR LES LISTES**

```typescript
// ✅ CORRECT - POST avec /list pour les listes paginées
@Post('users/list')
@ApiOperation({ summary: 'List users with filters and pagination' })
@ApiResponse({ status: 200, type: ListUsersResponseDto })
async list(@Body() dto: ListUsersRequestDto): Promise<ListUsersResponseDto> {
  return this.listUsersUseCase.execute(dto);
}

@Post('sessions/list')
@ApiOperation({ summary: 'List sessions with filters' })
async listSessions(@Body() dto: ListSessionsDto): Promise<ListSessionsResponseDto> {
  return this.listSessionsUseCase.execute(dto);
}

// ❌ INTERDIT - GET avec query params pour listes
@Get('users')
async list(@Query() query: ListUsersQueryDto) { }

@Get('sessions')
async listSessions(@Query() query: ListSessionsDto) { }
```

### 8. **TESTS E2E - OBLIGATOIRES POUR TOUT CONTROLLER**

Tout controller déclaré dans `presentation/rest/features/` **DOIT** avoir des tests E2E correspondants dans `test/e2e/`.

```typescript
// test/e2e/users.e2e-spec.ts
describe('UsersController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Setup avec TestingModule
  });

  describe('POST /api/v1/users/list', () => {
    it('should return paginated users', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/users/list')
        .send({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('totalPages');
    });

    it('should filter by status', async () => {
      // Test des filtres
    });

    it('should require authentication', async () => {
      // Test 401 sans cookie
    });
  });

  describe('POST /api/v1/users', () => {
    it('should create user with valid data', async () => {});
    it('should return 400 for invalid email', async () => {});
    it('should return 409 for duplicate email', async () => {});
  });
});
```

### 9. **SWAGGER - PAS D'ENDPOINT NON IMPLÉMENTÉ**

```typescript
// ✅ CORRECT - Endpoint avec implémentation COMPLÈTE
@Post()
@ApiOperation({ summary: 'Create user' })
@ApiResponse({ status: 201, type: CreateUserResponseDto })
@ApiResponse({ status: 400, description: 'Validation error' })
@ApiResponse({ status: 401, description: 'Unauthorized' })
@ApiResponse({ status: 409, description: 'User already exists' })
async create(@Body() dto: CreateUserDto): Promise<CreateUserResponseDto> {
  return this.createUserUseCase.execute({
    ...dto,
    correlationId: this.request.correlationId,
    ipAddress: this.request.ip,
  });
}

// ❌ INTERDIT - Endpoint stub ou non implémenté
@Post()
async create() {
  throw new NotImplementedException();
}

@Post()
async create() {
  // TODO: implement
  return null;
}
```

### 10. **COOKIE AUTHENTICATION**

```typescript
// Backend: Set HTTP-Only cookies
response.setCookie('accessToken', token, {
  httpOnly: true, // ✅ Not readable by JS
  secure: true, // ✅ HTTPS only
  sameSite: 'strict', // ✅ CSRF protection
});

// Backend: Read from cookies ONLY
const token = request.cookies['accessToken'];

// ❌ NEVER: request.headers.authorization
// ❌ NEVER: Return tokens in response body
```

### 11. **NO FRAMEWORK IN CORE**

```typescript
// ❌ FORBIDDEN in core/
import { Injectable } from '@nestjs/common'; // NO!
import { randomUUID } from 'crypto'; // NO!
import * as bcrypt from 'bcrypt'; // NO!

// ✅ ALLOWED in core/ - Interfaces (ports)
export interface IIdGenerator {
  generate(): string;
}
export interface IPasswordHasher {
  hash(password: string): Promise<string>;
}
// → Implementations in infrastructure/
```

### 12. **USE CASES - CLASSES CONCRÈTES UNIQUEMENT**

```typescript
// ✅ CORRECT - Classe concrète dans core/*/application/use-cases/
export class CreateUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly logger: ILogger,
  ) {}

  async execute(input: CreateUserInput): Promise<CreateUserOutput> {
    // Implémentation
  }
}

// ❌ INTERDIT - Pas d'interface pour les use-cases
export interface ICreateUserUseCase {
  execute(input): Promise<output>;
}

// ❌ INTERDIT - Pas de fichiers .impl.ts
// ❌ INTERDIT - Pas de use-cases dans infrastructure/
```

---

## 📁 **NAMING CONVENTIONS**

| Type                 | Pattern                     | Location                            |
| -------------------- | --------------------------- | ----------------------------------- |
| Entity               | `*.entity.ts`               | `core/*/domain/entities/`           |
| Value Object         | `*.vo.ts`                   | `core/*/domain/value-objects/`      |
| Repository Interface | `*.repository.interface.ts` | `core/*/domain/repositories/`       |
| Domain Exception     | `*.exception.ts`            | `core/*/domain/exceptions/`         |
| Use Case             | `*.use-case.ts`             | `core/*/application/use-cases/`     |
| Repository Impl      | `*-typeorm.repository.ts`   | `infrastructure/*/repositories/`    |
| Controller           | `*.controller.ts`           | `presentation/rest/features/`       |
| DTO                  | `*.dto.ts`                  | `presentation/rest/features/*/dto/` |
| E2E Test             | `*.e2e-spec.ts`             | `test/e2e/`                         |

| Type                 | Convention                   | Exemple                 |
| -------------------- | ---------------------------- | ----------------------- |
| Use Case             | `{Action}{Entity}UseCase`    | `CreateUserUseCase`     |
| Repository Interface | `I{Entity}Repository`        | `IUserRepository`       |
| Repository Token     | `{ENTITY}_REPOSITORY`        | `USER_REPOSITORY`       |
| Use Case Token       | `{ACTION}_{ENTITY}_USE_CASE` | `CREATE_USER_USE_CASE`  |
| DTO Input            | `{Action}{Entity}Dto`        | `CreateUserDto`         |
| DTO Output           | `{Action}{Entity}Result`     | `CreateUserResult`      |
| Exception            | `{Entity}{Problem}Exception` | `UserNotFoundException` |

---

## 🔒 **SECURITY**

### CORS Configuration

```typescript
// Development: CORS disabled (same host)
// Production: Strict whitelist
app.enableCors({
  origin: ['https://admin.example.com', 'https://app.example.com'],
  credentials: true,
});
```

### CSRF Protection

```typescript
// All state-changing requests must include X-CSRF-Token header
// Token obtained from GET /csrf-token endpoint
```

---

## 📚 **PATTERNS DE RÉFÉRENCE**

### Entity Pattern

```typescript
// core/platform/domain/entities/user.entity.ts
export class PlatformUser {
  private constructor(
    public readonly userId: string,
    public readonly email: Email, // ✅ Utiliser le VO existant
    public readonly fullName: string,
    public readonly platformRoles: PlatformRole[], // ✅ Enum existant
  ) {}

  static create(props: CreateUserProps): PlatformUser {
    return new PlatformUser(...);
  }

  updateRoles(roles: PlatformRole[]): PlatformUser {
    return new PlatformUser(this.userId, this.email, this.fullName, roles);
  }
}
```

### Use Case Pattern avec Permissions

```typescript
// core/platform/application/use-cases/create-user.use-case.ts
export class CreateUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly passwordHasher: IPasswordHasher,
    private readonly logger: ILogger,
  ) {}

  async execute(input: CreateUserInput): Promise<CreateUserOutput> {
    const { correlationId, performerRoles, performerId } = input;

    // 1. Vérifier les permissions
    this.checkPermission(performerRoles, performerId);

    // 2. Log début
    this.logger.debug('Creating user', {
      action: 'CreateUser',
      email: input.email,
      correlationId,
    });

    // 3. Logique métier
    const existingUser = await this.userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new UserAlreadyExistsException('platform.user.already_exists', {
        email: input.email,
      });
    }

    const user = await this.userRepository.save(newUser);

    // 4. Log succès
    this.logger.info('User created', {
      action: 'CreateUser',
      userId: user.userId,
      correlationId,
    });

    return { userId: user.userId };
  }

  private checkPermission(roles: PlatformRole[], performerId: string): void {
    const canCreate = roles.some((r) =>
      [PlatformRole.SAAS_SUPER_ADMIN, PlatformRole.SAAS_ADMIN].includes(r),
    );
    if (!canCreate) {
      throw new PlatformPermissionDeniedException(
        'platform.permission_denied',
        { performerId, action: 'CreateUser', requiredRole: 'SAAS_ADMIN' },
      );
    }
  }
}
```

### Repository Interface Pattern (avec pagination)

```typescript
// core/platform/domain/repositories/user.repository.interface.ts
export interface IUserRepository {
  findById(userId: string): Promise<PlatformUser | null>;
  findByEmail(email: string): Promise<PlatformUser | null>;
  findAll(
    pagination: PaginationParams,
    filters?: UserFilters,
  ): Promise<PaginatedResult<PlatformUser>>; // ✅ TOUJOURS paginé
  save(user: PlatformUser): Promise<PlatformUser>;
  delete(userId: string): Promise<void>;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
```

### DI Wiring Pattern

```typescript
// infrastructure/platform/platform.module.ts
@Module({
  providers: [
    {
      provide: USER_REPOSITORY,
      useClass: UserTypeOrmRepository,
    },
    {
      provide: CREATE_USER_USE_CASE,
      useFactory: (
        repo: IUserRepository,
        idGen: IIdGenerator,
        hasher: IPasswordHasher,
        logger: ILogger,
      ) => new CreateUserUseCase(repo, idGen, hasher, logger),
      inject: [USER_REPOSITORY, ID_GENERATOR, PASSWORD_HASHER, LOGGER],
    },
  ],
})
export class PlatformModule {}
```

### Controller Pattern avec Swagger complet

```typescript
// presentation/rest/features/platform/controllers/users.controller.ts
@ApiTags('Platform - Users')
@Controller('platform/users')
@ApiCookieAuth('accessToken')
export class UsersController {
  constructor(
    @Inject(LIST_USERS_USE_CASE)
    private readonly listUsersUseCase: ListUsersUseCase,
    @Inject(CREATE_USER_USE_CASE)
    private readonly createUserUseCase: CreateUserUseCase,
  ) {}

  @Post('list')
  @ApiOperation({ summary: 'List users with filters and pagination' })
  @ApiResponse({ status: 200, type: ListUsersResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(
    @Body() dto: ListUsersRequestDto,
    @Req() request: FastifyRequest,
  ): Promise<ListUsersResponseDto> {
    return this.listUsersUseCase.execute({
      ...dto,
      correlationId: request.correlationId,
      performerId: request.user.userId,
      performerRoles: request.user.platformRoles,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, type: CreateUserResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Permission denied' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async create(
    @Body() dto: CreateUserDto,
    @Req() request: FastifyRequest,
  ): Promise<CreateUserResponseDto> {
    return this.createUserUseCase.execute({
      ...dto,
      correlationId: request.correlationId,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      performerId: request.user.userId,
      performerRoles: request.user.platformRoles,
    });
  }
}
```

---

## ✅ **CHECKLIST AVANT COMMIT**

### Domain Layer

- [ ] Aucune dépendance externe (NestJS, Node.js APIs, npm packages)
- [ ] Exceptions avec clés i18n (`domain.entity.error_type`)
- [ ] Entités immutables (retournent de nouvelles instances)
- [ ] Repository interfaces définies (ports) avec pagination

### Application Layer

- [ ] Use Cases = classes TypeScript pures
- [ ] Pas de @Injectable, @Inject
- [ ] Vérification des permissions en premier
- [ ] Logger avec correlationId et contexte
- [ ] Dépend uniquement du domain layer
- [ ] Types du core réutilisés (pas de duplication)

### Infrastructure Layer

- [ ] Implémente les interfaces du domain
- [ ] NestJS DI configuré (@Injectable, @Inject)
- [ ] Dépendances externes ici uniquement

### Presentation Layer

- [ ] Documentation Swagger COMPLÈTE
- [ ] Tous les @ApiResponse (succès + erreurs)
- [ ] Tous les champs DTO avec @ApiProperty
- [ ] POST /list pour les listes paginées
- [ ] Capture correlationId, ipAddress, userAgent côté serveur
- [ ] **Tests E2E présents dans test/e2e/**

---

## 🚫 **INTERDICTIONS ABSOLUES**

| #   | Interdit                               | Alternative                         |
| --- | -------------------------------------- | ----------------------------------- |
| 1   | `npm run start:dev`                    | `docker compose up -d`              |
| 2   | `new Error('message')`                 | Exceptions du domaine avec clé i18n |
| 3   | Messages hardcodés                     | Clés i18n (`user.not_found`)        |
| 4   | `console.log()`                        | Logger injecté avec contexte        |
| 5   | Interfaces pour use-cases              | Classes concrètes uniquement        |
| 6   | Fichiers `.impl.ts`                    | Pattern interdit                    |
| 7   | Use-cases dans `infrastructure/`       | Toujours dans `core/`               |
| 8   | Listes sans pagination                 | Toujours `PaginatedResult<T>`       |
| 9   | GET pour listes avec filtres           | `POST /list`                        |
| 10  | Endpoints non implémentés              | Swagger = implémentation complète   |
| 11  | Duplication de types                   | Réutiliser les types du core        |
| 12  | Controller sans tests E2E              | Tout controller doit être testé     |
| 13  | `any` type                             | Types stricts                       |
| 14  | Retourner tokens dans body             | Cookies HTTP-Only uniquement        |
| 15  | `request.headers.authorization`        | `request.cookies['accessToken']`    |
| 16  | Use-case sans vérification permissions | Toujours vérifier les rôles         |
| 17  | `docker-compose build` (sans raison)   | Only when installing new npm deps   |

---

## 🔄 **DEVELOPMENT WORKFLOW**

### Implementation Steps

When implementing features (steps 1,2,3,4,5,6):

1. **Respect Clean Architecture** - Strict layer separation (core → infrastructure → presentation)
2. **Apply SOLID Principles** - Especially Dependency Inversion (interfaces in core, implementations in infrastructure)
3. **No Hardcoding** - All configuration, messages, and business rules must be externalized
4. **Domain Exceptions Only** - Never use `new Error()`, always use domain exceptions with i18n keys
5. **MongoDB Pagination** - Always use `.aggregate()` for pagination, use `.lean()` for performance when possible
6. **E2E Tests Required** - Every controller in presentation layer MUST have corresponding E2E tests in `test/e2e/`
7. **Roles & Permissions** - Always check roles/permissions in use cases AND document them in Swagger
8. **Exhaustive Swagger** - Precise and complete documentation to help frontend developers
9. **All Documentation in English** - Code comments, API docs, README files
10. **Quality Gates**:
    - ✅ All tests pass (green)
    - ✅ No ESLint errors
    - ✅ No build errors
    - ✅ Server runs correctly in Docker without errors

### Docker Commands

```bash
# ✅ ALWAYS - Start/restart services
docker compose up -d

# ✅ WHEN NEEDED - View logs
docker compose logs -f backend

# ⚠️ ONLY when new npm dependencies installed
docker compose build backend
docker compose up -d

# ❌ NEVER without new dependencies
docker-compose build
```

### Commit & Push Guidelines

After completing work:

1. Run all tests: `docker compose exec backend npm test`
2. Check ESLint: `docker compose exec backend npm run lint`
3. Verify server runs: `docker compose logs backend`
4. Commit with conventional commits (see COMMIT_GUIDELINES.md)
5. Push to repository
6. Propose next steps or improvements
