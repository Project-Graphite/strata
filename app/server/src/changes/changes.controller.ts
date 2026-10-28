import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { interval, map, merge, Observable, takeUntil, timer } from 'rxjs';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { ChangesService } from './changes.service';

const heartbeatMs = 25_000;
const streamLifetimeMs = 15 * 60_000;

@Controller('me/changes')
export class ChangesController {
  constructor(private readonly changes: ChangesService) {}

  @Sse()
  stream(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    return merge(
      this.changes.of(user.id).pipe(map((change) => ({ data: change }))),
      interval(heartbeatMs).pipe(map(() => ({ comment: 'heartbeat' }))),
    ).pipe(takeUntil(timer(streamLifetimeMs)));
  }
}
