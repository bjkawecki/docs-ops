import type { Job, PgBoss } from 'pg-boss';
import { prisma } from '../db.js';
import type { JobLogger } from './jobRegistry.js';
import { jobDefinitions } from './jobRegistry.js';

export async function ensureQueues(boss: PgBoss, logger: JobLogger): Promise<void> {
  for (const definition of jobDefinitions) {
    await boss.createQueue(definition.name, { retryLimit: definition.retryLimit });
    logger.info(
      { jobName: definition.name, retryLimit: definition.retryLimit },
      'Ensured async queue exists'
    );
  }
}

export async function registerWorkers(boss: PgBoss, logger: JobLogger): Promise<void> {
  for (const definition of jobDefinitions) {
    await boss.work(definition.name, async (jobs: Job[]): Promise<void> => {
      for (const job of jobs) {
        const parsedPayload = definition.schema.parse(job.data ?? {});
        logger.info(
          { jobName: definition.name, jobId: job.id, retryLimit: definition.retryLimit },
          'Started async job execution'
        );
        await definition.handler(parsedPayload, { prisma, logger });
        logger.info({ jobName: definition.name, jobId: job.id }, 'Finished async job execution');
      }
    });
  }
}
