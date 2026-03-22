const fraudService = require('../services/fraud.service');

async function analyze(req, res, next) {
  try {
    const result = await fraudService.analyzeTransaction(req.body, req.user.sub);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function getReport(req, res, next) {
  try {
    const report = await fraudService.getReport(req.params.transactionId);
    if (!report) {
      return res.status(404).json({ error: { message: 'Report not found' } });
    }
    res.status(200).json(report);
  } catch (err) {
    next(err);
  }
}

async function listReports(req, res, next) {
  try {
    const { page, limit, riskLevel, analyzedBy, startDate, endDate } = req.query;
    const result = await fraudService.listReports({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      riskLevel,
      analyzedBy,
      startDate,
      endDate,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { analyze, getReport, listReports };
