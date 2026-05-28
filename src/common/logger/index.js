'use strict';

const pino = require('pino');
const config = require('../config');

const logger = pino({
  level: config.logLevel,
  base: { service: 'file-to-markdown', env: config.env },
  ...(config.isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
        },
      }),
});

module.exports = logger;
