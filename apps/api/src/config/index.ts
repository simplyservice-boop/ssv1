import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const opt = (key: string, fallback = ''): string => process.env[key] ?? fallback;
const req = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
};

const defaultCorsOrigins = 'http://localhost:5173,http://localhost:4173,http://localhost:3000,http://localhost:4000,http://localhost';
const frontendUrl = opt('FRONTEND_URL');
const corsOriginsFromEnv = opt('CORS_ORIGINS', defaultCorsOrigins);

export const config = {
  env: opt('NODE_ENV', 'development'),
  port: parseInt(opt('PORT', '4000'), 10),
  apiUrl: opt('API_URL', 'http://localhost:4000'),
  webUrl: opt('WEB_URL', 'http://localhost:5173'),
  corsOrigins: Array.from(new Set([
    ...corsOriginsFromEnv.split(',').map((value) => value.trim()).filter(Boolean),
    ...(frontendUrl ? [frontendUrl] : []),
  ])),
  isDev: opt('NODE_ENV', 'development') === 'development',
  isProd: opt('NODE_ENV', 'development') === 'production',
  db: { url: req('DATABASE_URL') },
  jwt: {
    secret: opt('JWT_SECRET', 'dev_secret_change_me'),
    refreshSecret: opt('JWT_REFRESH_SECRET', 'dev_refresh_change_me'),
    expiresIn: opt('JWT_EXPIRES_IN', '15m'),
    refreshExpiresIn: opt('JWT_REFRESH_EXPIRES_IN', '7d'),
  },
  aws: {
    accessKeyId: opt('AWS_ACCESS_KEY_ID'),
    secretAccessKey: opt('AWS_SECRET_ACCESS_KEY'),
    region: opt('AWS_REGION', 'us-east-1'),
    bucket: opt('AWS_S3_BUCKET', 'simply-service-assets'),
  },
  openai: { apiKey: opt('OPENAI_API_KEY'), model: opt('OPENAI_MODEL', 'gpt-4o') },
  openaiApiKey: opt('OPENAI_API_KEY'),
  stripe: {
    secretKey: opt('STRIPE_SECRET_KEY'),
    webhookSecret: opt('STRIPE_WEBHOOK_SECRET'),
    publishableKey: opt('STRIPE_PUBLISHABLE_KEY'),
  },
  email: {
    host: opt('SMTP_HOST', 'smtp.sendgrid.net'),
    port: parseInt(opt('SMTP_PORT', '587'), 10),
    user: opt('SMTP_USER'),
    pass: opt('SMTP_PASS'),
    from: opt('EMAIL_FROM', 'noreply@simplyservice.io'),
    fromName: opt('EMAIL_FROM_NAME', 'Simply Service'),
  },
  smtp: {
    host: opt('SMTP_HOST', 'smtp.sendgrid.net'),
    port: parseInt(opt('SMTP_PORT', '587'), 10),
    user: opt('SMTP_USER'),
    pass: opt('SMTP_PASS'),
    from: opt('EMAIL_FROM', 'noreply@simplyservice.io'),
    fromName: opt('EMAIL_FROM_NAME', 'Simply Service'),
  },
  redis: { url: opt('REDIS_URL', 'redis://localhost:6379') },
};
