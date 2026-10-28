import { isAbsolute } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Matches, Max, Min, MinLength, ValidateBy, ValidateIf, validateSync } from 'class-validator';

const origins = /^https?:\/\/[^/,\s]+(,https?:\/\/[^/,\s]+)*$/;

class Environment {
  @IsOptional()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65_535)
  PORT?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  TRUST_PROXY?: number;

  @Matches(/^postgres(ql)?:\/\//)
  DATABASE_URL!: string;

  @ValidateIf((environment: Environment) => environment.NODE_ENV === 'production' || environment.REDIS_URL !== undefined)
  @Matches(/^rediss?:\/\//)
  REDIS_URL?: string;

  @IsOptional()
  @ValidateBy({ name: 'isAbsolutePath', validator: { validate: (value: unknown) => typeof value === 'string' && isAbsolute(value) } })
  FILES_ROOT?: string;

  @IsString()
  @MinLength(32)
  AUTH_ACCESS_TOKEN_SECRET!: string;

  @Matches(origins)
  AUTH_TRUSTED_ORIGINS!: string;

  @Matches(/^[A-Za-z0-9+/]{43}=$/, { message: 'DATA_ENCRYPTION_KEY must be 32 random bytes in base64' })
  DATA_ENCRYPTION_KEY!: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  APP_URL!: string;

  @IsString()
  DEFAULT_FROM_EMAIL!: string;

  @IsOptional()
  @IsString()
  EMAIL_HOST?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65_535)
  EMAIL_PORT?: number;

  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{87}$/, { message: 'VAPID_PUBLIC_KEY must be a URL-safe base64 public key' })
  VAPID_PUBLIC_KEY?: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: 'VAPID_PRIVATE_KEY must be a URL-safe base64 private key' })
  VAPID_PRIVATE_KEY?: string;

  @IsOptional()
  @Matches(/^(mailto:|https:\/\/)\S+$/, { message: 'VAPID_SUBJECT must be a mailto: or https:// address' })
  VAPID_SUBJECT?: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  SENTRY_DSN?: string;

  @IsOptional()
  @IsString()
  @MinLength(32)
  METRICS_TOKEN?: string;
}

export function validateEnvironment(config: Record<string, unknown>) {
  const present = Object.fromEntries(Object.entries(config).filter(([, value]) => value !== ''));
  const errors = validateSync(plainToInstance(Environment, present, { enableImplicitConversion: true }));
  if (errors.length > 0) {
    throw new Error(`Missing or invalid settings: ${errors.map((error) => error.property).join(', ')}`);
  }
  if (
    config.NODE_ENV === 'production' &&
    [String(config.AUTH_ACCESS_TOKEN_SECRET), Buffer.from(String(config.DATA_ENCRYPTION_KEY), 'base64').toString()].some((secret) => /change-me/i.test(secret))
  ) {
    throw new Error('AUTH_ACCESS_TOKEN_SECRET and DATA_ENCRYPTION_KEY still hold the development defaults. Set real secrets for production.');
  }
  return config;
}
