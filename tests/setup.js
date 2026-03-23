const { execSync } = require('child_process');

// Apply migrations to the SQLite test DB before all suites
beforeAll(() => {
  execSync('npx prisma db push --schema=prisma/schema.test.prisma --skip-generate', {
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
