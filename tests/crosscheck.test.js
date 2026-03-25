const request = require('supertest');
const app = require('../src/app');
const {
  validateEmail,
  isGeoConsistent,
  analyzeIdentitySignals,
} = require('../src/validators/crosscheck');

// ─── Unit tests — validateEmail() ────────────────────────────────────────────

describe('Cross-check — validateEmail() format', () => {
  it('accepts a standard email', () => {
    const r = validateEmail('joao.silva@empresa.com.br');
    expect(r.valid).toBe(true);
    expect(r.normalizedEmail).toBe('joao.silva@empresa.com.br');
  });

  it('normalizes email to lowercase', () => {
    const r = validateEmail('JOAO@EMPRESA.COM.BR');
    expect(r.normalizedEmail).toBe('joao@empresa.com.br');
  });

  it('rejects email without @', () => {
    const r = validateEmail('notanemail');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_EMAIL_FORMAT');
  });

  it('rejects email without domain', () => {
    const r = validateEmail('user@');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_EMAIL_FORMAT');
  });

  it('rejects null', () => {
    const r = validateEmail(null);
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_EMAIL_FORMAT');
  });
});

describe('Cross-check — validateEmail() disposable domains', () => {
  const disposables = [
    'user@mailinator.com',
    'user@guerrillamail.com',
    'user@tempmail.com',
    'user@yopmail.com',
    'user@maildrop.cc',
    'user@10minutemail.com',
    'user@trashmail.me',
  ];

  disposables.forEach(email => {
    it(`flags ${email} as DISPOSABLE_EMAIL`, () => {
      const r = validateEmail(email);
      expect(r.valid).toBe(true);           // format is valid
      expect(r.suspiciousPatterns).toContain('DISPOSABLE_EMAIL');
    });
  });
});

describe('Cross-check — validateEmail() suspicious patterns', () => {
  it('flags generic local part "test"', () => {
    const r = validateEmail('test@empresa.com.br');
    expect(r.suspiciousPatterns).toContain('GENERIC_LOCAL_PART');
  });

  it('flags generic local part "teste"', () => {
    const r = validateEmail('teste@empresa.com.br');
    expect(r.suspiciousPatterns).toContain('GENERIC_LOCAL_PART');
  });

  it('flags generic local part "admin"', () => {
    const r = validateEmail('admin@empresa.com.br');
    expect(r.suspiciousPatterns).toContain('GENERIC_LOCAL_PART');
  });

  it('flags generic local part "noreply"', () => {
    const r = validateEmail('noreply@empresa.com.br');
    expect(r.suspiciousPatterns).toContain('GENERIC_LOCAL_PART');
  });

  it('flags mirror address (local == domain name)', () => {
    const r = validateEmail('teste@teste.com.br');
    expect(r.suspiciousPatterns).toContain('MIRROR_ADDRESS');
  });

  it('flags mirror address empresa@empresa.com', () => {
    const r = validateEmail('empresa@empresa.com');
    expect(r.suspiciousPatterns).toContain('MIRROR_ADDRESS');
  });

  it('flags random hex local part', () => {
    const r = validateEmail('a1b2c3d4e5f6@dominio.com');
    expect(r.suspiciousPatterns).toContain('RANDOM_HEX_LOCAL');
  });

  it('does NOT flag a legitimate email', () => {
    const r = validateEmail('joao.silva@banco.com.br');
    expect(r.suspiciousPatterns).toEqual([]);
  });
});

// ─── Unit tests — isGeoConsistent() ──────────────────────────────────────────

describe('Cross-check — isGeoConsistent()', () => {
  // CPF prefix 8 → SP; DDD 11 → SP → consistent
  it('CPF 8xxxx (SP) + DDD 11 (SP) → consistent', () =>
    expect(isGeoConsistent('80000000000', '11')).toBe(true));

  // CPF prefix 9 → PR/SC; DDD 41 → PR → consistent
  it('CPF 9xxxx (PR/SC) + DDD 41 (PR) → consistent', () =>
    expect(isGeoConsistent('98765432100', '41')).toBe(true));

  // CPF prefix 9 → PR/SC; DDD 47 → SC → consistent
  it('CPF 9xxxx (PR/SC) + DDD 47 (SC) → consistent', () =>
    expect(isGeoConsistent('98765432100', '47')).toBe(true));

  // CPF prefix 6 → MG; DDD 31 → MG → consistent
  it('CPF 6xxxx (MG) + DDD 31 (MG) → consistent', () =>
    expect(isGeoConsistent('60000000000', '31')).toBe(true));

  // CPF prefix 1 → DF/GO/MS/MT/TO; DDD 61 → DF → consistent
  it('CPF 1xxxx (DF/GO/...) + DDD 61 (DF) → consistent', () =>
    expect(isGeoConsistent('10000000000', '61')).toBe(true));

  // CPF prefix 8 → SP; DDD 21 → RJ → mismatch
  it('CPF 8xxxx (SP) + DDD 21 (RJ) → mismatch', () =>
    expect(isGeoConsistent('52998224725', '21')).toBe(false));

  // CPF prefix 0 → RS; DDD 11 → SP → mismatch
  it('CPF 0xxxx (RS) + DDD 11 (SP) → mismatch', () =>
    expect(isGeoConsistent('00000000000', '11')).toBe(false));

  // CPF prefix 5 → BA/SE; DDD 71 → BA → consistent
  it('CPF 5xxxx (BA/SE) + DDD 71 (BA) → consistent', () =>
    expect(isGeoConsistent('52998224725', '71')).toBe(true));

  // CPF prefix 5 → BA/SE; DDD 79 → SE → consistent
  it('CPF 5xxxx (BA/SE) + DDD 79 (SE) → consistent', () =>
    expect(isGeoConsistent('52998224725', '79')).toBe(true));

  // CPF prefix 5 → BA/SE; DDD 11 → SP → mismatch
  it('CPF 5xxxx (BA/SE) + DDD 11 (SP) → mismatch', () =>
    expect(isGeoConsistent('52998224725', '11')).toBe(false));
});

// ─── Unit tests — analyzeIdentitySignals() ───────────────────────────────────

describe('Cross-check — analyzeIdentitySignals()', () => {
  it('returns no flags when no signals provided', () => {
    const r = analyzeIdentitySignals({ email: null, cpfDigits: null, cpfValid: false, phoneDdd: null, phoneValid: false });
    expect(r.flags).toEqual([]);
    expect(r.scoreIncrease).toBe(0);
  });

  it('flags DISPOSABLE_EMAIL and adds +30', () => {
    // 'hacker' is not a generic local part — only DISPOSABLE_EMAIL fires
    const r = analyzeIdentitySignals({ email: 'hacker@mailinator.com', cpfDigits: null, cpfValid: false, phoneDdd: null, phoneValid: false });
    expect(r.flags).toContain('DISPOSABLE_EMAIL');
    expect(r.flags).not.toContain('SUSPICIOUS_EMAIL_PATTERN');
    expect(r.scoreIncrease).toBe(30);
  });

  it('flags SUSPICIOUS_EMAIL_PATTERN for generic local and adds +20', () => {
    const r = analyzeIdentitySignals({ email: 'teste@banco.com.br', cpfDigits: null, cpfValid: false, phoneDdd: null, phoneValid: false });
    expect(r.flags).toContain('SUSPICIOUS_EMAIL_PATTERN');
    expect(r.scoreIncrease).toBe(20);
  });

  it('flags IDENTITY_GEO_MISMATCH when CPF (SP) + phone DDD (RJ)', () => {
    const r = analyzeIdentitySignals({
      email: null,
      cpfDigits: '52998224725', // prefix 5 → BA/SE
      cpfValid: true,
      phoneDdd: '11',           // SP → mismatch with BA/SE
      phoneValid: true,
    });
    expect(r.flags).toContain('IDENTITY_GEO_MISMATCH');
    expect(r.scoreIncrease).toBe(25);
  });

  it('does NOT flag geo mismatch when CPF or phone is invalid', () => {
    const r = analyzeIdentitySignals({
      email: null,
      cpfDigits: '52998224725',
      cpfValid: false,  // invalid CPF — skip geo check
      phoneDdd: '11',
      phoneValid: true,
    });
    expect(r.flags).not.toContain('IDENTITY_GEO_MISMATCH');
  });

  it('combines email + geo flags', () => {
    const r = analyzeIdentitySignals({
      email: 'hacker@mailinator.com', // non-generic local → only DISPOSABLE_EMAIL
      cpfDigits: '52998224725', // BA/SE
      cpfValid: true,
      phoneDdd: '11',           // SP — mismatch
      phoneValid: true,
    });
    expect(r.flags).toContain('DISPOSABLE_EMAIL');
    expect(r.flags).toContain('IDENTITY_GEO_MISMATCH');
    expect(r.scoreIncrease).toBe(55); // 30 + 25
  });
});

// ─── Integration tests — POST /api/fraud/analyze ─────────────────────────────

async function registerAndLogin(email = 'crosscheck-tester@test.com', password = 'pass123') {
  await request(app).post('/api/auth/register').send({ email, password });
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.accessToken;
}

describe('Fraud analyze — cross-check integration', () => {
  let token;
  beforeEach(async () => { token = await registerAndLogin(); });

  it('accepts transaction without email — no email flags', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1' });

    expect(res.status).toBe(200);
    expect(res.body.email).toBeNull();
    expect(res.body.flags).not.toContain('DISPOSABLE_EMAIL');
    expect(res.body.flags).not.toContain('SUSPICIOUS_EMAIL_PATTERN');
  });

  it('accepts legitimate email — stores normalized, no flags', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1',
              email: 'JOAO.SILVA@EMPRESA.COM.BR' });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('joao.silva@empresa.com.br');
    expect(res.body.flags).not.toContain('DISPOSABLE_EMAIL');
    expect(res.body.flags).not.toContain('SUSPICIOUS_EMAIL_PATTERN');
  });

  it('flags INVALID_EMAIL_FORMAT for malformed email', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1',
              email: 'notanemail' });

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('INVALID_EMAIL_FORMAT');
    expect(res.body.riskScore).toBeGreaterThanOrEqual(25);
  });

  it('flags DISPOSABLE_EMAIL for mailinator.com', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1',
              email: 'hacker@mailinator.com' });

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('DISPOSABLE_EMAIL');
    expect(res.body.riskScore).toBeGreaterThanOrEqual(30);
  });

  it('flags SUSPICIOUS_EMAIL_PATTERN for generic local part "teste"', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1',
              email: 'teste@banco.com.br' });

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('SUSPICIOUS_EMAIL_PATTERN');
  });

  it('flags IDENTITY_GEO_MISMATCH for CPF (BA/SE) + phone DDD 11 (SP)', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({
        amount: 100,
        userId: 'u1',
        location: 'BR',
        deviceId: 'd1',
        cpf: '529.982.247-25',   // prefix 5 → BA/SE
        phone: '11952873641',    // DDD 11 → SP — mismatch
      });

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('IDENTITY_GEO_MISMATCH');
    expect(res.body.riskScore).toBeGreaterThanOrEqual(25);
  });

  it('does NOT flag geo mismatch for CPF (SP) + phone DDD 11 (SP)', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({
        amount: 100,
        userId: 'u1',
        location: 'BR',
        deviceId: 'd1',
        cpf: '405.896.571-19',  // prefix 4 → AL/PB/PE/RN
        phone: '81952873641',   // DDD 81 → PE — consistent with prefix 4
      });

    expect(res.status).toBe(200);
    expect(res.body.flags).not.toContain('IDENTITY_GEO_MISMATCH');
  });

  it('stacks email + geo mismatch + CPF fraud for high risk score', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({
        amount: 100,
        userId: 'u1',
        location: 'BR',
        deviceId: 'd1',
        cpf: '529.982.247-25',       // valid, prefix 5 → BA/SE
        phone: '11952873641',         // DDD 11 → SP — IDENTITY_GEO_MISMATCH (+25)
        email: 'hacker@mailinator.com', // DISPOSABLE_EMAIL (+30)
      });

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('IDENTITY_GEO_MISMATCH');
    expect(res.body.flags).toContain('DISPOSABLE_EMAIL');
    // 25 + 30 = 55 → MEDIUM
    expect(res.body.riskScore).toBe(55);
    expect(res.body.riskLevel).toBe('MEDIUM');
  });

  it('report retrieved by ID includes email field', async () => {
    const created = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1',
              email: 'JOAO@BANCO.COM.BR' });

    const res = await request(app)
      .get(`/api/fraud/report/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('joao@banco.com.br');
  });
});
