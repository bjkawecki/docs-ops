import { Box, Container, Flex, NavLink, Paper, Stack, Text } from '@mantine/core';
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
  { value: 'documents', label: 'Documents', description: 'Publish, updates, archive, …' },
  { value: 'reviews', label: 'Reviews', description: 'Draft requests' },
  { value: 'system', label: 'System', description: 'Admin messages (reserved)' },
  { value: 'org', label: 'Organization', description: 'Roles & membership (reserved)' },
];

const navLinkFullWidth = {
  borderRadius: 'var(--mantine-radius-sm)',
  width: '100%',
} as const;

export function NotificationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = parseMeNotificationCategory(searchParams.get('category'));
  const unreadOnly = parseMeNotificationUnreadOnly(searchParams.get('unreadOnly'));

  const categoryHref = (next: MeNotificationCategory) => {
    const p = new URLSearchParams(searchParams);
    if (next === 'all') p.delete('category');
    else p.set('category', next);
    const qs = p.toString();
    return qs.length > 0 ? `/notifications?${qs}` : '/notifications';
  };

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
    <Container fluid maw={1600} px="md" mb="xl">
      <Stack gap={0} mt="md">
        <PageHeader
          title="Notifications"
          description="Document and review activity for your account."
        />
        <Paper withBorder={false} p="lg" radius="md">
          <Flex
            direction={{ base: 'column', lg: 'row' }}
            gap={{ base: 'xl', lg: 48 }}
            align="flex-start"
          >
            <Box
              w={{ base: '100%', lg: 280 }}
              style={{ flexShrink: 0 }}
              data-notifications-type-nav
            >
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
                    to={categoryHref(item.value)}
                    replace
                    label={item.label}
                    description={item.description}
                    active={category === item.value}
                    variant="light"
                    style={navLinkFullWidth}
                  />
                ))}
              </Stack>
            </Box>

            <Box style={{ flex: 1, minWidth: 0, width: '100%' }}>
              <NotificationsInboxPanel
                category={category}
                unreadOnly={unreadOnly}
                onUnreadOnlyChange={handleUnreadOnlyChange}
                embedded
              />
            </Box>
          </Flex>
        </Paper>
      </Stack>
    </Container>
  );
}
