import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Box, Collapse, Menu, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useId } from 'react';

const parentBoxStyle: React.CSSProperties = {
  borderRadius: 'var(--mantine-radius-sm)',
  display: 'flex',
  flex: 1,
  minWidth: 0,
  minHeight: 'var(--mantine-nav-link-height, 44px)',
};

const nestedBoxStyle: React.CSSProperties = {
  borderLeft: '2px solid var(--mantine-color-gray-7)',
  marginLeft: 20,
  paddingLeft: 8,
  marginTop: 4,
  marginBottom: 4,
};

const headerButtonStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 'var(--mantine-nav-link-height, 44px)',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
};

export type AppShellNavMenuItem = {
  to: string;
  label: string;
  active: boolean;
  badgeCount?: number;
};

export type AppShellNavMenuGroup = {
  groupLabel?: string;
  items: AppShellNavMenuItem[];
};

type AppShellNavCollapsibleSectionProps = {
  label: string;
  icon: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  middleSection?: ReactNode;
  children: ReactNode;
  isMiniRail?: boolean;
  menuGroups?: AppShellNavMenuGroup[];
  onNavigate?: () => void;
};

export function AppShellNavCollapsibleSection({
  label,
  icon,
  expanded,
  onToggle,
  middleSection,
  children,
  isMiniRail = false,
  menuGroups,
  onNavigate,
}: AppShellNavCollapsibleSectionProps) {
  const panelId = useId();

  if (isMiniRail && menuGroups && menuGroups.length > 0) {
    return (
      <Menu position="right-start" withinPortal>
        <Menu.Target>
          <Tooltip label={label} position="right" withArrow>
            <UnstyledButton
              className="app-shell-sidebar-mini-trigger"
              aria-label={label}
              aria-haspopup="menu"
            >
              {icon}
            </UnstyledButton>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          {menuGroups.map((group, groupIndex) => (
            <Box key={group.groupLabel ?? groupIndex}>
              {group.groupLabel ? <Menu.Label>{group.groupLabel}</Menu.Label> : null}
              {group.items.map((item) => (
                <Menu.Item
                  key={item.to}
                  component={Link}
                  to={item.to}
                  onClick={onNavigate}
                  aria-current={item.active ? 'page' : undefined}
                  rightSection={
                    item.badgeCount !== undefined && item.badgeCount > 0 ? (
                      <Text size="xs" c="var(--mantine-primary-color-filled)" component="span">
                        {item.badgeCount}
                      </Text>
                    ) : null
                  }
                >
                  {item.label}
                </Menu.Item>
              ))}
            </Box>
          ))}
        </Menu.Dropdown>
      </Menu>
    );
  }

  return (
    <>
      <Box data-sidebar-parent style={parentBoxStyle}>
        <UnstyledButton
          type="button"
          style={{ ...headerButtonStyle, width: '100%' }}
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
        >
          {icon}
          <Text size="sm" truncate style={{ flex: 1, textAlign: 'left' }}>
            {label}
          </Text>
          {middleSection}
          {expanded ? (
            <IconChevronDown size={16} style={{ flexShrink: 0 }} aria-hidden="true" />
          ) : (
            <IconChevronRight size={16} style={{ flexShrink: 0 }} aria-hidden="true" />
          )}
        </UnstyledButton>
      </Box>
      <Collapse in={expanded}>
        <Box id={panelId} style={nestedBoxStyle}>
          {children}
        </Box>
      </Collapse>
    </>
  );
}
