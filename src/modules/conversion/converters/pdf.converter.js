'use strict';

const pdfParse = require('pdf-parse');

module.exports = {
  name: 'pdf',
  /**
   * @param {Buffer} buffer
   * @returns {Promise<{markdown: string, meta: object}>}
   */
  async run(buffer) {
    const data = await pdfParse(buffer);
    const markdown = data.text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n\n');

    return {
      markdown,
      meta: { pages: data.numpages, info: data.info || null },
    };
  },
};
