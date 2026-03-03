import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(4000),
  TRUST_PROXY: Joi.boolean().default(false),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .allow('')
    .optional(),

  DB_HOST: Joi.when('DATABASE_URL', {
    is: Joi.string().min(1),
    then: Joi.string().optional(),
    otherwise: Joi.string().required(),
  }),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.when('DATABASE_URL', {
    is: Joi.string().min(1),
    then: Joi.string().optional(),
    otherwise: Joi.string().required(),
  }),
  DB_PASSWORD: Joi.when('DATABASE_URL', {
    is: Joi.string().min(1),
    then: Joi.string().optional(),
    otherwise: Joi.string().required(),
  }),
  DB_NAME: Joi.when('DATABASE_URL', {
    is: Joi.string().min(1),
    then: Joi.string().optional(),
    otherwise: Joi.string().required(),
  }),
  DB_SYNC: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),
  DB_SSL: Joi.boolean().default(false),
  DB_SSL_REJECT_UNAUTHORIZED: Joi.boolean().default(false),
  DB_MIGRATIONS_RUN: Joi.boolean().default(true),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  JWT_REFRESH_SECRET: Joi.string().min(32).default(Joi.ref('JWT_SECRET')),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),
  AUTH_MAX_LOGIN_ATTEMPTS: Joi.number().integer().min(3).max(20).default(5),
  AUTH_LOGIN_LOCK_MINUTES: Joi.number().integer().min(1).max(120).default(15),

  CORS_ORIGINS: Joi.string().default('*'),
  THROTTLE_TTL: Joi.number().integer().min(1000).default(60000),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(120),
  SWAGGER_ENABLED: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().default(false),
    otherwise: Joi.boolean().default(true),
  }),
  UPLOAD_DIR: Joi.string().default('uploads'),
  UPLOAD_MAX_FILE_MB: Joi.number().min(1).max(50).default(5),
  UPLOAD_DRIVER: Joi.string().valid('local', 's3').default('local'),
  UPLOAD_PUBLIC_BASE_URL: Joi.string().uri().allow('').optional(),
  UPLOAD_CLEANUP_DAYS: Joi.number().integer().min(1).max(365).default(30),

  S3_ENDPOINT: Joi.string().uri().allow('').optional(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_BUCKET: Joi.string().allow('').optional(),
  S3_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  S3_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(true),

  METRICS_ENABLED: Joi.boolean().default(true),
  METRICS_API_KEY: Joi.string().allow('').optional(),
  ALERT_ERROR_RATE_THRESHOLD: Joi.number().min(0).max(1).default(0.2),

  SENTRY_ENABLED: Joi.boolean().default(false),
  SENTRY_DSN: Joi.string().uri().allow('').optional(),
  SENTRY_TRACES_SAMPLE_RATE: Joi.number().min(0).max(1).default(0.1),
});
