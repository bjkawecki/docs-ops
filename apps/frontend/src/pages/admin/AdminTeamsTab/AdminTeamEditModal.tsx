import {
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import type { Department, Team } from 'backend/api-types';
import { formatBytes } from './adminTeamsTabFormat';
import type { AssignmentItem, TeamStatsRes, TeamWithDept } from './adminTeamsTabTypes';

export type AdminTeamEditModalProps = {
  team: TeamWithDept;
  onClose: () => void;
  departments: (Department & { teams: Team[] })[];
  teamCardEditing: boolean;
  setTeamCardEditing: (v: boolean) => void;
  editName: string;
  setEditName: (v: string) => void;
  editDepartmentId: string;
  setEditDepartmentId: (v: string) => void;
  editLeadIds: string[];
  setEditLeadIds: (v: string[]) => void;
  editMemberIds: string[];
  setEditMemberIds: (v: string[]) => void;
  userOptions: { value: string; label: string }[];
  leadsForEdit: AssignmentItem[];
  leadsForEditPending: boolean;
  membersForEdit: AssignmentItem[];
  membersForEditPending: boolean;
  teamStatsData: TeamStatsRes | undefined;
  teamStatsPending: boolean;
  onStartEditCard: () => void;
  onSaveCard: () => void;
  saveLoading: boolean;
  onRequestDelete: () => void;
  deleteFromManageLoading: boolean;
};

export function AdminTeamEditModal({
  team,
  onClose,
  departments,
  teamCardEditing,
  setTeamCardEditing,
  editName,
  setEditName,
  editDepartmentId,
  setEditDepartmentId,
  editLeadIds,
  setEditLeadIds,
  editMemberIds,
  setEditMemberIds,
  userOptions,
  leadsForEdit,
  leadsForEditPending,
  membersForEdit,
  membersForEditPending,
  teamStatsData,
  teamStatsPending,
  onStartEditCard,
  onSaveCard,
  saveLoading,
  onRequestDelete,
  deleteFromManageLoading,
}: AdminTeamEditModalProps) {
  return (
    <Modal opened onClose={onClose} title={`Team: ${team.name}`} size="lg" key={team.id}>
      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">Overview</Tabs.Tab>
          <Tabs.Tab value="manage">Manage</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="overview" pt="md">
          <Card withBorder padding="md">
            <Group justify="space-between" mb="md">
              <Text size="sm" fw={600}>
                Team
              </Text>
              {!teamCardEditing && (
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
            {teamCardEditing ? (
              <Stack gap="md">
                <TextInput
                  label="Name"
                  value={editName}
                  onChange={(e) => setEditName(e.currentTarget.value)}
                  required
                />
                <Select
                  label="Department"
                  data={departments.map((d) => ({ value: d.id, label: d.name }))}
                  value={editDepartmentId}
                  onChange={(v) => v && setEditDepartmentId(v)}
                  required
                />
                <MultiSelect
                  label="Lead"
                  placeholder="Select team leads"
                  data={userOptions}
                  value={editLeadIds}
                  onChange={setEditLeadIds}
                  searchable
                  clearable
                />
                <MultiSelect
                  label="Members"
                  placeholder="Select team members"
                  data={userOptions}
                  value={editMemberIds}
                  onChange={setEditMemberIds}
                  searchable
                  clearable
                />
                <Group gap="xs">
                  <Button size="sm" variant="default" onClick={() => setTeamCardEditing(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={onSaveCard}
                    loading={saveLoading}
                    disabled={!editName.trim() || !editDepartmentId}
                  >
                    Save
                  </Button>
                </Group>
              </Stack>
            ) : (
              <Stack gap="xs">
                <div>
                  <Text size="xs" c="dimmed">
                    Name
                  </Text>
                  <Text size="sm">{team.name}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Department
                  </Text>
                  <Text size="sm">{team.departmentName}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Lead
                  </Text>
                  {leadsForEditPending ? (
                    <Loader size="xs" />
                  ) : leadsForEdit.length === 0 ? (
                    <Text size="sm">–</Text>
                  ) : (
                    <Group gap="xs" mt={4}>
                      {leadsForEdit.map((u) => (
                        <Badge key={u.id} size="sm" variant="light">
                          {u.name}
                        </Badge>
                      ))}
                    </Group>
                  )}
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Members
                  </Text>
                  {membersForEditPending ? (
                    <Loader size="xs" />
                  ) : membersForEdit.length === 0 ? (
                    <Text size="sm">–</Text>
                  ) : (
                    <Group gap="xs" mt={4} wrap="wrap">
                      {membersForEdit.map((m) => (
                        <Badge key={m.id} size="sm" variant="light">
                          {m.name}
                        </Badge>
                      ))}
                    </Group>
                  )}
                </div>
              </Stack>
            )}
          </Card>
          <Card withBorder padding="md" mt="md">
            <Text size="sm" fw={600} mb="xs">
              Stats
            </Text>
            {teamStatsPending ? (
              <Loader size="sm" />
            ) : teamStatsData ? (
              <Group gap="lg">
                <div>
                  <Text size="xs" c="dimmed">
                    Storage
                  </Text>
                  <Text size="sm">{formatBytes(teamStatsData.storageBytesUsed)}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Members
                  </Text>
                  <Text size="sm">{teamStatsData.memberCount}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Documents
                  </Text>
                  <Text size="sm">{teamStatsData.documentCount}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Processes
                  </Text>
                  <Text size="sm">{teamStatsData.processCount}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    Projects
                  </Text>
                  <Text size="sm">{teamStatsData.projectCount}</Text>
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
              Delete team
            </Button>
          </Card>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}
