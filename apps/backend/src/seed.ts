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
 * Runs seed: creates company, departments, teams, users, members, leaders, supervisors
 * from CSV files. Does nothing if at least one company already exists.
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
  const supervisors = csvRows('supervisors.csv');

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
    await prisma.teamLeader.upsert({
      where: { teamId_userId: { teamId, userId } },
      create: { teamId, userId },
      update: {},
    });
  }

  for (const row of supervisors) {
    const departmentId = departmentById.get(row.department_name);
    const userId = userById.get(row.user_email);
    if (!departmentId || !userId) continue;
    await prisma.supervisor.upsert({
      where: { departmentId_userId: { departmentId, userId } },
      create: { departmentId, userId },
      update: {},
    });
  }
}
