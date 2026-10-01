import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUrl, Matches, Max, Min, MinLength, validateSync } from 'class-validator';

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

  @Matches(/^postgres(ql)?:\/\//)
  DATABASE_URL!: string;

  @IsOptional()
  @Matches(/^rediss?:\/\//)
  REDIS_URL?: string;

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
}

export function validateEnvironment(config: Record<string, unknown>) {
  const errors = validateSync(plainToInstance(Environment, config, { enableImplicitConversion: true }));
  if (errors.length > 0) {
    throw new Error(`Missing or invalid settings: ${errors.map((error) => error.property).join(', ')}`);
  }
  return config;
}
