const { Router } = require('express');
const fraudController = require('../controllers/fraud.controller');
const { analyzeLimiter, apiLimiter } = require('../middlewares/rateLimit');

const router = Router();

// POST /api/fraud/analyze — strict limit (expensive, Brazilian validators run here)
router.post('/analyze', analyzeLimiter, fraudController.analyze);

// GET /api/fraud/reports — general API limit
router.get('/reports', apiLimiter, fraudController.listReports);

// GET /api/fraud/report/:transactionId — general API limit
router.get('/report/:transactionId', apiLimiter, fraudController.getReport);

module.exports = router;
