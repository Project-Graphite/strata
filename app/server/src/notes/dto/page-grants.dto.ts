import { IsEmail, IsIn, MaxLength } from 'class-validator';
import { Trimmed } from '../../validation/trimmed.decorator';

export class SavePageGrantDto {
  @Trimmed()
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsIn(['view', 'comment', 'edit', 'manage'])
  role!: 'view' | 'comment' | 'edit' | 'manage';
}
