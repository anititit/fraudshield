/**
 * CPF Validator — Brazilian individual taxpayer registry number.
 *
 * Implements:
 *  - Mask stripping and format validation (11 digits)
 *  - Known-invalid sequences (000...000 through 999...999)
 *  - Official Receita Federal check-digit algorithm
 *  - Risk pattern detection (sequential, low-entropy)
 */

// CPFs with all identical digits are structurally invalid (and pass naive length checks)
const BLOCKED_SEQUENCES = Array.from({ length: 10 }, (_, i) => String(i).repeat(11));

// CPF prefixes issued per region (first digit → region)
// Useful context, but not used for hard invalidation here
const REGION_PREFIX = {
  1: 'DF/GO/MS/MT/TO', 2: 'AC/AM/AP/PA/RO/RR',
  3: 'CE/MA/PI', 4: 'AL/PB/PE/RN', 5: 'BA/SE',
  6: 'MG', 7: 'ES/RJ', 8: 'SP', 9: 'PR/SC', 0: 'RS',
};

/**
 * Remove formatting mask from CPF string.
 * Accepts: "123.456.789-09", "12345678909", " 123.456.789-09 "
 */
function clean(cpf) {
  return String(cpf || '').replace(/\D/g, '').trim();
}

/**
 * Format 11-digit string as "XXX.XXX.XXX-XX".
 */
function format(digits) {
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * Compute the two Receita Federal check digits for the first 9 digits.
 * Returns [d1, d2] as numbers.
 */
function computeCheckDigits(digits) {
  const d = digits.split('').map(Number);

  const sum1 = d.slice(0, 9).reduce((acc, v, i) => acc + v * (10 - i), 0);
  const rem1 = sum1 % 11;
  const d1 = rem1 < 2 ? 0 : 11 - rem1;

  const sum2 = [...d.slice(0, 9), d1].reduce((acc, v, i) => acc + v * (11 - i), 0);
  const rem2 = sum2 % 11;
  const d2 = rem2 < 2 ? 0 : 11 - rem2;

  return [d1, d2];
}

/**
 * Detect suspicious patterns beyond hard invalidity.
 * Returns an array of pattern keys found.
 */
function detectSuspiciousPatterns(digits) {
  const patterns = [];

  // Ascending sequential: 12345678909 (the only valid one), 01234567890-like
  const ascending = '0123456789';
  const descending = '9876543210';
  if (ascending.includes(digits.slice(0, 8)) || descending.includes(digits.slice(0, 8))) {
    patterns.push('SEQUENTIAL_DIGITS');
  }

  // Very low entropy: e.g. only 2 distinct digits across all 11
  const unique = new Set(digits.split('')).size;
  if (unique <= 2) {
    patterns.push('LOW_ENTROPY');
  }

  return patterns;
}

/**
 * Full CPF validation.
 *
 * Returns:
 * {
 *   valid: boolean,          // true only if format AND check digits are correct
 *   formatted: string|null, // "XXX.XXX.XXX-XX" if 11 digits present, else null
 *   digits: string|null,    // raw 11-digit string if present, else null
 *   region: string|null,    // issuing region name if valid
 *   issues: string[],       // list of issue codes (see below)
 *   suspiciousPatterns: string[], // pattern codes (not hard-invalid, but risky)
 * }
 *
 * Issue codes:
 *   INVALID_FORMAT       — not 11 digits after stripping
 *   BLOCKED_SEQUENCE     — all identical digits
 *   INVALID_CHECK_DIGITS — check digits do not match algorithm
 */
function validate(cpf) {
  const digits = clean(cpf);
  const issues = [];
  const suspiciousPatterns = [];

  if (digits.length !== 11 || !/^\d{11}$/.test(digits)) {
    issues.push('INVALID_FORMAT');
    return { valid: false, formatted: null, digits: null, region: null, issues, suspiciousPatterns };
  }

  const formatted = format(digits);
  const region = REGION_PREFIX[Number(digits[0])] ?? null;

  if (BLOCKED_SEQUENCES.includes(digits)) {
    issues.push('BLOCKED_SEQUENCE');
    // Also counts as invalid check digits conceptually, but one issue is enough
    return { valid: false, formatted, digits, region, issues, suspiciousPatterns };
  }

  const [d1, d2] = computeCheckDigits(digits);
  if (Number(digits[9]) !== d1 || Number(digits[10]) !== d2) {
    issues.push('INVALID_CHECK_DIGITS');
    return { valid: false, formatted, digits, region, issues, suspiciousPatterns };
  }

  // Passed hard checks — look for soft risk patterns
  suspiciousPatterns.push(...detectSuspiciousPatterns(digits));

  return { valid: true, formatted, digits, region, issues, suspiciousPatterns };
}

module.exports = { validate, clean, format, computeCheckDigits };
