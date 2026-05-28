'use strict';

const Tesseract = require('tesseract.js');

module.exports = {
  name: 'image',
  async run(buffer) {
    const { data } = await Tesseract.recognize(buffer, 'eng');
    const markdown = (data.text || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n\n');
    return {
      markdown,
      meta: { confidence: data.confidence },
    };
  },
};
