'use strict';

const express = require('express');

const { applySecurity } = require('./common/security/security.middleware');
const requestLogger = require('./common/middleware/requestLogger.middleware');
const errorHandler = require('./common/middleware/errorHandler.middleware');
const apiRouter = require('./routes');

const app = express();

applySecurity(app);
app.use(requestLogger);
app.use(express.json({ limit: '2mb' }));

// Liveness
app.get('/health', (_req, res) => res.json({ ok: true }));

// API
app.use('/api', apiRouter);

// 404
app.use((req, res) => {
  res.status(404).json({ error: { message: 'Not Found', code: 'NOT_FOUND', path: req.path } });
});

// Centralized error handler — must be last
app.use(errorHandler);

module.exports = app;
