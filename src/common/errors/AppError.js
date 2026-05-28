'use strict';

/**
 * Base application error. All thrown errors should extend this so the
 * centralized error handler can rely on `status` and `code`.
 */
class AppError extends Error {
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', cause, details } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    if (cause) this.cause = cause;
    if (details) this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details) {
    super(message, { status: 400, code: 'VALIDATION_ERROR', details });
  }
}

class UnsupportedMediaTypeError extends AppError {
  constructor(message) {
    super(message, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  }
}

class PayloadTooLargeError extends AppError {
  constructor(message) {
    super(message, { status: 413, code: 'PAYLOAD_TOO_LARGE' });
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnsupportedMediaTypeError,
  PayloadTooLargeError,
};
