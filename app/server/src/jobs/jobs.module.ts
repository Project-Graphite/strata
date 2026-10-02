import { Global, Module } from '@nestjs/common';
import { MaintenanceScheduler } from './maintenance.scheduler';
import { JobsService } from './jobs.service';

@Global()
@Module({
  providers: [JobsService, MaintenanceScheduler],
  exports: [JobsService],
})
export class JobsModule {}
