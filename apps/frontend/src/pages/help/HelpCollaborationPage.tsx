import { List, Stack, Text, Title } from '@mantine/core';

export function HelpCollaborationPage() {
  return (
    <Stack gap="md" align="stretch" style={{ textAlign: 'left' }}>
      <Title order={2}>Reviews & merging</Title>
      <Text size="md">
        Many teams are fine with <strong>real-time collaborative editing</strong> (several people in
        one live draft). DocsOps is aimed especially at organisations where that model is{' '}
        <strong>not</strong> how they want to ship documentation—whether because of regulation,
        distributed teams, or the need for a clear, agreed “official” version.
      </Text>
      <Title order={3}>Regulated and accountable work</Title>
      <Text size="md">
        In regulated settings, “whatever is in the shared buffer right now” is rarely the artifact
        you want to stand behind. You need a <strong>defined moment</strong> when a change is
        accepted: who reviewed it, what was approved, and what readers should treat as current.
        Review steps and a published line give you that boundary instead of a continuous stream of
        edits.
      </Text>
      <Title order={3}>Distributed and asynchronous teams</Title>
      <Text size="md">
        When people work across time zones or calendars, expecting everyone to be online in the same
        document at once is fragile. A workflow built around{' '}
        <strong>drafts, comments, and merge</strong> fits hand-offs: you finish a change, others
        review when they can, and the merged result becomes the shared truth—without requiring
        simultaneous presence.
      </Text>
      <Title order={3}>Why merge, not fancy live sync?</Title>
      <Text size="md">
        Keeping many cursors in sync in one surface is a deep engineering problem on its own. That
        is a secondary point: the main one is product fit. A <strong>merge-based</strong> path—draft
        → review (where needed) → integrate into a published version—matches how many organisations
        want
        <strong> predictable outcomes</strong>, readable history, and a single place for sign-off.
      </Text>
      <Title order={3}>What you get</Title>
      <List size="md" spacing="xs">
        <List.Item>
          Published versions readers can trust, plus change history for audit and learning.
        </List.Item>
        <List.Item>Room for review and approval where your process requires it.</List.Item>
        <List.Item>Less ambiguity about what is “live” versus in progress.</List.Item>
      </List>
    </Stack>
  );
}
