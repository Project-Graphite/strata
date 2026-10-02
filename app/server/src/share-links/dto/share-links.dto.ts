import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateShareLinkDto {
  @IsIn(['view', 'edit'], { message: 'Choose view or edit.' })
  access!: 'view' | 'edit';

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Links last at least 1 day.' })
  @Max(365, { message: 'Links last at most 365 days.' })
  expiresInDays?: number;
}
