import { Module } from '@nestjs/common';
import { PageAccessService } from './page-access.service';

@Module({ providers: [PageAccessService], exports: [PageAccessService] })
export class PageAccessModule {}
