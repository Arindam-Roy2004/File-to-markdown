'use strict';

const { ValidationError } = require('../../common/errors/AppError');

/**
 * Validate the multipart upload payload before it reaches the controller logic.
 */
function validateUploadedFile(req, _res, next) {
  if (!req.file) {
    return next(new ValidationError('No file uploaded. Use field name "file".'));
  }
  if (!req.file.originalname) {
    return next(new ValidationError('Uploaded file is missing a filename.'));
  }
  return next();
}

module.exports = { validateUploadedFile };
