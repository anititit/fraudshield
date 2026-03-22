const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { jwtSecret, jwtExpiresIn, refreshTokenExpiresInDays } = require('../config/env');

async function register(email, password) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const err = new Error('Email already registered');
    err.status = 409;
    throw err;
  }

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, password: hash },
    select: { id: true, email: true, createdAt: true },
  });

  return user;
}

async function login(email, password) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  const accessToken = jwt.sign({ sub: user.id, email: user.email }, jwtSecret, {
    expiresIn: jwtExpiresIn,
  });

  const refreshToken = await _createRefreshToken(user.id);

  return { accessToken, refreshToken, expiresIn: jwtExpiresIn };
}

async function refresh(rawRefreshToken) {
  const stored = await prisma.refreshToken.findUnique({
    where: { token: rawRefreshToken },
    include: { user: true },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    const err = new Error('Refresh token invalid or expired');
    err.status = 401;
    throw err;
  }

  // Rotate: revoke old, issue new
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const accessToken = jwt.sign(
    { sub: stored.user.id, email: stored.user.email },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );

  const newRefreshToken = await _createRefreshToken(stored.user.id);

  return { accessToken, refreshToken: newRefreshToken, expiresIn: jwtExpiresIn };
}

async function logout(rawRefreshToken) {
  const stored = await prisma.refreshToken.findUnique({
    where: { token: rawRefreshToken },
  });

  if (!stored || stored.revokedAt) return;

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });
}

async function _createRefreshToken(userId) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + refreshTokenExpiresInDays);

  const { token } = await prisma.refreshToken.create({
    data: { token: crypto.randomUUID(), userId, expiresAt },
    select: { token: true },
  });

  return token;
}

module.exports = { register, login, refresh, logout };
