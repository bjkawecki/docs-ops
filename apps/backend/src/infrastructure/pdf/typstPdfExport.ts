import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_COMPILE_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_BUFFER = 4 * 1024 * 1024;

export type TypstPdfExportOptions = {
  markdown: string;
  title?: string | null;
  typstBin?: string;
  typstArgs?: string[];
  execFileFn?: typeof execFileAsync;
  readOutputFn?: (path: string) => Promise<Buffer>;
  timeoutMs?: number;
};

function parseTypstArgsFromEnv(): string[] {
  return (process.env.TYPST_ARGS ?? '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Prepends document title as H1 when the body does not already start with one. */
export function buildMarkdownForPdfExport(markdown: string, title?: string | null): string {
  const body = markdown.trim();
  const trimmedTitle = title?.trim();
  if (!trimmedTitle) return body;
  if (body.startsWith('# ')) return body;
  return `# ${trimmedTitle}\n\n${body}`;
}

/**
 * Renders Markdown to PDF via Typst (`typst compile`).
 * Requires the typst binary (docsops-job-worker image or local dev install).
 */
export async function renderMarkdownToPdfBuffer(options: TypstPdfExportOptions): Promise<Buffer> {
  const typstCommand = options.typstBin?.trim() || process.env.TYPST_BIN?.trim() || 'typst';
  const typstExtraArgs = options.typstArgs ?? parseTypstArgsFromEnv();
  const execFn = options.execFileFn ?? execFileAsync;
  const readOutput = options.readOutputFn ?? ((path: string) => readFile(path));
  const timeoutMs = options.timeoutMs ?? DEFAULT_COMPILE_TIMEOUT_MS;

  const workDir = await mkdtemp(join(tmpdir(), 'docsops-typst-export-'));
  const inputPath = join(workDir, 'input.md');
  const outputPath = join(workDir, 'output.pdf');

  try {
    const markdown = buildMarkdownForPdfExport(options.markdown, options.title);
    await writeFile(inputPath, markdown, 'utf8');

    try {
      await execFn(typstCommand, ['compile', ...typstExtraArgs, inputPath, outputPath], {
        timeout: timeoutMs,
        maxBuffer: DEFAULT_MAX_BUFFER,
      });
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? (error as { code?: string }).code
          : undefined;
      if (code === 'ENOENT') {
        throw new Error(
          `Typst binary not found ("${typstCommand}"). Rebuild the docsops-job-worker image (typst) or set TYPST_BIN.`
        );
      }
      throw error;
    }

    return await readOutput(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
