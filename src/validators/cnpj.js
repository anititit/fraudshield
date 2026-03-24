/**
 * CNPJ Validator — Brazilian company taxpayer registry number.
 *
 * Implements:
 *  - Mask stripping and format validation (14 digits)
 *  - Known-invalid sequences (000...000 through 999...999)
 *  - Official Receita Federal check-digit algorithm
 *  - Risk pattern detection (sequential, low-entropy)
 */

// CNPJs with all identical digits are structurally invalid
const BLOCKED_SEQUENCES = Array.from({ length: 10 }, (_, i) => String(i).repeat(14));

// Check-digit weights for the two verification rounds
const WEIGHTS_D1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const WEIGHTS_D2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Remove formatting mask from CNPJ string.
 * Accepts: "11.222.333/0001-81", "11222333000181", " 11.222.333/0001-81 "
 */
function clean(cnpj) {
  return String(cnpj || '').replace(/\D/g, '').trim();
}

/**
 * Format 14-digit string as "XX.XXX.XXX/XXXX-XX".
 */
function format(digits) {
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/**
 * Compute the two Receita Federal check digits for the first 12 digits.
 * Returns [d1, d2] as numbers.
 */
function computeCheckDigits(digits) {
  const d = digits.split('').map(Number);

  const sum1 = WEIGHTS_D1.reduce((acc, w, i) => acc + d[i] * w, 0);
  const rem1 = sum1 % 11;
  const d1 = rem1 < 2 ? 0 : 11 - rem1;

  const base13 = [...d.slice(0, 12), d1];
  const sum2 = WEIGHTS_D2.reduce((acc, w, i) => acc + base13[i] * w, 0);
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

  // Sequential ascending/descending in the CNPJ base (first 8 digits)
  const base = digits.slice(0, 8);
  const ascending = '01234567890123456789';
  const descending = '98765432109876543210';
  if (ascending.includes(base) || descending.includes(base)) {
    patterns.push('SEQUENTIAL_DIGITS');
  }

  // Very low entropy: only 2 or fewer distinct digits across all 14
  const unique = new Set(digits.split('')).size;
  if (unique <= 2) {
    patterns.push('LOW_ENTROPY');
  }

  // Branch 0000 (matriz) is normal, but branches like 0000–9999 incrementing
  // across a very small base may indicate bulk-generated CNPJs — flag if
  // the order number (digits 8–11) is 0000 (fine) or ≥9000 (extremely high)
  const order = parseInt(digits.slice(8, 12), 10);
  if (order >= 9000) {
    patterns.push('HIGH_BRANCH_NUMBER');
  }

  return patterns;
}

/**
 * Full CNPJ validation.
 *
 * Returns:
 * {
 *   valid: boolean,              // true only if format AND check digits are correct
 *   formatted: string|null,      // "XX.XXX.XXX/XXXX-XX" if 14 digits present, else null
 *   digits: string|null,         // raw 14-digit string if present, else null
 *   issues: string[],            // list of issue codes (see below)
 *   suspiciousPatterns: string[], // pattern codes (not hard-invalid, but risky)
 * }
 *
 * Issue codes:
 *   INVALID_FORMAT       — not 14 digits after stripping
 *   BLOCKED_SEQUENCE     — all identical digits
 *   INVALID_CHECK_DIGITS — check digits do not match algorithm
 */
function validate(cnpj) {
  const digits = clean(cnpj);
  const issues = [];
  const suspiciousPatterns = [];

  if (digits.length !== 14 || !/^\d{14}$/.test(digits)) {
    issues.push('INVALID_FORMAT');
    return { valid: false, formatted: null, digits: null, issues, suspiciousPatterns };
  }

  const formatted = format(digits);

  if (BLOCKED_SEQUENCES.includes(digits)) {
    issues.push('BLOCKED_SEQUENCE');
    return { valid: false, formatted, digits, issues, suspiciousPatterns };
  }

  const [d1, d2] = computeCheckDigits(digits);
  if (Number(digits[12]) !== d1 || Number(digits[13]) !== d2) {
    issues.push('INVALID_CHECK_DIGITS');
    return { valid: false, formatted, digits, issues, suspiciousPatterns };
  }

  // Passed hard checks — look for soft risk patterns
  suspiciousPatterns.push(...detectSuspiciousPatterns(digits));

  return { valid: true, formatted, digits, issues, suspiciousPatterns };
}

module.exports = { validate, clean, format, computeCheckDigits };
