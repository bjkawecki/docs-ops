import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../../app.js';
import { prisma } from '../../../db.js';
import { invalidateMaintenanceLockCache } from '../../../infrastructure/maintenance/maintenancePreHandler.js';
import { hashPassword } from '../../auth/services/password.js';

const TS = Date.now();
const ADMIN_EMAIL = `backup-admin-${TS}@example.com`;
const PASSWORD = 'testpass123';

function getCookieHeader(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'];
  if (Array.isArray(setCookie)) return setCookie.join('; ');
  if (typeof setCookie === 'string') return setCookie;
  return '';
}

describe('Admin backup routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let adminId: string;

  beforeAll(async () => {
    app = await buildApp();
    const passwordHash = await hashPassword(PASSWORD);
    const admin = await prisma.user.create({
      data: { name: 'Backup Admin', email: ADMIN_EMAIL, passwordHash, isAdmin: true },
    });
    adminId = admin.id;
    await prisma.user.updateMany({
      where: { id: { not: adminId } },
      data: { isAdmin: false },
    });
  });

  afterAll(async () => {
    await prisma.systemMaintenanceLock.deleteMany({ where: { id: 'backup' } });
    invalidateMaintenanceLockCache();
    await prisma.adminBackupActionAudit.deleteMany({ where: { actorUserId: adminId } });
    await prisma.backupRun.deleteMany({});
    await prisma.session.deleteMany({ where: { userId: adminId } });
    await prisma.user.delete({ where: { id: adminId } });
    await app?.close();
  });

  async function loginAs(email: string, password: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(res.statusCode).toBe(204);
    return getCookieHeader(res);
  }

  it('GET /admin/backups/status without cookie → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/backups/status' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /admin/backups/status as admin → 200', async () => {
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/backups/status',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      minioAvailable: boolean;
      retentionCount: number;
      autoBackupConfigured: boolean;
    };
    expect(typeof body.minioAvailable).toBe('boolean');
    expect(body.retentionCount).toBeGreaterThan(0);
    expect(typeof body.autoBackupConfigured).toBe('boolean');
  });

  it('PATCH /admin/backups/schedule enable without default destination → 400', async () => {
    const prevKey = process.env.BACKUP_ENCRYPTION_KEY;
    process.env.BACKUP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    try {
      await prisma.backupSettings.upsert({
        where: { id: 'default' },
        create: { id: 'default', defaultDestinationId: null },
        update: { defaultDestinationId: null },
      });
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/backups/schedule',
        headers: { cookie, 'Content-Type': 'application/json' },
        payload: { enabled: true, cron: '0 3 * * *', tz: 'UTC' },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      if (prevKey == null) delete process.env.BACKUP_ENCRYPTION_KEY;
      else process.env.BACKUP_ENCRYPTION_KEY = prevKey;
    }
  });

  it('PATCH /admin/jobs/schedules/maintenance.backup enable → 403', async () => {
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/jobs/schedules/maintenance.backup',
      headers: { cookie, 'Content-Type': 'application/json' },
      payload: { enabled: true, cron: '0 3 * * *' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /admin/backups without MinIO → 400 when unavailable', async () => {
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/backups/status',
      headers: { cookie },
    });
    const status = statusRes.json() as { minioAvailable: boolean; encryptionConfigured: boolean };
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/backups',
      headers: { cookie },
      payload: {},
    });
    if (!status.minioAvailable || !status.encryptionConfigured) {
      expect(res.statusCode).toBe(400);
    }
  });

  it('DELETE /admin/backups/:id/local clears localObjectKey', async () => {
    const run = await prisma.backupRun.create({
      data: {
        status: 'succeeded',
        triggerSource: 'manual',
        localObjectKey: 'backups/test-run/archive.tar.zst',
        remotePath: 'offsite/archive.tar.zst',
        finishedAt: new Date(),
      },
    });
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/backups/${run.id}/local`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { localObjectKey: string | null };
    expect(body.localObjectKey).toBeNull();
    const persisted = await prisma.backupRun.findUnique({ where: { id: run.id } });
    expect(persisted?.localObjectKey).toBeNull();
    expect(persisted?.remotePath).toBe('offsite/archive.tar.zst');
  });

  it('DELETE /admin/backups/:id/local without local copy → 400', async () => {
    const run = await prisma.backupRun.create({
      data: {
        status: 'succeeded',
        triggerSource: 'manual',
        localObjectKey: null,
        finishedAt: new Date(),
      },
    });
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/backups/${run.id}/local`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /admin/backups/:id deletes failed run', async () => {
    const run = await prisma.backupRun.create({
      data: {
        status: 'failed',
        triggerSource: 'manual',
        errorMessage: 'pg_dump failed',
        finishedAt: new Date(),
      },
    });
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/backups/${run.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(204);
    const persisted = await prisma.backupRun.findUnique({ where: { id: run.id } });
    expect(persisted).toBeNull();
  });

  it('DELETE /admin/backups/:id for succeeded run → 400', async () => {
    const run = await prisma.backupRun.create({
      data: {
        status: 'succeeded',
        triggerSource: 'manual',
        localObjectKey: 'backups/test/archive.tar.zst',
        finishedAt: new Date(),
      },
    });
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/backups/${run.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /admin/backups/:id/download without local copy → 404', async () => {
    const run = await prisma.backupRun.create({
      data: {
        status: 'succeeded',
        triggerSource: 'manual',
        localObjectKey: null,
        finishedAt: new Date(),
      },
    });
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/backups/${run.id}/download`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('blocks mutating API during maintenance lock', async () => {
    await prisma.systemMaintenanceLock.upsert({
      where: { id: 'backup' },
      create: { id: 'backup', reason: 'backup', backupRunId: 'test' },
      update: { reason: 'backup', lockedAt: new Date() },
    });
    invalidateMaintenanceLockCache();
    const cookie = await loginAs(ADMIN_EMAIL, PASSWORD);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/documents',
      headers: { cookie },
      payload: { title: 'blocked', contextId: 'invalid' },
    });
    expect(res.statusCode).toBe(503);
    await prisma.systemMaintenanceLock.deleteMany({ where: { id: 'backup' } });
    invalidateMaintenanceLockCache();
  });
});
