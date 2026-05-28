'use strict';

const { htmlToMarkdown } = require('../../../common/utils/htmlToMarkdown.util');

module.exports = {
  name: 'html',
  async run(buffer) {
    return {
      markdown: htmlToMarkdown(buffer.toString('utf8')),
      meta: {},
    };
  },
};
