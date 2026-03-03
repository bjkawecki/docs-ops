import { Button, Card, Group, Stack, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useMe } from '../hooks/useMe';
import { useRecentItemsActions, type RecentScope } from '../hooks/useRecentItems';
import { PageHeader } from '../components/PageHeader';
import { EditContextNameModal } from '../components/contexts/EditContextNameModal';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';

type ContextType = 'process' | 'project';

type OwnerResponse = {
  companyId: string | null;
  departmentId: string | null;
  teamId: string | null;
};
type ProcessResponse = { id: string; name: string; contextId: string; owner: OwnerResponse };
type ProjectResponse = { id: string; name: string; contextId: string; owner: OwnerResponse };

function ownerToScope(owner: OwnerResponse): RecentScope | null {
  if (owner.companyId) return { type: 'company', id: owner.companyId };
  if (owner.departmentId) return { type: 'department', id: owner.departmentId };
  if (owner.teamId) return { type: 'team', id: owner.teamId };
  return null;
}

export interface ContextDetailPageProps {
  type: ContextType;
  id: string;
}

export function ContextDetailPage({ type, id }: ContextDetailPageProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const recentActions = useRecentItemsActions();
  const canManage = (me?.identity?.companyLeads?.length ?? 0) > 0 || me?.user?.isAdmin === true;

  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const [editName, setEditName] = useState('');
  const [deleteOpened, { open: openDelete, close: closeDelete }] = useDisclosure(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const endpoint = type === 'process' ? '/api/v1/processes' : '/api/v1/projects';
  const queryKey = type === 'process' ? ['processes'] : ['projects'];

  const { data, isPending, isError } = useQuery({
    queryKey: [type, id],
    queryFn: async () => {
      const res = await apiFetch(`${endpoint}/${id}`);
      if (!res.ok) throw new Error('Kontext nicht gefunden');
      return res.json() as Promise<ProcessResponse | ProjectResponse>;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (data && recentActions) {
      const scope = ownerToScope(data.owner);
      if (scope) recentActions.addRecent({ type, id: data.id, name: data.name }, scope);
    }
  }, [data, type, id, recentActions]);

  const invalidateAndClose = () => {
    void queryClient.invalidateQueries({ queryKey });
    closeEdit();
    closeDelete();
  };

  const handleEditClick = () => {
    if (data) {
      setEditName(data.name);
      openEdit();
    }
  };

  const handleEditSuccess = () => {
    invalidateAndClose();
    if (data) setEditName(data.name);
    void queryClient.invalidateQueries({ queryKey: [type, id] });
    notifications.show({
      title: 'Gespeichert',
      message: 'Name wurde aktualisiert.',
      color: 'green',
    });
  };

  const handleDeleteConfirm = async () => {
    setDeleteLoading(true);
    try {
      const res = await apiFetch(`${endpoint}/${id}`, { method: 'DELETE' });
      if (res.status === 204) {
        void queryClient.invalidateQueries({ queryKey });
        closeDelete();
        void navigate('/company', { replace: true });
        notifications.show({
          title: 'Gelöscht',
          message: 'Kontext wurde gelöscht.',
          color: 'green',
        });
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        notifications.show({
          title: 'Fehler',
          message: body?.error ?? res.statusText,
          color: 'red',
        });
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  if (isPending)
    return (
      <Text size="sm" c="dimmed">
        Wird geladen…
      </Text>
    );
  if (isError || !data)
    return (
      <Text size="sm" c="red">
        Kontext nicht gefunden.
      </Text>
    );

  const typeLabel = type === 'process' ? 'Prozess' : 'Projekt';

  return (
    <>
      <PageHeader
        title={data.name}
        description={`${typeLabel} · Company`}
        actions={
          canManage ? (
            <Group gap="xs">
              <Button variant="light" size="sm" onClick={handleEditClick}>
                Bearbeiten
              </Button>
              <Button variant="light" size="sm" color="red" onClick={openDelete}>
                Löschen
              </Button>
            </Group>
          ) : null
        }
      />

      <Stack gap="md">
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            Dokumentenliste folgt in §12.
          </Text>
        </Card>
      </Stack>

      <EditContextNameModal
        opened={editOpened}
        onClose={closeEdit}
        type={type}
        contextId={id}
        currentName={editName}
        onSuccess={handleEditSuccess}
      />

      <Modal opened={deleteOpened} onClose={closeDelete} title="Kontext löschen" centered>
        <Text size="sm" c="dimmed" mb="md">
          Dieser Kontext und zugehörige Daten werden unwiderruflich gelöscht. Fortfahren?
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={closeDelete}>
            Abbrechen
          </Button>
          <Button
            color="red"
            loading={deleteLoading}
            onClick={() => {
              void handleDeleteConfirm();
            }}
          >
            Löschen
          </Button>
        </Group>
      </Modal>
    </>
  );
}
