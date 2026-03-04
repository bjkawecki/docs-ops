import { Button, Card, Group } from '@mantine/core';
import { Link } from 'react-router-dom';

/** Gemeinsame Card-Props für ContextCard und SectionCard (einheitliches Design). */
export const contentCardProps = {
  withBorder: true as const,
  padding: 'md' as const,
  h: '100%' as const,
};

/** Einheitlicher "View more"-Link – gleiches Aussehen wie auf Company/Personal/etc. (Button subtle xs). */
export function ViewMoreLink({ to }: { to: string }) {
  return (
    <Group justify="flex-end" mt="xs">
      <Button component={Link} to={to} variant="subtle" size="xs">
        View more
      </Button>
    </Group>
  );
}

/** Wrapper: Card mit einheitlichem Design für alle Kontext-/Sektions-Karten. */
export function ContentCardWrapper({ children }: { children: React.ReactNode }) {
  return <Card {...contentCardProps}>{children}</Card>;
}
