'use strict';

const path = require('path');
const fs = require('fs/promises');

const { resolveConverter, listSupportedFormats } = require('./converter.registry');
const { UnsupportedMediaTypeError } = require('../../common/errors/AppError');
const { countTokens } = require('../../common/utils/tokenCounter.util');
const logger = require('../../common/logger');

/**
 * Convert an uploaded file to Markdown.
 * @param {{path: string, originalname: string, mimetype: string, size: number}} file
 * @returns {Promise<{markdown: string, meta: object, tokens: number}>}
 */
async function convertUploadedFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const converter = resolveConverter(ext, file.mimetype);

  if (!converter) {
    throw new UnsupportedMediaTypeError(`Unsupported file type: ${file.originalname}`);
  }

  logger.info({ filename: file.originalname, converter: converter.name }, 'converting file');

  const buffer = await fs.readFile(file.path);
  const { markdown, meta } = await converter.run(buffer, {
    filename: file.originalname,
    mimetype: file.mimetype,
  });

  const cleanMarkdown = `${markdown.trim()}\n`;

  return {
    markdown: cleanMarkdown,
    meta: { converter: converter.name, ...meta },
    tokens: countTokens(cleanMarkdown),
  };
}

function getSupportedFormats() {
  return listSupportedFormats();
}

module.exports = { convertUploadedFile, getSupportedFormats };
