'use strict';

const express = require('express');
const conversionModule = require('../modules/conversion');

const router = express.Router();

router.use('/convert', conversionModule.routes);

module.exports = router;
