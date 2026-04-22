import type { CSSProperties, ReactNode } from 'react';
import { Box, Collapse, Group, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';

const parentBoxStyle: CSSProperties = {
  borderRadius: 'var(--mantine-radius-sm)',
  display: 'flex',
  flex: 1,
  minWidth: 0,
  minHeight: 'var(--mantine-nav-link-height, 44px)',
};

const nestedBoxStyle: CSSProperties = {
  borderLeft: '2px solid var(--mantine-color-gray-7)',
  marginLeft: 20,
  paddingLeft: 8,
  marginTop: 4,
  marginBottom: 4,
};

const headerButtonStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 'var(--mantine-nav-link-height, 44px)',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
};

type AppShellNavCollapsibleSectionProps = {
  label: string;
  icon: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  /** Optional content between title and chevron (e.g. document count badge). */
  middleSection?: ReactNode;
  children: ReactNode;
};

export function AppShellNavCollapsibleSection({
  label,
  icon,
  expanded,
  onToggle,
  middleSection,
  children,
}: AppShellNavCollapsibleSectionProps) {
  return (
    <>
      <Box data-sidebar-parent style={parentBoxStyle}>
        <Group gap={0} wrap="nowrap" style={{ alignItems: 'stretch', flex: 1, minHeight: '100%' }}>
          <UnstyledButton style={headerButtonStyle} onClick={onToggle}>
            {icon}
            <Text size="sm" truncate>
              {label}
            </Text>
          </UnstyledButton>
          {middleSection}
          <UnstyledButton
            style={{ flex: 0, padding: '2px 4px' }}
            onClick={onToggle}
            aria-expanded={expanded}
          >
            {expanded ? (
              <IconChevronDown size={16} style={{ display: 'block' }} />
            ) : (
              <IconChevronRight size={16} style={{ display: 'block' }} />
            )}
          </UnstyledButton>
        </Group>
      </Box>
      <Collapse in={expanded}>
        <Box style={nestedBoxStyle}>{children}</Box>
      </Collapse>
    </>
  );
}
