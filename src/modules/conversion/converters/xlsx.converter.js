'use strict';

const XLSX = require('xlsx');

function rowsToMarkdownTable(rows) {
  if (!rows.length) return '';
  const header = rows[0];
  const body = rows.slice(1);
  const head = `| ${header.join(' | ')} |`;
  const sep = `| ${header.map(() => '---').join(' | ')} |`;
  const lines = body.map((r) => `| ${header.map((_, i) => r[i] ?? '').join(' | ')} |`);
  return [head, sep, ...lines].join('\n');
}

module.exports = {
  name: 'xlsx',
  async run(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const parts = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      parts.push(`## ${sheetName}\n\n${rowsToMarkdownTable(rows)}`);
    }
    return {
      markdown: parts.join('\n\n'),
      meta: { sheets: wb.SheetNames },
    };
  },
};
