import { Controller, HttpException, HttpStatus, MessageEvent, Sse, SseSignal } from '@nestjs/common';
import { interval, map, merge, Observable, takeUntil, timer } from 'rxjs';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { ChangesService } from './changes.service';

const heartbeatMs = 25_000;
const streamLifetimeMs = 15 * 60_000;
const maxStreamsPerUser = 5;

@Controller('me/changes')
export class ChangesController {
  private readonly openStreams = new Map<string, Set<AbortSignal>>();

  constructor(private readonly changes: ChangesService) {}

  @Sse()
  stream(@CurrentUser() user: AuthenticatedUser, @SseSignal() signal: AbortSignal): Observable<MessageEvent> {
    const streams = this.openStreams.get(user.id) ?? new Set<AbortSignal>();
    if (streams.size >= maxStreamsPerUser) {
      throw new HttpException('Too many open live update streams. Close another tab and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
    streams.add(signal);
    this.openStreams.set(user.id, streams);
    signal.addEventListener('abort', () => {
      streams.delete(signal);
      if (streams.size === 0) this.openStreams.delete(user.id);
    }, { once: true });
    return merge(
      this.changes.of(user.id).pipe(map((change) => ({ data: change }))),
      interval(heartbeatMs).pipe(map(() => ({ comment: 'heartbeat' }))),
    ).pipe(takeUntil(timer(streamLifetimeMs)));
  }
}
