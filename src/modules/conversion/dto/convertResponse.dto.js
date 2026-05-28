'use strict';

/**
 * @typedef {Object} ConvertResponseDTO
 * @property {string} filename
 * @property {string} mimetype
 * @property {number} sizeBytes
 * @property {number} tokens
 * @property {object} meta
 * @property {string} markdown
 */

/**
 * Build the response DTO. Keeps the API contract decoupled from internal shapes.
 * @param {{originalname: string, mimetype: string, size: number}} file
 * @param {{markdown: string, meta: object, tokens: number}} result
 * @returns {ConvertResponseDTO}
 */
function toConvertResponse(file, result) {
  return {
    filename: file.originalname,
    mimetype: file.mimetype,
    sizeBytes: file.size,
    tokens: result.tokens,
    meta: result.meta,
    markdown: result.markdown,
  };
}

module.exports = { toConvertResponse };
