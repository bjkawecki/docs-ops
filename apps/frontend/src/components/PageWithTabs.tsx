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
  /** Controlled tab: current value. */
  activeTab?: string;
  /** Called when user switches tab (enables "View more" to change tab from Overview). */
  onTabChange?: (value: string) => void;
}

const defaultTabs: TabItem[] = [{ value: 'overview', label: 'Overview' }];

export function PageWithTabs({
  title,
  description,
  actions,
  tabs = defaultTabs,
  children,
  activeTab,
  onTabChange,
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

  return (
    <>
      <PageHeader title={title} description={description} actions={actions} />
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
        {panels}
      </Tabs>
    </>
  );
}
