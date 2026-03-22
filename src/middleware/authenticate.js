const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { message: 'Missing or invalid Authorization header' } });
  }

  const token = authHeader.slice(7);
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch (err) {
    return res.status(401).json({ error: { message: 'Token invalid or expired' } });
  }
}

module.exports = authenticate;
