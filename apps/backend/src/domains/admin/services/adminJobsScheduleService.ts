import {
  getSchedules,
  removeSchedule,
  upsertSchedule,
} from '../../../infrastructure/jobs/client.js';
import { type JobType } from '../../../infrastructure/jobs/jobTypes.js';

export const schedulableJobTypes = ['search.reindex.full', 'maintenance.cleanup'] as const;

export function isSchedulableJobType(
  jobName: string
): jobName is (typeof schedulableJobTypes)[number] {
  return schedulableJobTypes.includes(jobName as (typeof schedulableJobTypes)[number]);
}

export async function listAdminJobSchedules() {
  const schedules = (await getSchedules()) as Array<Record<string, unknown>>;
  const allowed = new Set<JobType>(schedulableJobTypes);
  return {
    availableJobNames: schedulableJobTypes,
    items: schedules
      .filter((entry) => allowed.has(String(entry.name) as JobType))
      .map((entry) => ({
        jobName: entry.name,
        key: entry.key ?? '',
        cron: entry.cron,
        tz: entry.timezone ?? entry.tz ?? null,
        payload: entry.data ?? {},
        options: entry.options ?? {},
        createdOn: entry.createdOn ?? null,
        updatedOn: entry.updatedOn ?? null,
      })),
  };
}

export async function removeAdminJobSchedule(jobName: JobType, key?: string) {
  await removeSchedule(jobName, key);
}

export async function upsertAdminJobSchedule(args: {
  jobType: JobType;
  cron: string;
  payload?: Record<string, unknown>;
  tz?: string;
  key?: string;
}) {
  await upsertSchedule({
    jobType: args.jobType,
    cron: args.cron,
    payload: args.payload ?? {},
    tz: args.tz,
    key: args.key,
  });
}
