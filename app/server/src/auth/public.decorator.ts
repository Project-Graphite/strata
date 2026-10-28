import { SetMetadata } from '@nestjs/common';

export const publicKey = 'public';

export const Public = () => SetMetadata(publicKey, true);
