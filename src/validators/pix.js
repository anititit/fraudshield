/**
 * Pix Validator — Brazilian instant payment system patterns.
 *
 * Implements:
 *  - Chave Pix type detection (CPF, CNPJ, phone, e-mail, EVP/UUID)
 *  - Format validation per key type
 *  - Structuring detection (amounts just below Bacen reporting thresholds)
 *  - Unusual-hour detection (Bacen restricts large Pix 00:20–06:59)
 *  - Round-amount detection (common in money laundering / test fraud)
 */

const cpfValidator = require('./cpf');
const cnpjValidator = require('./cnpj');

// ─── Structuring thresholds (Bacen Resolução 1/2020 reporting requirements) ──
// Transactions within 10 % below R$5,000 or R$10,000 are suspicious
const THRESHOLDS = [5000, 10000];
const STRUCTURING_MARGIN = 0.10; // 10% below threshold

// ─── Unusual-hour window (BR time is UTC-3; we check UTC hour + offset) ──────
// Bacen restricts Pix above R$1,000 between 20:20 and 06:59 (local BR time).
// For fraud detection we flag the broader risk window: 00:00–05:59 local time.
const UNUSUAL_HOUR_START = 0;  // midnight
const UNUSUAL_HOUR_END   = 5;  // up to and including 05:xx

// BR is UTC-3 (BRT). We apply the offset so tests can inject any UTC timestamp.
const BRT_OFFSET_HOURS = -3;

/**
 * Detect which Pix key type a string represents.
 * Returns: 'CPF' | 'CNPJ' | 'PHONE' | 'EMAIL' | 'EVP' | 'UNKNOWN'
 */
function detectKeyType(key) {
  if (!key || typeof key !== 'string') return 'UNKNOWN';
  const trimmed = key.trim();

  // EVP — UUID v4 format (random key)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return 'EVP';
  }

  // Phone — E.164 with Brazil country code: +55 + DDD(2) + number(8 or 9)
  if (/^\+55\d{10,11}$/.test(trimmed)) {
    return 'PHONE';
  }

  // Email — RFC-5322 simplified
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'EMAIL';
  }

  // CPF — 11 digits after stripping mask
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 11) return 'CPF';
  if (digits.length === 14) return 'CNPJ';

  return 'UNKNOWN';
}

/**
 * Validate a Pix key.
 *
 * Returns:
 * {
 *   valid: boolean,
 *   keyType: string,        // detected key type
 *   normalizedKey: string,  // key in canonical form (no mask, lowercase)
 *   issues: string[],       // 'INVALID_PIX_KEY' if format is wrong
 * }
 */
function validateKey(key) {
  const issues = [];
  const keyType = detectKeyType(key);
  const trimmed = (key || '').trim();
  let normalizedKey = trimmed.toLowerCase();

  switch (keyType) {
    case 'CPF': {
      const r = cpfValidator.validate(trimmed);
      if (!r.valid) {
        issues.push('INVALID_PIX_KEY');
        return { valid: false, keyType, normalizedKey: r.digits || normalizedKey, issues };
      }
      normalizedKey = r.digits; // 11 raw digits
      break;
    }
    case 'CNPJ': {
      const r = cnpjValidator.validate(trimmed);
      if (!r.valid) {
        issues.push('INVALID_PIX_KEY');
        return { valid: false, keyType, normalizedKey: r.digits || normalizedKey, issues };
      }
      normalizedKey = r.digits; // 14 raw digits
      break;
    }
    case 'PHONE': {
      // +55 + valid DDD (11-99) + 8 or 9 digit number
      const phoneDigits = trimmed.replace(/\D/g, '');
      const ddd = parseInt(phoneDigits.slice(2, 4), 10);
      const VALID_DDDS = [11,12,13,14,15,16,17,18,19,
                         21,22,24,27,28,
                         31,32,33,34,35,37,38,
                         41,42,43,44,45,46,47,48,49,
                         51,53,54,55,
                         61,62,63,64,65,66,67,68,69,
                         71,73,74,75,77,79,
                         81,82,83,84,85,86,87,88,89,
                         91,92,93,94,95,96,97,98,99];
      if (!VALID_DDDS.includes(ddd)) {
        issues.push('INVALID_PIX_KEY');
        return { valid: false, keyType, normalizedKey: trimmed, issues };
      }
      normalizedKey = trimmed; // keep E.164 form
      break;
    }
    case 'EMAIL': {
      normalizedKey = trimmed.toLowerCase();
      break;
    }
    case 'EVP': {
      normalizedKey = trimmed.toLowerCase();
      break;
    }
    default: {
      issues.push('INVALID_PIX_KEY');
      return { valid: false, keyType: 'UNKNOWN', normalizedKey: trimmed, issues };
    }
  }

  return { valid: true, keyType, normalizedKey, issues };
}

/**
 * Return true if the amount is within the structuring danger zone —
 * i.e. within STRUCTURING_MARGIN below a Bacen reporting threshold.
 *
 * Examples (10% margin):
 *   R$4,500–R$4,999   → true   (just below R$5,000)
 *   R$9,000–R$9,999   → true   (just below R$10,000)
 *   R$5,000 or above  → false  (at or above the threshold, no avoidance benefit)
 */
function isStructuringAmount(amount) {
  for (const threshold of THRESHOLDS) {
    const lower = threshold * (1 - STRUCTURING_MARGIN);
    if (amount >= lower && amount < threshold) return true;
  }
  return false;
}

/**
 * Return true if the amount is a "suspicious round" value —
 * exact multiple of R$1,000 at or above R$1,000.
 * Round amounts are a common signal in smurfing / test fraud.
 */
function isRoundAmount(amount) {
  return amount >= 1000 && amount % 1000 === 0;
}

/**
 * Return true if the given UTC Date falls in the unusual-hour window
 * (00:00–05:59 Brazil Standard Time, UTC-3).
 */
function isUnusualHour(date) {
  const brtHour = ((date.getUTCHours() + BRT_OFFSET_HOURS) + 24) % 24;
  return brtHour >= UNUSUAL_HOUR_START && brtHour <= UNUSUAL_HOUR_END;
}

module.exports = { detectKeyType, validateKey, isStructuringAmount, isRoundAmount, isUnusualHour };
