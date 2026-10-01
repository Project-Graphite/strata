import { ArgumentsHost, Catch, ConflictException, NotFoundException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

@Catch()
export class ApiExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2025') {
      return super.catch(new NotFoundException('Nothing was found at this address'), host);
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      return super.catch(new ConflictException('That already exists'), host);
    }
    return super.catch(exception, host);
  }
}
