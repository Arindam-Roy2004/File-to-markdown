'use strict';

module.exports = {
  name: 'text',
  async run(buffer) {
    return {
      markdown: buffer.toString('utf8'),
      meta: {},
    };
  },
};
