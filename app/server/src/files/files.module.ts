import { Module } from '@nestjs/common';
import { ItemsModule } from '../items/items.module';
import { DiskFileStore, FileStore } from './file-store';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [ItemsModule],
  controllers: [FilesController],
  providers: [FilesService, { provide: FileStore, useClass: DiskFileStore }],
  exports: [FilesService],
})
export class FilesModule {}
