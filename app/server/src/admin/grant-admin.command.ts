import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { grantAdmin } from './grant-admin';

async function run([email, ...flags]: string[]) {
  if (!email || flags.some((flag) => flag !== '--revoke')) {
    throw new Error('Usage: npm run admin:grant --workspace server -- <email> [--revoke]');
  }
  const context = await NestFactory.createApplicationContext(PrismaModule, { logger: false });
  try {
    return await grantAdmin(context.get(PrismaService), email, flags.includes('--revoke'));
  } finally {
    await context.close();
  }
}

run(process.argv.slice(2))
  .then((message) => console.log(message))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
