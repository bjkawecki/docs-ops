import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getRelease,
  listReleases,
  resetReleaseNotesCache,
  ReleaseNotFoundError,
} from '../services/releaseNotesService.js';

function writeFixture(dir: string): void {
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({
      formatVersion: 1,
      releases: [
        { version: '0.1.0', date: '2026-01-01', title: 'First' },
        { version: '0.2.0', date: '2026-02-01', title: 'Second' },
      ],
    })
  );
  writeFileSync(join(dir, '0.1.0.md'), '# First release\n');
  writeFileSync(join(dir, '0.2.0.md'), '# Second release\n');
}

describe('releaseNotesService', () => {
  const previousReleasesDir = process.env.RELEASES_DIR;

  afterEach(() => {
    if (previousReleasesDir === undefined) {
      delete process.env.RELEASES_DIR;
    } else {
      process.env.RELEASES_DIR = previousReleasesDir;
    }
    resetReleaseNotesCache();
  });

  it('lists releases sorted newest first', () => {
    const dir = mkdtempSync(join(tmpdir(), 'docsops-releases-'));
    writeFixture(dir);
    process.env.RELEASES_DIR = dir;
    resetReleaseNotesCache();

    const releases = listReleases();
    expect(releases.map((item) => item.version)).toEqual(['0.2.0', '0.1.0']);
  });

  it('returns markdown for a known release', () => {
    const dir = mkdtempSync(join(tmpdir(), 'docsops-releases-'));
    writeFixture(dir);
    process.env.RELEASES_DIR = dir;
    resetReleaseNotesCache();

    const detail = getRelease('0.1.0');
    expect(detail.title).toBe('First');
    expect(detail.markdown).toContain('# First release');
  });

  it('throws ReleaseNotFoundError for unknown version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'docsops-releases-'));
    writeFixture(dir);
    process.env.RELEASES_DIR = dir;
    resetReleaseNotesCache();

    expect(() => getRelease('9.9.9')).toThrow(ReleaseNotFoundError);
  });

  it('strips operator section from markdown for end users', () => {
    const dir = mkdtempSync(join(tmpdir(), 'docsops-releases-'));
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        formatVersion: 1,
        releases: [{ version: '0.3.0', date: '2026-03-01', title: 'Ops' }],
      })
    );
    writeFileSync(
      join(dir, '0.3.0.md'),
      `# 0.3.0

### Features

- User feature

## For operators

- Backup first`
    );
    process.env.RELEASES_DIR = dir;
    resetReleaseNotesCache();

    const detail = getRelease('0.3.0');
    expect(detail.markdown).toContain('User feature');
    expect(detail.markdown).not.toContain('For operators');
    expect(detail.markdown).not.toContain('Backup first');
  });

  it('throws ReleaseNotFoundError when markdown file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'docsops-releases-'));
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        formatVersion: 1,
        releases: [{ version: '1.0.0', date: '2026-03-01', title: 'No file' }],
      })
    );
    process.env.RELEASES_DIR = dir;
    resetReleaseNotesCache();

    expect(() => getRelease('1.0.0')).toThrow(ReleaseNotFoundError);
  });
});
