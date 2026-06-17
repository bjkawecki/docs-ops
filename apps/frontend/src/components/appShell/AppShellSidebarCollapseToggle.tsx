import { ActionIcon, Tooltip } from '@mantine/core';
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react';
import {
  MAIN_NAV_ID,
  SIDEBAR_MINI_ICON_SIZE,
  SIDEBAR_MINI_ITEM_SIZE,
} from './appShellLayoutConstants.js';

type Props = {
  isMiniRail: boolean;
  onToggle: () => void;
};

export function AppShellSidebarCollapseToggle({ isMiniRail, onToggle }: Props) {
  const label = isMiniRail ? 'Expand sidebar' : 'Collapse sidebar';
  return (
    <Tooltip label={label} position="right" withArrow>
      <ActionIcon
        className="app-shell-sidebar-collapse-toggle"
        variant="subtle"
        size={SIDEBAR_MINI_ITEM_SIZE}
        visibleFrom="sm"
        onClick={onToggle}
        aria-label={isMiniRail ? 'Expand sidebar' : 'Collapse sidebar to icon rail'}
        aria-expanded={!isMiniRail}
        aria-controls={MAIN_NAV_ID}
      >
        {isMiniRail ? (
          <IconLayoutSidebarLeftExpand size={SIDEBAR_MINI_ICON_SIZE} stroke={1.75} />
        ) : (
          <IconLayoutSidebarLeftCollapse size={SIDEBAR_MINI_ICON_SIZE} stroke={1.75} />
        )}
      </ActionIcon>
    </Tooltip>
  );
}
