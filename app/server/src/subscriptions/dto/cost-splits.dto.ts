import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class CostShareDto {
  @IsUUID('all', { message: 'Choose members of this space.' })
  userId!: string;

  @IsInt()
  @Min(1, { message: 'Shares are 1 to 100.' })
  @Max(100, { message: 'Shares are 1 to 100.' })
  weight!: number;
}

export class SaveCostSplitDto {
  @IsUUID('all', { message: 'Choose who pays from this space.' })
  payerId!: string;

  @IsArray()
  @ArrayMinSize(2, { message: 'Split between at least two members.' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CostShareDto)
  shares!: CostShareDto[];
}
