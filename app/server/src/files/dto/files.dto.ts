import { IsBoolean } from 'class-validator';

export class UpdateFileDto {
  @IsBoolean({ message: 'Choose whether the file is in your public folder.' })
  public!: boolean;
}
