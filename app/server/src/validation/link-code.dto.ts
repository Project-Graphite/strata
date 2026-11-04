import { IsString, Length, Matches } from 'class-validator';

const incomplete = 'This link is incomplete. Open the whole link.';

export class LinkCodeDto {
  @IsString()
  @Length(43, 43, { message: incomplete })
  code!: string;
}

export class ShareCodeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{3,64}$/, { message: incomplete })
  code!: string;
}
