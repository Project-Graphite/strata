import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export class GoogleStartDto {
  @IsOptional()
  @IsString()
  @Length(43, 43, { message: 'This invite link is incomplete. Open the whole link.' })
  invite?: string;
}

export class GoogleConnectDto {
  @IsIn(['link', 'calendar', 'drive'])
  purpose!: 'link' | 'calendar' | 'drive';

  @IsOptional()
  @Matches(/^\/(?![/\\])[^\s]{0,199}$/, { message: 'Return to a page in Strata.' })
  returnTo?: string;
}

export class GoogleFinishDto {
  @IsString()
  @Length(1, 2_000)
  code!: string;

  @IsString()
  @Length(1, 100)
  state!: string;
}
