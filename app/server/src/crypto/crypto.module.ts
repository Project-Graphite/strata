import { Global, Module } from '@nestjs/common';
import { SecretBox } from './secret-box.service';

@Global()
@Module({
  providers: [SecretBox],
  exports: [SecretBox],
})
export class CryptoModule {}
