const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { authLimiter } = require('../middlewares/rateLimit');

const router = Router();

router.post('/register', authLimiter, authController.register);
router.post('/login',    authLimiter, authController.login);
router.post('/refresh',  authLimiter, authController.refresh);
router.post('/logout',   authController.logout);  // logout is free — no credential guessing risk

module.exports = router;
