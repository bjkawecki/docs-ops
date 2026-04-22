import {
  Button,
  Card,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Stack,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { formatBytes } from './adminDepartmentsTabFormat';
import type { DepartmentStatsRes, DepartmentWithCompany } from './adminDepartmentsTabTypes';

export type AdminDepartmentEditModalProps = {
  department: DepartmentWithCompany;
  onClose: () => void;
  departmentCardEditing: boolean;
  setDepartmentCardEditing: (v: boolean) => void;
  editName: string;
  setEditName: (v: string) => void;
  editLeadIds: string[];
  setEditLeadIds: (v: string[]) => void;
  userOptions: { value: string; label: string }[];
  leadsForEdit: { id: string; name: string }[];
  leadsForEditPending: boolean;
  departmentStatsData: DepartmentStatsRes | undefined;
  departmentStatsPending: boolean;
  onStartEditCard: () => void;
  onSaveCard: () => void;
  saveLoading: boolean;
  onRequestDelete: () => void;
  deleteFromManageLoading: boolean;
};

export function AdminDepartmentEditModal({
  department,
  onClose,
  departmentCardEditing,
  setDepartmentCardEditing,
  editName,
  setEditName,
  editLeadIds,
  setEditLeadIds,
  userOptions,
  leadsForEdit,
  leadsForEditPending,
  departmentStatsData,
  departmentStatsPending,
  onStartEditCard,
  onSaveCard,
  saveLoading,
  onRequestDelete,
  deleteFromManageLoading,
}: AdminDepartmentEditModalProps) {
  return (
    <Modal
      opened
      onClose={onClose}
      title={`Department: ${department.name}`}
      size="lg"
      key={department.id}
    >
      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">Overview</Tabs.Tab>
          <Tabs.Tab value="manage">Manage</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="overview" pt="md">
          <Card withBorder padding="md">
            <Group justify="space-between" mb="md">
              <Text size="sm" fw={600}>
                Department
              </Text>
              {!departmentCardEditing && (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPencil size={14} />}
                  onClick={onStartEditCard}
                >
                  Edit
                </Button>
              )}
            </Group>
            {departmentCardEditing ? (
              <Stack gap="md">
                <TextInput
                  label="Name"
                  value={editName}
                  onChange={(e) => setEditName(e.currentTarget.value)}
                  required
                />
                <MultiSelect
                  label="Lead"
                  placeholder="Select department leads"
                  data={userOptions}
                  value={editLeadIds}
                  onChange={setEditLeadIds}
                  searchable
                  clearable
                />
                <Group gap="xs">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => setDepartmentCardEditing(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={onSaveCard}
                    loading={saveLoading}
                    disabled={!editName.trim()}
                  >
                    Save
                  </Button>
                </Group>
              </Stack>
            ) : leadsForEditPending ? (
              <Loader size="sm" />
            ) : (
              <Stack gap="xs">
                <div>
                  <Text size="xs" c="dimmed">
                    Name
                  </Text>
                  <Text size="sm">{department.name}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Lead
                  </Text>
                  <Text size="sm">
                    {leadsForEdit.length === 0 ? '–' : leadsForEdit.map((u) => u.name).join(', ')}
                  </Text>
                </div>
              </Stack>
            )}
          </Card>
          <Card withBorder padding="md" mt="md">
            <Text size="sm" fw={600} mb="xs">
              Stats
            </Text>
            {departmentStatsPending ? (
              <Loader size="sm" />
            ) : departmentStatsData ? (
              <Group gap="lg">
                <div>
                  <Text size="xs" c="dimmed">
                    Storage
                  </Text>
                  <Text size="sm">{formatBytes(departmentStatsData.storageBytesUsed)}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Teams
                  </Text>
                  <Text size="sm">{departmentStatsData.teamCount}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Members
                  </Text>
                  <Text size="sm">{departmentStatsData.memberCount}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Documents
                  </Text>
                  <Text size="sm">{departmentStatsData.documentCount}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Processes
                  </Text>
                  <Text size="sm">{departmentStatsData.processCount}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Projects
                  </Text>
                  <Text size="sm">{departmentStatsData.projectCount}</Text>
                </div>
              </Group>
            ) : null}
          </Card>
        </Tabs.Panel>
        <Tabs.Panel value="manage" pt="md">
          <Card withBorder padding="md">
            <Text size="sm" fw={600} mb="xs">
              Manage
            </Text>
            <Text size="xs" c="dimmed" mb="md">
              Sensitive actions. Use with care.
            </Text>
            <Button
              size="sm"
              variant="light"
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={onRequestDelete}
              loading={deleteFromManageLoading}
            >
              Delete department
            </Button>
          </Card>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
