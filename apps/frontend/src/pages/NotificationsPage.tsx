import { Box, Card, Flex, NavLink, Paper, Stack, Text } from '@mantine/core';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import {
  NotificationsInboxPanel,
  parseMeNotificationCategory,
  parseMeNotificationUnreadOnly,
  type MeNotificationCategory,
} from '../components/notifications/NotificationsInboxPanel';

const CATEGORY_NAV: {
  value: MeNotificationCategory;
  label: string;
  description?: string;
}[] = [
  { value: 'all', label: 'All' },
  { value: 'documents', label: 'Documents', description: 'Publish, update, archive, …' },
  { value: 'reviews', label: 'Reviews', description: 'Draft requests' },
  { value: 'system', label: 'System', description: 'Reserved for admin messages' },
  { value: 'org', label: 'Organization', description: 'Reserved for role / membership' },
];

const navLinkFullWidth = {
  borderRadius: 'var(--mantine-radius-sm)',
  width: '100%',
} as const;

function hrefForCategory(c: MeNotificationCategory, unreadOnly: boolean): string {
  const sp = new URLSearchParams();
  if (c !== 'all') sp.set('category', c);
  if (unreadOnly) sp.set('unreadOnly', 'true');
  const q = sp.toString();
  return q ? `/notifications?${q}` : '/notifications';
}

export function NotificationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = parseMeNotificationCategory(searchParams.get('category'));
  const unreadOnly = parseMeNotificationUnreadOnly(searchParams.get('unreadOnly'));

  const handleUnreadOnlyChange = (next: boolean) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next) p.set('unreadOnly', 'true');
        else p.delete('unreadOnly');
        return p;
      },
      { replace: true }
    );
  };

  return (
    <Box>
      <PageHeader
        title="Notifications"
        description="In-app document and review activity, filtered by type."
      />
      <Paper withBorder={false} p="lg" radius="md">
        <Flex
          direction={{ base: 'column', lg: 'row' }}
          gap={{ base: 'xl', lg: 48 }}
          align="flex-start"
        >
          <Box w={{ base: '100%', lg: 280 }} style={{ flexShrink: 0 }} data-notifications-type-nav>
            <Text
              tt="uppercase"
              fz="xs"
              fw={600}
              c="dimmed"
              mb="sm"
              style={{ paddingLeft: 'var(--mantine-spacing-xs)' }}
            >
              Type
            </Text>
            <Stack component="nav" gap={2} align="stretch" w="100%">
              {CATEGORY_NAV.map((item) => (
                <NavLink
                  key={item.value}
                  component={Link}
                  to={hrefForCategory(item.value, unreadOnly)}
                  label={item.label}
                  description={item.description}
                  active={category === item.value}
                  variant="light"
                  style={navLinkFullWidth}
                />
              ))}
            </Stack>
          </Box>

          <Card withBorder padding="md" style={{ flex: 1, minWidth: 0, width: '100%' }}>
            <NotificationsInboxPanel
              category={category}
              unreadOnly={unreadOnly}
              onUnreadOnlyChange={handleUnreadOnlyChange}
              embedded
            />
          </Card>
        </Flex>
      </Paper>
    </Box>
  );
}
