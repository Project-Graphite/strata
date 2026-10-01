import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { grantSystemManager } from './grant-system-manager';

async function run([email, ...flags]: string[]) {
  if (!email || flags.some((flag) => flag !== '--transfer')) {
    throw new Error(
      'Usage: npm run system-manager:grant --workspace server -- <email> [--transfer]',
    );
  }
  const context = await NestFactory.createApplicationContext(PrismaModule, { logger: false });
  try {
    return await grantSystemManager(context.get(PrismaService), email, flags.includes('--transfer'));
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
