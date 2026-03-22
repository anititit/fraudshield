const { Router } = require('express');
const fraudController = require('../controllers/fraud.controller');

const router = Router();

// POST /api/fraud/analyze - analyze a transaction for fraud
router.post('/analyze', fraudController.analyze);

// GET /api/fraud/reports - list all reports (supports ?page, ?limit, ?riskLevel)
router.get('/reports', fraudController.listReports);

// GET /api/fraud/report/:transactionId - get fraud report for a transaction
router.get('/report/:transactionId', fraudController.getReport);

module.exports = router;
