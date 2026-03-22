const request = require('supertest');
const app = require('../src/app');

async function registerAndLogin(email, password = 'pass123') {
  const reg = await request(app).post('/api/auth/register').send({ email, password });
  const login = await request(app).post('/api/auth/login').send({ email, password });
  return { token: login.body.accessToken, userId: reg.body.id };
}

async function analyze(token, tx) {
  return request(app)
    .post('/api/fraud/analyze')
    .set('Authorization', `Bearer ${token}`)
    .send(tx);
}

describe('Dashboard — GET /api/dashboard/summary', () => {
  let token;

  beforeEach(async () => {
    ({ token } = await registerAndLogin('summary@test.com'));
    await analyze(token, { amount: 25000 });                                         // HIGH (90)
    await analyze(token, { amount: 15000, userId: 'u1', location: 'BR', deviceId: 'd1' }); // MEDIUM (40)
    await analyze(token, { amount: 50, userId: 'u2', location: 'BR', deviceId: 'd2' });    // LOW (0)
  });

  it('returns total, byRiskLevel counts, avg and max riskScore', async () => {
    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.byRiskLevel.HIGH).toBe(1);
    expect(res.body.byRiskLevel.MEDIUM).toBe(1);
    expect(res.body.byRiskLevel.LOW).toBe(1);
    // {amount:25000} → 100 (HIGH_AMOUNT+MISSING_USER+MISSING_LOCATION+MISSING_DEVICE)
    // {amount:15000, all fields} → 40 (HIGH_AMOUNT only)
    // {amount:50, all fields} → 0
    expect(res.body.avgRiskScore).toBeCloseTo((100 + 40 + 0) / 3, 1);
    expect(res.body.maxRiskScore).toBe(100);
  });

  it('filters by date range — future window returns 0', async () => {
    const future = new Date(Date.now() + 86400000 * 2).toISOString();
    const farFuture = new Date(Date.now() + 86400000 * 3).toISOString();

    const res = await request(app)
      .get(`/api/dashboard/summary?startDate=${future}&endDate=${farFuture}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.total).toBe(0);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/dashboard/summary');
    expect(res.status).toBe(401);
  });
});

describe('Dashboard — GET /api/dashboard/by-user', () => {
  let tokenA, userIdA, tokenB, userIdB;

  beforeEach(async () => {
    ({ token: tokenA, userId: userIdA } = await registerAndLogin('usera@test.com'));
    ({ token: tokenB, userId: userIdB } = await registerAndLogin('userb@test.com'));

    await analyze(tokenA, { amount: 25000 });
    await analyze(tokenA, { amount: 50, userId: 'u1', location: 'BR', deviceId: 'd1' });
    await analyze(tokenB, { amount: 15000, userId: 'u2', location: 'BR', deviceId: 'd2' });
  });

  it('returns one entry per user with totalReports and avgRiskScore', async () => {
    const res = await request(app)
      .get('/api/dashboard/by-user')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);

    const entryA = res.body.find(r => r.userId === userIdA);
    expect(entryA.totalReports).toBe(2);
    expect(entryA.email).toBe('usera@test.com');

    const entryB = res.body.find(r => r.userId === userIdB);
    expect(entryB.totalReports).toBe(1);
  });
});

describe('Dashboard — GET /api/dashboard/timeline', () => {
  let token;

  beforeEach(async () => {
    ({ token } = await registerAndLogin('timeline@test.com'));
    await analyze(token, { amount: 25000 });
    await analyze(token, { amount: 50, userId: 'u1', location: 'BR', deviceId: 'd1' });
    await analyze(token, { amount: 15000, userId: 'u2', location: 'BR', deviceId: 'd2' });
  });

  it('returns an array of daily buckets with total and per-level counts', async () => {
    const res = await request(app)
      .get('/api/dashboard/timeline')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const today = new Date().toISOString().slice(0, 10);
    const bucket = res.body.find(b => b.date === today);

    expect(bucket).toBeDefined();
    expect(bucket.total).toBe(3);
    expect(bucket.HIGH).toBe(1);
    expect(bucket.MEDIUM).toBe(1);
    expect(bucket.LOW).toBe(1);
  });

  it('returns empty array for a future date range', async () => {
    const future = new Date(Date.now() + 86400000 * 2).toISOString();
    const farFuture = new Date(Date.now() + 86400000 * 3).toISOString();

    const res = await request(app)
      .get(`/api/dashboard/timeline?startDate=${future}&endDate=${farFuture}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body).toEqual([]);
  });
});
