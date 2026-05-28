'use strict';

const { encode } = require('gpt-tokenizer');

/**
 * Approximate token count using cl100k_base (GPT-4/4o family).
 * Falls back to a 4-chars-per-token heuristic if encoding fails.
 * @param {string} text
 * @returns {number}
 */
function countTokens(text) {
  if (!text) return 0;
  try {
    return encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

module.exports = { countTokens };
