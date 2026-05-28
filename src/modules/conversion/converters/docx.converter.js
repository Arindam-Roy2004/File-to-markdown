'use strict';

const mammoth = require('mammoth');
const { htmlToMarkdown } = require('../../../common/utils/htmlToMarkdown.util');

module.exports = {
  name: 'docx',
  async run(buffer) {
    const { value: html, messages } = await mammoth.convertToHtml({ buffer });
    return {
      markdown: htmlToMarkdown(html),
      meta: { warnings: messages?.length || 0 },
    };
  },
};
