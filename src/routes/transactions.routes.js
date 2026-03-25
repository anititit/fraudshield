const { Router } = require('express');
const fraudController = require('../controllers/fraud.controller');
const { analyzeLimiter } = require('../middlewares/rateLimit');

const router = Router();

// Alias for POST /api/fraud/analyze — same strict limit as the primary endpoint
router.post('/', analyzeLimiter, fraudController.analyze);

module.exports = router;
