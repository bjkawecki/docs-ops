import type { ReactNode } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Block-level Markdown mapped to inline-ish nodes so snippets stay valid inside
 * `Text`, table cells, and quote wrappers (no nested `<p>`).
 */
const searchSnippetMarkdownComponents: Partial<Components> = {
  p: ({ children }) => <span>{children}</span>,
  h1: ({ children }) => <strong>{children}</strong>,
  h2: ({ children }) => <strong>{children}</strong>,
  h3: ({ children }) => <strong>{children}</strong>,
  h4: ({ children }) => <strong>{children}</strong>,
  h5: ({ children }) => <strong>{children}</strong>,
  h6: ({ children }) => <strong>{children}</strong>,
  ul: ({ children }) => <span>{children}</span>,
  ol: ({ children }) => <span>{children}</span>,
  li: ({ children }) => (
    <span>
      <span aria-hidden> · </span>
      {children}
    </span>
  ),
  blockquote: ({ children }) => <span style={{ fontStyle: 'italic' }}>{children}</span>,
  pre: ({ children }) => (
    <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{children}</code>
  ),
  table: ({ children }) => <span>{children}</span>,
  thead: ({ children }) => <span>{children}</span>,
  tbody: ({ children }) => <span>{children}</span>,
  tr: ({ children }) => (
    <span style={{ display: 'block' }}>
      {children}
      <span aria-hidden> </span>
    </span>
  ),
  th: ({ children }) => <span style={{ fontWeight: 600 }}>{children} </span>,
  td: ({ children }) => <span>{children} </span>,
  hr: () => <span aria-hidden> · </span>,
  img: ({ alt }) => <span>[{alt?.trim() || 'Bild'}]</span>,
  a: ({ href, children }) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        style={{ textDecoration: 'underline' }}
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
};

function SnippetMarkdown({ source }: { source: string }): ReactNode {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={searchSnippetMarkdownComponents}>
      {source}
    </ReactMarkdown>
  );
}

/** Renders FTS `ts_headline` snippet with `[[...]]` markers as `<mark>` (same convention as Catalog). */
export function renderSearchSnippet(snippet: string): ReactNode {
  const parts = snippet.split(/(\[\[.*?\]\])/g).filter((part) => part.length > 0);
  return parts.map((part, index) => {
    if (part.startsWith('[[') && part.endsWith(']]')) {
      const inner = part.slice(2, -2);
      return (
        <mark key={index}>
          <SnippetMarkdown source={inner} />
        </mark>
      );
    }
    return (
      <span key={index}>
        <SnippetMarkdown source={part} />
      </span>
    );
  });
}
