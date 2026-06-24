import { describe, expect, it } from 'vitest';
import { splitReleaseMarkdown } from './releaseMarkdownAudience.js';

describe('splitReleaseMarkdown', () => {
  it('returns full markdown as user markdown when no operators section', () => {
    const md = '# 0.2.0\n\n### Features\n\n- Item';
    const result = splitReleaseMarkdown(md);
    expect(result.userMarkdown).toBe(md);
    expect(result.operatorMarkdown).toBe('');
    expect(result.fullMarkdown).toBe(md);
  });

  it('splits user and operator sections', () => {
    const md = `# 0.3.0

### Features

- New thing

## For operators

- Backup before upgrade
- New env optional`;
    const result = splitReleaseMarkdown(md);
    expect(result.userMarkdown).toContain('### Features');
    expect(result.userMarkdown).not.toContain('For operators');
    expect(result.operatorMarkdown).toContain('Backup before upgrade');
    expect(result.fullMarkdown).toBe(md);
  });

  it('ignores operators heading only when line matches exactly after trim', () => {
    const md = '# Title\n\nNot ## For operators inline';
    const result = splitReleaseMarkdown(md);
    expect(result.userMarkdown).toBe(md);
    expect(result.operatorMarkdown).toBe('');
  });
});
