import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMarkdownForPdfExport, renderMarkdownToPdfBuffer } from './typstPdfExport.js';

describe('buildMarkdownForPdfExport', () => {
  it('prepends title as H1 when body has no heading', () => {
    expect(buildMarkdownForPdfExport('Hello world', 'My Doc')).toBe('# My Doc\n\nHello world');
  });

  it('does not prepend title when body already starts with H1', () => {
    const body = '# Existing\n\nText';
    expect(buildMarkdownForPdfExport(body, 'My Doc')).toBe(body);
  });

  it('returns trimmed body when title is empty', () => {
    expect(buildMarkdownForPdfExport('  Hello  ', null)).toBe('Hello');
  });
});

describe('renderMarkdownToPdfBuffer', () => {
  const previousTypstArgs = process.env.TYPST_ARGS;

  afterEach(() => {
    if (previousTypstArgs === undefined) {
      delete process.env.TYPST_ARGS;
    } else {
      process.env.TYPST_ARGS = previousTypstArgs;
    }
  });

  it('calls typst compile and returns pdf buffer', async () => {
    const execFileFn = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const readOutputFn = vi.fn().mockResolvedValue(Buffer.from('%PDF-fake'));

    const result = await renderMarkdownToPdfBuffer({
      markdown: 'Body text',
      title: 'Title',
      typstBin: 'typst',
      execFileFn,
      readOutputFn,
    });

    expect(result).toEqual(Buffer.from('%PDF-fake'));
    expect(execFileFn).toHaveBeenCalledOnce();
    const [cmd, args] = execFileFn.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('typst');
    expect(args[0]).toBe('compile');
    expect(args.at(-2)).toMatch(/input\.md$/);
    expect(args.at(-1)).toMatch(/output\.pdf$/);
    expect(readOutputFn).toHaveBeenCalledOnce();
  });

  it('throws clear error when typst binary is missing', async () => {
    const execFileFn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));

    await expect(
      renderMarkdownToPdfBuffer({
        markdown: 'x',
        typstBin: 'typst-missing',
        execFileFn,
        readOutputFn: vi.fn(),
      })
    ).rejects.toThrow(/Typst binary not found/);
  });

  it('passes TYPST_ARGS from environment', async () => {
    process.env.TYPST_ARGS = '--font-path /fonts';
    const execFileFn = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });

    await renderMarkdownToPdfBuffer({
      markdown: 'x',
      execFileFn,
      readOutputFn: vi.fn().mockResolvedValue(Buffer.from('pdf')),
    });

    const args = execFileFn.mock.calls[0]?.[1] as string[];
    expect(args).toContain('--font-path');
    expect(args).toContain('/fonts');
  });
});
