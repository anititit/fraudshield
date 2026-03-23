const prisma = require('../config/prisma');
const {
  VELOCITY_WINDOW_MINUTES,
  VELOCITY_MAX_TRANSACTIONS,
  HIGH_RISK_COUNTRIES,
} = require('../config/fraudRules');

async function analyzeTransaction(transaction, requesterId) {
  const { amount, userId, location, deviceId } = transaction;

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
      where: {
        deviceId,
        analyzedAt: { gte: windowStart },
      },
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

  riskScore = Math.min(riskScore, 100);

  const report = await prisma.fraudReport.create({
    data: {
      amount,
      userId: userId || null,
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
