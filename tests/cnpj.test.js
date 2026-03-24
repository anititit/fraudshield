const request = require('supertest');
const app = require('../src/app');
const { validate, clean, format, computeCheckDigits } = require('../src/validators/cnpj');

// ─── Real valid CNPJs (verified with the official Receita Federal algorithm) ───
// Computation notes:
//   11.222.333/0001-81 → d1=8, d2=1 ✓
//   11.444.777/0001-61 → d1=6, d2=1 ✓
//   45.723.174/0001-10 → d1=1, d2=0 ✓
const VALID_CNPJS = [
  '11.222.333/0001-81',  // formatted with mask
  '11444777000161',      // raw 14 digits
  '45.723.174/0001-10',  // another valid CNPJ
];

// ─── Unit tests — pure validator ─────────────────────────────────────────────

describe('CNPJ Validator — clean()', () => {
  it('strips dots, slash and dash', () => expect(clean('11.222.333/0001-81')).toBe('11222333000181'));
  it('strips spaces', () => expect(clean(' 11.222.333/0001-81 ')).toBe('11222333000181'));
  it('leaves raw digits unchanged', () => expect(clean('11222333000181')).toBe('11222333000181'));
  it('handles null/undefined gracefully', () => expect(clean(null)).toBe(''));
});

describe('CNPJ Validator — format()', () => {
  it('formats 14 digits as XX.XXX.XXX/XXXX-XX', () => {
    expect(format('11222333000181')).toBe('11.222.333/0001-81');
  });
});

describe('CNPJ Validator — computeCheckDigits()', () => {
  it('computes correct digits for 11.222.333/0001-81', () => {
    expect(computeCheckDigits('11222333000181')).toEqual([8, 1]);
  });
  it('computes correct digits for 11.444.777/0001-61', () => {
    expect(computeCheckDigits('11444777000161')).toEqual([6, 1]);
  });
  it('computes correct digits for 45.723.174/0001-10', () => {
    expect(computeCheckDigits('45723174000110')).toEqual([1, 0]);
  });
});

describe('CNPJ Validator — format validation', () => {
  it('rejects CNPJ shorter than 14 digits', () => {
    const r = validate('11.222.333/0001');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_FORMAT');
  });

  it('rejects CNPJ longer than 14 digits', () => {
    const r = validate('112223330001810');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_FORMAT');
  });

  it('rejects CNPJ with letters', () => {
    const r = validate('AB.222.333/0001-81');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_FORMAT');
  });

  it('returns null formatted and digits on format error', () => {
    const r = validate('123');
    expect(r.formatted).toBeNull();
    expect(r.digits).toBeNull();
  });
});

describe('CNPJ Validator — blocked sequences (all identical digits)', () => {
  const blocked = ['00000000000000', '11111111111111', '22222222222222', '33333333333333',
                   '44444444444444', '55555555555555', '66666666666666', '77777777777777',
                   '88888888888888', '99999999999999'];

  blocked.forEach(seq => {
    it(`rejects ${seq}`, () => {
      const r = validate(seq);
      expect(r.valid).toBe(false);
      expect(r.issues).toContain('BLOCKED_SEQUENCE');
    });
  });
});

describe('CNPJ Validator — invalid check digits', () => {
  it('rejects CNPJ with first check digit wrong', () => {
    // 11.222.333/0001-81 → tamper first check digit: /0001-91
    const r = validate('11222333000191');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_CHECK_DIGITS');
  });

  it('rejects CNPJ with second check digit wrong', () => {
    // tamper second digit: /0001-80
    const r = validate('11222333000180');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_CHECK_DIGITS');
  });

  it('rejects CNPJ with both digits wrong', () => {
    const r = validate('11222333000100');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_CHECK_DIGITS');
  });
});

describe('CNPJ Validator — valid CNPJs', () => {
  VALID_CNPJS.forEach(cnpj => {
    it(`accepts ${cnpj}`, () => {
      const r = validate(cnpj);
      expect(r.valid).toBe(true);
      expect(r.issues).toHaveLength(0);
      expect(r.formatted).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
      expect(r.digits).toHaveLength(14);
    });
  });

  it('stores clean 14-digit string in result.digits', () => {
    const r = validate('11.222.333/0001-81');
    expect(r.digits).toBe('11222333000181');
  });
});

describe('CNPJ Validator — suspicious patterns', () => {
  it('no suspicious patterns on a normal valid CNPJ', () => {
    const r = validate('11.222.333/0001-81');
    expect(r.suspiciousPatterns).toEqual([]);
  });
});

// ─── Integration tests — POST /api/fraud/analyze with CNPJ ───────────────────

async function registerAndLogin(email = 'cnpj-tester@test.com', password = 'pass123') {
  await request(app).post('/api/auth/register').send({ email, password });
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.accessToken;
}

describe('Fraud analyze — CNPJ integration', () => {
  let token;
  beforeEach(async () => { token = await registerAndLogin(); });

  it('accepts transaction without CNPJ — no CNPJ flags', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1' });

    expect(res.status).toBe(200);
    expect(res.body.cnpj).toBeNull();
    expect(res.body.flags).not.toContain('INVALID_CNPJ_FORMAT');
    expect(res.body.flags).not.toContain('INVALID_CNPJ_DIGITS');
  });

  it('accepts valid CNPJ — stores clean digits, no CNPJ flags', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1', cnpj: '11.222.333/0001-81' });

    expect(res.status).toBe(200);
    expect(res.body.cnpj).toBe('11222333000181'); // stored without mask
    expect(res.body.flags).not.toContain('INVALID_CNPJ_FORMAT');
    expect(res.body.flags).not.toContain('INVALID_CNPJ_DIGITS');
  });

  it('flags INVALID_CNPJ_FORMAT for malformed CNPJ', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1', cnpj: '11.222.333' });

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('INVALID_CNPJ_FORMAT');
    expect(res.body.riskScore).toBeGreaterThanOrEqual(50);
  });

  it('flags INVALID_CNPJ_DIGITS for wrong check digits and elevates risk', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1', cnpj: '11222333000100' });

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('INVALID_CNPJ_DIGITS');
    expect(res.body.riskScore).toBe(50);
    expect(res.body.riskLevel).toBe('MEDIUM'); // 50 = MEDIUM (40–69)
  });

  it('flags INVALID_CNPJ_DIGITS for blocked sequence (all same digits)', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1', cnpj: '11111111111111' });

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('INVALID_CNPJ_DIGITS');
  });

  it('combines CNPJ fraud with other flags for cumulative score', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 25000, cnpj: '00000000000000', location: 'KP', deviceId: 'd1' });

    // HIGH_AMOUNT(40) + MISSING_USER(30) + SUSPICIOUS_LOCATION(30) + INVALID_CNPJ_DIGITS(50) → capped at 100
    expect(res.body.riskScore).toBe(100);
    expect(res.body.riskLevel).toBe('HIGH');
    expect(res.body.flags).toEqual(
      expect.arrayContaining(['HIGH_AMOUNT', 'MISSING_USER', 'SUSPICIOUS_LOCATION', 'INVALID_CNPJ_DIGITS'])
    );
  });

  it('report retrieved by ID includes cnpj field', async () => {
    const created = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1', cnpj: '11.222.333/0001-81' });

    const res = await request(app)
      .get(`/api/fraud/report/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.cnpj).toBe('11222333000181');
  });

  it('accepts transaction with both CPF and CNPJ — both valid', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({
        amount: 100,
        userId: 'u1',
        location: 'BR',
        deviceId: 'd1',
        cpf: '529.982.247-25',
        cnpj: '11.222.333/0001-81',
      });

    expect(res.status).toBe(200);
    expect(res.body.cpf).toBe('52998224725');
    expect(res.body.cnpj).toBe('11222333000181');
    expect(res.body.flags).not.toContain('INVALID_CPF_FORMAT');
    expect(res.body.flags).not.toContain('INVALID_CNPJ_FORMAT');
  });
});
