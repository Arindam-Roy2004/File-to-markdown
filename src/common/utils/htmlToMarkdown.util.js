'use strict';

const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');

const td = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
});
td.use(gfm);

/**
 * Convert raw HTML to GitHub-flavored Markdown.
 * @param {string} html
 * @returns {string}
 */
function htmlToMarkdown(html) {
  return td.turndown(html || '');
}

module.exports = { htmlToMarkdown };
