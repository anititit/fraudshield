const prisma = require('../config/prisma');
const cpfValidator = require('../validators/cpf');
const cnpjValidator = require('../validators/cnpj');
const pixValidator = require('../validators/pix');
const {
  VELOCITY_WINDOW_MINUTES,
  VELOCITY_MAX_TRANSACTIONS,
  HIGH_RISK_COUNTRIES,
} = require('../config/fraudRules');

async function analyzeTransaction(transaction, requesterId) {
  const { amount, userId, cpf, cnpj, pixKey, transactionTime, location, deviceId } = transaction;

  const flags = [];
  let riskScore = 0;

  // Rule 1: high amount
  if (amount > 10000) {
    flags.push('HIGH_AMOUNT');
    riskScore += 40;
  }

  // Rule 2: missing required fields
  if (!userId) {
    flags.push('MISSING_USER');
    riskScore += 30;
  }
  if (!location) {
    flags.push('MISSING_LOCATION');
    riskScore += 10;
  }
  if (!deviceId) {
    flags.push('MISSING_DEVICE');
    riskScore += 20;
  }

  // Rule 3: velocity check — too many transactions from the same device in a short window
  if (deviceId) {
    const windowStart = new Date(Date.now() - VELOCITY_WINDOW_MINUTES * 60 * 1000);
    const recentCount = await prisma.fraudReport.count({
      where: { deviceId, analyzedAt: { gte: windowStart } },
    });
    if (recentCount >= VELOCITY_MAX_TRANSACTIONS) {
      flags.push('VELOCITY_EXCEEDED');
      riskScore += 40;
    }
  }

  // Rule 4: suspicious location (high-risk country code)
  if (location && HIGH_RISK_COUNTRIES.includes(location.toUpperCase())) {
    flags.push('SUSPICIOUS_LOCATION');
    riskScore += 30;
  }

  // Rule 5: CPF validation
  let cpfDigits = null;
  if (cpf) {
    const result = cpfValidator.validate(cpf);
    cpfDigits = result.digits; // store clean digits (no mask)

    if (!result.valid) {
      if (result.issues.includes('INVALID_FORMAT')) {
        flags.push('INVALID_CPF_FORMAT');
        riskScore += 50;
      } else if (result.issues.includes('BLOCKED_SEQUENCE')) {
        flags.push('INVALID_CPF_DIGITS');
        riskScore += 50;
      } else if (result.issues.includes('INVALID_CHECK_DIGITS')) {
        flags.push('INVALID_CPF_DIGITS');
        riskScore += 50;
      }
    } else if (result.suspiciousPatterns.length > 0) {
      flags.push('SUSPICIOUS_CPF');
      riskScore += 25;
    }
  }

  // Rule 6: CNPJ validation
  let cnpjDigits = null;
  if (cnpj) {
    const result = cnpjValidator.validate(cnpj);
    cnpjDigits = result.digits; // store clean digits (no mask)

    if (!result.valid) {
      if (result.issues.includes('INVALID_FORMAT')) {
        flags.push('INVALID_CNPJ_FORMAT');
        riskScore += 50;
      } else if (result.issues.includes('BLOCKED_SEQUENCE')) {
        flags.push('INVALID_CNPJ_DIGITS');
        riskScore += 50;
      } else if (result.issues.includes('INVALID_CHECK_DIGITS')) {
        flags.push('INVALID_CNPJ_DIGITS');
        riskScore += 50;
      }
    } else if (result.suspiciousPatterns.length > 0) {
      flags.push('SUSPICIOUS_CNPJ');
      riskScore += 25;
    }
  }

  // Rule 7: Pix suspicious patterns
  let pixKeyNormalized = null;
  let pixKeyType = null;
  if (pixKey) {
    const result = pixValidator.validateKey(pixKey);
    pixKeyNormalized = result.normalizedKey;
    pixKeyType = result.keyType;

    if (!result.valid) {
      flags.push('INVALID_PIX_KEY');
      riskScore += 40;
    }
  }

  // Pix pattern checks — applied whenever a pixKey is present
  if (pixKey) {
    const txDate = transactionTime ? new Date(transactionTime) : new Date();

    if (pixValidator.isUnusualHour(txDate)) {
      flags.push('PIX_UNUSUAL_HOUR');
      riskScore += 20;
    }
    if (pixValidator.isStructuringAmount(amount)) {
      flags.push('PIX_STRUCTURING');
      riskScore += 35;
    }
    if (pixValidator.isRoundAmount(amount)) {
      flags.push('PIX_ROUND_AMOUNT');
      riskScore += 15;
    }
  }

  riskScore = Math.min(riskScore, 100);

  const report = await prisma.fraudReport.create({
    data: {
      amount,
      userId: userId || null,
      cpf: cpfDigits,
      cnpj: cnpjDigits,
      pixKey: pixKeyNormalized,
      pixKeyType: pixKeyType,
      location: location || null,
      deviceId: deviceId || null,
      riskScore,
      riskLevel: riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW',
      flags: JSON.stringify(flags),
      analyzedBy: requesterId || null,
    },
  });

  return formatReport(report);
}

async function getReport(id) {
  const report = await prisma.fraudReport.findUnique({ where: { id } });
  return report ? formatReport(report) : null;
}

async function listReports({ page = 1, limit = 20, riskLevel, analyzedBy, startDate, endDate } = {}) {
  const where = {};

  if (riskLevel) where.riskLevel = riskLevel;
  if (analyzedBy) where.analyzedBy = analyzedBy;
  if (startDate || endDate) {
    where.analyzedAt = {};
    if (startDate) where.analyzedAt.gte = new Date(startDate);
    if (endDate) where.analyzedAt.lte = new Date(endDate);
  }

  const [reports, total] = await Promise.all([
    prisma.fraudReport.findMany({
      where,
      orderBy: { analyzedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.fraudReport.count({ where }),
  ]);

  return {
    data: reports.map(formatReport),
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  };
}

function formatReport(report) {
  const flags = report.flags;
  return {
    ...report,
    flags: Array.isArray(flags) ? flags : JSON.parse(flags),
  };
}

module.exports = { analyzeTransaction, getReport, listReports };
