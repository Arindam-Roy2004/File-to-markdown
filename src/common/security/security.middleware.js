'use strict';

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * Apply baseline security middleware to an Express app.
 */
function applySecurity(app) {
  app.use(helmet());
  app.use(cors({ origin: config.security.corsOrigin }));
  app.use(
    rateLimit({
      windowMs: config.security.rateLimitWindowMs,
      max: config.security.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );
}

module.exports = { applySecurity };
