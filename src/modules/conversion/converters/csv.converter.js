'use strict';

const Papa = require('papaparse');

module.exports = {
  name: 'csv',
  async run(buffer) {
    const text = buffer.toString('utf8');
    const { data, errors } = Papa.parse(text, { skipEmptyLines: true });
    if (!data.length) return { markdown: '', meta: { rows: 0 } };

    const header = data[0];
    const body = data.slice(1);
    const head = `| ${header.join(' | ')} |`;
    const sep = `| ${header.map(() => '---').join(' | ')} |`;
    const lines = body.map((r) => `| ${header.map((_, i) => r[i] ?? '').join(' | ')} |`);

    return {
      markdown: [head, sep, ...lines].join('\n'),
      meta: { rows: body.length, parseErrors: errors.length },
    };
  },
};
