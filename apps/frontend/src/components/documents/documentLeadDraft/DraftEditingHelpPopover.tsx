import { ActionIcon, Popover, Stack, Text } from '@mantine/core';
import { IconHelp } from '@tabler/icons-react';
import type { LeadDraftEditorMode } from '../LeadDraftTiptapEditor.js';

type Props = {
  editorMode: LeadDraftEditorMode;
  canEdit: boolean;
};

const REVISION_HELP =
  'Internal revision number of the shared draft. It increments on every draft update and prevents accidental overwrites when multiple users edit concurrently.';

function helpContent(editorMode: LeadDraftEditorMode, canEdit: boolean): string {
  if (!canEdit) {
    return 'You have read-only access to this shared draft. You cannot edit content or submit suggestions.';
  }
  if (editorMode === 'author') {
    return [
      'This is the shared lead draft for your team scope.',
      'Your edits are saved as inline suggestions (insert/delete marks).',
      'Use typing to add suggestions; the formatting toolbar is not available in author mode.',
      'Save draft to persist your suggestions. The scope lead can accept or decline them.',
      'Only the scope lead can publish the document.',
    ].join(' ');
  }
  return [
    'You are editing the shared lead draft directly.',
    'Changes apply to the draft for everyone with access.',
    'Scope authors can propose changes as inline suggestions for you to review.',
    'Use Publish when the draft is ready to go live.',
  ].join(' ');
}

export function DraftEditingHelpPopover({ editorMode, canEdit }: Props) {
  return (
    <Popover width={320} position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <ActionIcon variant="subtle" size="sm" aria-label="How draft editing works">
          <IconHelp size={16} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Draft revision
          </Text>
          <Text size="sm">{REVISION_HELP}</Text>
          <Text size="sm" fw={600} mt="xs">
            {canEdit
              ? editorMode === 'author'
                ? 'Author suggestions'
                : 'Lead draft editing'
              : 'Read-only draft'}
          </Text>
          <Text size="sm">{helpContent(editorMode, canEdit)}</Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
