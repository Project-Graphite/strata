import { ValidateIf } from 'class-validator';

export const IsOptionalNotNull = () => ValidateIf((_object, value) => value !== undefined);
