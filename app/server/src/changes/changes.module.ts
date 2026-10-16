import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ChangesController } from './changes.controller';
import { ChangesService } from './changes.service';

@Global()
@Module({
  controllers: [ChangesController],
  providers: [ChangesService],
  exports: [ChangesService],
})
export class ChangesModule implements NestModule {
  constructor(private readonly changes: ChangesService) {}

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(this.changes.afterResponse).forRoutes('*');
  }
}
