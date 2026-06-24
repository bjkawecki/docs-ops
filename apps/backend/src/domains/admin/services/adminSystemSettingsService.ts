import type { PrismaClient } from '../../../../generated/prisma/client.js';

export type SystemSettingsView = {
  updateCheckEnabled: boolean;
  updatedAt: Date;
};

export async function getSystemSettings(prisma: PrismaClient): Promise<SystemSettingsView> {
  const settings = await prisma.systemSettings.findUnique({
    where: { id: 'default' },
    select: { updateCheckEnabled: true, updatedAt: true },
  });
  return (
    settings ?? {
      updateCheckEnabled: true,
      updatedAt: new Date(),
    }
  );
}

export async function updateSystemSettings(
  prisma: PrismaClient,
  data: { updateCheckEnabled?: boolean }
): Promise<SystemSettingsView> {
  return prisma.systemSettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      updateCheckEnabled: data.updateCheckEnabled ?? true,
    },
    update: {
      ...(data.updateCheckEnabled !== undefined
        ? { updateCheckEnabled: data.updateCheckEnabled }
        : {}),
    },
    select: { updateCheckEnabled: true, updatedAt: true },
  });
}
