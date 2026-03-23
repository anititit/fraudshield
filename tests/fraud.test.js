const request = require('supertest');
const app = require('../src/app');

async function registerAndLogin(email = 'analyst@test.com', password = 'pass123') {
  await request(app).post('/api/auth/register').send({ email, password });
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.accessToken;
}

describe('Fraud — POST /api/fraud/analyze', () => {
  let token;
  beforeEach(async () => { token = await registerAndLogin(); });

  it('returns LOW risk for a clean transaction', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 50, userId: 'u1', location: 'BR', deviceId: 'd1' });

    expect(res.status).toBe(200);
    expect(res.body.riskLevel).toBe('LOW');
    expect(res.body.riskScore).toBe(0);
    expect(res.body.flags).toEqual([]);
    expect(res.body.id).toBeDefined();
    expect(res.body.analyzedAt).toBeDefined();
  });

  it('flags HIGH_AMOUNT when amount > 10000', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 15000, userId: 'u1', location: 'BR', deviceId: 'd1' });

    expect(res.body.flags).toContain('HIGH_AMOUNT');
    expect(res.body.riskScore).toBe(40);
    expect(res.body.riskLevel).toBe('MEDIUM');
  });

  it('returns HIGH risk when multiple fields missing', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 25000 });

    expect(res.body.riskLevel).toBe('HIGH');
    expect(res.body.riskScore).toBe(100);
    expect(res.body.flags).toEqual(
      expect.arrayContaining(['HIGH_AMOUNT', 'MISSING_USER', 'MISSING_LOCATION', 'MISSING_DEVICE'])
    );
  });

  it('caps riskScore at 100', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 99999 });

    expect(res.body.riskScore).toBeLessThanOrEqual(100);
  });

  it('stores analyzedBy with the requesting user id', async () => {
    const meRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'me@test.com', password: 'pass123' });
    const userId = meRes.body.id;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'me@test.com', password: 'pass123' });
    const myToken = loginRes.body.accessToken;

    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${myToken}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1' });

    expect(res.body.analyzedBy).toBe(userId);
  });
});

describe('Fraud — VELOCITY_EXCEEDED rule', () => {
  let token;
  beforeEach(async () => { token = await registerAndLogin('velocity@test.com'); });

  it('flags VELOCITY_EXCEEDED after 3 transactions from the same device within the window', async () => {
    const tx = { amount: 50, userId: 'u1', location: 'BR', deviceId: 'device-vel-1' };

    // First 3 transactions — should NOT trigger velocity (threshold is >= 3 existing)
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/fraud/analyze')
        .set('Authorization', `Bearer ${token}`)
        .send(tx);
    }

    // 4th transaction — now there are 3 existing → VELOCITY_EXCEEDED
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send(tx);

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('VELOCITY_EXCEEDED');
    expect(res.body.riskScore).toBeGreaterThanOrEqual(40);
  });

  it('does NOT flag VELOCITY_EXCEEDED for different devices', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/fraud/analyze')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 50, userId: 'u1', location: 'BR', deviceId: `device-diff-${i}` });
    }

    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 50, userId: 'u1', location: 'BR', deviceId: 'device-new' });

    expect(res.body.flags).not.toContain('VELOCITY_EXCEEDED');
  });
});

describe('Fraud — SUSPICIOUS_LOCATION rule', () => {
  let token;
  beforeEach(async () => { token = await registerAndLogin('location@test.com'); });

  it('flags SUSPICIOUS_LOCATION for a high-risk country', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 50, userId: 'u1', location: 'KP', deviceId: 'd1' });

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('SUSPICIOUS_LOCATION');
    expect(res.body.riskScore).toBeGreaterThanOrEqual(30);
  });

  it('does NOT flag SUSPICIOUS_LOCATION for a safe country', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 50, userId: 'u1', location: 'BR', deviceId: 'd1' });

    expect(res.body.flags).not.toContain('SUSPICIOUS_LOCATION');
  });

  it('is case-insensitive for country codes', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 50, userId: 'u1', location: 'ir', deviceId: 'd1' });

    expect(res.body.flags).toContain('SUSPICIOUS_LOCATION');
  });
});

describe('Fraud — POST /api/transactions (alias)', () => {
  let token;
  beforeEach(async () => { token = await registerAndLogin('tx-alias@test.com'); });

  it('analyzes a transaction and returns a fraud report', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 500, userId: 'u1', location: 'BR', deviceId: 'd1' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.riskLevel).toBe('LOW');
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({ amount: 100 });
    expect(res.status).toBe(401);
  });
});

describe('Fraud — GET /api/fraud/report/:id', () => {
  let token;
  beforeEach(async () => { token = await registerAndLogin(); });

  it('returns the report by id', async () => {
    const created = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1' });

    const res = await request(app)
      .get(`/api/fraud/report/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(Array.isArray(res.body.flags)).toBe(true);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .get('/api/fraud/report/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('Fraud — GET /api/fraud/reports', () => {
  let token;

  beforeEach(async () => {
    token = await registerAndLogin();

    const transactions = [
      { amount: 25000 },                                                    // HIGH
      { amount: 15000, userId: 'u1', location: 'BR', deviceId: 'd1' },    // MEDIUM
      { amount: 50,    userId: 'u2', location: 'BR', deviceId: 'd2' },    // LOW
    ];

    for (const tx of transactions) {
      await request(app)
        .post('/api/fraud/analyze')
        .set('Authorization', `Bearer ${token}`)
        .send(tx);
    }
  });

  it('returns paginated list with meta', async () => {
    const res = await request(app)
      .get('/api/fraud/reports?page=1&limit=10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.meta.total).toBe(3);
    expect(res.body.meta.pages).toBe(1);
  });

  it('filters by riskLevel=HIGH', async () => {
    const res = await request(app)
      .get('/api/fraud/reports?riskLevel=HIGH')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.every(r => r.riskLevel === 'HIGH')).toBe(true);
    expect(res.body.meta.total).toBe(1);
  });

  it('filters by startDate and endDate', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();

    const res = await request(app)
      .get(`/api/fraud/reports?startDate=${yesterday}&endDate=${tomorrow}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.meta.total).toBe(3);
  });

  it('filters by analyzedBy user id', async () => {
    const meRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'other@test.com', password: 'pass123' });
    const otherId = meRes.body.id;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'other@test.com', password: 'pass123' });
    const otherToken = loginRes.body.accessToken;

    await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ amount: 200, userId: 'u9', location: 'US', deviceId: 'd9' });

    const res = await request(app)
      .get(`/api/fraud/reports?analyzedBy=${otherId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].analyzedBy).toBe(otherId);
  });

  it('respects pagination limit', async () => {
    const res = await request(app)
      .get('/api/fraud/reports?page=1&limit=2')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(3);
    expect(res.body.meta.pages).toBe(2);
  });
});
