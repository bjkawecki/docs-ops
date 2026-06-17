import { Box } from '@mantine/core';
import { MAIN_CONTENT_ID } from './appShellLayoutConstants.js';

export function AppShellSkipLink() {
  return (
    <Box
      component="a"
      href={`#${MAIN_CONTENT_ID}`}
      style={{
        position: 'absolute',
        left: -9999,
        top: 'auto',
        width: 1,
        height: 1,
        overflow: 'hidden',
        zIndex: 10000,
      }}
      onFocus={(e) => {
        const el = e.currentTarget;
        el.style.position = 'fixed';
        el.style.left = '8px';
        el.style.top = '8px';
        el.style.width = 'auto';
        el.style.height = 'auto';
        el.style.overflow = 'visible';
        el.style.padding = '8px 16px';
        el.style.background = 'var(--mantine-color-body)';
        el.style.border = '2px solid var(--mantine-primary-color-filled)';
        el.style.borderRadius = 'var(--mantine-radius-sm)';
        el.style.color = 'var(--mantine-color-text)';
        el.style.textDecoration = 'none';
        el.style.fontWeight = '500';
      }}
      onBlur={(e) => {
        const el = e.currentTarget;
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        el.style.width = '1px';
        el.style.height = '1px';
        el.style.overflow = 'hidden';
        el.style.padding = '';
        el.style.border = '';
      }}
    >
      Skip to main content
    </Box>
  );
}
