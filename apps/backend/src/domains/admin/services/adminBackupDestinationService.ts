import type { PrismaClient } from '../../../../generated/prisma/client.js';
import {
  encryptJson,
  isBackupEncryptionConfigured,
} from '../../../infrastructure/crypto/secretBox.js';
import {
  assertSafeRemoteHost,
  assertS3BackupDestinationEndpoint,
} from '../../../infrastructure/backup/ssrfGuard.js';
import type {
  createBackupDestinationBodySchema,
  patchBackupDestinationBodySchema,
} from '../schemas/backups.js';
import type { z } from 'zod';

export function assertBackupEncryptionReady(): void {
  if (!isBackupEncryptionConfigured()) {
    throw new Error('BACKUP_ENCRYPTION_KEY is not configured');
  }
}

function validateDestinationInput(body: z.infer<typeof createBackupDestinationBodySchema>): void {
  if (body.type === 'S3_COMPATIBLE') {
    assertS3BackupDestinationEndpoint(body.config.endpoint);
  } else {
    assertSafeRemoteHost(body.config.host);
    if (!body.credentials.password && !body.credentials.privateKey) {
      throw new Error('SSH credentials require password or privateKey');
    }
  }
}

export async function listBackupDestinations(prisma: PrismaClient) {
  const items = await prisma.backupDestination.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      type: true,
      enabled: true,
      configJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return { items };
}

export async function createBackupDestination(
  prisma: PrismaClient,
  body: z.infer<typeof createBackupDestinationBodySchema>
) {
  assertBackupEncryptionReady();
  validateDestinationInput(body);
  return prisma.backupDestination.create({
    data: {
      name: body.name,
      type: body.type,
      enabled: body.enabled ?? true,
      configJson: body.config,
      credentialsCiphertext: encryptJson(body.credentials),
    },
    select: {
      id: true,
      name: true,
      type: true,
      enabled: true,
      configJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function updateBackupDestination(
  prisma: PrismaClient,
  id: string,
  body: z.infer<typeof patchBackupDestinationBodySchema>
) {
  const existing = await prisma.backupDestination.findUnique({ where: { id } });
  if (!existing) return null;

  if (body.config || body.credentials) {
    const mergedType = existing.type;
    const mergedConfig = (body.config ?? existing.configJson) as Record<string, unknown>;
    if (mergedType === 'S3_COMPATIBLE') {
      assertS3BackupDestinationEndpoint(String(mergedConfig.endpoint));
    } else {
      assertSafeRemoteHost(String(mergedConfig.host));
    }
  }

  return prisma.backupDestination.update({
    where: { id },
    data: {
      ...(body.name != null ? { name: body.name } : {}),
      ...(body.enabled != null ? { enabled: body.enabled } : {}),
      ...(body.config != null ? { configJson: body.config } : {}),
      ...(body.credentials != null ? { credentialsCiphertext: encryptJson(body.credentials) } : {}),
    },
    select: {
      id: true,
      name: true,
      type: true,
      enabled: true,
      configJson: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function deleteBackupDestination(prisma: PrismaClient, id: string): Promise<boolean> {
  const existing = await prisma.backupDestination.findUnique({ where: { id } });
  if (!existing) return false;
  await prisma.backupSettings.updateMany({
    where: { defaultDestinationId: id },
    data: { defaultDestinationId: null },
  });
  await prisma.backupDestination.delete({ where: { id } });
  return true;
}

export async function getBackupSettings(prisma: PrismaClient) {
  const settings = await prisma.backupSettings.findUnique({
    where: { id: 'default' },
    select: {
      retentionCount: true,
      defaultDestinationId: true,
      autoBackupConfigured: true,
      updatedAt: true,
    },
  });
  return (
    settings ?? {
      retentionCount: 7,
      defaultDestinationId: null,
      autoBackupConfigured: false,
      updatedAt: new Date(),
    }
  );
}

export async function updateBackupSettings(
  prisma: PrismaClient,
  data: { retentionCount?: number; defaultDestinationId?: string | null }
) {
  if (data.defaultDestinationId) {
    const dest = await prisma.backupDestination.findFirst({
      where: { id: data.defaultDestinationId, enabled: true },
    });
    if (!dest) throw new Error('Default destination not found or disabled');
  }
  return prisma.backupSettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      retentionCount: data.retentionCount ?? 7,
      defaultDestinationId: data.defaultDestinationId ?? null,
    },
    update: {
      ...(data.retentionCount != null ? { retentionCount: data.retentionCount } : {}),
      ...(data.defaultDestinationId !== undefined
        ? { defaultDestinationId: data.defaultDestinationId }
        : {}),
    },
    select: {
      retentionCount: true,
      defaultDestinationId: true,
      autoBackupConfigured: true,
      updatedAt: true,
    },
  });
}
