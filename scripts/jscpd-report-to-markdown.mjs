#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

function readArg(flag, fallback = '') {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function severityFromScore(score) {
  if (score >= 60) return 'kritisch';
  if (score >= 35) return 'hoch';
  if (score >= 18) return 'mittel';
  return 'niedrig';
}

function escapeMd(value) {
  return String(value).replace(/\|/g, '\\|');
}

function normalizeRelPath(filePath) {
  return String(filePath || '').replaceAll('\\', '/');
}

function mkRange(file) {
  const start = file?.start ?? '?';
  const end = file?.end ?? '?';
  return `${start}-${end}`;
}

const input = readArg('--input');
const output = readArg('--output');
const scope = readArg('--scope', 'unknown');

if (!input || !output) {
  console.error('Usage: node scripts/jscpd-report-to-markdown.mjs --input <json> --output <md> [--scope <name>]');
  process.exit(1);
}

const reportJson = await fs.readFile(input, 'utf8');
const report = JSON.parse(reportJson);
const duplicates = Array.isArray(report?.duplicates) ? report.duplicates : [];
const summary = report?.statistics?.total ?? {};

const findings = duplicates.map((d, index) => {
  const first = d?.firstFile ?? {};
  const second = d?.secondFile ?? {};
  const sameFile = normalizeRelPath(first.name) === normalizeRelPath(second.name);
  const lines = Number(d?.lines ?? 0);
  const tokens = Number(d?.tokens ?? 0);
  const score = Math.round(lines * (sameFile ? 1 : 1.35) + tokens / 25);
  return {
    rank: index + 1,
    score,
    severity: severityFromScore(score),
    lines,
    tokens,
    format: d?.format ?? 'unknown',
    first,
    second,
    sameFile,
  };
});

findings.sort((a, b) => b.score - a.score || b.lines - a.lines || b.tokens - a.tokens);
for (let i = 0; i < findings.length; i += 1) findings[i].rank = i + 1;

const fileWeights = new Map();
for (const finding of findings) {
  const files = [finding.first, finding.second];
  for (const f of files) {
    const key = normalizeRelPath(f?.name);
    if (!key) continue;
    const prev = fileWeights.get(key) ?? { score: 0, hits: 0 };
    prev.score += finding.score;
    prev.hits += 1;
    fileWeights.set(key, prev);
  }
}

const hotspots = [...fileWeights.entries()]
  .map(([file, data]) => ({ file, score: data.score, hits: data.hits }))
  .sort((a, b) => b.score - a.score || b.hits - a.hits || a.file.localeCompare(b.file));

const nowIso = new Date().toISOString();
let md = '';
md += `# Duplikat-Report (${scope})\n\n`;
md += `- Erzeugt: ${nowIso}\n`;
md += `- Quelle: \`${normalizeRelPath(path.relative(process.cwd(), input))}\`\n`;
md += `- Gefundene Duplikate: **${findings.length}**\n`;
md += `- Duplizierte Zeilen gesamt: **${summary.duplicatedLines ?? 0}** von ${summary.lines ?? 0}\n`;
md += `- Duplizierte Tokens gesamt: **${summary.duplicatedTokens ?? 0}** von ${summary.tokens ?? 0}\n`;
md += `- Anteil (Lines): **${summary.percentage ?? 0}%**\n\n`;

if (findings.length === 0) {
  md += '## Gewichtete Liste\n\n';
  md += 'Keine Duplikate gefunden.\n';
} else {
  md += '## Gewichtete Liste\n\n';
  md += '| Rang | Gewicht | Schwere | Lines | Tokens | Format | Datei A | Datei B |\n';
  md += '|---:|---:|---|---:|---:|---|---|---|\n';
  for (const f of findings) {
    const a = `${normalizeRelPath(f.first.name)}:${mkRange(f.first)}`;
    const b = `${normalizeRelPath(f.second.name)}:${mkRange(f.second)}`;
    md += `| ${f.rank} | ${f.score} | ${f.severity} | ${f.lines} | ${f.tokens} | ${escapeMd(f.format)} | \`${escapeMd(a)}\` | \`${escapeMd(b)}\` |\n`;
  }

  md += '\n## Hotspots nach kumulierter Last\n\n';
  md += '| Rang | Datei | Gewicht gesamt | Treffer |\n';
  md += '|---:|---|---:|---:|\n';
  hotspots.slice(0, 25).forEach((h, idx) => {
    md += `| ${idx + 1} | \`${escapeMd(h.file)}\` | ${h.score} | ${h.hits} |\n`;
  });
}

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, md, 'utf8');

console.log(`Markdown report written to ${output}`);
