import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SeedCsvData, SeedRow } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fromSrc = resolve(__dirname, '../../prisma/seed-data');
const fromCwd = resolve(process.cwd(), 'prisma/seed-data');
const SEED_DATA_DIR = existsSync(fromSrc) ? fromSrc : fromCwd;

function parseCsv(path: string): string[][] {
  const fullPath = resolve(SEED_DATA_DIR, path);
  if (!existsSync(fullPath)) return [];
  const content = readFileSync(fullPath, 'utf-8');
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  return lines.map((line) => line.split(',').map((cell) => cell.trim()));
}

function csvRows(path: string): SeedRow[] {
  const rows = parseCsv(path);
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj: SeedRow = {};
    headers.forEach((header, i) => {
      obj[header] = row[i] ?? '';
    });
    return obj;
  });
}

function loadSeedCsvData(): SeedCsvData {
  return {
    companies: csvRows('companies.csv'),
    departments: csvRows('departments.csv'),
    teams: csvRows('teams.csv'),
    users: csvRows('users.csv'),
    teamMembers: csvRows('team_members.csv'),
    teamLeaders: csvRows('team_leaders.csv'),
    departmentLeads: csvRows('department_leads.csv'),
    companyLeads: csvRows('company_leads.csv'),
  };
}

export { loadSeedCsvData };
