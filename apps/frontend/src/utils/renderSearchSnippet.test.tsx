import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { renderSearchSnippet } from './renderSearchSnippet';

describe('renderSearchSnippet', () => {
  it('renders Markdown bold as strong', () => {
    render(<div data-testid="wrap">{renderSearchSnippet('Kurzer **Markdown**-Inhalt.')}</div>);
    const strong = screen.getByTestId('wrap').querySelector('strong');
    expect(strong?.textContent).toBe('Markdown');
  });

  it('renders highlight segment with Markdown inside mark', () => {
    render(<div data-testid="wrap">{renderSearchSnippet('A [[**hit**]] B')}</div>);
    const mark = screen.getByTestId('wrap').querySelector('mark');
    expect(mark?.querySelector('strong')?.textContent).toBe('hit');
  });
});
