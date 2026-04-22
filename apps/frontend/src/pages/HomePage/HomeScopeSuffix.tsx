import { Text } from '@mantine/core';
import { IconBuildingSkyscraper, IconSitemap, IconUser, IconUsersGroup } from '@tabler/icons-react';
import type { DraftScopeType } from '../../hooks/useMeDrafts';
import { SCOPE_ICON_SIZE } from './homePageConstants';

type Props = { scopeType: DraftScopeType; scopeName: string };

/** Renders [icon] scopeName with left padding for separation from document title. */
export function HomeScopeSuffix({ scopeType, scopeName }: Props) {
  const ScopeIcon =
    scopeType === 'team'
      ? IconUsersGroup
      : scopeType === 'department'
        ? IconSitemap
        : scopeType === 'company'
          ? IconBuildingSkyscraper
          : IconUser;
  return (
    <Text
      component="span"
      size="xs"
      c="dimmed"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
        lineHeight: 1,
      }}
    >
      <ScopeIcon
        size={SCOPE_ICON_SIZE}
        style={{ flexShrink: 0, display: 'block' }}
        color="var(--mantine-color-dimmed)"
        aria-hidden
      />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1,
        }}
        title={scopeName}
      >
        {scopeName}
      </span>
    </Text>
  );
}
