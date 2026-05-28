'use strict';

require('dotenv').config();

/**
 * Centralized environment config.
 * No other file should read process.env directly.
 */
const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '3000', 10),
  logLevel: process.env.LOG_LEVEL || 'info',

  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxBytes: parseInt(process.env.MAX_UPLOAD_MB || '25', 10) * 1024 * 1024,
  },

  security: {
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
    corsOrigin: process.env.CORS_ORIGIN || '*',
  },
});

module.exports = config;
