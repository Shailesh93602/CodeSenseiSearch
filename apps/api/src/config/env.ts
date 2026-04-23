/**
 * Single source of truth for runtime configuration.
 *
 * Validates `process.env` at startup with Zod and exposes a typed
 * `Env` object so callers don't have to reach for `process.env.X`
 * directly. If a required variable is missing or malformed, we
 * print every offence and exit non-zero before the HTTP listener
 * binds — so failures show up at boot rather than as mysterious
 * 500s on the first request that touches the missing key.
 *
 * Add a new env var? Update the schema below; everything else
 * follows from the inferred type.
 */
import { z } from 'zod';

const truthyString = z
  .string()
  .transform((v) => v.toLowerCase())
  .refine((v) => v === 'true' || v === '1' || v === 'yes', {
    message: 'expected "true", "1", or "yes"',
  });

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // Networking
  API_PORT: z.coerce.number().int().positive().default(3001),
  FRONTEND_URL: z.url().default('http://localhost:3000'),

  // Database
  DATABASE_URL: z.url({ message: 'DATABASE_URL must be a valid postgres URL' }),

  // Redis (BullMQ + cache)
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),

  // Auth — required, no fallback. Missing → boot fails. Generate with
  // `openssl rand -hex 32`.
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 chars (use openssl rand -hex 32)'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 chars')
    .optional(),

  // GitHub OAuth — optional, only required if a user actually triggers
  // the GitHub login flow. Code paths short-circuit when missing.
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CALLBACK_URL: z.url().optional(),
  GITHUB_TOKEN: z.string().optional(),

  // Gemini — required for embedding + search to work, but the service
  // already short-circuits with a warning when missing so the API can
  // still boot for non-embedding routes (auth, admin metadata).
  GEMINI_API_KEY: z.string().optional(),

  // Optional toggles
  SWAGGER_ENABLED: truthyString.optional(),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .optional(),

  // Sentry — optional. When unset, instrument.ts skips Sentry.init()
  // entirely so local dev runs without it.
  SENTRY_DSN: z.url().optional(),
  SENTRY_RELEASE: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce
    .number()
    .min(0)
    .max(1)
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(rawEnv: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    // eslint-disable-next-line no-console -- intentional pre-logger boot output
    console.error('\n❌ Invalid environment configuration:\n');
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.') || '(root)';
      // eslint-disable-next-line no-console
      console.error(`  • ${path}: ${issue.message}`);
    }
    // eslint-disable-next-line no-console
    console.error(
      '\nFix the variables above (see apps/api/.env.example) and restart.\n',
    );
    throw new Error('Environment validation failed');
  }

  return parsed.data;
}
