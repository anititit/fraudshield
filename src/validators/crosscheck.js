/**
 * Cross-check Validator — identity signal consistency for fraud detection.
 *
 * Implements:
 *  1. Email validation: format, disposable domains, suspicious patterns
 *  2. Geographic consistency: CPF regional prefix vs phone DDD state
 *
 * These checks only fire when the relevant signals are present and individually
 * valid — there's no value in cross-checking already-flagged invalid data.
 */

// ─── Email — disposable domain list ──────────────────────────────────────────
const DISPOSABLE_DOMAINS = new Set([
  // Guerrilla Mail family
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamail.biz', 'guerrillamail.de', 'guerrillamail.info',
  'sharklasers.com', 'grr.la', 'guerrillamailblock.com',
  // Mailinator family
  'mailinator.com', 'tradermail.info', 'mailinater.com',
  // Temp mail services
  'tempmail.com', 'temp-mail.org', 'tempmail.net',
  '10minutemail.com', '10minutemail.net', '10minutemail.org',
  'throwam.com', 'discard.email', 'dispostable.com',
  'trashmail.com', 'trashmail.me', 'trashmail.net',
  'trashmail.at', 'trashmail.io', 'trashmail.xyz',
  // Yopmail
  'yopmail.com', 'yopmail.fr',
  // Other common disposables
  'maildrop.cc', 'mailnesia.com', 'mailnull.com',
  'spam4.me', 'spamgourmet.com', 'spamgourmet.net',
  'gishpuppy.com', 'getonemail.com', 'owlymail.com',
  'filzmail.com', 'tempinbox.com',
  // Brazilian disposables
  'desechable.com', 'email-temporario.com.br', 'lixo.email',
]);

// ─── Email — generic/placeholder local parts ──────────────────────────────────
const GENERIC_LOCAL_PARTS = new Set([
  'test', 'teste', 'tester', 'testing',
  'admin', 'administrador',
  'user', 'usuario', 'utilizador',
  'info', 'information',
  'demo', 'sample', 'example', 'placeholder',
  'noreply', 'no-reply', 'nao-responda', 'noresponda',
  'nobody', 'noone', 'anonymous', 'anonimo',
  'fake', 'falso', 'temp', 'temporario', 'provisorio',
  'email', 'mail', 'correio', 'contato', 'contact',
  'abc', 'abcd', 'abcde', 'xyz', 'xpto',
  'aaa', 'bbb', 'ccc', 'ddd', 'zzz', '123', '1234',
]);

// ─── CPF first digit → Brazilian states ──────────────────────────────────────
// Based on Receita Federal regional assignment
const CPF_PREFIX_STATES = {
  0: ['RS'],
  1: ['DF', 'GO', 'MS', 'MT', 'TO'],
  2: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR'],
  3: ['CE', 'MA', 'PI'],
  4: ['AL', 'PB', 'PE', 'RN'],
  5: ['BA', 'SE'],
  6: ['MG'],
  7: ['ES', 'RJ'],
  8: ['SP'],
  9: ['PR', 'SC'],
};

// ─── Phone DDD → Brazilian state abbreviation ────────────────────────────────
const DDD_STATE = {
  11: 'SP', 12: 'SP', 13: 'SP', 14: 'SP', 15: 'SP',
  16: 'SP', 17: 'SP', 18: 'SP', 19: 'SP',
  21: 'RJ', 22: 'RJ', 24: 'RJ',
  27: 'ES', 28: 'ES',
  31: 'MG', 32: 'MG', 33: 'MG', 34: 'MG', 35: 'MG', 37: 'MG', 38: 'MG',
  41: 'PR', 42: 'PR', 43: 'PR', 44: 'PR', 45: 'PR', 46: 'PR',
  47: 'SC', 48: 'SC', 49: 'SC',
  51: 'RS', 53: 'RS', 54: 'RS', 55: 'RS',
  61: 'DF', 62: 'GO', 63: 'TO', 64: 'GO',
  65: 'MT', 66: 'MT', 67: 'MS', 68: 'AC', 69: 'RO',
  71: 'BA', 73: 'BA', 74: 'BA', 75: 'BA', 77: 'BA',
  79: 'SE',
  81: 'PE', 82: 'AL', 83: 'PB', 84: 'RN', 85: 'CE',
  86: 'PI', 87: 'PE', 88: 'CE', 89: 'PI',
  91: 'PA', 92: 'AM', 93: 'PA', 94: 'PA',
  95: 'RR', 96: 'AP', 97: 'AM', 98: 'MA', 99: 'MA',
};

// ─── Email validation ─────────────────────────────────────────────────────────

/**
 * Validate an email address and detect suspicious patterns.
 *
 * Returns:
 * {
 *   valid: boolean,
 *   normalizedEmail: string | null,
 *   issues: string[],            // 'INVALID_EMAIL_FORMAT'
 *   suspiciousPatterns: string[] // 'DISPOSABLE_EMAIL', 'GENERIC_LOCAL_PART',
 *                                //  'MIRROR_ADDRESS', 'RANDOM_HEX_LOCAL'
 * }
 */
function validateEmail(email) {
  const issues = [];
  const suspiciousPatterns = [];

  if (!email || typeof email !== 'string') {
    issues.push('INVALID_EMAIL_FORMAT');
    return { valid: false, normalizedEmail: null, issues, suspiciousPatterns };
  }

  const trimmed = email.trim().toLowerCase();

  // Basic format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    issues.push('INVALID_EMAIL_FORMAT');
    return { valid: false, normalizedEmail: null, issues, suspiciousPatterns };
  }

  const atIdx = trimmed.lastIndexOf('@');
  const localPart = trimmed.slice(0, atIdx);
  const domainPart = trimmed.slice(atIdx + 1);
  const domainName = domainPart.split('.')[0]; // e.g. "gmail" from "gmail.com"

  // Disposable domain check
  if (DISPOSABLE_DOMAINS.has(domainPart)) {
    suspiciousPatterns.push('DISPOSABLE_EMAIL');
  }

  // Generic/placeholder local part
  if (GENERIC_LOCAL_PARTS.has(localPart)) {
    suspiciousPatterns.push('GENERIC_LOCAL_PART');
  }

  // Mirror address: local part matches domain name (e.g. teste@teste.com.br)
  if (localPart === domainName) {
    suspiciousPatterns.push('MIRROR_ADDRESS');
  }

  // Random hex local part: 8+ characters that are all hex digits (looks like a hash/UUID fragment)
  if (/^[0-9a-f]{8,}$/.test(localPart)) {
    suspiciousPatterns.push('RANDOM_HEX_LOCAL');
  }

  return { valid: true, normalizedEmail: trimmed, issues, suspiciousPatterns };
}

// ─── Geographic consistency ───────────────────────────────────────────────────

/**
 * Check whether a CPF's regional prefix is geographically consistent with
 * the phone number's DDD state.
 *
 * Returns true if they are consistent (no mismatch), false if there is a
 * geographic inconsistency worth flagging.
 *
 * @param {string} cpfDigits   — clean 11-digit CPF string
 * @param {string|number} ddd  — 2-digit DDD as string or number
 */
function isGeoConsistent(cpfDigits, ddd) {
  const prefix = Number(cpfDigits[0]);
  const dddNum = Number(ddd);

  const cpfStates = CPF_PREFIX_STATES[prefix];
  const phoneState = DDD_STATE[dddNum];

  // If either mapping is unknown, we can't flag it
  if (!cpfStates || !phoneState) return true;

  return cpfStates.includes(phoneState);
}

/**
 * Run all identity cross-checks given the raw transaction fields and the
 * results already produced by individual validators.
 *
 * @param {object} inputs
 * @param {string|null}  inputs.email
 * @param {string|null}  inputs.cpfDigits      — clean digits from CPF validator, or null
 * @param {boolean}      inputs.cpfValid        — was the CPF individually valid?
 * @param {string|null}  inputs.phoneDdd        — DDD string from phone validator, or null
 * @param {boolean}      inputs.phoneValid      — was the phone individually valid?
 *
 * Returns:
 * {
 *   emailResult: object,   // full result from validateEmail()
 *   flags: string[],       // cross-check flags to add
 *   scoreIncrease: number, // total risk score increase from cross-checks
 * }
 */
function analyzeIdentitySignals({ email, cpfDigits, cpfValid, phoneDdd, phoneValid }) {
  const crossFlags = [];
  let scoreIncrease = 0;

  // 1. Email validation
  let emailResult = null;
  if (email) {
    emailResult = validateEmail(email);

    if (!emailResult.valid) {
      crossFlags.push('INVALID_EMAIL_FORMAT');
      scoreIncrease += 25;
    } else {
      if (emailResult.suspiciousPatterns.includes('DISPOSABLE_EMAIL')) {
        crossFlags.push('DISPOSABLE_EMAIL');
        scoreIncrease += 30;
      }
      // Merge remaining suspicious email patterns into one flag
      const otherPatterns = emailResult.suspiciousPatterns.filter(p => p !== 'DISPOSABLE_EMAIL');
      if (otherPatterns.length > 0) {
        crossFlags.push('SUSPICIOUS_EMAIL_PATTERN');
        scoreIncrease += 20;
      }
    }
  }

  // 2. Geographic consistency — only when both CPF and phone are individually valid
  if (cpfValid && cpfDigits && phoneValid && phoneDdd) {
    if (!isGeoConsistent(cpfDigits, phoneDdd)) {
      crossFlags.push('IDENTITY_GEO_MISMATCH');
      scoreIncrease += 25;
    }
  }

  return { emailResult, flags: crossFlags, scoreIncrease };
}

module.exports = { validateEmail, isGeoConsistent, analyzeIdentitySignals };
