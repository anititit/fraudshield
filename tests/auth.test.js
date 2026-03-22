const request = require('supertest');
const app = require('../src/app');

describe('Auth — POST /api/auth/register', () => {
  it('creates a new user and returns id, email, createdAt', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'user@test.com', password: 'pass123' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'user@test.com' });
    expect(res.body.id).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.password).toBeUndefined();
  });

  it('returns 409 when email is already registered', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@test.com', password: 'pass123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@test.com', password: 'other' });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already registered/i);
  });

  it('returns 400 when fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'x@test.com' });

    expect(res.status).toBe(400);
  });
});

describe('Auth — POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'login@test.com', password: 'pass123' });
  });

  it('returns accessToken and refreshToken on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: 'pass123' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.expiresIn).toBe('1h');
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@test.com', password: 'wrong' });

    expect(res.status).toBe(401);
  });

  it('returns 401 on unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@test.com', password: 'pass' });

    expect(res.status).toBe(401);
  });
});

describe('Auth — POST /api/auth/refresh', () => {
  let refreshToken;

  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'refresh@test.com', password: 'pass123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'refresh@test.com', password: 'pass123' });

    refreshToken = res.body.refreshToken;
  });

  it('issues new accessToken and rotated refreshToken', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.refreshToken).not.toBe(refreshToken);
  });

  it('rejects a refresh token that was already used (rotation)', async () => {
    await request(app).post('/api/auth/refresh').send({ refreshToken });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
  });

  it('returns 400 when refreshToken is missing', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });
});

describe('Auth — POST /api/auth/logout', () => {
  let refreshToken;

  beforeEach(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'logout@test.com', password: 'pass123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'logout@test.com', password: 'pass123' });

    refreshToken = res.body.refreshToken;
  });

  it('returns 204 and invalidates the refresh token', async () => {
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken });
    expect(logoutRes.status).toBe(204);

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(refreshRes.status).toBe(401);
  });
});

describe('Auth — protected routes', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .send({ amount: 100 });

    expect(res.status).toBe(401);
  });

  it('returns 401 on invalid token', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', 'Bearer invalid.token.here')
      .send({ amount: 100 });

    expect(res.status).toBe(401);
  });
});
