import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { CreateExpenseDto } from './spending.dto';

const stampText = Transform(({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : value));

export class CaptureMessageDto {
  @IsString()
  @Length(1, 60, { message: 'Senders are 1 to 60 characters.' })
  from!: string;

  @IsString()
  @Length(1, 2_000, { message: 'Messages are 1 to 2,000 characters.' })
  text!: string;

  @IsOptional()
  @stampText
  @Matches(/^[1-9]\d{11,14}$/, { message: 'Times are milliseconds since 1970.' })
  sentStamp?: string;

  @IsOptional()
  @stampText
  @Matches(/^[1-9]\d{11,14}$/, { message: 'Times are milliseconds since 1970.' })
  receivedStamp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sim?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  app?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  chat?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 60, { each: true })
  allowedChats?: string[];
}

export class RecordCaptureDto extends CreateExpenseDto {
  @IsOptional()
  @IsBoolean()
  remember?: boolean;

  @IsOptional()
  @IsBoolean()
  report?: boolean;
}

export class IgnoreCaptureDto {
  @IsOptional()
  @IsIn(['sender', 'merchant'], { message: 'Ignore by sender or by merchant.' })
  always?: 'sender' | 'merchant';
}

export class UpdateSenderRuleDto {
  @IsOptional()
  @IsUUID('all', { message: 'Choose an account from the list.' })
  accountId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Choose an account from the list.' })
  toAccountId?: string;
}
