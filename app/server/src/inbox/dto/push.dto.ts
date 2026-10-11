import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsString, MaxLength, ValidateNested } from 'class-validator';
import { inboxKinds } from '../inbox-kinds';

class PushKeysDto {
  @IsString()
  @MaxLength(200)
  p256dh!: string;

  @IsString()
  @MaxLength(100)
  auth!: string;
}

export class PushEndpointDto {
  @IsString()
  @MaxLength(1_000)
  endpoint!: string;
}

export class SavePushSubscriptionDto extends PushEndpointDto {
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;

  @IsArray()
  @ArrayMaxSize(inboxKinds.length)
  @ArrayUnique()
  @IsIn(inboxKinds, { each: true, message: 'Choose notification kinds from the list.' })
  kinds!: string[];
}
