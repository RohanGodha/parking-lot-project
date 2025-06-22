const express = require('express');
const router = express.Router();
const { checkIn, checkOut } = require('../controllers/parking.controller');
const { getStatus } = require('../controllers/status.controller');

router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/status', getStatus);

module.exports = router;