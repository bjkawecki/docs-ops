import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  blockDocumentJsonFromSeedSections,
  type SeedDocumentBlockSection,
} from '../domains/documents/services/blocks/documentBlocksBackfill.js';
import type { SeedContextData } from './types.js';

type PublishedSeedDocInput = {
  title: string;
  sections: SeedDocumentBlockSection[];
  contextId: string;
  createdById?: string | null;
};

const SEED_DOCUMENT_SECTIONS: SeedDocumentBlockSection[] = [
  { type: 'heading', level: 2, text: 'Überblick' },
  {
    type: 'paragraph',
    text: 'Kurzer Beispieltext für den Seed-Datensatz. Hier steht typischer Fließtext ohne Markdown-Zeichen.',
  },
  { type: 'heading', level: 3, text: 'Weitere Hinweise' },
  {
    type: 'paragraph',
    text: 'Zweiter inhaltlicher Absatz mit weiteren Informationen zum Dokument. So wirkt die Seite realistischer.',
  },
];

async function createPublishedSeedDocument(prisma: PrismaClient, input: PublishedSeedDocInput) {
  return prisma.$transaction(async (tx) => {
    const blocksJson = blockDocumentJsonFromSeedSections(input.sections);
    const doc = await tx.document.create({
      data: {
        title: input.title,
        draftBlocks: blocksJson,
        contextId: input.contextId,
        ...(input.createdById != null ? { createdById: input.createdById } : {}),
      },
    });
    const version = await tx.documentVersion.create({
      data: {
        documentId: doc.id,
        blocks: blocksJson,
        blocksSchemaVersion: 0,
        versionNumber: 1,
        ...(input.createdById != null ? { createdById: input.createdById } : {}),
      },
    });
    await tx.document.update({
      where: { id: doc.id },
      data: {
        publishedAt: new Date(),
        currentPublishedVersionId: version.id,
      },
    });
    return doc;
  });
}

function seedDocTitle(scopeKey: string, kind: 'process' | 'project'): string {
  const name = scopeKey.includes(':') ? (scopeKey.split(':')[1]?.trim() ?? '') : '';
  if (scopeKey.startsWith('company:'))
    return kind === 'process' ? 'Onboarding Guide' : 'Product Roadmap';
  if (scopeKey.startsWith('department:')) {
    if (kind === 'process') return name === 'Sales' ? 'Sales Playbook' : 'Engineering Guidelines';
    return name === 'Sales' ? 'Q1 Campaign' : 'Release Plan';
  }
  if (scopeKey.startsWith('team:')) return kind === 'process' ? 'Team Wiki' : 'Sprint Planning';
  if (scopeKey === 'personal:') return kind === 'process' ? 'My Notes' : 'Side Project';
  return kind === 'process' ? 'Overview' : 'Project Overview';
}

async function seedDocuments(
  prisma: PrismaClient,
  contextData: SeedContextData,
  tagByNameAndOwner: Map<string, string>
): Promise<void> {
  for (const [scopeKey, processId] of contextData.processByScope) {
    const process = await prisma.process.findUniqueOrThrow({
      where: { id: processId },
      select: { contextId: true, ownerId: true },
    });
    const doc = await createPublishedSeedDocument(prisma, {
      title: seedDocTitle(scopeKey, 'process'),
      sections: SEED_DOCUMENT_SECTIONS,
      contextId: process.contextId,
    });
    if (process.ownerId && scopeKey.startsWith('company:')) {
      const tagId = tagByNameAndOwner.get(`${process.ownerId}:Referenz`);
      if (tagId) {
        await prisma.documentTag.create({ data: { documentId: doc.id, tagId } });
      }
    }
  }

  for (const [scopeKey, projectId] of contextData.projectByScope) {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { contextId: true },
    });
    await createPublishedSeedDocument(prisma, {
      title: seedDocTitle(scopeKey, 'project'),
      sections: SEED_DOCUMENT_SECTIONS,
      contextId: project.contextId,
    });
  }

  if (contextData.companyProjectId) {
    const subcontexts = await prisma.subcontext.findMany({
      where: { projectId: contextData.companyProjectId },
      select: { name: true, contextId: true },
    });
    const subcontextTitles: Record<string, string> = {
      Protokolle: 'Meeting Notes',
      Meilensteine: 'Project Milestones',
    };
    for (const sub of subcontexts) {
      await createPublishedSeedDocument(prisma, {
        title: subcontextTitles[sub.name] ?? sub.name,
        sections: SEED_DOCUMENT_SECTIONS,
        contextId: sub.contextId,
      });
    }
  }
}

export { SEED_DOCUMENT_SECTIONS, createPublishedSeedDocument, seedDocuments };
