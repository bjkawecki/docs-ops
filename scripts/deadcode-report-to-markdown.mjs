#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

function arg(flag, fallback = '') {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function rel(p) {
  return String(p || '').replaceAll('\\', '/');
}

function isStrictEnabled(value) {
  const v = String(value ?? '0').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function inScope(file, scope) {
  if (!file) return false;
  const normalized = rel(file);
  const prefix = scope === 'backend' ? 'apps/backend/' : 'apps/frontend/';
  return normalized.startsWith(prefix);
}

function isStrictNoiseFile(file) {
  return (
    file.includes('/generated/') ||
    file.endsWith('/index.ts') ||
    file.endsWith('/api-types.ts') ||
    file.endsWith('/vite.config.ts') ||
    file.endsWith('/vitest.config.ts')
  );
}

function readTsPruneLines(content, scope, strict) {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const rows = [];
  for (const line of lines) {
    const match = line.match(/^(.+?):(\d+)\s*-\s*(.+)$/);
    if (!match) continue;
    const file = rel(match[1]);
    if (!inScope(file, scope)) continue;
    const lineNo = Number(match[2]);
    const symbol = match[3];
    if (strict) {
      if (isStrictNoiseFile(file)) continue;
      if (symbol.includes('(used in module)')) continue;
    }
    rows.push({ file, line: lineNo, symbol });
  }
  return rows;
}

function knipItemCount(item) {
  const keys = [
    'dependencies',
    'devDependencies',
    'optionalPeerDependencies',
    'unlisted',
    'unresolved',
    'exports',
    'types',
    'enumMembers',
    'namespaceMembers',
    'files',
    'binaries',
    'catalog',
    'duplicates',
  ];
  return keys.reduce((sum, key) => sum + (Array.isArray(item?.[key]) ? item[key].length : 0), 0);
}

function toIssueRows(knipJson, scope, strict) {
  const issues = Array.isArray(knipJson?.issues) ? knipJson.issues : [];
  const rows = [];
  for (const issue of issues) {
    const file = rel(issue?.file);
    if (!inScope(file, scope)) continue;
    if (strict && isStrictNoiseFile(file)) continue;
    const count = knipItemCount(issue);
    if (count === 0) continue;
    const issueSummary = {
      file,
      count,
      exports: (issue.exports ?? []).length,
      deps: (issue.dependencies ?? []).length + (issue.devDependencies ?? []).length,
      unresolved: (issue.unresolved ?? []).length,
      unlisted: (issue.unlisted ?? []).length,
      files: (issue.files ?? []).length,
      types: (issue.types ?? []).length,
      duplicates: (issue.duplicates ?? []).length,
    };
    if (strict) {
      const actionable = issueSummary.exports + issueSummary.unresolved + issueSummary.unlisted + issueSummary.files;
      if (actionable === 0) continue;
    }
    rows.push({
      ...issueSummary,
    });
  }
  return rows.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
}

const scope = arg('--scope', 'backend');
const tsPrunePath = arg('--tsprune');
const knipPath = arg('--knip');
const outputPath = arg('--output');
const strict = isStrictEnabled(arg('--strict', '0'));

if (!tsPrunePath || !knipPath || !outputPath) {
  console.error(
    'Usage: node scripts/deadcode-report-to-markdown.mjs --scope backend|frontend --tsprune <file> --knip <file> --output <file>'
  );
  process.exit(1);
}

const [tsPruneContent, knipContent] = await Promise.all([
  fs.readFile(tsPrunePath, 'utf8').catch(() => ''),
  fs.readFile(knipPath, 'utf8').catch(() => '{"issues":[]}'),
]);

let knipJson;
try {
  knipJson = JSON.parse(knipContent);
} catch {
  knipJson = { issues: [] };
}

const tsPruneRows = readTsPruneLines(tsPruneContent, scope, strict);
const knipRows = toIssueRows(knipJson, scope, strict);

const now = new Date().toISOString();
let out = '';
out += `# Dead Code Report (${scope})\n\n`;
out += `- Erzeugt: ${now}\n`;
out += `- Modus: **${strict ? 'strict' : 'standard'}**\n`;
out += `- ts-prune Treffer: **${tsPruneRows.length}**\n`;
out += `- knip Treffer (Dateien mit Issues): **${knipRows.length}**\n\n`;

out += '## ts-prune (ungenutzte Exporte)\n\n';
if (tsPruneRows.length === 0) {
  out += 'Keine Treffer im gewaehlten Scope.\n\n';
} else {
  out += '| Datei | Zeile | Symbol |\n';
  out += '|---|---:|---|\n';
  for (const row of tsPruneRows.slice(0, 300)) {
    out += `| \`${row.file}\` | ${row.line} | \`${String(row.symbol).replaceAll('|', '\\|')}\` |\n`;
  }
  if (tsPruneRows.length > 300) {
    out += `\n... und ${tsPruneRows.length - 300} weitere ts-prune Treffer.\n\n`;
  } else {
    out += '\n';
  }
}

out += '## knip (Datei-/Dependency-/Export-Issues)\n\n';
if (knipRows.length === 0) {
  out += 'Keine Treffer im gewaehlten Scope.\n';
} else {
  out += '| Rang | Datei | Gesamt | Exports | Types | Deps | Unresolved | Unlisted | Files | Duplicates |\n';
  out += '|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  knipRows.slice(0, 200).forEach((row, idx) => {
    out += `| ${idx + 1} | \`${row.file}\` | ${row.count} | ${row.exports} | ${row.types} | ${row.deps} | ${row.unresolved} | ${row.unlisted} | ${row.files} | ${row.duplicates} |\n`;
  });
  if (knipRows.length > 200) {
    out += `\n... und ${knipRows.length - 200} weitere knip-Dateien mit Issues.\n`;
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, out, 'utf8');
console.log(`Dead code report written to ${outputPath}`);
