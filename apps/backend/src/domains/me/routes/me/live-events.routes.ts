import type { FastifyInstance } from 'fastify';
import {
  getEffectiveUserId,
  requireAuthPreHandler,
  type RequestWithUser,
} from '../../../auth/middleware.js';
import {
  getLiveEventsHeartbeatIntervalMs,
  isLiveEventsEnabled,
} from '../../../../infrastructure/liveEvents/liveEventConfig.js';
import {
  registerLiveEventConnection,
  unregisterLiveEventConnection,
} from '../../../../infrastructure/liveEvents/liveEventRegistry.js';
import {
  formatSsePingFrame,
  writeSseFrame,
} from '../../../../infrastructure/liveEvents/liveEventSse.js';
import { touchUserActivityFireAndForget } from '../../../me/services/userActivityService.js';

function registerMeLiveEventsRoutes(app: FastifyInstance): void {
  app.get('/me/events', { preHandler: requireAuthPreHandler }, async (request, reply) => {
    if (!isLiveEventsEnabled()) {
      return reply.status(503).send({
        error: 'Live events are disabled',
        code: 'LIVE_EVENTS_DISABLED',
      });
    }

    const userId = getEffectiveUserId(request as RequestWithUser);
    touchUserActivityFireAndForget(request.server.prisma, userId);

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const write = (chunk: string) => {
      reply.raw.write(chunk);
    };

    const connection = registerLiveEventConnection(
      userId,
      {
        write,
        close: () => {
          try {
            reply.raw.end();
          } catch {
            // already closed
          }
        },
      },
      request.log
    );

    writeSseFrame(write, formatSsePingFrame());

    const heartbeatMs = getLiveEventsHeartbeatIntervalMs();
    const heartbeat = setInterval(() => {
      const ok = writeSseFrame(write, formatSsePingFrame());
      if (!ok) {
        clearInterval(heartbeat);
        unregisterLiveEventConnection(connection, request.log);
      }
    }, heartbeatMs);
    heartbeat.unref();

    const cleanup = () => {
      clearInterval(heartbeat);
      unregisterLiveEventConnection(connection, request.log);
    };

    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);
  });
}

export { registerMeLiveEventsRoutes };
