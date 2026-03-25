const { Router } = require('express');
const dashboardController = require('../controllers/dashboard.controller');
const { apiLimiter } = require('../middlewares/rateLimit');

const router = Router();
router.use(apiLimiter);

// GET /api/dashboard — consolidated: summary + by-user + timeline
router.get('/', dashboardController.all);

// GET /api/dashboard/summary?startDate=&endDate=
router.get('/summary', dashboardController.summary);

// GET /api/dashboard/by-user?startDate=&endDate=
router.get('/by-user', dashboardController.byUser);

// GET /api/dashboard/timeline?startDate=&endDate=
router.get('/timeline', dashboardController.timeline);

module.exports = router;
