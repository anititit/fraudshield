const { execSync } = require('child_process');

// Run migrations against the test DB once before all suites
beforeAll(() => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env },
    stdio: 'pipe',
  });
});

// Wipe data between each test for isolation
beforeEach(async () => {
  const prisma = require('../src/config/prisma');
  await prisma.fraudReport.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  const prisma = require('../src/config/prisma');
  await prisma.$disconnect();
});
