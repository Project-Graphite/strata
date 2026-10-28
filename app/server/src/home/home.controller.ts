import { Controller, Get } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { HomeService } from './home.service';

@Controller('me/home')
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get()
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.home.summary(user.id);
  }
}
