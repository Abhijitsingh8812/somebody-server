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

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
};

