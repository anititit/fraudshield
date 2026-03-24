const request = require('supertest');
const app = require('../src/app');
const { validate, clean, classifyNumber, detectSuspiciousPatterns } = require('../src/validators/phone');

// ─── Unit tests — clean() ─────────────────────────────────────────────────────

describe('Phone Validator — clean()', () => {
  it('strips formatting from local number', () =>
    expect(clean('(11) 98765-4321')).toBe('11987654321'));
  it('strips +55 country code (13 digits → 11)', () =>
    expect(clean('+5511987654321')).toBe('11987654321'));
  it('strips 55 country code (13 digits → 11)', () =>
    expect(clean('5511987654321')).toBe('11987654321'));
  it('leaves raw DDD+number unchanged', () =>
    expect(clean('11987654321')).toBe('11987654321'));
  it('handles null gracefully', () => expect(clean(null)).toBe(''));
});

// ─── Unit tests — classifyNumber() ───────────────────────────────────────────

describe('Phone Validator — classifyNumber()', () => {
  it('classifies 9-digit number starting with 9 as MOBILE', () =>
    expect(classifyNumber('952873641')).toBe('MOBILE'));
  it('classifies 8-digit number starting with 2 as LANDLINE', () =>
    expect(classifyNumber('34567890')).toBe('LANDLINE'));
  it('classifies 8-digit number starting with 3 as LANDLINE', () =>
    expect(classifyNumber('32345678')).toBe('LANDLINE'));
  it('classifies 9-digit number starting with 8 as UNKNOWN (pre-2012 mobile format)', () =>
    expect(classifyNumber('812345678')).toBe('UNKNOWN'));
  it('classifies 7-digit number as UNKNOWN', () =>
    expect(classifyNumber('1234567')).toBe('UNKNOWN'));
});

// ─── Unit tests — detectSuspiciousPatterns() ─────────────────────────────────

describe('Phone Validator — detectSuspiciousPatterns()', () => {
  it('flags all repeated digits', () =>
    expect(detectSuspiciousPatterns('999999999')).toContain('REPEATED_DIGITS'));
  it('flags ascending sequential digits', () =>
    expect(detectSuspiciousPatterns('123456789')).toContain('SEQUENTIAL_DIGITS'));
  it('flags descending sequential digits', () =>
    expect(detectSuspiciousPatterns('987654321')).toContain('SEQUENTIAL_DIGITS'));
  it('flags low-entropy number (2 distinct digits)', () =>
    expect(detectSuspiciousPatterns('911111119')).toContain('LOW_ENTROPY')); // only 9 and 1
  it('returns no patterns for a normal number', () =>
    expect(detectSuspiciousPatterns('952873641')).toEqual([]));
});

// ─── Unit tests — validate() ─────────────────────────────────────────────────

describe('Phone Validator — valid mobile numbers', () => {
  const mobiles = [
    ['(11) 95287-3641', '11', 'SP (São Paulo)',    '+5511952873641'],
    ['+5521994561230',  '21', 'RJ (Rio de Janeiro)', '+5521994561230'],
    ['47992837465',     '47', 'SC (Blumenau)',      '+5547992837465'],
    ['(85) 9-8172-4653','85', 'CE (Fortaleza)',     '+5585981724653'],
  ];

  mobiles.forEach(([input, ddd, region, e164]) => {
    it(`accepts mobile ${input}`, () => {
      const r = validate(input);
      expect(r.valid).toBe(true);
      expect(r.type).toBe('MOBILE');
      expect(r.ddd).toBe(ddd);
      expect(r.dddRegion).toBe(region);
      expect(r.e164).toBe(e164);
      expect(r.issues).toHaveLength(0);
    });
  });
});

describe('Phone Validator — valid landline numbers', () => {
  const landlines = [
    ['(11) 3456-7890', '11', 'SP (São Paulo)',    '+551134567890'],
    ['6132451234',     '61', 'DF (Brasília)',      '+556132451234'],
    ['(31) 2345-6789', '31', 'MG (Belo Horizonte)', '+553123456789'],
  ];

  landlines.forEach(([input, ddd, region, e164]) => {
    it(`accepts landline ${input}`, () => {
      const r = validate(input);
      expect(r.valid).toBe(true);
      expect(r.type).toBe('LANDLINE');
      expect(r.ddd).toBe(ddd);
      expect(r.dddRegion).toBe(region);
      expect(r.e164).toBe(e164);
    });
  });
});

describe('Phone Validator — format errors', () => {
  it('rejects too-short input', () => {
    const r = validate('1198765');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_FORMAT');
  });

  it('rejects too-long input', () => {
    const r = validate('119876543210000');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_FORMAT');
  });

  it('rejects non-digit input', () => {
    const r = validate('not-a-phone');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_FORMAT');
  });

  it('returns null e164 on format error', () => {
    expect(validate('123').e164).toBeNull();
  });
});

describe('Phone Validator — invalid DDD', () => {
  it('rejects DDD 00 (does not exist)', () => {
    const r = validate('00987654321');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_DDD');
  });

  it('rejects DDD 23 (does not exist — gap between 22 and 24)', () => {
    const r = validate('23987654321');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_DDD');
  });

  it('rejects DDD 20 (does not exist)', () => {
    const r = validate('20987654321');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_DDD');
  });
});

describe('Phone Validator — invalid number format (valid DDD, wrong prefix/length)', () => {
  it('rejects 9-digit number starting with 8 (invalid mobile format)', () => {
    const r = validate('11812345678');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_NUMBER');
  });

  it('rejects 8-digit number starting with 9 (landline cannot start with 9)', () => {
    const r = validate('1191234567');
    expect(r.valid).toBe(false);
    expect(r.issues).toContain('INVALID_NUMBER');
  });
});

describe('Phone Validator — suspicious patterns', () => {
  it('flags repeated-digit mobile as suspicious', () => {
    const r = validate('11999999999');
    expect(r.valid).toBe(true);
    expect(r.suspiciousPatterns).toContain('REPEATED_DIGITS');
  });

  it('flags sequential mobile as suspicious', () => {
    const r = validate('11987654321'); // 987654321 is descending
    expect(r.valid).toBe(true);
    expect(r.suspiciousPatterns).toContain('SEQUENTIAL_DIGITS');
  });

  it('no suspicious patterns on a normal mobile', () => {
    const r = validate('11952873641');
    expect(r.valid).toBe(true);
    expect(r.suspiciousPatterns).toEqual([]);
  });
});

describe('Phone Validator — DDD coverage', () => {
  // Spot-check a handful of DDDs across all regions
  const samples = [
    ['13987654321', '13', 'SP (Baixada Santista)'],
    ['27987654321', '27', 'ES (Grande Vitória)'],
    ['41987654321', '41', 'PR (Curitiba)'],
    ['51987654321', '51', 'RS (Porto Alegre)'],
    ['63987654321', '63', 'TO (Palmas)'],
    ['71987654321', '71', 'BA (Salvador)'],
    ['91987654321', '91', 'PA (Belém)'],
    ['98987654321', '98', 'MA (São Luís)'],
  ];

  samples.forEach(([num, ddd, region]) => {
    it(`DDD ${ddd} → ${region}`, () => {
      const r = validate(num);
      expect(r.ddd).toBe(ddd);
      expect(r.dddRegion).toBe(region);
    });
  });
});

// ─── Integration tests — POST /api/fraud/analyze with phone ──────────────────

async function registerAndLogin(email = 'phone-tester@test.com', password = 'pass123') {
  await request(app).post('/api/auth/register').send({ email, password });
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.accessToken;
}

describe('Fraud analyze — phone integration', () => {
  let token;
  beforeEach(async () => { token = await registerAndLogin(); });

  it('accepts transaction without phone — no phone flags', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1' });

    expect(res.status).toBe(200);
    expect(res.body.phone).toBeNull();
    expect(res.body.phoneType).toBeNull();
    expect(res.body.flags).not.toContain('INVALID_PHONE_FORMAT');
  });

  it('accepts valid mobile — stores E.164, no flags', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1',
              phone: '(11) 95287-3641' });

    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('+5511952873641');
    expect(res.body.phoneType).toBe('MOBILE');
    expect(res.body.flags).not.toContain('INVALID_PHONE_FORMAT');
    expect(res.body.flags).not.toContain('SUSPICIOUS_PHONE');
  });

  it('accepts valid landline — stores E.164, type LANDLINE', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1',
              phone: '(11) 3456-7890' });

    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('+551134567890');
    expect(res.body.phoneType).toBe('LANDLINE');
    expect(res.body.flags).not.toContain('INVALID_PHONE_FORMAT');
  });

  it('flags INVALID_PHONE_FORMAT for garbage input', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1',
              phone: '123' });

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('INVALID_PHONE_FORMAT');
    expect(res.body.riskScore).toBeGreaterThanOrEqual(30);
  });

  it('flags INVALID_PHONE_DDD for non-existent area code', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1',
              phone: '23987654321' }); // DDD 23 does not exist

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('INVALID_PHONE_DDD');
    expect(res.body.riskScore).toBeGreaterThanOrEqual(20);
  });

  it('flags SUSPICIOUS_PHONE for repeated-digit number', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1',
              phone: '11999999999' }); // 999999999 — all 9s

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('SUSPICIOUS_PHONE');
    expect(res.body.riskScore).toBeGreaterThanOrEqual(20);
  });

  it('flags SUSPICIOUS_PHONE for sequential number', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1',
              phone: '11987654321' }); // 987654321 descending

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('SUSPICIOUS_PHONE');
  });

  it('combines phone fraud with CPF and other flags', async () => {
    const res = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({
        amount: 100,
        userId: 'u1',
        location: 'BR',
        deviceId: 'd1',
        cpf: '52998224700',    // wrong check digits → INVALID_CPF_DIGITS (+50)
        phone: '23987654321',  // invalid DDD → INVALID_PHONE_DDD (+20)
      });

    expect(res.status).toBe(200);
    expect(res.body.flags).toContain('INVALID_CPF_DIGITS');
    expect(res.body.flags).toContain('INVALID_PHONE_DDD');
    expect(res.body.riskScore).toBe(70); // 50+20 = 70
    expect(res.body.riskLevel).toBe('HIGH');
  });

  it('report retrieved by ID includes phone and phoneType', async () => {
    const created = await request(app)
      .post('/api/fraud/analyze')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 100, userId: 'u1', location: 'BR', deviceId: 'd1',
              phone: '+5511952873641' });

    const res = await request(app)
      .get(`/api/fraud/report/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('+5511952873641');
    expect(res.body.phoneType).toBe('MOBILE');
  });
});
