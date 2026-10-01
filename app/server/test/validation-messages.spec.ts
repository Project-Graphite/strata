import { NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { RegisterDto } from '../src/auth/dto/register.dto';
import { UuidPipe } from '../src/validation/uuid.pipe';

const messages = async (type: new () => object, value: object) =>
  (await validate(plainToInstance(type, value)))
    .flatMap((error) => Object.values(error.constraints ?? {}))
    .sort();

describe('Validation messages', () => {
  it('explains registration problems in the app voice', async () => {
    await expect(
      messages(RegisterDto, { email: 'nope', handle: '-x', displayName: '', password: 'short' }),
    ).resolves.toEqual([
      'Display names are 1 to 80 characters long.',
      'Enter a valid email address.',
      'Handles are 3 to 32 characters long.',
      'Handles use letters, numbers, - and _, and start and end with a letter or number.',
      'Passwords are 12 to 128 characters long.',
    ]);
  });

  it('answers a malformed identifier as a missing page', async () => {
    await expect(new UuidPipe().transform('not-an-id', { type: 'param' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
