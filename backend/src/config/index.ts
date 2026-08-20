import dotenv from 'dotenv';

dotenv.config();

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function readOptionalEnv(key: string): string {
  return (process.env[key] ?? '').trim();
}

const r2AccountId = readOptionalEnv('R2_ACCOUNT_ID');
const r2Bucket = readOptionalEnv('R2_BUCKET') || process.env.S3_BUCKET || 'shughaily';
const r2Region = readOptionalEnv('R2_REGION') || process.env.S3_REGION || 'auto';
const r2Endpoint =
  readOptionalEnv('R2_ENDPOINT') ||
  readOptionalEnv('S3_ENDPOINT') ||
  (r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : '');
const r2PublicBaseUrl = readOptionalEnv('R2_PUBLIC_BASE_URL') || readOptionalEnv('S3_PUBLIC_BASE_URL');
const r2AccessKeyId = readOptionalEnv('R2_ACCESS_KEY_ID') || readOptionalEnv('S3_ACCESS_KEY');
const r2SecretAccessKey =
  readOptionalEnv('R2_SECRET_ACCESS_KEY') || readOptionalEnv('S3_SECRET_KEY');

export const config = {
  port: parseInt(requireEnv('PORT', '4000'), 10),
  nodeEnv: requireEnv('NODE_ENV', 'development'),

  // Database
  databaseUrl: requireEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/shughaily'),

  // JWT
  jwtSecret: requireEnv('JWT_SECRET', 'change-me-in-production'),
  jwtExpiresIn: requireEnv('JWT_EXPIRES_IN', '7d'),

  // Redis
  redisUrl: requireEnv('REDIS_URL', 'redis://localhost:6379'),

  // Flask AI micro-service
  flaskAiUrl: requireEnv('FLASK_AI_URL', 'http://localhost:5050'),
  // Shared secret sent to the AI service on every request (X-Internal-Auth
  // header — see ai-service's app.py before_request handler). No fallback:
  // this is a real secret, so a missing value must fail startup rather
  // than silently sending an empty/absent header the AI service would
  // then have to choose whether to accept.
  internalAuthToken: requireEnv('INTERNAL_AUTH_TOKEN'),

  // Cloudflare R2 storage
  r2: {
    accountId: r2AccountId,
    bucket: r2Bucket,
    region: r2Region,
    endpoint: r2Endpoint,
    publicBaseUrl: r2PublicBaseUrl,
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
  },

  // SerpAPI for Google Jobs search
  serpApiKey: readOptionalEnv('SERP_API_KEY'),

  // Google OAuth
  googleClientId: readOptionalEnv('GOOGLE_CLIENT_ID'),
  googleClientSecret: readOptionalEnv('GOOGLE_CLIENT_SECRET'),
  googleRedirectUri: readOptionalEnv('GOOGLE_REDIRECT_URI') || 'http://localhost:5173/auth/google/callback',

  // CORS
  corsOrigin: requireEnv('CORS_ORIGIN', 'http://localhost:5173'),

  // Outbound mail (SMTP). Used by the email auto-apply feature and future
  // notification email. All optional — when SMTP_HOST is unset, mailer.service
  // runs in a safe no-op/log-only mode instead of throwing at boot.
  smtp: {
    host: readOptionalEnv('SMTP_HOST'),
    port: parseInt(readOptionalEnv('SMTP_PORT') || '587', 10),
    secure: readOptionalEnv('SMTP_SECURE') === 'true',
    user: readOptionalEnv('SMTP_USER'),
    pass: readOptionalEnv('SMTP_PASS'),
    fromAddress: readOptionalEnv('SMTP_FROM') || 'الشغيلي <no-reply@shughaily.app>',
  },
} as const;

export type Config = typeof config;
