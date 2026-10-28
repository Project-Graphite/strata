import { ArgumentsHost, Catch, ConflictException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

const logger = new Logger('Errors');

@Catch()
export class ApiExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2025') {
      return super.catch(new NotFoundException('Nothing was found at this address'), host);
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      return super.catch(new ConflictException('That already exists'), host);
    }
    if (exception instanceof HttpException || host.getType() !== 'http') {
      return super.catch(exception, host);
    }
    const request = host.switchToHttp().getRequest<Request>();
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = response.locals.requestId as string | undefined;
    logger.error({
      requestId,
      userId: (request.user as { id?: string } | undefined)?.id,
      method: request.method,
      route: request.route ? `${request.baseUrl}${String(request.route.path)}` : request.path,
      status: 500,
      error: exception instanceof Error ? exception.stack : String(exception),
    });
    if (response.headersSent) {
      response.end();
      return;
    }
    response.status(500).json({ statusCode: 500, message: 'Something went wrong on our side', requestId });
  }
}
