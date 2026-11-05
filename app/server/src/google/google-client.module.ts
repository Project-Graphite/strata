import { Global, Module } from '@nestjs/common';
import { GoogleClient } from './google-client';

@Global()
@Module({
  providers: [GoogleClient],
  exports: [GoogleClient],
})
export class GoogleClientModule {}
