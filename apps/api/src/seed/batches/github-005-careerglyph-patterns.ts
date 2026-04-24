/**
 * Batch github-005-careerglyph-patterns
 *
 * 25 patterns extracted from Shailesh93602/CareerGlyph — a monorepo with
 * a NestJS backend (auth, JWT, bcrypt, profile/skill/endorsement
 * service, Prisma) and a Next.js App Router frontend (login, register,
 * /[username] public profile, axios + react-query). Patterns cover
 * authentication, authorization checks, controller routing order,
 * optimistic UI, axios interceptors, and the Nest testing harness.
 *
 * Authoring rules (see CORPUS-PLAN.md):
 * - Real attribution; every URL resolves.
 * - Real patterns the project actually uses (read the file first).
 * - 200–400 word body, one topic per entry.
 */

import type { SeedItem } from '../types';

const repo = { owner: 'Shailesh93602', name: 'CareerGlyph' };
const blob = (path: string) =>
  `https://github.com/Shailesh93602/CareerGlyph/blob/main/${path}`;

export const BATCH: SeedItem[] = [
  {
    title: 'NestJS auth: bcrypt hash + JWT issue, fail-fast on missing JWT_SECRET',
    body: `\`AuthService.register\` checks for an existing email, hashes the password with bcrypt at cost 10, persists the user, and returns a signed JWT. The login flow mirrors it: lookup by email, \`bcrypt.compare\`, sign token. Both throw the right NestJS exception subclass so the global filter maps them to the right HTTP status.

\`\`\`ts
async register(dto: RegisterDto) {
  const existing = await this.prisma.developer.findUnique({
    where: { email: dto.email },
  });
  if (existing) throw new ConflictException('Email already registered'); // → 409

  const hash = await bcrypt.hash(dto.password, 10);
  const developer = await this.prisma.developer.create({
    data: { username: dto.username, name: dto.name, email: dto.email,
            password: hash, bio: dto.bio, isPublic: true },
  });

  const token = this.signToken(developer.id, developer.username);
  return { accessToken: token, username: developer.username };
}

async login(dto: LoginDto) {
  const developer = await this.prisma.developer.findUnique({ where: { email: dto.email } });
  if (!developer) throw new UnauthorizedException('Invalid credentials'); // → 401

  const valid = await bcrypt.compare(dto.password, developer.password);
  if (!valid) throw new UnauthorizedException('Invalid credentials');

  const token = this.signToken(developer.id, developer.username);
  return { accessToken: token, username: developer.username };
}

private signToken(sub: string, username: string): string {
  return this.jwtService.sign({ sub, username }, { expiresIn: '7d' });
}
\`\`\`

Two security details to copy:

1. **Identical "Invalid credentials" message for both "user not found" and "wrong password."** Distinguishing them lets attackers enumerate which emails are registered. Same exception, same wording.
2. **bcrypt cost 10 is the sane default** in 2026 — about 100ms per hash on commodity hardware. Cost 12 is ~400ms (better security, slower login UX); cost 8 is ~25ms (faster but increasingly within reach of GPU rigs). 10 is the conventional balance for web auth.

The companion \`AuthModule\` registers the JwtModule via \`registerAsync\` and explicitly throws if \`JWT_SECRET\` isn't set in env — fail-fast at boot rather than silent token signing with \`undefined\`.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nestjs', 'jwt', 'bcrypt', 'authentication', 'security'],
    repository: repo,
    filePath: 'apps/backend/src/auth/auth.service.ts',
    url: blob('apps/backend/src/auth/auth.service.ts'),
  },
  {
    title: 'NestJS Passport JWT strategy with database lookup on every request',
    body: `\`JwtStrategy\` extends Passport's JWT strategy, parses the bearer token, and \`validate\` re-fetches the user from Postgres. Whatever \`validate\` returns is attached to \`req.user\` for downstream guards and controllers.

\`\`\`ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_SECRET is required. Set it in .env (generate with: openssl rand -hex 32).'
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; username: string }) {
    const developer = await this.prisma.developer.findUnique({
      where: { id: payload.sub },
    });
    if (!developer) throw new UnauthorizedException();
    return developer;
  }
}
\`\`\`

Two design choices worth understanding:

1. **The DB lookup in \`validate\` makes tokens revocable.** Pure JWT validation is signature + expiry — once a token is issued, it's valid until it expires. By looking up the developer row on every request, you can soft-delete (or set \`isPublic: false\`) and the next request fails 401. The cost is one indexed point query per authenticated request — usually invisible at modest scale.
2. **\`ignoreExpiration: false\` is explicit** even though it's the default. The tiny extra surface area documents intent; future-you reading the code knows expiration is enforced rather than wondering whether the default flipped.

The \`JwtAuthGuard\` is then a one-liner — \`extends AuthGuard('jwt')\` — and gets attached to controllers with \`@UseGuards(JwtAuthGuard)\`. The string \`'jwt'\` is the strategy name Passport uses to look up the strategy class; misspelling it gives a confusing "no strategy registered" error at runtime.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nestjs', 'passport', 'jwt', 'authentication', 'guards'],
    repository: repo,
    filePath: 'apps/backend/src/auth/jwt.strategy.ts',
    url: blob('apps/backend/src/auth/jwt.strategy.ts'),
  },
  {
    title: 'Per-route Throttle decorators for register/login rate limiting',
    body: `Brute-forcing the login endpoint is the #1 attack on any auth system. CareerGlyph's \`AuthController\` uses the \`@Throttle\` decorator to apply different rate limits to register vs login — 5/min for register (creating accounts shouldn't be a high-frequency operation), 10/min for login (typoing a password a few times is normal).

\`\`\`ts
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Register a new developer account' })
  @ApiResponse({ status: 201, description: 'Account created, returns JWT' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Login and receive a JWT' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
\`\`\`

Three patterns:

1. **\`ttl\` is in milliseconds in NestJS Throttler v5+.** Older versions used seconds; passing \`60\` to a v5 setup gives you 16-minute windows by accident.
2. **The module-level default** in \`AuthModule\` is \`{ ttl: 60000, limit: 10 }\` — the per-route \`@Throttle\` lets you tighten it for sensitive endpoints without touching the global config. This composes nicely: routes you don't decorate inherit the safe default.
3. **\`@HttpCode(HttpStatus.OK)\` on login** because Nest defaults POST to 201 Created. A successful login isn't creating a resource; it's returning a token. Returning 200 matches REST conventions and avoids confusing API consumers that key off the status code.

The \`@ApiResponse\` decorators feed the Swagger doc generator (\`/api/docs\`) so consumers see exactly which status codes each endpoint returns.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nestjs', 'rate-limiting', 'security', 'decorators', 'swagger'],
    repository: repo,
    filePath: 'apps/backend/src/auth/auth.controller.ts',
    url: blob('apps/backend/src/auth/auth.controller.ts'),
  },
  {
    title: 'JwtModule.registerAsync with ConfigService dependency injection',
    body: `Using \`JwtModule.register({ secret: process.env.JWT_SECRET })\` reads env at module-load time, before \`ConfigModule\` has loaded \`.env\` files. The result is a JWT module signed with \`undefined\`, which silently produces unverifiable tokens. \`registerAsync\` defers the secret read until DI is ready.

\`\`\`ts
@Module({
  imports: [
    DatabaseModule,
    PassportModule,
    ConfigModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error(
            'JWT_SECRET is required. Set it in .env (generate with: openssl rand -hex 32).'
          );
        }
        return { secret, signOptions: { expiresIn: '7d' } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
\`\`\`

The pattern is "factory provider with explicit imports + inject array." \`imports: [ConfigModule]\` makes ConfigService available; \`inject: [ConfigService]\` tells Nest to hand it as the first argument to the factory; \`useFactory\` returns the synchronous module options.

The fail-fast \`throw new Error\` is critical: NestJS will boot with an empty secret and start signing tokens with \`""\`. Every token will validate, every login will succeed, and your prod deploy is silently auth-less for a week before anyone notices. Throwing at boot guarantees a missing secret is loud.

The \`exports: [AuthService, JwtModule]\` lets feature modules import AuthModule and get JWT signing without re-configuring it — \`ProfileModule\` imports AuthModule for the JWT guard.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nestjs', 'dependency-injection', 'jwt', 'configuration', 'modules'],
    repository: repo,
    filePath: 'apps/backend/src/auth/auth.module.ts',
    url: blob('apps/backend/src/auth/auth.module.ts'),
  },
  {
    title: 'NestJS bootstrap: helmet + compression + cookie-parser + CORS + global ValidationPipe',
    body: `\`main.ts\` is the production-grade Nest bootstrap: every middleware that matters in a real deployment, plus a global validation pipe configured to reject extra fields rather than silently strip them.

\`\`\`ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security middleware
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  app.setGlobalPrefix('api/v1');

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('CareerGlyph API')
      .addBearerAuth()
      .addTag('auth', 'Authentication endpoints')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = process.env.PORT || 7777;
  await app.listen(port);
}
\`\`\`

Four production patterns:

1. **\`helmet()\` first.** Security headers (CSP, X-Frame-Options, HSTS) cost nothing and prevent classes of attack. NestJS doesn't enable it by default.
2. **\`whitelist: true\` + \`forbidNonWhitelisted: true\`** make the global validation pipe reject unknown fields outright (400) rather than silently strip them. Combined with \`transform: true\`, unknown fields can't sneak through and overwrite columns the DTO doesn't declare.
3. **CORS \`credentials: true\` requires a specific origin** — you can't use \`*\` with credentials per the CORS spec. The fallback to \`localhost:3000\` keeps local dev working when \`FRONTEND_URL\` isn't set.
4. **Swagger only in non-production.** The interactive \`/api/docs\` page is great for development but exposes the full API surface — production hides it both to reduce attack surface and to skip the DocumentBuilder cost on startup.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nestjs', 'security', 'helmet', 'cors', 'validation'],
    repository: repo,
    filePath: 'apps/backend/src/main.ts',
    url: blob('apps/backend/src/main.ts'),
  },
  {
    title: 'NestJS controller route order: static paths must precede param routes',
    body: `\`ProfileController\` mixes \`/me\` routes (own profile) with \`/:username\` routes (public profiles). The order of decorators matters — Nest's router walks them top-to-bottom and the first match wins, so \`/me\` MUST be declared before \`/:username\` or \`me\` becomes a username.

\`\`\`ts
@ApiTags('profile')
@Controller('profile')
export class ProfileController {
  // ─── Static routes first (must precede :username param) ──────────────────

  @Get('health')
  getHealth(): string { return this.profileService.getHealth(); }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateProfile(@Request() req, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(req.user.id, dto);
  }

  @Post('me/skills')
  @UseGuards(JwtAuthGuard)
  addSkill(@Request() req, @Body() dto: CreateSkillDto) {
    return this.profileService.addSkill(req.user.id, dto);
  }

  @Delete('me/skills/:skillId')
  @UseGuards(JwtAuthGuard)
  removeSkill(@Request() req, @Param('skillId') skillId: string) {
    return this.profileService.removeSkill(req.user.id, skillId);
  }

  // ─── Parameterized routes last ────────────────────────────────────────────

  @Post(':username/skills/:skillId/endorse')
  @UseGuards(JwtAuthGuard)
  endorseSkill(@Request() req, @Param('skillId') skillId: string,
               @Body() dto: EndorseSkillDto) {
    return this.profileService.endorseSkill(req.user.id, skillId, dto);
  }

  @Get(':username')
  getProfile(@Param('username') username: string) {
    return this.profileService.getByUsername(username);
  }
}
\`\`\`

The comment block \`// Static routes first\` is a deliberate marker — without it, a future contributor reordering methods alphabetically would break \`PATCH /me\` because \`PATCH /:username\` would catch it first. Some frameworks (Express via path-to-regexp, Fastify) score routes by specificity automatically; NestJS's underlying Express layer doesn't.

The same controller demonstrates two more patterns: \`@HttpCode(204)\` on DELETE endpoints (no response body), and \`@Request() req: { user: { id: string } }\` to read the authenticated user attached by the JWT strategy.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nestjs', 'routing', 'controllers', 'rest-api', 'design-patterns'],
    repository: repo,
    filePath: 'apps/backend/src/profile/profile.controller.ts',
    url: blob('apps/backend/src/profile/profile.controller.ts'),
  },
  {
    title: 'Service-layer ownership check before destructive ops',
    body: `Every "remove" method in \`ProfileService\` does a two-step dance: lookup the row, verify the caller owns it, then delete. Throwing \`NotFoundException\` for "exists but not yours" is intentional — it doesn't leak whether the resource exists at all.

\`\`\`ts
async removeSkill(developerId: string, skillId: string) {
  const skill = await this.prisma.skill.findUnique({ where: { id: skillId } });
  if (skill?.developerId !== developerId) {
    throw new NotFoundException('Skill not found');
  }
  await this.prisma.skill.delete({ where: { id: skillId } });
}

async removeProject(developerId: string, projectId: string) {
  const project = await this.prisma.project.findUnique({ where: { id: projectId } });
  if (project?.developerId !== developerId) {
    throw new NotFoundException('Project not found');
  }
  await this.prisma.project.delete({ where: { id: projectId } });
}
\`\`\`

Three security micro-patterns:

1. **\`NotFoundException\` for both "doesn't exist" and "not yours."** A \`ForbiddenException\` (403) for "exists but you don't own it" leaks the existence of the resource — an attacker can enumerate IDs to find ones that exist for OTHER users. Returning 404 in both cases prevents the enumeration.
2. **The optional-chain \`skill?.developerId !== developerId\` covers the null case.** If \`findUnique\` returned null (skill doesn't exist), \`undefined !== developerId\` is true → 404. One condition handles both cases.
3. **No transaction.** This is fine here because the worst case of a race (skill deleted between findUnique and delete) is that \`delete\` throws Prisma's \`P2025\` (record not found), which the global error filter would still map to 404. The race window is microseconds and the failure mode is graceful.

\`endorseSkill\` extends the pattern: it adds a \`BadRequestException('Cannot endorse your own skill')\` to prevent self-endorsement, then upserts to the unique constraint \`(skillId, giverId)\` so duplicate endorsements idempotently update rather than error.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nestjs', 'authorization', 'security', 'prisma', 'service-layer'],
    repository: repo,
    filePath: 'apps/backend/src/profile/profile.service.ts',
    url: blob('apps/backend/src/profile/profile.service.ts'),
  },
  {
    title: 'Endorsement upsert with composite unique key for idempotent writes',
    body: `One developer can endorse a given skill exactly once. Rather than checking-then-inserting (race-prone), \`endorseSkill\` uses Prisma's \`upsert\` against a composite unique key — Postgres enforces the invariant atomically.

\`\`\`prisma
model Endorsement {
  id          String    @id @default(cuid())
  skillId     String
  skill       Skill     @relation(fields: [skillId], references: [id], onDelete: Cascade)
  receiverId  String
  giverId     String
  message     String?
  createdAt   DateTime  @default(now())

  @@unique([skillId, giverId]) // one endorsement per skill per giver
  @@map("endorsements")
}
\`\`\`

\`\`\`ts
async endorseSkill(giverId: string, skillId: string, dto: EndorseSkillDto) {
  const skill = await this.prisma.skill.findUnique({ where: { id: skillId } });
  if (!skill) throw new NotFoundException('Skill not found');
  if (skill.developerId === giverId) {
    throw new BadRequestException('Cannot endorse your own skill');
  }

  return this.prisma.endorsement.upsert({
    where: { skillId_giverId: { skillId, giverId } },
    update: { message: dto.message },
    create: {
      skillId, giverId,
      receiverId: skill.developerId,
      message: dto.message,
    },
  });
}
\`\`\`

The \`skillId_giverId\` key is auto-generated by Prisma from the \`@@unique([skillId, giverId])\` declaration — Prisma concats the field names with underscores. The pattern lets the \`upsert\` either update an existing endorsement's message or create a new one with the same single call.

Why upsert over check-then-insert: Two simultaneous endorse clicks (e.g., user double-clicks the button, or React's strict-mode double-fires the mutation in dev) both pass the "does it exist?" check, both try to insert, second one trips the unique constraint and throws. With upsert, both calls converge on the same state without errors.

The pattern recurs anywhere you have "at most one X per (Y, Z)" — votes per (post, user), reactions per (message, user), follows per (follower, followee).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'postgresql', 'upsert', 'idempotency', 'database-design'],
    repository: repo,
    filePath: 'apps/backend/src/profile/profile.service.ts',
    url: blob('apps/backend/src/profile/profile.service.ts'),
  },
  {
    title: 'Profile DTO formatter strips internal fields from API response',
    body: `\`formatProfile\` is the boundary between Prisma's full row shape and the public API. Internal fields (\`id\`, \`isPublic\`, \`password\`) are deliberately omitted; \`createdAt\` is renamed to \`memberSince\`; nested skills/projects are mapped to a flatter shape.

\`\`\`ts
formatProfile(developer: any) {
  return {
    username: developer.username,
    name: developer.name,
    bio: developer.bio,
    avatarUrl: developer.avatarUrl,
    location: developer.location,
    websiteUrl: developer.websiteUrl,
    githubLogin: developer.githubLogin,
    linkedinUrl: developer.linkedinUrl,
    memberSince: developer.createdAt,
    skills: developer.skills.map((skill: any) => ({
      id: skill.id,
      name: skill.name,
      category: skill.category,
      level: skill.level,
      yearsExp: skill.yearsExp,
      endorsementCount: skill.endorsements.length,
      endorsedBy: skill.endorsements.map((e: any) => ({
        username: e.giver.username,
        name: e.giver.name,
        avatarUrl: e.giver.avatarUrl,
        message: e.message,
      })),
    })),
    projects: developer.projects.map((project: any) => ({ /* same idea */ })),
  };
}
\`\`\`

Why an explicit formatter rather than letting Prisma return the raw row:

1. **Internal columns stay internal.** \`password\` (the bcrypt hash) and \`isPublic\` are real columns Prisma returns. Without an explicit allowlist, refactoring to add a sensitive field (verification token, internal score) would silently leak it on the next deploy.
2. **Aggregations happen here, not in the client.** \`endorsementCount: skill.endorsements.length\` is a one-line aggregation that frees every client from re-deriving the same number. Frontend code becomes \`{skill.endorsementCount}\` instead of \`{skill.endorsedBy?.length || 0}\`.
3. **Renames decouple DB schema from API.** \`createdAt → memberSince\` lets you change the column without breaking clients. The boundary is the API contract; the DB schema is internal.

The accompanying tests assert the formatter explicitly: \`expect((result as any).isPublic).toBeUndefined()\`, \`expect((result as any).id).toBeUndefined()\`. Regression-testing the negative case (field NOT present) is the right shape for "don't leak this."`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nestjs', 'api-design', 'data-mapping', 'security', 'serialization'],
    repository: repo,
    filePath: 'apps/backend/src/profile/profile.service.ts',
    url: blob('apps/backend/src/profile/profile.service.ts'),
  },
  {
    title: 'Prisma include with nested orderBy + per-relation field selection',
    body: `Loading a developer profile pulls skills (with their endorsements and the giver's display data) and projects in one query. The shape of the \`include\` is non-trivial — every level orders, every \`giver\` selection trims down to the three fields the UI actually shows.

\`\`\`ts
async getByUsername(username: string) {
  const developer = await this.prisma.developer.findUnique({
    where: { username },
    include: {
      skills: {
        include: {
          endorsements: {
            include: {
              giver: {
                select: { username: true, name: true, avatarUrl: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: [{ level: 'desc' }, { name: 'asc' }],
      },
      projects: {
        orderBy: [{ isHighlight: 'desc' }, { startedAt: 'desc' }],
      },
    },
  });

  if (!developer?.isPublic) {
    throw new NotFoundException(\`Developer @\${username} not found\`);
  }
  return this.formatProfile(developer);
}
\`\`\`

Three optimisations:

1. **\`select: { username, name, avatarUrl }\`** on the giver explicitly omits \`email\`, \`password\`, \`createdAt\` etc. Prisma defaults to "all scalar fields" when you use \`include\`; switching to \`select\` for nested-too-deep relations cuts both bytes-on-wire and accidental data leaks.
2. **Compound \`orderBy: [{ isHighlight: 'desc' }, { startedAt: 'desc' }]\`** on projects pins highlighted ones to the top, then orders the rest by recency. The frontend can then just iterate without re-sorting client-side.
3. **The privacy check happens AFTER the query**, comparing against \`isPublic\`. Doing it as part of the where-clause (\`where: { username, isPublic: true }\`) would also work, but separating the concern lets the same query return private profiles for the owner via a separate code path later.

Resolving everything in one query is critical for a profile page — N+1 here would be brutal (1 dev + N skills × M endorsements + L projects round-trips). One query, one transaction, one network hop.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'postgresql', 'query-optimization', 'n-plus-one', 'nested-includes'],
    repository: repo,
    filePath: 'apps/backend/src/profile/profile.service.ts',
    url: blob('apps/backend/src/profile/profile.service.ts'),
  },
  {
    title: 'class-validator DTOs with @ApiProperty for auto-generated Swagger',
    body: `\`RegisterDto\` declares the request shape with both class-validator decorators (for runtime validation) and \`@ApiProperty\` (for Swagger docs). One source of truth; two consumers.

\`\`\`ts
export class RegisterDto {
  @ApiProperty({ example: 'shailesh93602' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'Shailesh Chaudhari' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'shailesh@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'securepassword123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Software Engineer', required: false })
  @IsOptional()
  @IsString()
  bio?: string;
}
\`\`\`

The global ValidationPipe (configured in \`main.ts\` with \`whitelist: true\`) walks these decorators on every request, rejecting unknown fields and 400-ing on validation failures. The DTO is also the type the controller method receives, so misspelling \`developer.bio\` somewhere downstream is a TypeScript error at compile time.

Two patterns:

1. **\`@IsOptional()\` MUST come before any "value-required" validators** like \`@IsString\`. class-validator runs decorators in metadata order; without \`@IsOptional\` first, \`@IsString\` rejects \`undefined\` and the field becomes secretly required.
2. **\`@ApiProperty({ example })\`** seeds Swagger's "Try it out" form with realistic values. Reviewers playing with the doc don't have to invent test data — they hit Send and it works against the local DB. Combined with \`@ApiResponse({ status, description })\` on the controller, the doc is genuinely usable.

Compare to \`CreateProjectDto\` which uses \`@IsArray() @IsString({ each: true })\` for techStack and \`@IsUrl()\` on optional URLs — the validators map almost 1:1 to the kind of free-text inputs you'd otherwise have to validate by hand.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nestjs', 'class-validator', 'dto', 'swagger', 'validation'],
    repository: repo,
    filePath: 'apps/backend/src/auth/dto/register.dto.ts',
    url: blob('apps/backend/src/auth/dto/register.dto.ts'),
  },
  {
    title: 'PrismaService lifecycle hooks for graceful connect/disconnect',
    body: `\`PrismaService\` extends \`PrismaClient\` and implements two NestJS lifecycle interfaces — \`OnModuleInit\` to open the DB connection at boot, and \`OnModuleDestroy\` to close it cleanly on shutdown.

\`\`\`ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
\`\`\`

This is the canonical NestJS+Prisma integration pattern. Three things it gets right:

1. **Extending \`PrismaClient\` directly** lets every Prisma method (\`prisma.developer.findMany\`, \`prisma.$transaction\`, etc.) work as-is with no wrapping. Services inject \`PrismaService\` and use it as if it WERE the client — because it is.
2. **\`onModuleInit → $connect\`** opens the pool eagerly. Without it, the first DB query at request-time pays the connection cost — visible in p99 latency right after a deploy. Calling it at module init front-loads the cost to boot.
3. **\`onModuleDestroy → $disconnect\`** matters for graceful shutdown. SIGTERM in containerised deploys triggers Nest's shutdown hooks; without disconnect, in-flight queries get killed mid-flight and the pool emits "connection terminated" warnings.

The companion \`DatabaseModule\` declares it once with \`@Global()\` so every other module gets it via DI without re-importing:

\`\`\`ts
@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class DatabaseModule {}
\`\`\`

\`@Global()\` is one of the few NestJS features worth using sparingly — for cross-cutting infra like the DB client, it eliminates boilerplate. For feature-scoped services it would create unwanted coupling.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nestjs', 'prisma', 'lifecycle-hooks', 'dependency-injection', 'graceful-shutdown'],
    repository: repo,
    filePath: 'apps/backend/src/database/prisma.service.ts',
    url: blob('apps/backend/src/database/prisma.service.ts'),
  },
  {
    title: 'AppModule wiring: ConfigModule + Bull + Schedule + Throttler in one place',
    body: `\`AppModule\` is the single composition root. Every cross-cutting infra module is configured here with values from env, so feature modules don't have to know whether Redis is on localhost or Upstash.

\`\`\`ts
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
        limit: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 10,
      },
    ]),
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
      },
    }),
    DatabaseModule,
    AuthModule,
    ProfileModule,
    ProjectModule,
    AiModule,
    IntegrationsModule,
  ],
})
export class AppModule {}
\`\`\`

Three wiring details worth copying:

1. **\`ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] })\`** loads \`.env.local\` first (gitignored, per-developer overrides) then falls back to \`.env\` (committed defaults). \`isGlobal\` skips the per-module re-import.
2. **\`parseInt(... ) || default\` for env-derived numbers.** \`process.env.RATE_LIMIT_WINDOW_MS\` is always a string; without \`parseInt\`, the throttler gets \`"60000"\` and treats it as garbage. The \`|| default\` covers both unset (\`undefined\`) and unparseable (\`NaN\`) cases.
3. **Feature modules import \`DatabaseModule\`/\`AuthModule\` indirectly.** Each lists its own service providers; cross-module needs (Prisma, JWT) are handled by AuthModule + DatabaseModule being global/exported — no transitive imports.

The pattern keeps each feature module self-contained: \`AuthModule\` knows nothing about Bull or scheduling, \`ProfileModule\` knows nothing about Redis. Adding a queue to one feature is a one-line \`BullModule.registerQueue\` import in that module.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nestjs', 'modules', 'configuration', 'composition', 'dependency-injection'],
    repository: repo,
    filePath: 'apps/backend/src/app.module.ts',
    url: blob('apps/backend/src/app.module.ts'),
  },
  {
    title: 'Slim test module pattern: Test.createTestingModule with overrideProvider',
    body: `The e2e tests don't import the full \`AppModule\` — that would require Redis, Mongo, OpenAI, AWS to all be reachable. Instead they declare a \`TestAppModule\` that imports only the modules under test, then override \`PrismaService\` with a mock.

\`\`\`ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    ProfileModule,
  ],
})
class TestAppModule {}

const mockPrisma = {
  developer: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
};

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [TestAppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(mockPrisma)
    .compile();

  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
  );
  await app.init();
});
\`\`\`

The pattern works because NestJS's DI container resolves \`PrismaService\` lazily — when you override the provider, every \`@Injectable()\` that depends on it gets the mock without code changes. \`AuthService\`, \`ProfileService\`, etc. all suddenly point at \`mockPrisma\`.

Three details:

1. **\`mockPrisma\` mocks \`$connect\` and \`$disconnect\`** as resolved promises so the lifecycle hooks don't crash at \`app.init()\`. Forgetting these is the #1 e2e test failure on the first run.
2. **The same \`ValidationPipe\` config from \`main.ts\` is repeated.** Without it, the test's POST requests with extra fields wouldn't get rejected and validation tests would silently pass against incomplete behaviour.
3. **\`request(app.getHttpServer())\`** uses supertest against the actual underlying Express handler, so URL parsing, header parsing, status codes etc. all behave exactly like prod. Real HTTP semantics, mocked DB.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nestjs', 'testing', 'jest', 'supertest', 'e2e'],
    repository: repo,
    filePath: 'apps/backend/test/app.e2e-spec.ts',
    url: blob('apps/backend/test/app.e2e-spec.ts'),
  },
  {
    title: 'AuthService unit test that asserts the password is actually hashed',
    body: `Most auth tests check "did the service call create?" — fewer check "did it hash the password before storing?" The AuthService spec inspects the value passed to \`prisma.developer.create\` and runs \`bcrypt.compare\` against it.

\`\`\`ts
it('hashes the password before storing', async () => {
  prisma.developer.findUnique.mockResolvedValue(null);
  prisma.developer.create.mockResolvedValue(mockDeveloper);

  await service.register({
    username: 'shailesh', name: 'Shailesh Chaudhari',
    email: 'shailesh@example.com', password: 'password123',
  });

  const createCall = prisma.developer.create.mock.calls[0][0];
  expect(createCall.data.password).not.toBe('password123');
  const valid = await bcrypt.compare('password123', createCall.data.password);
  expect(valid).toBe(true);
});

it('throws ConflictException when email already registered', async () => {
  prisma.developer.findUnique.mockResolvedValue(mockDeveloper);
  await expect(
    service.register({
      username: 'other', name: 'Other',
      email: 'shailesh@example.com', password: 'password123',
    })
  ).rejects.toThrow(ConflictException);
  expect(prisma.developer.create).not.toHaveBeenCalled();
});
\`\`\`

What the "hashed" test catches that a simpler test wouldn't:

1. **Regressions where someone disables hashing in dev** ("just temporarily, to debug") and forgets to re-enable it. Reading from \`mock.calls[0][0]\` and asserting on the actual stored value is bulletproof against any refactor that bypasses bcrypt.
2. **Wrong cost factor.** If the test starts failing with "compare is too slow," someone bumped cost from 10 to 16 and forgot to extend the test timeout — visible immediately, not at the next perf regression.

The conflict test is paired: \`expect(prisma.developer.create).not.toHaveBeenCalled()\`. Without that assertion, the test would still pass if the service swallowed the conflict and inserted anyway — the negative assertion catches the bug, not just the happy path.

The login spec includes the same defensive shape: separate tests for "email not found" and "wrong password," both expected to throw \`UnauthorizedException\` with the same message ("Invalid credentials") to prevent enumeration leaks.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nestjs', 'jest', 'testing', 'bcrypt', 'security-testing'],
    repository: repo,
    filePath: 'apps/backend/src/auth/auth.service.spec.ts',
    url: blob('apps/backend/src/auth/auth.service.spec.ts'),
  },
  {
    title: 'Prisma seed script with upsert for repeatable dev fixtures',
    body: `The seed script creates two developers, three skills, two projects, and one cross-developer endorsement. Every write is an \`upsert\`, so re-running the script never errors on re-create.

\`\`\`ts
const shailesh = await prisma.developer.upsert({
  where: { username: 'shailesh93602' },
  update: {},
  create: {
    username: 'shailesh93602',
    email: 'shailesh@example.com',
    name: 'Shailesh Chaudhari',
    bio: 'Full-stack developer specialising in distributed systems and TypeScript.',
    location: 'India',
    websiteUrl: 'https://shaileshchaudhari.vercel.app',
    githubLogin: 'Shailesh93602',
    isPublic: true,
  },
});

const nestjsSkill = await prisma.skill.upsert({
  where: { developerId_name: { developerId: shailesh.id, name: 'NestJS' } },
  update: {},
  create: {
    developerId: shailesh.id,
    name: 'NestJS',
    category: SkillCategory.FRAMEWORK,
    level: SkillLevel.ADVANCED,
    yearsExp: 2,
  },
});

await prisma.endorsement.upsert({
  where: { skillId_giverId: { skillId: nestjsSkill.id, giverId: alice.id } },
  update: {},
  create: {
    skillId: nestjsSkill.id,
    receiverId: shailesh.id,
    giverId: alice.id,
    message: 'Built a production-grade NestJS API with Redlock and circuit breakers.',
  },
});
\`\`\`

Three things to copy:

1. **\`update: {}\` (empty object) means "if the row exists, change nothing."** This is the right default for seed data — re-running shouldn't clobber any local edits. If you DO want to refresh a field on every seed (e.g. always-latest \`bio\`), put it in \`update\` too.
2. **The composite-key shape \`developerId_name: { developerId, name }\`** is Prisma's auto-generated key for \`@@unique([developerId, name])\`. Same for \`skillId_giverId\` on Endorsement. Re-running the seed with the same composite key updates rather than duplicates.
3. **Hard-coded \`id: 'eduscale-seed-id'\`** on the projects (in the full seed file) makes the seed deterministic. Without it, every re-seed would create new project ids and any other test relying on those ids would break.

Run via \`npm run db:seed\` from \`apps/backend\`. The \`finally\` block calls \`prisma.$disconnect()\` so the script doesn't hang — without it, the Node process stays alive waiting for the open pool.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['prisma', 'seed', 'database', 'idempotency', 'fixtures'],
    repository: repo,
    filePath: 'apps/backend/prisma/seed.ts',
    url: blob('apps/backend/prisma/seed.ts'),
  },
  {
    title: 'Axios singleton with request interceptor for JWT and 401 cleanup',
    body: `The frontend creates one axios instance with two interceptors: one to attach the bearer token on every request, one to clear localStorage on a 401 response.

\`\`\`ts
import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: \`\${BASE_URL}/api\`,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT on every request
api.interceptors.request.use(config => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('cg_token');
    if (token) {
      config.headers.Authorization = \`Bearer \${token}\`;
    }
  }
  return config;
});

// On 401 clear stale token
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('cg_token');
      localStorage.removeItem('cg_user');
    }
    return Promise.reject(err);
  }
);
\`\`\`

Three details to copy:

1. **\`typeof window !== 'undefined'\` guard** because Next.js renders pages on the server first. localStorage doesn't exist there; reading it would throw and break SSR. The interceptor runs in both contexts so the guard is mandatory.
2. **The 401 cleanup is fire-and-forget.** It removes the bad token but doesn't redirect — the calling component's \`onError\` handler decides what to do (toast + redirect to login is the typical follow-up in this codebase). Centralising the redirect would couple the API layer to a router.
3. **The interceptor still calls \`Promise.reject(err)\`.** Forgetting this turns 401s into "successful" responses with undefined data, which then crashes the component reading \`.data\`. Always re-throw in error interceptors unless you're explicitly recovering.

Pair with \`saveAuth(token, user)\` in \`lib/auth.ts\` which writes both keys, and the round-trip is symmetric: login writes both, 401 clears both, every request reads the token.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['axios', 'nextjs', 'jwt', 'interceptors', 'api-client'],
    repository: repo,
    filePath: 'apps/frontend/src/lib/api.ts',
    url: blob('apps/frontend/src/lib/api.ts'),
  },
  {
    title: 'localStorage auth helpers with safe JSON parse and SSR guards',
    body: `\`lib/auth.ts\` is four small helpers that wrap localStorage access with TypeScript types and SSR safety. Every read is wrapped in a try/catch + null guard so a corrupted localStorage entry doesn't crash the app.

\`\`\`ts
export interface StoredUser {
  id: string;
  username: string;
  name: string;
  email: string;
}

export function saveAuth(token: string, user: StoredUser) {
  localStorage.setItem('cg_token', token);
  localStorage.setItem('cg_user', JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem('cg_token');
  localStorage.removeItem('cg_user');
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('cg_token');
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('cg_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}
\`\`\`

The patterns:

1. **The \`cg_\` namespace prefix** prevents collisions with other apps in the same domain. If a future feature shares the origin (e.g. a marketing site at \`/\` and the app at \`/app\`), the prefix keeps the keys separate.
2. **Try/catch on \`JSON.parse\`** because localStorage is plain text any user can edit via DevTools. A malformed JSON throws synchronously — without the catch, the React component reading \`getStoredUser()\` would crash on first render. Returning \`null\` lets the UI fall through to the "logged out" branch.
3. **The SSR guard returns \`null\` rather than throwing.** \`/[username]/page.tsx\` calls \`getStoredUser()\` inside a \`useEffect\` so it only runs client-side, but other paths might call it from a render pass. Returning null preserves the same shape and the consumers handle null correctly.

The pair (\`saveAuth\` + \`clearAuth\`) keeps the two keys (token + user object) in sync — there's no path where you'd write one without the other. That's an explicit contract the API interceptor relies on (it clears both on 401).`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nextjs', 'localstorage', 'ssr', 'typescript', 'auth'],
    repository: repo,
    filePath: 'apps/frontend/src/lib/auth.ts',
    url: blob('apps/frontend/src/lib/auth.ts'),
  },
  {
    title: 'react-query optimistic update with rollback on error',
    body: `\`useEndorseSkill\` does the textbook optimistic-mutation dance: cancel in-flight queries, snapshot current data, apply the optimistic update, return the snapshot for rollback in \`onError\`, and invalidate on \`onSuccess\` to fetch fresh server state.

\`\`\`ts
export function useEndorseSkill(username: string) {
  const queryClient = useQueryClient();

  return useMutation(
    async ({ skillId, message }: { skillId: string; message?: string }) => {
      const res = await api.post(
        \`/profile/\${username}/skills/\${skillId}/endorse\`,
        { message }
      );
      return res.data;
    },
    {
      onMutate: async ({ skillId }) => {
        await queryClient.cancelQueries(['profile', username]);
        const prev = queryClient.getQueryData<Profile>(['profile', username]);

        if (prev) {
          queryClient.setQueryData<Profile>(['profile', username], {
            ...prev,
            skills: prev.skills.map(s =>
              s.id === skillId
                ? { ...s, endorsementCount: s.endorsementCount + 1 }
                : s
            ),
          });
        }
        return { prev };
      },
      onError: (_err, _vars, ctx) => {
        if (ctx?.prev) {
          queryClient.setQueryData(['profile', username], ctx.prev);
        }
        toast.error('Could not endorse skill');
      },
      onSuccess: () => {
        queryClient.invalidateQueries(['profile', username]);
        toast.success('Skill endorsed');
      },
    }
  );
}
\`\`\`

Four sequencing details:

1. **\`cancelQueries\` first.** If a refetch is in flight when the user clicks Endorse, its response would arrive AFTER the optimistic update and clobber it. Cancelling guarantees the optimistic state wins.
2. **The snapshot returned from \`onMutate\` is the third argument to \`onError\`** (\`ctx.prev\`). React Query passes it through; you don't have to store it in a ref.
3. **\`invalidateQueries\` on success**, not \`setQueryData(serverResponse)\`. The server response is the new endorsement row, not the full profile — invalidating triggers a refetch that gets the canonical state including any concurrent changes from other users.
4. **Toast inside the mutation hook**, not the component. Centralising user feedback here means every consumer of the hook gets the same UX — calling \`endorse.mutate(...)\` from anywhere produces the same success/error toast.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react-query', 'optimistic-updates', 'react', 'mutations', 'state-management'],
    repository: repo,
    filePath: 'apps/frontend/src/hooks/useProfile.ts',
    url: blob('apps/frontend/src/hooks/useProfile.ts'),
  },
  {
    title: 'QueryClient as useState lazy initializer to survive Strict Mode',
    body: `\`Providers\` wraps the app in \`QueryClientProvider\`, but the QueryClient is created via \`useState(() => new QueryClient(...))\` rather than a module-level constant. The lazy-init function runs exactly once per mount — critical for React Strict Mode and for SSR.

\`\`\`tsx
'use client';

import { ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';

interface ProvidersProps { children: ReactNode; }

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}
\`\`\`

Why \`useState\` with a function and not a top-level \`const\`:

1. **Top-level \`const queryClient = new QueryClient(...)\`** is shared across server requests in Next.js. One user's cached profile leaks to another because the server module is reused. Instantiating per render keeps each request isolated.
2. **\`new QueryClient()\` directly inside the component** runs on every render — wasteful and would invalidate all cached queries every keystroke. The \`useState\` lazy initializer runs the function exactly once per mount, then memoises the result.
3. **\`refetchOnWindowFocus: false\`** is a deliberate UX choice. The default behaviour refetches on tab switch, which is great for dashboards but disorienting for profile pages that should be stable while you read them. \`retry: 1\` means one automatic retry on network failure before surfacing the error.

The same pattern applies in App Router projects without changes — \`'use client'\` on the Providers file is the only Next-specific bit.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react-query', 'react', 'nextjs', 'app-router', 'state-management'],
    repository: repo,
    filePath: 'apps/frontend/src/app/providers.tsx',
    url: blob('apps/frontend/src/app/providers.tsx'),
  },
  {
    title: 'react-hook-form with inline regex validators and accessible errors',
    body: `The login page uses react-hook-form's \`register\` API with inline validation rules, then renders the per-field error messages directly under each input. Each input has \`autoComplete\` set so password managers and browser autofill work.

\`\`\`tsx
const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();

async function onSubmit(data: LoginForm) {
  setLoading(true);
  try {
    const res = await api.post<AuthResponse>('/auth/login', data);
    saveAuth(res.data.access_token, res.data.developer);
    toast.success(\`Welcome back, \${res.data.developer.name}!\`);
    router.push(\`/\${res.data.developer.username}\`);
  } catch (err: any) {
    const msg = err?.response?.data?.message || 'Invalid credentials';
    toast.error(msg);
  } finally {
    setLoading(false);
  }
}

<form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
  <input
    id="email"
    type="email"
    autoComplete="email"
    {...register('email', {
      required: 'Email is required',
      pattern: { value: /\\S+@\\S+\\.\\S+/, message: 'Enter a valid email' },
    })}
  />
  {errors.email && (
    <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
  )}
</form>
\`\`\`

Four details:

1. **\`noValidate\` on the \`<form>\`** disables the browser's native HTML5 validation. Without it, you get duplicate error UI — the browser's "Please fill in this field" tooltip plus your custom red text. Pick one source of truth.
2. **\`autoComplete="email"\` and \`autoComplete="current-password"\`** trigger 1Password / Bitwarden autofill. The register page uses \`new-password\` instead, which tells password managers to suggest a generated one rather than autofill an existing.
3. **Errors are inline, scoped to the input** by id. Screen readers announce them as the user tabs through the form. Toasts (used for server-side errors like wrong password) are global and announced by aria-live regions inside react-hot-toast.
4. **\`err?.response?.data?.message\`** with optional chaining handles the cases where the server is down (no response object) or returned a non-JSON error. The \`||\` fallback gives a sensible default user message.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react-hook-form', 'forms', 'accessibility', 'react', 'validation'],
    repository: repo,
    filePath: 'apps/frontend/src/app/login/page.tsx',
    url: blob('apps/frontend/src/app/login/page.tsx'),
  },
  {
    title: 'Username regex validator pinned to a 3–30 char URL-safe alphabet',
    body: `The register form constrains usernames to \`/^[a-zA-Z0-9_-]{3,30}$/\` — letters, digits, underscore, hyphen, 3–30 characters. The same regex is duplicated server-side in \`packages/utils/src/validation-utils.ts\`. Keeping both in sync matters because the username becomes part of every profile URL.

\`\`\`tsx
<input
  id="username"
  type="text"
  autoComplete="username"
  placeholder="shailesh93602"
  {...register('username', {
    required: 'Username is required',
    pattern: {
      value: /^[a-zA-Z0-9_-]{3,30}$/,
      message: 'Letters, numbers, _ and - only (3–30 chars)',
    },
  })}
/>
\`\`\`

\`\`\`ts
// packages/utils/src/validation-utils.ts
export const isValidUsername = (username: string): boolean => {
  const usernameRegex = /^[a-zA-Z0-9_-]{3,30}$/;
  return usernameRegex.test(username);
};
\`\`\`

Why this exact alphabet:

1. **No dots or slashes** — the username is concatenated into the URL path (\`careerglyph.app/{username}\`), and special characters would either need escaping or break Next.js's dynamic route matching.
2. **Underscore and hyphen but not period.** Hyphens are URL-friendly and standard for handles; underscores are a holdover from old-school internet identifiers. Periods are excluded specifically because they confuse regex parsers, file systems, and auto-link detectors in chat tools (which would link \`@user.name\` as one word but then split on the period).
3. **3-character minimum** prevents single-letter squatting; 30-character maximum keeps URLs readable and database keys bounded.

The form shows the URL prefix inline (\`careerglyph.app/\`) so users see the resulting URL as they type. That visual cue is what makes the alphabet rules obvious — without it, "why won't it accept \`shail.dev\`?" is a frequent support ticket.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['validation', 'regex', 'react-hook-form', 'url-design', 'usability'],
    repository: repo,
    filePath: 'apps/frontend/src/app/register/page.tsx',
    url: blob('apps/frontend/src/app/register/page.tsx'),
  },
  {
    title: 'Public profile page with viewer-aware endorse/remove buttons',
    body: `The dynamic \`/[username]\` page reads two pieces of state: the public profile (via react-query, no auth needed) and the viewer's own username (read from localStorage on mount). Skill cards then conditionally show "Endorse," "Remove," or nothing at all based on the viewer-vs-owner relationship.

\`\`\`tsx
'use client';

export default function ProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params.username;

  const { data: profile, isLoading, isError } = useProfile(username);
  const [viewerUsername, setViewerUsername] = useState<string | null>(null);

  useEffect(() => {
    const user = getStoredUser();
    setViewerUsername(user?.username ?? null);
  }, []);

  // ...
  return (
    /* ... */
    <SkillCard
      skill={skill}
      profileUsername={username}
      viewerUsername={viewerUsername}
    />
  );
}

function SkillCard({ skill, profileUsername, viewerUsername }) {
  const isOwnProfile = viewerUsername === profileUsername;
  const alreadyEndorsed = viewerUsername
    ? skill.endorsedBy.some(e => e.username === viewerUsername)
    : false;

  return (
    /* ... */
    {viewerUsername && !isOwnProfile && (
      alreadyEndorsed
        ? <button onClick={() => removeEndorsement.mutate(skill.id)}>Remove</button>
        : <button onClick={() => endorse.mutate({ skillId: skill.id })}>Endorse</button>
    )}
  );
}
\`\`\`

Four UX patterns:

1. **viewerUsername read in useEffect**, not at render time. localStorage isn't available during SSR; reading it after mount avoids hydration mismatches.
2. **Three states for the action button**: no button (logged out), no button (own profile — can't self-endorse), Endorse button (already endorsed → Remove button instead). The state machine is encoded in the JSX with two booleans.
3. **\`endorsedBy\` includes the giver username**, so "have I already endorsed this?" is a client-side \`.some()\` check against the cached profile. No extra API call needed.
4. **\`alreadyEndorsed\` recomputes from the cached profile data**, so the optimistic update from \`useEndorseSkill\` (which bumps the count) doesn't toggle the button — you'd want to add the giver's username to \`endorsedBy\` in the optimistic update for a fully-symmetric UX.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['react', 'nextjs', 'app-router', 'react-query', 'authorization'],
    repository: repo,
    filePath: 'apps/frontend/src/app/[username]/page.tsx',
    url: blob('apps/frontend/src/app/[username]/page.tsx'),
  },
  {
    title: 'Docker Compose for local Postgres + MongoDB + Redis with named volumes',
    body: `\`docker-compose.yml\` boots the entire local infra in one command. Three services (Postgres for relational data, MongoDB for project metadata, Redis for queue/cache), each with a named volume so data persists across \`docker-compose down\`.

\`\`\`yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: careerglyph-postgres
    environment:
      POSTGRES_USER: careerglyph
      POSTGRES_PASSWORD: development
      POSTGRES_DB: careerglyph_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init-db.sql
    networks:
      - careerglyph-network

  mongodb:
    image: mongo:7-jammy
    # ...

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - careerglyph-network

volumes:
  postgres_data:
  mongodb_data:
  redis_data:

networks:
  careerglyph-network:
    driver: bridge
\`\`\`

Four production-style choices in a dev compose file:

1. **\`-alpine\` images** keep download size to ~80MB instead of 200MB+. Faster initial pull, less disk usage, fewer CVEs in unused Debian packages.
2. **Named volumes** (\`postgres_data\`) instead of bind mounts (\`./data:/var/lib/...\`). Named volumes are managed by Docker, survive container recreation, and don't leave stale files in your repo dir.
3. **Init script via \`/docker-entrypoint-initdb.d/init-db.sql\`** runs ONCE on first boot of an empty database. Postgres images mount this dir and execute every \`.sql\` / \`.sh\` file alphabetically. Re-runs of \`docker-compose up\` skip it because the data dir already exists — perfect for one-time schema bootstraps.
4. **Custom bridge network \`careerglyph-network\`** lets services reach each other by container name (\`postgres:5432\` instead of localhost). Less surprising than the default network and makes future multi-container compositions easier.`,
    contentType: 'REPOSITORY_FILE',
    language: 'yaml',
    tags: ['docker', 'docker-compose', 'devops', 'postgres', 'redis'],
    repository: repo,
    filePath: 'docker-compose.yml',
    url: blob('docker-compose.yml'),
  },
  {
    title: 'NestJS test harness: mock Prisma + fakeReq for guard-protected controllers',
    body: `\`profile.controller.spec.ts\` mocks the entire ProfileService and constructs fake \`req.user\` objects with a single helper. Guards aren't applied in unit tests (Nest's TestingModule skips them by default), so the controller is exercised as if auth had already passed.

\`\`\`ts
const fakeReq = (id: string) => ({ user: { id } });

describe('ProfileController', () => {
  let controller: ProfileController;
  let service: jest.Mocked<ProfileService>;

  beforeEach(async () => {
    const serviceMock = {
      getByUsername: jest.fn(),
      getHealth: jest.fn(),
      updateProfile: jest.fn(),
      addSkill: jest.fn(),
      removeSkill: jest.fn(),
      addProject: jest.fn(),
      removeProject: jest.fn(),
      endorseSkill: jest.fn(),
      removeEndorsement: jest.fn(),
    };
    const module = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [{ provide: ProfileService, useValue: serviceMock }],
    }).compile();

    controller = module.get<ProfileController>(ProfileController);
    service = module.get(ProfileService);
  });

  describe('updateProfile', () => {
    it('calls service.updateProfile with the authenticated user id and dto', async () => {
      const dto = { name: 'Updated Name', bio: 'Updated bio' };
      service.updateProfile.mockResolvedValue(mockProfile as any);
      const result = await controller.updateProfile(fakeReq('dev-1') as any, dto as any);
      expect(service.updateProfile).toHaveBeenCalledWith('dev-1', dto);
      expect(result).toEqual(mockProfile);
    });
  });
});
\`\`\`

Three patterns:

1. **\`jest.Mocked<ProfileService>\`** gives every method full Jest mock typings without manually declaring each one — \`service.updateProfile.mockResolvedValue\` is type-checked.
2. **Guard skipping** is intentional. Unit tests of controllers verify the controller's wiring (does it pass req.user.id correctly, does it return what the service returns, does it propagate errors). Auth and validation are tested in their own specs and integrated in the e2e tests.
3. **Error-propagation tests are explicit.** \`service.updateProfile.mockRejectedValue(new NotFoundException(...))\` and \`await expect(...).rejects.toThrow(NotFoundException)\` proves the controller doesn't accidentally swallow exceptions — which would silently 200-OK on a not-found scenario.

The companion \`auth.controller.spec.ts\` follows the same shape with mock services for register and login. Service-layer specs are separate (\`profile.service.spec.ts\`, \`auth.service.spec.ts\`) and mock Prisma instead.`,
    contentType: 'REPOSITORY_FILE',
    language: 'typescript',
    tags: ['nestjs', 'jest', 'testing', 'mocking', 'controllers'],
    repository: repo,
    filePath: 'apps/backend/src/profile/profile.controller.spec.ts',
    url: blob('apps/backend/src/profile/profile.controller.spec.ts'),
  },
];
