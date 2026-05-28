'use strict';

const express = require('express');

const upload = require('../../common/middleware/upload.middleware');
const { validateUploadedFile } = require('./conversion.validation');
const controller = require('./conversion.controller');

const router = express.Router();

router.post('/', upload.single('file'), validateUploadedFile, controller.convert);
router.get('/formats', controller.formats);

module.exports = router;
