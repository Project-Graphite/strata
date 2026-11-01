import { Controller, Get } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { ExchangeRatesService } from './exchange-rates.service';

@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly exchangeRates: ExchangeRatesService) {}

  @Get()
  @Scope('items:read')
  async currencies() {
    const { publishedOn, rates } = await this.exchangeRates.table();
    return { publishedOn, currencies: [...rates.keys()] };
  }
}
