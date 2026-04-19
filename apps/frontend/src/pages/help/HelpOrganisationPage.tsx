import { List, Stack, Text, Title } from '@mantine/core';

export function HelpOrganisationPage() {
  return (
    <Stack gap="md" align="stretch" style={{ textAlign: 'left' }}>
      <Title order={2}>Organisation & scopes</Title>
      <Text size="md">
        Content is grouped by <strong>scope</strong>: typically company, then department, then team.
        You may also have a <strong>personal</strong> area for your own drafts and projects. The
        catalog and navigation reflect where you have access.
      </Text>
      <Title order={3}>Projects and subcontexts</Title>
      <Text size="md">
        A <strong>project</strong> is a durable container for related documentation (for example a
        product, initiative, or workstream). <strong>Subcontexts</strong> split a project into
        smaller areas (topics, milestones, or working groups) while staying under the same project
        and ownership. Use them when you want separate document spaces without creating another
        top-level project.
      </Text>
      <Title order={3}>Processes</Title>
      <Text size="md">
        A <strong>process</strong> represents an operational or recurring flow: procedures,
        playbooks, or line-of-business documentation that is often tied to how work runs rather than
        to a single initiative. Naming is a guide, not a rule—pick the shape your team will
        recognise.
      </Text>
      <Title order={3}>When to choose which</Title>
      <List size="md" spacing="xs">
        <List.Item>
          <strong>Project</strong> when work shares one owner or theme and benefits from sub-areas
          (subcontexts).
        </List.Item>
        <List.Item>
          <strong>Process</strong> when documentation is naturally described as a flow, standard, or
          recurring operational context.
        </List.Item>
      </List>
    </Stack>
  );
}
