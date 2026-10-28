import { Controller, Get } from '@nestjs/common';
import { ExchangeRatesService } from './exchange-rates.service';

@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly exchangeRates: ExchangeRatesService) {}

  @Get()
  async currencies() {
    const { publishedOn, rates } = await this.exchangeRates.table();
    return { publishedOn, currencies: [...rates.keys()] };
  }
}
