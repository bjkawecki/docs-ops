import { Anchor, List, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';

export function HelpOverviewPage() {
  return (
    <Stack gap="md" align="stretch" style={{ textAlign: 'left' }}>
      <Title order={2}>What is DocsOps?</Title>
      <Text size="md">
        DocsOps is a documentation and knowledge workspace for engineering organisations. You work
        in scoped areas (company, department, team, or personal space), create documents in
        processes or projects, and move work through review and publication when your organisation
        uses that workflow.
      </Text>
      <Text size="md" fw={600}>
        Jump to a topic:
      </Text>
      <List size="md" spacing="sm" style={{ listStylePosition: 'outside', textAlign: 'left' }}>
        <List.Item>
          <Anchor component={Link} to="/help/organisation" size="md" fw={600}>
            Organisation & scopes
          </Anchor>
          <Text size="md" c="dimmed" mt={4}>
            Company → department → team (and personal); projects with subcontexts vs processes—when
            to use which.
          </Text>
        </List.Item>
        <List.Item>
          <Anchor component={Link} to="/help/permissions" size="md" fw={600}>
            Read & write access
          </Anchor>
          <Text size="md" c="dimmed" mt={4}>
            Who can open documents and who can change them, tied to where content lives.
          </Text>
        </List.Item>
        <List.Item>
          <Anchor component={Link} to="/help/workflow" size="md" fw={600}>
            Document lifecycle
          </Anchor>
          <Text size="md" c="dimmed" mt={4}>
            From draft through review to a published line others can rely on.
          </Text>
        </List.Item>
        <List.Item>
          <Anchor component={Link} to="/help/collaboration" size="md" fw={600}>
            Reviews & merging
          </Anchor>
          <Text size="md" c="dimmed" mt={4}>
            Why we focus on review and merge instead of everyone typing in the same live document.
          </Text>
        </List.Item>
      </List>
    </Stack>
  );
}
