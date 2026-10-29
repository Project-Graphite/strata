import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RequestContextInterceptor } from '../http/request-context';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor }],
  exports: [AuditService],
})
export class AuditModule {}
