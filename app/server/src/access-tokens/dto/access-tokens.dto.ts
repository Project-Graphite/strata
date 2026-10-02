import { ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { ProofDto } from '../../auth/dto/account.dto';
import { Trimmed } from '../../validation/trimmed.decorator';
import { tokenScopes, type TokenScope } from '../scopes';

export class CreateAccessTokenDto extends ProofDto {
  @Trimmed()
  @IsString()
  @Length(1, 60, { message: 'Token names are 1 to 60 characters long.' })
  name!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one permission.' })
  @ArrayUnique()
  @IsIn(tokenScopes, { each: true, message: 'Choose permissions from the list.' })
  scopes!: TokenScope[];

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Tokens last at least 1 day.' })
  @Max(365, { message: 'Tokens last at most 365 days.' })
  expiresInDays?: number;
}
