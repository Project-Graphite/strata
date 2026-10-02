import { Global, Module } from '@nestjs/common';
import { TokenAuthenticator } from './token-authenticator';

@Global()
@Module({
  providers: [TokenAuthenticator],
  exports: [TokenAuthenticator],
})
export class TokenAuthModule {}
