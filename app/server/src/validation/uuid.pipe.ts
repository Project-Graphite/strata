import { Injectable, NotFoundException, ParseUUIDPipe } from '@nestjs/common';

@Injectable()
export class UuidPipe extends ParseUUIDPipe {
  constructor() {
    super({ exceptionFactory: () => new NotFoundException('Nothing was found at this address') });
  }
}
