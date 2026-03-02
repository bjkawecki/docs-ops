import { Tabs } from '@mantine/core';
import type { ReactNode } from 'react';
import { PageHeader } from './PageHeader';

export interface TabItem {
  value: string;
  label: string;
}

export interface PageWithTabsProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Tabs to show under the header. Default: single "Overview" tab. */
  tabs?: TabItem[];
  /** Tab content: single node for single tab, or array in same order as tabs for multiple panels. */
  children: ReactNode | ReactNode[];
}

const defaultTabs: TabItem[] = [{ value: 'overview', label: 'Overview' }];

export function PageWithTabs({
  title,
  description,
  actions,
  tabs = defaultTabs,
  children,
}: PageWithTabsProps) {
  const tabList = tabs.length > 0 ? tabs : defaultTabs;
  const childArray = Array.isArray(children) ? children : [children];
  const panels = tabList.map((tab, i) => (
    <Tabs.Panel key={tab.value} value={tab.value} pt="md">
      {childArray[i] ?? null}
    </Tabs.Panel>
  ));

  return (
    <>
      <PageHeader title={title} description={description} actions={actions} />
      <Tabs
        defaultValue={tabList[0]?.value ?? 'overview'}
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
        {panels}
      </Tabs>
    </>
  );
}
