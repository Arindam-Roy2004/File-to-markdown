'use strict';

const pinoHttp = require('pino-http');
const logger = require('../logger');

module.exports = pinoHttp({
  logger,
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
