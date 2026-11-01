import { Controller, Get, Query } from '@nestjs/common';
import { Scope } from '../access-tokens/scopes';
import { RateLimit } from '../redis/rate-limit.guard';
import { FeedQueryDto, PlaceQueryDto, WeatherQueryDto } from './dto/widgets.dto';
import { WidgetsService } from './widgets.service';

@Controller('widgets')
export class WidgetsController {
  constructor(private readonly widgets: WidgetsService) {}

  @Get('weather')
  @RateLimit('widget-weather', 120, 3_600)
  @Scope('account:read')
  weather(@Query() query: WeatherQueryDto) {
    return this.widgets.weather(query.latitude, query.longitude, query.unit ?? 'celsius');
  }

  @Get('places')
  @RateLimit('widget-places', 60, 3_600)
  @Scope('account:read')
  places(@Query() query: PlaceQueryDto) {
    return this.widgets.places(query.name);
  }

  @Get('feed')
  @RateLimit('widget-feed', 120, 3_600)
  @Scope('account:read')
  feed(@Query() query: FeedQueryDto) {
    return this.widgets.feed(query.url);
  }

}
