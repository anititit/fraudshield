const prisma = require('../config/prisma');

async function analyzeTransaction(transaction, requesterId) {
  const { amount, userId, location, deviceId } = transaction;

  const flags = [];
  let riskScore = 0;

  if (amount > 10000) {
    flags.push('HIGH_AMOUNT');
    riskScore += 40;
  }
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
  return { ...report, flags: JSON.parse(report.flags) };
}

module.exports = { analyzeTransaction, getReport, listReports };
