import { Box, Flex, Tabs } from '@mantine/core';
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RecentScope } from '../hooks/useRecentItems';
import { useMe, meQueryKey } from '../hooks/useMe';
import { apiFetch } from '../api/client';
import { PageHeader } from './PageHeader';
import { ScopeRecentColumn } from './ScopeRecentColumn';

export interface TabItem {
  value: string;
  label: string;
}

export interface PageWithTabsProps {
  title: string;
  /** Optional icon shown before the page title (e.g. scope icon). */
  titleIcon?: ReactNode;
  description?: string;
  actions?: ReactNode;
  /** Tabs to show under the header. Default: single "Overview" tab. */
  tabs?: TabItem[];
  /** Tab content: single node for single tab, or array in same order as tabs for multiple panels. */
  children: ReactNode | ReactNode[];
  /** Controlled tab: current value. */
  activeTab?: string;
  /** Called when user switches tab (enables "View more" to change tab from Overview). */
  onTabChange?: (value: string) => void;
  /** When set, show a persistent collapsible "Recently viewed" column on the right (md+ only). */
  recentScope?: RecentScope | null;
  /** Optional "View more" link for the recent column (e.g. /catalog). */
  recentViewMoreHref?: string;
}

const defaultTabs: TabItem[] = [{ value: 'overview', label: 'Overview' }];

export function PageWithTabs({
  title,
  titleIcon,
  description,
  actions,
  tabs = defaultTabs,
  children,
  activeTab,
  onTabChange,
  recentScope,
  recentViewMoreHref,
}: PageWithTabsProps) {
  const tabList = tabs.length > 0 ? tabs : defaultTabs;
  const childArray = Array.isArray(children) ? children : [children];
  const panels = tabList.map((tab, i) => (
    <Tabs.Panel key={tab.value} value={tab.value} pt="md">
      {childArray[i] ?? null}
    </Tabs.Panel>
  ));

  const defaultVal = tabList[0]?.value ?? 'overview';
  const isControlled = activeTab != null && onTabChange != null;

  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const recentPanelOpen = me?.preferences?.scopeRecentPanelOpen ?? true;
  const patchPreferences = useMutation({
    mutationFn: async (body: { scopeRecentPanelOpen: boolean }) => {
      const res = await apiFetch('/api/v1/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save preferences');
      return res.json() as Promise<{ scopeRecentPanelOpen?: boolean }>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meQueryKey });
    },
  });

  const showRecentColumn = recentScope != null;

  return (
    <>
      <PageHeader title={title} titleIcon={titleIcon} description={description} actions={actions} />
      <Tabs
        {...(isControlled
          ? { value: activeTab, onChange: (v) => onTabChange(v ?? defaultVal) }
          : { defaultValue: defaultVal })}
        variant="default"
        styles={{
          list: { borderBottom: '1px solid var(--mantine-color-default-border)' },
          tab: {
            textTransform: 'uppercase',
            fontWeight: 500,
            fontSize: 'var(--mantine-font-size-sm)',
          },
        }}
      >
        <Tabs.List>
          {tabList.map((tab) => (
            <Tabs.Tab key={tab.value} value={tab.value}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {showRecentColumn ? (
          <Flex
            wrap="nowrap"
            align="stretch"
            gap="lg"
            style={{ flex: 1, minHeight: 0 }}
            direction={{ base: 'column', md: 'row' }}
          >
            <Box style={{ flex: 1, minHeight: 0, minWidth: 0 }}>{panels}</Box>
            <ScopeRecentColumn
              open={recentPanelOpen}
              onToggle={() => patchPreferences.mutate({ scopeRecentPanelOpen: !recentPanelOpen })}
              scope={recentScope}
              viewMoreHref={recentViewMoreHref}
            />
          </Flex>
        ) : (
          panels
        )}
      </Tabs>
    </>
  );
}
