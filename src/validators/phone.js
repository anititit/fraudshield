/**
 * Phone Validator — Brazilian phone numbers.
 *
 * Implements:
 *  - Multi-format parsing: E.164, local with DDD, raw digits
 *  - DDD validation against the full ANATEL list
 *  - Mobile vs landline classification
 *  - Suspicious pattern detection (repeated, sequential, low-entropy digits)
 *
 * Mobile  : 9 digits after DDD, first digit must be 9 (mandatory since 2012)
 * Landline: 8 digits after DDD, first digit in {2,3,4,5}
 */

// ─── ANATEL DDD table (all valid Brazilian area codes) ───────────────────────
const DDD_REGIONS = {
  11: 'SP (São Paulo)',           12: 'SP (Vale do Paraíba)',
  13: 'SP (Baixada Santista)',    14: 'SP (Centro-Oeste Paulista)',
  15: 'SP (Sorocaba)',            16: 'SP (Ribeirão Preto)',
  17: 'SP (São José do Rio Preto)', 18: 'SP (Presidente Prudente)',
  19: 'SP (Campinas)',
  21: 'RJ (Rio de Janeiro)',      22: 'RJ (Norte/Noroeste Fluminense)',
  24: 'RJ (Sul Fluminense)',
  27: 'ES (Grande Vitória)',      28: 'ES (Interior)',
  31: 'MG (Belo Horizonte)',      32: 'MG (Zona da Mata)',
  33: 'MG (Vale do Rio Doce)',    34: 'MG (Triângulo Mineiro)',
  35: 'MG (Sul de Minas)',        37: 'MG (Centro-Oeste)',
  38: 'MG (Norte/Jequitinhonha)',
  41: 'PR (Curitiba)',            42: 'PR (Ponta Grossa)',
  43: 'PR (Londrina)',            44: 'PR (Maringá)',
  45: 'PR (Cascavel)',            46: 'PR (Pato Branco)',
  47: 'SC (Blumenau)',            48: 'SC (Florianópolis)',
  49: 'SC (Chapecó)',
  51: 'RS (Porto Alegre)',        53: 'RS (Pelotas)',
  54: 'RS (Caxias do Sul)',       55: 'RS (Santa Maria)',
  61: 'DF (Brasília)',            62: 'GO (Goiânia)',
  63: 'TO (Palmas)',              64: 'GO (Interior)',
  65: 'MT (Cuiabá)',              66: 'MT (Interior)',
  67: 'MS (Campo Grande)',        68: 'AC (Rio Branco)',
  69: 'RO (Porto Velho)',
  71: 'BA (Salvador)',            73: 'BA (Sul)',
  74: 'BA (Sudoeste)',            75: 'BA (Feira de Santana)',
  77: 'BA (Oeste)',               79: 'SE (Aracaju)',
  81: 'PE (Recife)',              82: 'AL (Maceió)',
  83: 'PB (João Pessoa)',         84: 'RN (Natal)',
  85: 'CE (Fortaleza)',           86: 'PI (Teresina)',
  87: 'PE (Interior)',            88: 'CE (Interior)',
  89: 'PI (Interior)',
  91: 'PA (Belém)',               92: 'AM (Manaus)',
  93: 'PA (Santarém)',            94: 'PA (Marabá)',
  95: 'RR (Boa Vista)',           96: 'AP (Macapá)',
  97: 'AM (Interior)',            98: 'MA (São Luís)',
  99: 'MA (Interior)',
};

const VALID_DDDS = new Set(Object.keys(DDD_REGIONS).map(Number));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip everything except digits from the input and remove a leading +55 or 55
 * country code, returning just the DDD + local number (10 or 11 digits).
 * Returns the raw digit string (may be invalid length).
 */
function clean(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  // Remove Brazil country code (55) if present at the start
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  return digits;
}

/**
 * Parse a Brazilian phone string into its components.
 * Returns null if the string cannot be interpreted as a valid-length BR number.
 */
function parse(phone) {
  const digits = clean(phone);
  if (digits.length !== 10 && digits.length !== 11) return null;

  const ddd = parseInt(digits.slice(0, 2), 10);
  const number = digits.slice(2);
  return { ddd, number, digits };
}

/**
 * Classify a phone number as MOBILE, LANDLINE, or UNKNOWN.
 * Requires the local number part (after DDD).
 */
function classifyNumber(number) {
  if (number.length === 9 && number[0] === '9') return 'MOBILE';
  if (number.length === 8 && '2345'.includes(number[0])) return 'LANDLINE';
  return 'UNKNOWN';
}

// ─── Suspicious pattern detection ────────────────────────────────────────────

function detectSuspiciousPatterns(number) {
  const patterns = [];

  // All identical digits: 99999999, 999999999
  if (/^(\d)\1+$/.test(number)) {
    patterns.push('REPEATED_DIGITS');
  }

  // Sequential ascending: 12345678 or 123456789
  const ascending = '0123456789';
  const descending = '9876543210';
  if (ascending.includes(number) || descending.includes(number)) {
    patterns.push('SEQUENTIAL_DIGITS');
  }

  // Low entropy: ≤ 2 distinct digits
  if (new Set(number.split('')).size <= 2) {
    patterns.push('LOW_ENTROPY');
  }

  return patterns;
}

// ─── Main validator ───────────────────────────────────────────────────────────

/**
 * Full Brazilian phone validation.
 *
 * Returns:
 * {
 *   valid: boolean,
 *   type: 'MOBILE' | 'LANDLINE' | 'UNKNOWN',
 *   ddd: string | null,
 *   dddRegion: string | null,
 *   number: string | null,    // local number part (without DDD)
 *   e164: string | null,      // +55 DDD number
 *   issues: string[],
 *   suspiciousPatterns: string[],
 * }
 *
 * Issue codes:
 *   INVALID_FORMAT  — cannot parse 10 or 11 digits from input
 *   INVALID_DDD     — DDD is not in the ANATEL list
 *   INVALID_NUMBER  — number part does not match mobile or landline pattern
 */
function validate(phone) {
  const issues = [];
  const suspiciousPatterns = [];

  const parsed = parse(phone);
  if (!parsed) {
    issues.push('INVALID_FORMAT');
    return { valid: false, type: 'UNKNOWN', ddd: null, dddRegion: null, number: null, e164: null, issues, suspiciousPatterns };
  }

  const { ddd, number } = parsed;
  const dddRegion = DDD_REGIONS[ddd] ?? null;

  if (!VALID_DDDS.has(ddd)) {
    issues.push('INVALID_DDD');
    return { valid: false, type: 'UNKNOWN', ddd: String(ddd).padStart(2, '0'), dddRegion: null, number, e164: null, issues, suspiciousPatterns };
  }

  const type = classifyNumber(number);
  if (type === 'UNKNOWN') {
    issues.push('INVALID_NUMBER');
    return { valid: false, type, ddd: String(ddd), dddRegion, number, e164: null, issues, suspiciousPatterns };
  }

  const e164 = `+55${ddd}${number}`;

  // Soft checks
  suspiciousPatterns.push(...detectSuspiciousPatterns(number));

  return { valid: true, type, ddd: String(ddd), dddRegion, number, e164, issues, suspiciousPatterns };
}

module.exports = { validate, clean, parse, classifyNumber, detectSuspiciousPatterns };
