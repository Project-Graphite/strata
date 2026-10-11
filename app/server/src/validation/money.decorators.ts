import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, Matches, Max, Min } from 'class-validator';

export const AmountMinor = () => applyDecorators(IsInt(), Min(0), Max(100_000_000, { message: 'That price is too large.' }));

export const CurrencyCode = () =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value)),
    Matches(/^[A-Z]{3}$/, { message: 'Currencies are three-letter codes such as EUR or USD.' }),
  );

export const NotCardNumber = () => Matches(/^(?!.*\d(?:[ -]?\d){4})/, { message: 'Use a label such as "Visa ending 1234". Never enter a full card number.' });
