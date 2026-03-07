/**
 * One-time backfill: set displayName on all Owner rows and displayName/contextType/ownerDisplayName on all Context rows.
 * Run after migration add_context_owner_display_names.
 * Usage: pnpm exec tsx scripts/run-backfill-context-owner-display.ts (from apps/backend).
 */
import './load-env.js';
import { prisma } from '../src/db.js';
import {
  setOwnerDisplayName,
  setContextDisplayFromProcess,
  setContextDisplayFromProject,
  setContextDisplayFromSubcontext,
} from '../src/contextOwnerDisplay.js';

async function main() {
  const owners = await prisma.owner.findMany({ select: { id: true } });
  for (const o of owners) {
    await setOwnerDisplayName(prisma, o.id);
  }
  console.log(`Updated displayName for ${owners.length} Owner(s).`);

  const processes = await prisma.process.findMany({
    select: { id: true, contextId: true },
  });
  for (const p of processes) {
    await setContextDisplayFromProcess(prisma, p.contextId, p.id);
  }
  console.log(`Updated Context for ${processes.length} Process(es).`);

  const projects = await prisma.project.findMany({
    select: { id: true, contextId: true },
  });
  for (const p of projects) {
    await setContextDisplayFromProject(prisma, p.contextId, p.id);
  }
  console.log(`Updated Context for ${projects.length} Project(s).`);

  const subcontexts = await prisma.subcontext.findMany({
    select: { id: true, contextId: true },
  });
  for (const s of subcontexts) {
    await setContextDisplayFromSubcontext(prisma, s.contextId, s.id);
  }
  console.log(`Updated Context for ${subcontexts.length} Subcontext(s).`);
}

void main()
  .then(() => {
    console.log('Backfill finished.');
    process.exit(0);
  })
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
