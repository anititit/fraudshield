const dashboardService = require('../services/dashboard.service');

async function summary(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const data = await dashboardService.getSummary({ startDate, endDate });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function byUser(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const data = await dashboardService.getByUser({ startDate, endDate });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function timeline(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const data = await dashboardService.getTimeline({ startDate, endDate });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

async function all(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const data = await dashboardService.getAll({ startDate, endDate });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { summary, byUser, timeline, all };
