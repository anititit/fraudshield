const request = require('supertest');
const app = require('../src/app');
const {
  detectKeyType,
  validateKey,
  isStructuringAmount,
  isRoundAmount,
  isUnusualHour,
} = require('../src/validators/pix');

// ─── Unit tests — detectKeyType() ────────────────────────────────────────────

describe('Pix Validator — detectKeyType()', () => {
  it('detects CPF key (formatted)', () => expect(detectKeyType('529.982.247-25')).toBe('CPF'));
  it('detects CPF key (raw digits)', () => expect(detectKeyType('52998224725')).toBe('CPF'));
  it('detects CNPJ key (formatted)', () => expect(detectKeyType('11.222.333/0001-81')).toBe('CNPJ'));
  it('detects CNPJ key (raw digits)', () => expect(detectKeyType('11222333000181')).toBe('CNPJ'));
  it('detects PHONE key', () => expect(detectKeyType('+5511987654321')).toBe('PHONE'));
  it('detects EMAIL key', () => expect(detectKeyType('user@empresa.com.br')).toBe('EMAIL'));
  it('detects EVP (UUID v4) key', () =>
    expect(detectKeyType('123e4567-e89b-42d3-a456-556642440000')).toBe('EVP'));
  it('returns UNKNOWN for garbage', () => expect(detectKeyType('!@#$%')).toBe('UNKNOWN'));
  it('returns UNKNOWN for null', () => expect(detectKeyType(null)).toBe('UNKNOWN'));
});

// ─── Unit tests — validateKey() ──────────────────────────────────────────────

describe('Pix Validator — validateKey() — CPF key', () => {
  it('accepts valid CPF chave', () => {
    const r = validateKey('529.982.247-25');
    expect(r.valid).toBe(true);
    expect(r.keyType).toBe('CPF');
    expect(r.normalizedKey).toBe('52998224725');
  });

  it('rejects invalid CPF chave', () => {
    const r = validateKey('529.982.247-00'); // wrong check digits
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_PIX_KEY');
  });
});

describe('Pix Validator — validateKey() — CNPJ key', () => {
  it('accepts valid CNPJ chave', () => {
    const r = validateKey('11.222.333/0001-81');
    expect(r.valid).toBe(true);
    expect(r.keyType).toBe('CNPJ');
    expect(r.normalizedKey).toBe('11222333000181');
  });

  it('rejects invalid CNPJ chave', () => {
    const r = validateKey('11.222.333/0001-00');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_PIX_KEY');
  });
});

describe('Pix Validator — validateKey() — PHONE key', () => {
  it('accepts valid phone chave (9 digits)', () => {
    const r = validateKey('+5511987654321');
    expect(r.valid).toBe(true);
    expect(r.keyType).toBe('PHONE');
  });

  it('accepts valid phone chave (8 digits, fixed)', () => {
    const r = validateKey('+551132345678');
    expect(r.valid).toBe(true);
    expect(r.keyType).toBe('PHONE');
  });

  it('rejects phone with invalid DDD', () => {
    const r = validateKey('+5500987654321'); // DDD 00 is not valid
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_PIX_KEY');
  });
});

describe('Pix Validator — validateKey() — EMAIL key', () => {
  it('accepts valid email chave', () => {
    const r = validateKey('pagamento@empresa.com.br');
    expect(r.valid).toBe(true);
    expect(r.keyType).toBe('EMAIL');
    expect(r.normalizedKey).toBe('pagamento@empresa.com.br');
  });

  it('normalizes email to lowercase', () => {
    const r = validateKey('PAGAMENTO@EMPRESA.COM.BR');
    expect(r.normalizedKey).toBe('pagamento@empresa.com.br');
  });
});

describe('Pix Validator — validateKey() — EVP key', () => {
  it('accepts valid EVP (UUID v4) chave', () => {
    const r = validateKey('123e4567-e89b-42d3-a456-556642440000');
    expect(r.valid).toBe(true);
    expect(r.keyType).toBe('EVP');
  });

  it('rejects invalid UUID (wrong version digit)', () => {
    // Version must be 4 — use 3 here
    const r = validateKey('123e4567-e89b-32d3-a456-556642440000');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_PIX_KEY');
  });
});

describe('Pix Validator — validateKey() — UNKNOWN key', () => {
  it('rejects completely unrecognized key', () => {
    const r = validateKey('XYZXYZXYZ');
    expect(r.valid).toBe(false);
    expect(r.keyType).toBe('UNKNOWN');
    expect(r.issues).toContain('INVALID_PIX_KEY');
  });
});

// ─── Unit tests — isStructuringAmount() ──────────────────────────────────────

describe('Pix Validator — isStructuringAmount()', () => {
  // R$5,000 threshold: flag range [4500, 4999]
  it('flags R$4,999 as structuring', () => expect(isStructuringAmount(4999)).toBe(true));
  it('flags R$4,500 as structuring', () => expect(isStructuringAmount(4500)).toBe(true));
  it('does NOT flag R$5,000 (at threshold)', () => expect(isStructuringAmount(5000)).toBe(false));
  it('does NOT flag R$4,499 (below margin)', () => expect(isStructuringAmount(4499)).toBe(false));

  // R$10,000 threshold: flag range [9000, 9999]
  it('flags R$9,999 as structuring', () => expect(isStructuringAmount(9999)).toBe(true));
  it('flags R$9,000 as structuring', () => expect(isStructuringAmount(9000)).toBe(true));
  it('does NOT flag R$10,000 (at threshold)', () => expect(isStructuringAmount(10000)).toBe(false));
  it('does NOT flag R$8,999 (below margin)', () => expect(isStructuringAmount(8999)).toBe(false));

  it('does NOT flag normal amounts', () => {
    expect(isStructuringAmount(100)).toBe(false);
    expect(isStructuringAmount(1500)).toBe(false);
    expect(isStructuringAmount(20000)).toBe(false);
  });
});

// ─── Unit tests — isRoundAmount() ────────────────────────────────────────────

describe('Pix Validator — isRoundAmount()', () => {
  it('flags R$1,000', () => expect(isRoundAmount(1000)).toBe(true));
  it('flags R$5,000', () => expect(isRoundAmount(5000)).toBe(true));
  it('flags R$10,000', () => expect(isRoundAmount(10000)).toBe(true));
  it('does NOT flag R$999', () => expect(isRoundAmount(999)).toBe(false));
  it('does NOT flag R$1,500 (not round)', () => expect(isRoundAmount(1500)).toBe(false));
  it('does NOT flag R$250', () => expect(isRoundAmount(250)).toBe(false));
});

// ─── Unit tests — isUnusualHour() ────────────────────────────────────────────
// Brazil is UTC-3 (BRT). Unusual window = 00:00–05:59 BRT = 03:00–08:59 UTC

describe('Pix Validator — isUnusualHour()', () => {
  function utcDate(utcHour) {
    const d = new Date();
    d.setUTCHours(utcHour, 0, 0, 0);
    return d;
  }

  // UTC 03:00 = BRT 00:00 — start of unusual window
  it('flags 03:00 UTC (00:00 BRT)', () => expect(isUnusualHour(utcDate(3))).toBe(true));
  // UTC 08:00 = BRT 05:00
  it('flags 08:00 UTC (05:00 BRT)', () => expect(isUnusualHour(utcDate(8))).toBe(true));
  // UTC 09:00 = BRT 06:00 — outside window
  it('does NOT flag 09:00 UTC (06:00 BRT)', () => expect(isUnusualHour(utcDate(9))).toBe(false));
  // UTC 14:00 = BRT 11:00 — business hours
  it('does NOT flag 14:00 UTC (11:00 BRT)', () => expect(isUnusualHour(utcDate(14))).toBe(false));
  // UTC 02:00 = BRT 23:00 — late evening, not flagged
  it('does NOT flag 02:00 UTC (23:00 BRT)', () => expect(isUnusualHour(utcDate(2))).toBe(false));
});

// ─── Integration tests — POST /api/fraud/analyze with Pix ────────────────────

async function registerAndLogin(email = 'pix-tester@test.com', password = 'pass123') {
  await request(app).post('/api/auth/register').send({ email, password });
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.accessToken;
}

describe('Fraud analyze — Pix integration', () => {
  let token;
  beforeEach(async () => { token = await registerAndLogin(); });

  it('accepts transaction without pixKey — no Pix flags', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1' });

    expect(res.status).toBe(200);
    expect(res.body.pixKey).toBeNull();
    expect(res.body.pixKeyType).toBeNull();
    expect(res.body.flags).not.toContain('INVALID_PIX_KEY');
  });

  it('accepts valid CPF pixKey — stores normalized, no flags', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1', pixKey: '529.982.247-25' });

    expect(res.status).toBe(200);
    expect(res.body.pixKey).toBe('52998224725');
    expect(res.body.pixKeyType).toBe('CPF');
    expect(res.body.flags).not.toContain('INVALID_PIX_KEY');
  });

  it('accepts valid email pixKey', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1', pixKey: 'user@banco.com.br' });

    expect(res.status).toBe(200);
    expect(res.body.pixKey).toBe('user@banco.com.br');
    expect(res.body.pixKeyType).toBe('EMAIL');
    expect(res.body.flags).not.toContain('INVALID_PIX_KEY');
  });

  it('accepts valid phone pixKey', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1', pixKey: '+5511987654321' });

    expect(res.status).toBe(200);
    expect(res.body.pixKeyType).toBe('PHONE');
    expect(res.body.flags).not.toContain('INVALID_PIX_KEY');
  });

  it('accepts valid EVP pixKey', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1',
              pixKey: '123e4567-e89b-42d3-a456-556642440000' });

    expect(res.status).toBe(200);
    expect(res.body.pixKeyType).toBe('EVP');
    expect(res.body.flags).not.toContain('INVALID_PIX_KEY');
  });

  it('flags INVALID_PIX_KEY for unrecognized key format', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1', pixKey: 'XYZXYZ' });

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('INVALID_PIX_KEY');
    expect(res.body.riskScore).toBeGreaterThanOrEqual(40);
  });

  it('flags PIX_STRUCTURING for amount R$4,999 with pixKey', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 4999, userId: 'u1', location: 'BR', deviceId: 'd1', pixKey: 'user@banco.com.br' });

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('PIX_STRUCTURING');
  });

  it('flags PIX_ROUND_AMOUNT for R$5,000 exact with pixKey', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 5000, userId: 'u1', location: 'BR', deviceId: 'd1', pixKey: 'user@banco.com.br' });

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('PIX_ROUND_AMOUNT');
    // R$5000 is at the threshold, NOT structuring
    expect(res.body.flags).not.toContain('PIX_STRUCTURING');
  });

  it('flags PIX_UNUSUAL_HOUR for transaction at 03:30 UTC (00:30 BRT)', async () => {
    // Build a timestamp that is 03:30 UTC = 00:30 BRT
    const unusual = new Date();
    unusual.setUTCHours(3, 30, 0, 0);

    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1',
              pixKey: 'user@banco.com.br', transactionTime: unusual.toISOString() });

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('PIX_UNUSUAL_HOUR');
  });

  it('does NOT flag PIX_UNUSUAL_HOUR for transaction at 14:00 UTC (11:00 BRT)', async () => {
    const normal = new Date();
    normal.setUTCHours(14, 0, 0, 0);

    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1',
              pixKey: 'user@banco.com.br', transactionTime: normal.toISOString() });

    expect(res.status).toBe(200);
    expect(res.body.flags).not.toContain('PIX_UNUSUAL_HOUR');
  });

  it('stacks multiple Pix flags for a high-risk transaction', async () => {
    // Structuring amount (4999) + unusual hour + bad key
    const unusual = new Date();
    unusual.setUTCHours(4, 0, 0, 0); // 04:00 UTC = 01:00 BRT

    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 4999, userId: 'u1', location: 'BR', deviceId: 'd1',
              pixKey: 'INVALID_KEY', transactionTime: unusual.toISOString() });

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('INVALID_PIX_KEY');     // +40
    expect(res.body.flags).toContain('PIX_STRUCTURING');     // +35
    expect(res.body.flags).toContain('PIX_UNUSUAL_HOUR');    // +20
    // total = 40+35+20 = 95, capped at 100
    expect(res.body.riskScore).toBe(95);
    expect(res.body.riskLevel).toBe('HIGH');
  });

  it('report retrieved by ID includes pixKey and pixKeyType', async () => {
    const created = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1',
              pixKey: '529.982.247-25' });

    const res = await request(app)
      .get(`/api/fraud/report/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.pixKey).toBe('52998224725');
    expect(res.body.pixKeyType).toBe('CPF');
  });
});
