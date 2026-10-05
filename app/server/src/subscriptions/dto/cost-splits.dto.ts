import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';

const Month = () => Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Months look like 2026-10.' });

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

export class BalancesQueryDto {
  @Month()
  month!: string;
}

export class CreateSettlementDto {
  @IsUUID('all', { message: 'Choose members of this space.' })
  fromUserId!: string;

  @IsUUID('all', { message: 'Choose members of this space.' })
  toUserId!: string;

  @IsInt()
  @Min(1)
  @Max(100_000_000, { message: 'That amount is too large.' })
  amountMinor!: number;

  @Matches(/^[A-Z]{3}$/, { message: 'Currencies are three-letter codes such as EUR or USD.' })
  currency!: string;

  @Month()
  month!: string;
}
