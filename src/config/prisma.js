const { PrismaClient } =
  process.env.NODE_ENV === 'test'
    ? require('../generated/prisma-test')
    : require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
