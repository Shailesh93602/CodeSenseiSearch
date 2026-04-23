import { loadEnv } from '../env';

const VALID_BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(32),
};

describe('loadEnv', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('returns a typed env object when required vars are set', () => {
    const env = loadEnv({ ...VALID_BASE });

    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3001);
    expect(env.FRONTEND_URL).toBe('http://localhost:3000');
    expect(env.REDIS_HOST).toBe('localhost');
    expect(env.REDIS_PORT).toBe(6379);
    expect(env.JWT_SECRET).toBe(VALID_BASE.JWT_SECRET);
  });

  it('throws and logs every offence when DATABASE_URL is missing', () => {
    expect(() => loadEnv({ JWT_SECRET: 'a'.repeat(32) } as any)).toThrow(
      /Environment validation failed/,
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
    const allLogged = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allLogged).toMatch(/DATABASE_URL/);
  });

  it('rejects a too-short JWT_SECRET with a helpful message', () => {
    expect(() =>
      loadEnv({ ...VALID_BASE, JWT_SECRET: 'short' } as any),
    ).toThrow(/Environment validation failed/);
    const logged = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toMatch(/openssl rand -hex 32/);
  });

  it('coerces numeric env vars from string', () => {
    const env = loadEnv({
      ...VALID_BASE,
      API_PORT: '4000',
      REDIS_PORT: '6380',
      REDIS_DB: '2',
    } as any);

    expect(env.API_PORT).toBe(4000);
    expect(env.REDIS_PORT).toBe(6380);
    expect(env.REDIS_DB).toBe(2);
  });

  it('rejects a non-numeric API_PORT', () => {
    expect(() =>
      loadEnv({ ...VALID_BASE, API_PORT: 'not-a-number' } as any),
    ).toThrow(/Environment validation failed/);
  });

  it('rejects a malformed FRONTEND_URL', () => {
    expect(() =>
      loadEnv({ ...VALID_BASE, FRONTEND_URL: 'not a url' } as any),
    ).toThrow(/Environment validation failed/);
  });

  it('treats SWAGGER_ENABLED=true as truthy and rejects "maybe"', () => {
    expect(loadEnv({ ...VALID_BASE, SWAGGER_ENABLED: 'true' } as any)).toBeDefined();
    expect(loadEnv({ ...VALID_BASE, SWAGGER_ENABLED: '1' } as any)).toBeDefined();
    expect(() =>
      loadEnv({ ...VALID_BASE, SWAGGER_ENABLED: 'maybe' } as any),
    ).toThrow(/Environment validation failed/);
  });

  it('keeps GitHub OAuth vars optional', () => {
    const env = loadEnv({ ...VALID_BASE });
    expect(env.GITHUB_CLIENT_ID).toBeUndefined();
    expect(env.GITHUB_CLIENT_SECRET).toBeUndefined();
  });

  it('accepts NODE_ENV=production', () => {
    const env = loadEnv({ ...VALID_BASE, NODE_ENV: 'production' } as any);
    expect(env.NODE_ENV).toBe('production');
  });
});
