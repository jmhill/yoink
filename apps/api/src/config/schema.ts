import { z } from 'zod';

// Database configuration - discriminated union
const SqliteDatabaseConfigSchema = z.object({
  type: z.literal('sqlite'),
  path: z.string(),
});

const MemoryDatabaseConfigSchema = z.object({
  type: z.literal('memory'),
});

export const DatabaseConfigSchema = z.discriminatedUnion('type', [
  SqliteDatabaseConfigSchema,
  MemoryDatabaseConfigSchema,
]);

// Clock configuration - discriminated union
const SystemClockConfigSchema = z.object({
  type: z.literal('system'),
});

const FakeClockConfigSchema = z.object({
  type: z.literal('fake'),
  startTime: z.coerce.date().optional(),
  autoAdvanceMs: z.number().optional(),
});

export const ClockConfigSchema = z.discriminatedUnion('type', [
  SystemClockConfigSchema,
  FakeClockConfigSchema,
]);

// IdGenerator configuration - discriminated union
const UuidGeneratorConfigSchema = z.object({
  type: z.literal('uuid'),
});

const SequentialGeneratorConfigSchema = z.object({
  type: z.literal('sequential'),
});

export const IdGeneratorConfigSchema = z.discriminatedUnion('type', [
  UuidGeneratorConfigSchema,
  SequentialGeneratorConfigSchema,
]);

// PasswordHasher configuration - discriminated union
const BcryptHasherConfigSchema = z.object({
  type: z.literal('bcrypt'),
});

const FakeHasherConfigSchema = z.object({
  type: z.literal('fake'),
});

export const PasswordHasherConfigSchema = z.discriminatedUnion('type', [
  BcryptHasherConfigSchema,
  FakeHasherConfigSchema,
]);

// Server configuration
export const ServerConfigSchema = z.object({
  port: z.number().default(3000),
  host: z.string().default('0.0.0.0'),
});

// Infrastructure configuration (combines clock, idGenerator, passwordHasher)
export const InfrastructureConfigSchema = z.object({
  clock: ClockConfigSchema,
  idGenerator: IdGeneratorConfigSchema,
  passwordHasher: PasswordHasherConfigSchema,
});

// Admin configuration
export const AdminConfigSchema = z.object({
  password: z.string().min(1),
  sessionSecret: z.string().min(32),
});

// Rate limiting configuration
export const RateLimitConfigSchema = z.object({
  enabled: z.boolean().default(true),
  // General rate limit for all endpoints
  globalMax: z.number().default(100),
  globalTimeWindow: z.string().default('1 minute'),
  // Strict rate limit for admin login (brute force protection)
  adminLoginMax: z.number().default(5),
  adminLoginTimeWindow: z.string().default('15 minutes'),
});

// Log level enum matching Pino's levels
export const LogLevelSchema = z.enum([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
]);

// Logging configuration
export const LogConfigSchema = z.object({
  level: LogLevelSchema.default('info'),
  pretty: z.boolean().default(false),
});

// WebAuthn configuration for passkey authentication
export const WebAuthnConfigSchema = z.object({
  /** Relying party ID - typically the domain (e.g., "yoink.app" or "localhost") */
  rpId: z.string(),
  /** Relying party name shown to users (e.g., "Yoink") */
  rpName: z.string(),
  /** Allowed origin(s) for WebAuthn (e.g., "https://yoink.app" or "http://localhost:3000") */
  origin: z.union([z.string(), z.array(z.string())]),
  /** Secret for signing challenges (HMAC) - must be at least 32 bytes */
  challengeSecret: z.string().min(32),
});

// Full application configuration
export const AppConfigSchema = z.object({
  server: ServerConfigSchema,
  database: DatabaseConfigSchema,
  infrastructure: InfrastructureConfigSchema,
  seedToken: z.string().optional(),
  admin: AdminConfigSchema.optional(),
  rateLimit: RateLimitConfigSchema.optional(),
  log: LogConfigSchema,
  webauthn: WebAuthnConfigSchema.optional(),
});

// Export inferred types
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type ClockConfig = z.infer<typeof ClockConfigSchema>;
export type AdminConfig = z.infer<typeof AdminConfigSchema>;
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
export type LogLevel = z.infer<typeof LogLevelSchema>;
export type LogConfig = z.infer<typeof LogConfigSchema>;
export type WebAuthnConfig = z.infer<typeof WebAuthnConfigSchema>;
export type IdGeneratorConfig = z.infer<typeof IdGeneratorConfigSchema>;
export type PasswordHasherConfig = z.infer<typeof PasswordHasherConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type InfrastructureConfig = z.infer<typeof InfrastructureConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
