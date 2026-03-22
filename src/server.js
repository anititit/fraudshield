const app = require('./app');
const { port } = require('./config/env');
const prisma = require('./config/prisma');

const server = app.listen(port, () => {
  console.log(`FraudShield API running on port ${port}`);
});

async function shutdown() {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
