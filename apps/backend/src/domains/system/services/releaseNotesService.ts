import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  releasesManifestSchema,
  type ReleaseDetailResponse,
  type ReleaseSummary,
} from '../schemas/releases.js';
import { splitReleaseMarkdown } from '../utils/releaseMarkdownAudience.js';

export class ReleaseNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(version: string) {
    super(`Release not found: ${version}`);
    this.name = 'ReleaseNotFoundError';
  }
}

function parseSemVer(version: string): [number, number, number] {
  const [major, minor, patch] = version.split('.').map((part) => Number.parseInt(part, 10));
  return [major, minor, patch];
}

function compareSemVerDesc(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = parseSemVer(a);
  const [bMajor, bMinor, bPatch] = parseSemVer(b);
  if (aMajor !== bMajor) return bMajor - aMajor;
  if (aMinor !== bMinor) return bMinor - aMinor;
  return bPatch - aPatch;
}

function resolveReleasesDir(): string {
  const fromEnv = process.env.RELEASES_DIR?.trim();
  if (fromEnv) return fromEnv;

  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, 'content', 'releases');
    if (existsSync(join(candidate, 'manifest.json'))) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const prodFallback = '/app/content/releases';
  if (existsSync(join(prodFallback, 'manifest.json'))) {
    return prodFallback;
  }

  throw new Error('content/releases/manifest.json not found');
}

let cachedManifest: ReleaseSummary[] | null = null;
let cachedReleasesDir: string | null = null;

/** Clears in-memory manifest cache (tests). */
export function resetReleaseNotesCache(): void {
  cachedManifest = null;
  cachedReleasesDir = null;
}

function loadManifest(): ReleaseSummary[] {
  const releasesDir = resolveReleasesDir();
  if (cachedManifest != null && cachedReleasesDir === releasesDir) {
    return cachedManifest;
  }

  const raw = readFileSync(join(releasesDir, 'manifest.json'), 'utf8');
  const parsed = releasesManifestSchema.parse(JSON.parse(raw));
  const releases = [...parsed.releases].sort((a, b) => compareSemVerDesc(a.version, b.version));

  cachedManifest = releases;
  cachedReleasesDir = releasesDir;
  return releases;
}

export function listReleases(): ReleaseSummary[] {
  return loadManifest();
}

export function getRelease(version: string): ReleaseDetailResponse {
  const releases = loadManifest();
  const entry = releases.find((item) => item.version === version);
  if (!entry) {
    throw new ReleaseNotFoundError(version);
  }

  const releasesDir = cachedReleasesDir ?? resolveReleasesDir();
  const markdownPath = join(releasesDir, `${version}.md`);
  if (!existsSync(markdownPath)) {
    throw new ReleaseNotFoundError(version);
  }

  const markdown = readFileSync(markdownPath, 'utf8');
  const { userMarkdown } = splitReleaseMarkdown(markdown);
  return { ...entry, markdown: userMarkdown };
}
