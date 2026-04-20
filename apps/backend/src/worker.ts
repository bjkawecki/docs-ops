import { createBoss } from './jobs/boss.js';
import { ensureQueues, registerWorkers } from './jobs/startWorker.js';
import { prisma } from './db.js';

const logger = {
  info: (obj: unknown, msg?: string) => {
    if (msg) console.log(msg, obj);
    else console.log(obj);
  },
  warn: (obj: unknown, msg?: string) => {
    if (msg) console.warn(msg, obj);
    else console.warn(obj);
  },
  error: (obj: unknown, msg?: string) => {
    if (msg) console.error(msg, obj);
    else console.error(obj);
  },
};

const WORKER_HEARTBEAT_INTERVAL_MS = Math.max(
  1_000,
  Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS ?? 5_000)
);
const WORKER_INSTANCE_ID = `${process.env.HOSTNAME ?? 'worker'}-${process.pid}`;
let heartbeatInterval: NodeJS.Timeout | null = null;

async function ensureHeartbeatTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS worker_heartbeat (
      instance_id TEXT PRIMARY KEY,
      heartbeat_at TIMESTAMPTZ NOT NULL
    )
  `);
}

async function writeHeartbeat(): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO worker_heartbeat (instance_id, heartbeat_at)
    VALUES (${WORKER_INSTANCE_ID}, NOW())
    ON CONFLICT (instance_id)
    DO UPDATE SET heartbeat_at = EXCLUDED.heartbeat_at
  `;
}

async function startHeartbeatLoop(): Promise<void> {
  await ensureHeartbeatTable();
  await writeHeartbeat();
  heartbeatInterval = setInterval(() => {
    void writeHeartbeat().catch((error: unknown) => {
      logger.warn(
        { error, workerInstanceId: WORKER_INSTANCE_ID },
        'Failed to write worker heartbeat'
      );
    });
  }, WORKER_HEARTBEAT_INTERVAL_MS);
  heartbeatInterval.unref();
}

const boss = createBoss();
boss.on('error', (error) => {
  logger.error({ error }, 'pg-boss emitted worker error');
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, 'Stopping async worker');
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  try {
    await boss.stop();
  } catch (error) {
    logger.error({ error, signal }, 'Failed to stop pg-boss cleanly');
  }
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await boss.start();
  await startHeartbeatLoop();
  await ensureQueues(boss, logger);
  await registerWorkers(boss, logger);
  logger.info(
    { queuesRegistered: true, workerInstanceId: WORKER_INSTANCE_ID },
    'Async worker started'
  );
} catch (error) {
  logger.error({ error }, 'Failed to start async worker');
  process.exit(1);
}
