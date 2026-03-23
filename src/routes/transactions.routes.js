const { Router } = require('express');
const fraudController = require('../controllers/fraud.controller');

const router = Router();

// Alias for POST /api/fraud/analyze
router.post('/', fraudController.analyze);

module.exports = router;
