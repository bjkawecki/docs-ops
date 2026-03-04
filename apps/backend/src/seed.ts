/**
 * Seed script: loads dummy data from CSV files if the database has no company yet.
 * Called on app startup (index.ts) or can be run standalone via pnpm run seed.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '../generated/prisma/client.js';
import { hashPassword } from './auth/password.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve from project root (apps/backend) so it works with tsx and node dist
const fromSrc = resolve(__dirname, '../prisma/seed-data');
const fromCwd = resolve(process.cwd(), 'prisma/seed-data');
const SEED_DATA_DIR = existsSync(fromSrc) ? fromSrc : fromCwd;

function parseCsv(path: string): string[][] {
  const fullPath = resolve(SEED_DATA_DIR, path);
  if (!existsSync(fullPath)) return [];
  const content = readFileSync(fullPath, 'utf-8');
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return []; // header + at least one row
  return lines.map((line) => line.split(',').map((cell) => cell.trim()));
}

function csvRows(path: string): Record<string, string>[] {
  const rows = parseCsv(path);
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? '';
    });
    return obj;
  });
}

/**
 * Runs seed: creates company, departments, teams, users, members, team leads, department leads,
 * company leads from CSV files. Does nothing if at least one company already exists.
 */
export async function runSeedIfNeeded(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.company.count();
  if (existing > 0) {
    return;
  }

  const companies = csvRows('companies.csv');
  const departments = csvRows('departments.csv');
  const teams = csvRows('teams.csv');
  const users = csvRows('users.csv');
  const teamMembers = csvRows('team_members.csv');
  const teamLeaders = csvRows('team_leaders.csv');
  const departmentLeads = csvRows('department_leads.csv');
  const companyLeads = csvRows('company_leads.csv');

  if (companies.length === 0) {
    return;
  }

  const companyById = new Map<string, string>();
  for (const row of companies) {
    const c = await prisma.company.create({ data: { name: row.name } });
    companyById.set(row.name, c.id);
  }

  const departmentById = new Map<string, string>();
  for (const row of departments) {
    const companyId = companyById.get(row.company_name);
    if (!companyId) continue;
    const d = await prisma.department.create({
      data: { name: row.name, companyId },
    });
    departmentById.set(row.name, d.id);
  }

  const teamById = new Map<string, string>();
  for (const row of teams) {
    const departmentId = departmentById.get(row.department_name);
    if (!departmentId) continue;
    const t = await prisma.team.create({
      data: { name: row.name, departmentId },
    });
    teamById.set(row.name, t.id);
  }

  const userById = new Map<string, string>();
  for (const row of users) {
    const passwordHash = await hashPassword(row.password);
    const u = await prisma.user.create({
      data: {
        name: row.name,
        email: row.email,
        passwordHash,
        isAdmin: false,
      },
    });
    userById.set(row.email, u.id);
  }

  for (const row of teamMembers) {
    const teamId = teamById.get(row.team_name);
    const userId = userById.get(row.user_email);
    if (!teamId || !userId) continue;
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      create: { teamId, userId },
      update: {},
    });
  }

  for (const row of teamLeaders) {
    const teamId = teamById.get(row.team_name);
    const userId = userById.get(row.user_email);
    if (!teamId || !userId) continue;
    await prisma.teamLead.upsert({
      where: { teamId_userId: { teamId, userId } },
      create: { teamId, userId },
      update: {},
    });
  }

  for (const row of departmentLeads) {
    const departmentId = departmentById.get(row.department_name);
    const userId = userById.get(row.user_email);
    if (!departmentId || !userId) continue;
    await prisma.departmentLead.upsert({
      where: { departmentId_userId: { departmentId, userId } },
      create: { departmentId, userId },
      update: {},
    });
  }

  for (const row of companyLeads) {
    const companyId = companyById.get(row.company_name);
    const userId = userById.get(row.user_email);
    if (!companyId || !userId) continue;
    await prisma.companyLead.upsert({
      where: { companyId_userId: { companyId, userId } },
      create: { companyId, userId },
      update: {},
    });
  }

  // --- Owners (ein Owner pro Scope für Kontexte/Tags) ---
  const ownerByCompany = new Map<string, string>();
  const ownerByDepartment = new Map<string, string>();
  const ownerByTeam = new Map<string, string>();
  const ownerByUser = new Map<string, string>();

  for (const row of companies) {
    const companyId = companyById.get(row.name);
    if (!companyId) continue;
    let owner = await prisma.owner.findFirst({
      where: { companyId, departmentId: null, teamId: null, ownerUserId: null },
    });
    if (!owner) owner = await prisma.owner.create({ data: { companyId } });
    ownerByCompany.set(row.name, owner.id);
  }
  for (const row of departments) {
    const departmentId = departmentById.get(row.name);
    if (!departmentId) continue;
    let owner = await prisma.owner.findFirst({
      where: { departmentId, companyId: null, teamId: null, ownerUserId: null },
    });
    if (!owner) owner = await prisma.owner.create({ data: { departmentId } });
    ownerByDepartment.set(row.name, owner.id);
  }
  for (const row of teams) {
    const teamId = teamById.get(row.name);
    if (!teamId) continue;
    let owner = await prisma.owner.findFirst({
      where: { teamId, companyId: null, departmentId: null, ownerUserId: null },
    });
    if (!owner) owner = await prisma.owner.create({ data: { teamId } });
    ownerByTeam.set(row.name, owner.id);
  }
  const firstUserEmail = users[0]?.email;
  if (firstUserEmail) {
    const userId = userById.get(firstUserEmail);
    if (userId) {
      let owner = await prisma.owner.findFirst({
        where: { ownerUserId: userId, companyId: null, departmentId: null, teamId: null },
      });
      if (!owner) owner = await prisma.owner.create({ data: { ownerUserId: userId } });
      ownerByUser.set(firstUserEmail, owner.id);
    }
  }

  // --- Kontexte: je 1 Process + 1 Project pro Scope (Company, Department, Team, Personal) ---
  const processByScope = new Map<string, string>(); // key z. B. "company:Seed Company"
  const projectByScope = new Map<string, string>();

  const companyName = companies[0]?.name ?? 'Seed Company';
  const companyOwnerId = ownerByCompany.get(companyName);
  if (companyOwnerId) {
    const ctx = await prisma.context.create({ data: {} });
    const process = await prisma.process.create({
      data: { name: 'Company-Prozess', contextId: ctx.id, ownerId: companyOwnerId },
    });
    processByScope.set(`company:${companyName}`, process.id);
    const ctx2 = await prisma.context.create({ data: {} });
    const project = await prisma.project.create({
      data: { name: 'Company-Projekt', contextId: ctx2.id, ownerId: companyOwnerId },
    });
    projectByScope.set(`company:${companyName}`, project.id);
  }

  for (const row of departments) {
    const ownerId = ownerByDepartment.get(row.name);
    if (!ownerId) continue;
    const ctx = await prisma.context.create({ data: {} });
    const process = await prisma.process.create({
      data: { name: `${row.name}-Prozess`, contextId: ctx.id, ownerId },
    });
    processByScope.set(`department:${row.name}`, process.id);
    const ctx2 = await prisma.context.create({ data: {} });
    const project = await prisma.project.create({
      data: { name: `${row.name}-Projekt`, contextId: ctx2.id, ownerId },
    });
    projectByScope.set(`department:${row.name}`, project.id);
  }

  for (const row of teams) {
    const ownerId = ownerByTeam.get(row.name);
    if (!ownerId) continue;
    const ctx = await prisma.context.create({ data: {} });
    const process = await prisma.process.create({
      data: { name: `${row.name}-Prozess`, contextId: ctx.id, ownerId },
    });
    processByScope.set(`team:${row.name}`, process.id);
    const ctx2 = await prisma.context.create({ data: {} });
    const project = await prisma.project.create({
      data: { name: `${row.name}-Projekt`, contextId: ctx2.id, ownerId },
    });
    projectByScope.set(`team:${row.name}`, project.id);
  }

  if (firstUserEmail && ownerByUser.has(firstUserEmail)) {
    const ownerId = ownerByUser.get(firstUserEmail)!;
    const ctx = await prisma.context.create({ data: {} });
    const process = await prisma.process.create({
      data: { name: 'Mein Prozess', contextId: ctx.id, ownerId },
    });
    processByScope.set('personal:', process.id);
    const ctx2 = await prisma.context.create({ data: {} });
    const project = await prisma.project.create({
      data: { name: 'Mein Projekt', contextId: ctx2.id, ownerId },
    });
    projectByScope.set('personal:', project.id);
  }

  // --- Subcontexts unter dem ersten Projekt (Company-Projekt) ---
  const companyProjectId = companyName ? projectByScope.get(`company:${companyName}`) : null;
  if (companyProjectId) {
    const ctx1 = await prisma.context.create({ data: {} });
    await prisma.subcontext.create({
      data: { name: 'Protokolle', contextId: ctx1.id, projectId: companyProjectId },
    });
    const ctx2 = await prisma.context.create({ data: {} });
    await prisma.subcontext.create({
      data: { name: 'Meilensteine', contextId: ctx2.id, projectId: companyProjectId },
    });
  }

  // --- Tags pro Scope (Company, erstes Team, Personal) ---
  const tagByNameAndOwner = new Map<string, string>(); // key "ownerId:name" -> tagId
  if (companyOwnerId) {
    for (const name of ['Release', 'Wichtig', 'Draft']) {
      const tag = await prisma.tag.create({ data: { name, ownerId: companyOwnerId } });
      tagByNameAndOwner.set(`${companyOwnerId}:${name}`, tag.id);
    }
  }
  const firstTeam = teams[0];
  if (firstTeam) {
    const teamOwnerId = ownerByTeam.get(firstTeam.name);
    if (teamOwnerId) {
      for (const name of ['Sprint', 'Bugfix']) {
        const tag = await prisma.tag.create({ data: { name, ownerId: teamOwnerId } });
        tagByNameAndOwner.set(`${teamOwnerId}:${name}`, tag.id);
      }
    }
  }
  if (firstUserEmail && ownerByUser.has(firstUserEmail)) {
    const personalOwnerId = ownerByUser.get(firstUserEmail)!;
    for (const name of ['Privat', 'Ideen']) {
      const tag = await prisma.tag.create({ data: { name, ownerId: personalOwnerId } });
      tagByNameAndOwner.set(`${personalOwnerId}:${name}`, tag.id);
    }
  }

  // --- Dokumente: je 1–2 pro Kontext (Process/Project), optional mit Tags ---
  const docContent = '# Überschrift\n\nKurzer **Markdown**-Inhalt für Seed.\n';
  for (const [scopeKey, processId] of processByScope) {
    const process = await prisma.process.findUniqueOrThrow({
      where: { id: processId },
      select: { contextId: true, ownerId: true },
    });
    const doc = await prisma.document.create({
      data: {
        title: `Dokument in ${scopeKey}`,
        content: docContent,
        contextId: process.contextId,
      },
    });
    if (process.ownerId && scopeKey.startsWith('company:')) {
      const tagId = tagByNameAndOwner.get(`${process.ownerId}:Release`);
      if (tagId) {
        await prisma.documentTag.create({ data: { documentId: doc.id, tagId } });
      }
    }
  }
  for (const [scopeKey, projectId] of projectByScope) {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { contextId: true, ownerId: true },
    });
    await prisma.document.create({
      data: {
        title: `Projekt-Dokument ${scopeKey}`,
        content: docContent,
        contextId: project.contextId,
      },
    });
  }
  if (companyProjectId) {
    const subcontexts = await prisma.subcontext.findMany({
      where: { projectId: companyProjectId },
      select: { name: true, contextId: true },
    });
    for (const sub of subcontexts) {
      await prisma.document.create({
        data: {
          title: `Dokument: ${sub.name}`,
          content: docContent,
          contextId: sub.contextId,
        },
      });
    }
  }
}
