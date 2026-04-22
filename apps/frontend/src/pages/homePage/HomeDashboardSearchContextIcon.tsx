import { IconBriefcase, IconNotes, IconRoute, IconSubtask } from '@tabler/icons-react';
import { SEARCH_HIT_CONTEXT_ICON } from './homePageConstants';
import type { DashboardSearchItem } from './homePageTypes';

type Props = {
  contextType: DashboardSearchItem['contextType'];
};

export function HomeDashboardSearchContextIcon({ contextType }: Props) {
  const IconComp =
    contextType === 'process'
      ? IconRoute
      : contextType === 'project'
        ? IconBriefcase
        : contextType === 'subcontext'
          ? IconSubtask
          : IconNotes;
  return (
    <IconComp
      size={SEARCH_HIT_CONTEXT_ICON}
      style={{ flexShrink: 0, display: 'block' }}
      color="var(--mantine-color-dimmed)"
      aria-hidden
    />
  );
}
