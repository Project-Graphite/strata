import { Global, Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { MaintenanceScheduler } from './maintenance.scheduler';
import { JobsService } from './jobs.service';

@Global()
@Module({
  imports: [FilesModule],
  providers: [JobsService, MaintenanceScheduler],
  exports: [JobsService],
})
export class JobsModule {}
