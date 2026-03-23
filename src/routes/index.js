const { Router } = require('express');
const authRoutes = require('./auth.routes');
const fraudRoutes = require('./fraud.routes');
const transactionsRoutes = require('./transactions.routes');
const dashboardRoutes = require('./dashboard.routes');
const authenticate = require('../middleware/authenticate');

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.use('/auth', authRoutes);
router.use('/fraud', authenticate, fraudRoutes);
router.use('/transactions', authenticate, transactionsRoutes);
router.use('/dashboard', authenticate, dashboardRoutes);

module.exports = router;
