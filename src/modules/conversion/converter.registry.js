'use strict';

const { EXTENSIONS } = require('./conversion.constants');

const pdf = require('./converters/pdf.converter');
const docx = require('./converters/docx.converter');
const xlsx = require('./converters/xlsx.converter');
const csv = require('./converters/csv.converter');
const html = require('./converters/html.converter');
const image = require('./converters/image.converter');
const text = require('./converters/text.converter');

/**
 * Strategy registry: extension -> converter implementation.
 * Adding a new format = drop a converter file + register it here.
 */
const REGISTRY = Object.freeze({
  [EXTENSIONS.PDF]: pdf,
  [EXTENSIONS.DOCX]: docx,
  [EXTENSIONS.XLSX]: xlsx,
  [EXTENSIONS.XLS]: xlsx,
  [EXTENSIONS.CSV]: csv,
  [EXTENSIONS.HTML]: html,
  [EXTENSIONS.HTM]: html,
  [EXTENSIONS.PNG]: image,
  [EXTENSIONS.JPG]: image,
  [EXTENSIONS.JPEG]: image,
  [EXTENSIONS.WEBP]: image,
  [EXTENSIONS.TXT]: text,
  [EXTENSIONS.MD]: text,
});

/**
 * @param {string} ext  lowercase extension including the dot (e.g. ".pdf")
 * @param {string} [mimetype]
 * @returns {object|null} converter implementation or null
 */
function resolveConverter(ext, mimetype) {
  if (REGISTRY[ext]) return REGISTRY[ext];

  // MIME-based fallback when extension is unknown/missing
  if (mimetype?.startsWith('image/')) return image;
  if (mimetype === 'text/plain') return text;
  if (mimetype === 'text/html') return html;

  return null;
}

/**
 * Returns supported formats grouped by converter name.
 */
function listSupportedFormats() {
  const grouped = new Map();
  for (const [ext, conv] of Object.entries(REGISTRY)) {
    if (!grouped.has(conv.name)) grouped.set(conv.name, []);
    grouped.get(conv.name).push(ext);
  }
  return Array.from(grouped, ([name, extensions]) => ({ name, extensions }));
}

module.exports = { resolveConverter, listSupportedFormats };
