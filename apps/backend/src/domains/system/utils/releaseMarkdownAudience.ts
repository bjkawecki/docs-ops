export const OPERATORS_SECTION_HEADING = '## For operators';

export type SplitReleaseMarkdownResult = {
  fullMarkdown: string;
  userMarkdown: string;
  operatorMarkdown: string;
};

/**
 * Splits release notes into end-user and operator sections.
 * Everything before `## For operators` (line start) is user-facing; the rest is operator-only.
 */
export function splitReleaseMarkdown(markdown: string): SplitReleaseMarkdownResult {
  const fullMarkdown = markdown;
  const lines = markdown.split('\n');
  const operatorIndex = lines.findIndex((line) => line.trim() === OPERATORS_SECTION_HEADING);

  if (operatorIndex === -1) {
    return {
      fullMarkdown,
      userMarkdown: markdown.trim(),
      operatorMarkdown: '',
    };
  }

  const userMarkdown = lines.slice(0, operatorIndex).join('\n').trim();
  const operatorMarkdown = lines
    .slice(operatorIndex + 1)
    .join('\n')
    .trim();

  return {
    fullMarkdown,
    userMarkdown,
    operatorMarkdown,
  };
}
