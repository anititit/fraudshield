// Velocity check: max transactions per device within a time window
const VELOCITY_WINDOW_MINUTES = parseInt(process.env.VELOCITY_WINDOW_MINUTES || '10', 10);
const VELOCITY_MAX_TRANSACTIONS = parseInt(process.env.VELOCITY_MAX_TRANSACTIONS || '3', 10);

// Countries flagged as high-risk for fraud
const HIGH_RISK_COUNTRIES = (
  process.env.HIGH_RISK_COUNTRIES || 'KP,IR,SY,CU,SD,MM,BY,RU,VE,YE'
).split(',').map(c => c.trim().toUpperCase());

module.exports = {
  VELOCITY_WINDOW_MINUTES,
  VELOCITY_MAX_TRANSACTIONS,
  HIGH_RISK_COUNTRIES,
};
