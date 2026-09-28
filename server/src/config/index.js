import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    secret:
      process.env.JWT_SECRET ||
      'court_cms_jwt_super_secret_key_2026_judicial_registry_docket_secure_9847123984',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  cookie: {
    name: process.env.COOKIE_NAME || 'court_cms_token',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours in milliseconds
  },
};
