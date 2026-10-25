import { Matches } from 'class-validator';

export const DayText = () => Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Dates look like 2026-10-31.' });

