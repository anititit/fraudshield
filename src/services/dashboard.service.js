const prisma = require('../config/prisma');

/**
 * Summary: total de reports agrupados por riskLevel, com filtro opcional de período.
 */
async function getSummary({ startDate, endDate } = {}) {
  const where = _dateFilter(startDate, endDate);

  const [total, byRiskLevel, avgScore] = await Promise.all([
    prisma.fraudReport.count({ where }),
    prisma.fraudReport.groupBy({
      by: ['riskLevel'],
      where,
      _count: { id: true },
    }),
    prisma.fraudReport.aggregate({
      where,
      _avg: { riskScore: true },
      _max: { riskScore: true },
    }),
  ]);

  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const row of byRiskLevel) {
    counts[row.riskLevel] = row._count.id;
  }

  return {
    total,
    byRiskLevel: counts,
    avgRiskScore: avgScore._avg.riskScore
      ? Math.round(avgScore._avg.riskScore * 100) / 100
      : 0,
    maxRiskScore: avgScore._max.riskScore ?? 0,
  };
}

/**
 * By-user: quantas transações cada analista processou e qual o risco médio.
 */
async function getByUser({ startDate, endDate } = {}) {
  const where = { ...(_dateFilter(startDate, endDate)), analyzedBy: { not: null } };

  const rows = await prisma.fraudReport.groupBy({
    by: ['analyzedBy'],
    where,
    _count: { id: true },
    _avg: { riskScore: true },
  });

  if (rows.length === 0) return [];

  const userIds = rows.map(r => r.analyzedBy);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  });
  const userMap = Object.fromEntries(users.map(u => [u.id, u.email]));

  return rows.map(row => ({
    userId: row.analyzedBy,
    email: userMap[row.analyzedBy] ?? 'unknown',
    totalReports: row._count.id,
    avgRiskScore: Math.round((row._avg.riskScore ?? 0) * 100) / 100,
  }));
}

/**
 * Timeline: contagem de reports por dia no período informado.
 */
async function getTimeline({ startDate, endDate } = {}) {
  const where = _dateFilter(startDate, endDate);

  const reports = await prisma.fraudReport.findMany({
    where,
    select: { analyzedAt: true, riskLevel: true },
    orderBy: { analyzedAt: 'asc' },
  });

  // Group by date (YYYY-MM-DD)
  const map = {};
  for (const r of reports) {
    const day = r.analyzedAt.toISOString().slice(0, 10);
    if (!map[day]) map[day] = { date: day, total: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    map[day].total++;
    map[day][r.riskLevel]++;
  }

  return Object.values(map);
}

function _dateFilter(startDate, endDate) {
  if (!startDate && !endDate) return {};
  const analyzedAt = {};
  if (startDate) analyzedAt.gte = new Date(startDate);
  if (endDate) analyzedAt.lte = new Date(endDate);
  return { analyzedAt };
}

module.exports = { getSummary, getByUser, getTimeline };
