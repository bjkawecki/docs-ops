import { Prisma, type PrismaClient } from '../../../../generated/prisma/client.js';
import { resolveAppVersion } from '../../../infrastructure/appVersion.js';
import { enqueueJob } from '../../../infrastructure/jobs/client.js';
import type { AdminSystemUpdateStatus } from '../schemas/systemUpdate.js';
import { compareSemver, normalizeReleaseVersion } from '../utils/compareSemver.js';
import { fetchUpcomingReleaseMarkdown } from './adminUpcomingReleaseNotesService.js';
import { getSystemSettings } from './adminSystemSettingsService.js';
import { getActiveUpdateRun } from './adminUpdateRunService.js';
import { isUpdaterConfigured } from '../../../infrastructure/updater/updaterSidecarClient.js';

export const DEFAULT_UPDATE_GITHUB_REPO = 'bjkawecki/docs-ops';

type GitHubLatestRelease = {
  tag_name?: string;
  html_url?: string;
};

type CachedUpdateStatus = {
  status: AdminSystemUpdateStatus;
  expiresAt: number;
};

let updateStatusCache: CachedUpdateStatus | null = null;

const EMPTY_UPCOMING_NOTES = {
  upcomingReleaseNotesVersion: null,
  upcomingReleaseNotesMarkdown: null,
  upcomingReleaseNotesError: null,
} as const;

const EMPTY_APPLY_FIELDS = {
  updaterConfigured: false,
  canApplyUpdate: false,
  activeUpdateRun: null,
} as const;

type UpdateStatusCore = Omit<
  AdminSystemUpdateStatus,
  'updaterConfigured' | 'canApplyUpdate' | 'activeUpdateRun'
>;

function stripApplyFields(status: AdminSystemUpdateStatus): UpdateStatusCore {
  return {
    installedVersion: status.installedVersion,
    updateCheckEnabled: status.updateCheckEnabled,
    updateCheckConfigured: status.updateCheckConfigured,
    githubRepo: status.githubRepo,
    latestVersion: status.latestVersion,
    latestReleaseTag: status.latestReleaseTag,
    updateAvailable: status.updateAvailable,
    releaseUrl: status.releaseUrl,
    checkedAt: status.checkedAt,
    checkError: status.checkError,
    upcomingReleaseNotesVersion: status.upcomingReleaseNotesVersion,
    upcomingReleaseNotesMarkdown: status.upcomingReleaseNotesMarkdown,
    upcomingReleaseNotesError: status.upcomingReleaseNotesError,
  };
}

async function enrichWithApplyFields(
  prisma: PrismaClient,
  status: UpdateStatusCore
): Promise<AdminSystemUpdateStatus> {
  const updaterConfigured = isUpdaterConfigured();
  const activeUpdateRun = await getActiveUpdateRun(prisma);
  const canApplyUpdate =
    updaterConfigured &&
    status.updateCheckEnabled &&
    status.updateAvailable &&
    activeUpdateRun == null;
  return {
    ...status,
    updaterConfigured,
    canApplyUpdate,
    activeUpdateRun,
  };
}

export function getUpdateCheckGithubRepo(): string {
  const raw = process.env.DOCSOPS_UPDATE_GITHUB_REPO?.trim();
  return raw ? raw : DEFAULT_UPDATE_GITHUB_REPO;
}

export function getUpdateCheckCacheTtlSeconds(): number {
  const raw = process.env.DOCSOPS_UPDATE_CHECK_CACHE_TTL_SECONDS;
  if (raw == null || raw.trim() === '') return 86400;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 86400;
  if (n > 86400) return 86400;
  return n;
}

function buildDisabledStatus(
  installedVersion: string,
  githubRepo: string | null,
  updateCheckConfigured: boolean
): AdminSystemUpdateStatus {
  return {
    installedVersion,
    updateCheckEnabled: false,
    updateCheckConfigured,
    githubRepo,
    latestVersion: null,
    latestReleaseTag: null,
    updateAvailable: false,
    releaseUrl: null,
    checkedAt: null,
    checkError: null,
    ...EMPTY_UPCOMING_NOTES,
    ...EMPTY_APPLY_FIELDS,
  };
}

async function fetchLatestGitHubRelease(
  repo: string
): Promise<{ latestVersion: string; latestReleaseTag: string; releaseUrl: string }> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'docsops',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub Releases API returned ${res.status}`);
  }
  const body = (await res.json()) as GitHubLatestRelease;
  const tag = typeof body.tag_name === 'string' ? body.tag_name : '';
  const latestVersion = normalizeReleaseVersion(tag);
  if (latestVersion == null) {
    throw new Error(`Latest release tag is not SemVer: ${tag || '(missing)'}`);
  }
  const releaseUrl =
    typeof body.html_url === 'string' && body.html_url.trim() !== ''
      ? body.html_url
      : `https://github.com/${repo}/releases/tag/${encodeURIComponent(tag)}`;
  return { latestVersion, latestReleaseTag: tag, releaseUrl };
}

async function attachUpcomingReleaseNotes(
  status: UpdateStatusCore,
  githubRepo: string
): Promise<UpdateStatusCore> {
  if (!status.updateAvailable || status.latestVersion == null || status.latestReleaseTag == null) {
    return { ...status, ...EMPTY_UPCOMING_NOTES };
  }

  try {
    const notes = await fetchUpcomingReleaseMarkdown({
      repo: githubRepo,
      version: status.latestVersion,
      releaseTag: status.latestReleaseTag,
    });
    return {
      ...status,
      upcomingReleaseNotesVersion: status.latestVersion,
      upcomingReleaseNotesMarkdown: notes.fullMarkdown,
      upcomingReleaseNotesError: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load release notes';
    return {
      ...status,
      upcomingReleaseNotesVersion: status.latestVersion,
      upcomingReleaseNotesMarkdown: null,
      upcomingReleaseNotesError: message,
    };
  }
}

async function buildUpdateStatus(
  prisma: PrismaClient,
  refresh: boolean
): Promise<AdminSystemUpdateStatus> {
  const installedVersion = resolveAppVersion();
  const githubRepo = getUpdateCheckGithubRepo();
  const settings = await getSystemSettings(prisma);

  if (!settings.updateCheckEnabled) {
    updateStatusCache = null;
    return enrichWithApplyFields(prisma, buildDisabledStatus(installedVersion, githubRepo, false));
  }

  const now = Date.now();
  if (!refresh && updateStatusCache != null && updateStatusCache.expiresAt > now) {
    return enrichWithApplyFields(prisma, {
      ...stripApplyFields(updateStatusCache.status),
      installedVersion,
      githubRepo,
      updateCheckConfigured: true,
      updateCheckEnabled: true,
    });
  }

  const checkedAt = new Date().toISOString();
  try {
    const latest = await fetchLatestGitHubRelease(githubRepo);
    const cmp = compareSemver(installedVersion, latest.latestVersion);
    const baseStatus: UpdateStatusCore = {
      installedVersion,
      updateCheckEnabled: true,
      updateCheckConfigured: true,
      githubRepo,
      latestVersion: latest.latestVersion,
      latestReleaseTag: latest.latestReleaseTag,
      updateAvailable: cmp === -1,
      releaseUrl: latest.releaseUrl,
      checkedAt,
      checkError: null,
      ...EMPTY_UPCOMING_NOTES,
    };
    const status = await attachUpcomingReleaseNotes(baseStatus, githubRepo);
    const enriched = await enrichWithApplyFields(prisma, status);
    updateStatusCache = {
      status: enriched,
      expiresAt: now + getUpdateCheckCacheTtlSeconds() * 1000,
    };
    return enriched;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update check failed';
    const status: UpdateStatusCore = {
      installedVersion,
      updateCheckEnabled: true,
      updateCheckConfigured: true,
      githubRepo,
      latestVersion: null,
      latestReleaseTag: null,
      updateAvailable: false,
      releaseUrl: null,
      checkedAt,
      checkError: message,
      ...EMPTY_UPCOMING_NOTES,
    };
    const enriched = await enrichWithApplyFields(prisma, status);
    updateStatusCache = {
      status: enriched,
      expiresAt: now + getUpdateCheckCacheTtlSeconds() * 1000,
    };
    return enriched;
  }
}

export async function getAdminSystemUpdateStatus(
  prisma: PrismaClient,
  options?: { refresh?: boolean }
): Promise<AdminSystemUpdateStatus> {
  return buildUpdateStatus(prisma, options?.refresh === true);
}

async function hasUnreadUpdateNotification(
  prisma: PrismaClient,
  latestVersion: string
): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM user_notification
    WHERE event_type = 'update-available'
      AND read_at IS NULL
      AND payload->>'latestVersion' = ${latestVersion}
    LIMIT 1
  `);
  return rows.length > 0;
}

async function notifyAdminsUpdateAvailable(
  prisma: PrismaClient,
  status: AdminSystemUpdateStatus
): Promise<boolean> {
  if (!status.updateAvailable || status.latestVersion == null) return false;
  if (await hasUnreadUpdateNotification(prisma, status.latestVersion)) return false;

  const admins = await prisma.user.findMany({
    where: { isAdmin: true, deletedAt: null },
    select: { id: true },
  });
  if (admins.length === 0) return false;

  await enqueueJob('notifications.send', {
    eventType: 'update-available',
    targetUserIds: admins.map((a) => a.id),
    payload: {
      installedVersion: status.installedVersion,
      latestVersion: status.latestVersion,
      latestReleaseTag: status.latestReleaseTag,
      releaseUrl: status.releaseUrl,
    },
  });
  return true;
}

export async function checkAdminSystemUpdatesAndNotify(
  prisma: PrismaClient
): Promise<{ status: AdminSystemUpdateStatus; notificationSent: boolean }> {
  const status = await buildUpdateStatus(prisma, true);
  const notificationSent = await notifyAdminsUpdateAvailable(prisma, status);
  return { status, notificationSent };
}

/** Test helper */
export function resetAdminSystemUpdateCacheForTests(): void {
  updateStatusCache = null;
}
