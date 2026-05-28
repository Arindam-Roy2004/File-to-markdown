'use strict';

const logger = require('../logger');
const config = require('../config');
const { AppError } = require('../errors/AppError');

/**
 * Centralized error handler. Express identifies it via the 4-arg signature.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const isOperational = err instanceof AppError;
  const status = err.status || 500;

  logger.error(
    {
      err: { message: err.message, code: err.code, stack: err.stack },
      path: req.path,
      method: req.method,
    },
    'request failed'
  );

  res.status(status).json({
    error: {
      message: isOperational ? err.message : 'Internal Server Error',
      code: err.code || 'INTERNAL_ERROR',
      ...(err.details && { details: err.details }),
      ...(!config.isProd && !isOperational && { stack: err.stack }),
    },
  });
}

module.exports = errorHandler;
