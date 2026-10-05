import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimit } from '../redis/rate-limit.guard';
import { FeedQueryDto, PlaceQueryDto, WeatherQueryDto } from './dto/widgets.dto';
import { WidgetsService } from './widgets.service';

@Controller('widgets')
@UseGuards(JwtAuthGuard)
export class WidgetsController {
  constructor(private readonly widgets: WidgetsService) {}

  @Get('weather')
  @RateLimit('widget-weather', 120, 3_600)
  weather(@Query() query: WeatherQueryDto) {
    return this.widgets.weather(query.latitude, query.longitude, query.unit ?? 'celsius');
  }

  @Get('places')
  @RateLimit('widget-places', 60, 3_600)
  places(@Query() query: PlaceQueryDto) {
    return this.widgets.places(query.name);
  }

  @Get('feed')
  @RateLimit('widget-feed', 120, 3_600)
  feed(@Query() query: FeedQueryDto) {
    return this.widgets.feed(query.url);
  }
}
