import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  allowedOrigins: process.env.ALLOWED_ORIGINS || '*',

  database: {
    url: process.env.DATABASE_URL || '',
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'fallback_access_secret_min_32_characters_long_hash',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret_min_32_characters_long_hash',
    accessExpiry: '15m',
    refreshExpiryDays: 30,
  },

  r2: {
    endpoint: process.env.R2_ENDPOINT || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || 'somebody-media-vault',
    publicDomain: process.env.R2_PUBLIC_DOMAIN || 'https://media.somebody.app',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
};
