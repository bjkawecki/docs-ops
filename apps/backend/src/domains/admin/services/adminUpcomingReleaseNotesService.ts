import { splitReleaseMarkdown } from '../../system/utils/releaseMarkdownAudience.js';

export type UpcomingReleaseNotesResult = {
  fullMarkdown: string;
  userMarkdown: string;
  operatorMarkdown: string;
};

export async function fetchUpcomingReleaseMarkdown(args: {
  repo: string;
  version: string;
  releaseTag: string;
}): Promise<UpcomingReleaseNotesResult> {
  const { repo, version, releaseTag } = args;
  const url = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(releaseTag)}/content/releases/${version}.md`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/plain',
        'User-Agent': 'docsops',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Release notes not found (${res.status})`);
    }

    const raw = await res.text();
    if (raw.trim() === '') {
      throw new Error('Release notes file is empty');
    }

    const split = splitReleaseMarkdown(raw);
    return {
      fullMarkdown: split.fullMarkdown,
      userMarkdown: split.userMarkdown,
      operatorMarkdown: split.operatorMarkdown,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Release notes fetch timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
