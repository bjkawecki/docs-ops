import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  setContextDisplayFromProcess,
  setContextDisplayFromProject,
  setContextDisplayFromSubcontext,
} from '../domains/organisation/services/contextOwnerDisplay.js';
import { createPublishedSeedDocument, SEED_DOCUMENT_SECTIONS } from './documents.js';
import type { SeedContextData, SeedMasterData, SeedOwnerData } from './types.js';

async function seedContexts(
  prisma: PrismaClient,
  masterData: SeedMasterData,
  ownerData: SeedOwnerData
): Promise<SeedContextData> {
  const processByScope = new Map<string, string>();
  const projectByScope = new Map<string, string>();

  const companyOwnerId = ownerData.ownerByCompany.get(ownerData.companyName);
  if (companyOwnerId) {
    const ctx = await prisma.context.create({ data: {} });
    const process = await prisma.process.create({
      data: { name: 'Company-Prozess', contextId: ctx.id, ownerId: companyOwnerId },
    });
    await setContextDisplayFromProcess(prisma, ctx.id, process.id);
    processByScope.set(`company:${ownerData.companyName}`, process.id);

    const ctx2 = await prisma.context.create({ data: {} });
    const project = await prisma.project.create({
      data: { name: 'Company-Projekt', contextId: ctx2.id, ownerId: companyOwnerId },
    });
    await setContextDisplayFromProject(prisma, ctx2.id, project.id);
    projectByScope.set(`company:${ownerData.companyName}`, project.id);

    const extraProcesses: { name: string; docTitles: string[] }[] = [
      {
        name: 'Onboarding',
        docTitles: ['Onboarding Guide', 'New Hire Checklist', 'Role Overview'],
      },
      {
        name: 'Release Process',
        docTitles: ['Release Checklist', 'Deployment Steps', 'Rollback Procedure'],
      },
      { name: 'Quality Assurance', docTitles: ['QA Guidelines', 'Test Scenarios', 'Bug Triage'] },
      {
        name: 'Documentation',
        docTitles: ['Writing Guidelines', 'API Documentation', 'Changelog Template'],
      },
      { name: 'Support Process', docTitles: ['Escalation Matrix', 'SLA Overview', 'FAQ'] },
    ];
    for (const { name: processName, docTitles } of extraProcesses) {
      const processContext = await prisma.context.create({ data: {} });
      const extraProcess = await prisma.process.create({
        data: { name: processName, contextId: processContext.id, ownerId: companyOwnerId },
      });
      await setContextDisplayFromProcess(prisma, processContext.id, extraProcess.id);
      for (const title of docTitles) {
        await createPublishedSeedDocument(prisma, {
          title,
          sections: SEED_DOCUMENT_SECTIONS,
          contextId: processContext.id,
        });
      }
    }

    const extraProjects: { name: string; docTitles: string[] }[] = [
      { name: 'Product Roadmap 2026', docTitles: ['Q1 Goals', 'Q2 Priorities', 'Feature Backlog'] },
      { name: 'Internal Wiki', docTitles: ['Getting Started', 'Tools & Access', 'Meeting Notes'] },
    ];
    for (const { name: projectName, docTitles } of extraProjects) {
      const projectContext = await prisma.context.create({ data: {} });
      const extraProject = await prisma.project.create({
        data: { name: projectName, contextId: projectContext.id, ownerId: companyOwnerId },
      });
      await setContextDisplayFromProject(prisma, projectContext.id, extraProject.id);
      for (const title of docTitles) {
        await createPublishedSeedDocument(prisma, {
          title,
          sections: SEED_DOCUMENT_SECTIONS,
          contextId: projectContext.id,
        });
      }
    }
  }

  for (const row of masterData.departments) {
    const ownerId = ownerData.ownerByDepartment.get(row.name);
    if (!ownerId) continue;
    const ctx = await prisma.context.create({ data: {} });
    const process = await prisma.process.create({
      data: { name: `${row.name}-Prozess`, contextId: ctx.id, ownerId },
    });
    await setContextDisplayFromProcess(prisma, ctx.id, process.id);
    processByScope.set(`department:${row.name}`, process.id);

    const ctx2 = await prisma.context.create({ data: {} });
    const project = await prisma.project.create({
      data: { name: `${row.name}-Projekt`, contextId: ctx2.id, ownerId },
    });
    await setContextDisplayFromProject(prisma, ctx2.id, project.id);
    projectByScope.set(`department:${row.name}`, project.id);
  }

  for (const row of masterData.teams) {
    const ownerId = ownerData.ownerByTeam.get(row.name);
    if (!ownerId) continue;
    const ctx = await prisma.context.create({ data: {} });
    const process = await prisma.process.create({
      data: { name: `${row.name}-Prozess`, contextId: ctx.id, ownerId },
    });
    await setContextDisplayFromProcess(prisma, ctx.id, process.id);
    processByScope.set(`team:${row.name}`, process.id);

    const ctx2 = await prisma.context.create({ data: {} });
    const project = await prisma.project.create({
      data: { name: `${row.name}-Projekt`, contextId: ctx2.id, ownerId },
    });
    await setContextDisplayFromProject(prisma, ctx2.id, project.id);
    projectByScope.set(`team:${row.name}`, project.id);
  }

  if (masterData.firstUserEmail && ownerData.ownerByUser.has(masterData.firstUserEmail)) {
    const ownerId = ownerData.ownerByUser.get(masterData.firstUserEmail)!;
    const ctx = await prisma.context.create({ data: {} });
    const process = await prisma.process.create({
      data: { name: 'Mein Prozess', contextId: ctx.id, ownerId },
    });
    await setContextDisplayFromProcess(prisma, ctx.id, process.id);
    processByScope.set('personal:', process.id);

    const ctx2 = await prisma.context.create({ data: {} });
    const project = await prisma.project.create({
      data: { name: 'Mein Projekt', contextId: ctx2.id, ownerId },
    });
    await setContextDisplayFromProject(prisma, ctx2.id, project.id);
    projectByScope.set('personal:', project.id);
  }

  const companyProjectId = projectByScope.get(`company:${ownerData.companyName}`) ?? null;
  if (companyProjectId) {
    const ctx1 = await prisma.context.create({ data: {} });
    const sub1 = await prisma.subcontext.create({
      data: { name: 'Protokolle', contextId: ctx1.id, projectId: companyProjectId },
    });
    await setContextDisplayFromSubcontext(prisma, ctx1.id, sub1.id);

    const ctx2 = await prisma.context.create({ data: {} });
    const sub2 = await prisma.subcontext.create({
      data: { name: 'Meilensteine', contextId: ctx2.id, projectId: companyProjectId },
    });
    await setContextDisplayFromSubcontext(prisma, ctx2.id, sub2.id);
  }

  return { processByScope, projectByScope, companyProjectId };
}

export { seedContexts };
