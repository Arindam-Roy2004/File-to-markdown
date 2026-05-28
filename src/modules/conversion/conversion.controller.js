'use strict';

const fs = require('fs/promises');

const conversionService = require('./conversion.service');
const { toConvertResponse } = require('./dto/convertResponse.dto');

/**
 * POST /api/convert
 * Thin controller: validates input (via middleware), delegates to service, shapes response.
 */
async function convert(req, res, next) {
  const { file } = req;
  try {
    const result = await conversionService.convertUploadedFile(file);
    res.json(toConvertResponse(file, result));
  } catch (err) {
    next(err);
  } finally {
    fs.unlink(file.path).catch(() => {});
  }
}

/**
 * GET /api/convert/formats
 */
function formats(_req, res) {
  res.json({ supported: conversionService.getSupportedFormats() });
}

module.exports = { convert, formats };
