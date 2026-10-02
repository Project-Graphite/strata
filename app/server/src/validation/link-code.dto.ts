import { IsString, Length } from 'class-validator';

export class LinkCodeDto {
  @IsString()
  @Length(43, 43, { message: 'This link is incomplete. Open the whole link.' })
  code!: string;
}
