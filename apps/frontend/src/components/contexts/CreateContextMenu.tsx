import { Button, Menu } from '@mantine/core';
import { IconBriefcase, IconFileText, IconPlus, IconRoute } from '@tabler/icons-react';

export interface CreateContextMenuProps {
  /** Called when the user chooses "Process". */
  onCreateProcess: () => void;
  /** Called when the user chooses "Project". */
  onCreateProject: () => void;
  /** Called when the user chooses "Draft" (new document draft, to be published later). */
  onCreateDraft: () => void;
  /** Button label. Default: "Create". */
  label?: string;
}

/**
 * Reusable "Create" dropdown with Process, Project and Draft actions.
 * Used on Personal, Company, Department and Team context pages.
 * Drafts are unpublished documents; they become documents after publishing.
 */
export function CreateContextMenu({
  onCreateProcess,
  onCreateProject,
  onCreateDraft,
  label = 'Create',
}: CreateContextMenuProps) {
  return (
    <Menu position="bottom-end" shadow="md">
      <Menu.Target>
        <Button variant="light" size="sm" leftSection={<IconPlus size={16} />}>
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconRoute size={16} />} onClick={onCreateProcess}>
          Process
        </Menu.Item>
        <Menu.Item leftSection={<IconBriefcase size={16} />} onClick={onCreateProject}>
          Project
        </Menu.Item>
        <Menu.Item leftSection={<IconFileText size={16} />} onClick={onCreateDraft}>
          Draft
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
