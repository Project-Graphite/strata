import { IsBoolean } from 'class-validator';

export class MarkReadDto {
  @IsBoolean()
  read!: boolean;
}
