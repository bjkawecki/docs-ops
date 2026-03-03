import { Button, Card, Group, Modal, SimpleGrid, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { useMe } from '../hooks/useMe';
import { useRecentItems } from '../hooks/useRecentItems';
import { PageWithTabs } from '../components/PageWithTabs';
import {
  ContextCard,
  ContextGrid,
  EditContextNameModal,
  NewContextModal,
  RecentItemsCard,
} from '../components/contexts';
import { notifications } from '@mantine/notifications';

type ProcessItem = { id: string; name: string; contextId: string };
type ProjectItem = { id: string; name: string; contextId: string };

type DepartmentRes = { id: string; name: string; companyId?: string; company?: { id: string } };

type EditTarget = { id: string; name: string; type: 'process' | 'project' };
type DeleteTarget = { id: string; type: 'process' | 'project' };

export function DepartmentContextPage() {
  const { departmentId } = useParams<{ departmentId: string }>();
  const queryClient = useQueryClient();
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { data: me } = useMe();

  const {
    data: department,
    isPending: departmentPending,
    isError: departmentError,
  } = useQuery({
    queryKey: ['department', departmentId],
    queryFn: async (): Promise<DepartmentRes> => {
      if (!departmentId) throw new Error('Missing departmentId');
      const res = await apiFetch(`/api/v1/departments/${departmentId}`);
      if (!res.ok) throw new Error('Failed to load department');
      return (await res.json()) as DepartmentRes;
    },
    enabled: !!departmentId,
  });

  const companyId = department?.companyId ?? department?.company?.id;
  const isAdmin = me?.user?.isAdmin === true;
  const isDepartmentLead =
    (me?.identity?.departmentLeads?.length ?? 0) > 0 &&
    me?.identity?.departmentLeads?.some((d) => d.id === departmentId);
  const isCompanyLead =
    companyId != null &&
    (me?.identity?.companyLeads?.length ?? 0) > 0 &&
    me?.identity?.companyLeads?.some((c) => c.id === companyId);
  const canManage = !!(isAdmin || isDepartmentLead || isCompanyLead);

  const { data: processesData, isPending: processesPending } = useQuery({
    queryKey: ['processes', 'department', departmentId ?? ''],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (departmentId) params.set('departmentId', departmentId);
      const res = await apiFetch(`/api/v1/processes?${params}`);
      if (!res.ok) throw new Error('Prozesse laden fehlgeschlagen');
      const data = (await res.json()) as { items: ProcessItem[] };
      return data.items;
    },
    enabled: !!departmentId,
  });

  const { data: projectsData, isPending: projectsPending } = useQuery({
    queryKey: ['projects', 'department', departmentId ?? ''],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (departmentId) params.set('departmentId', departmentId);
      const res = await apiFetch(`/api/v1/projects?${params}`);
      if (!res.ok) throw new Error('Projekte laden fehlgeschlagen');
      const data = (await res.json()) as { items: ProjectItem[] };
      return data.items;
    },
    enabled: !!departmentId,
  });

  const departmentScope =
    departmentId != null ? { type: 'department' as const, id: departmentId } : null;
  const { items: recentItems } = useRecentItems(departmentScope);

  const invalidateContexts = () => {
    void queryClient.invalidateQueries({
      queryKey: ['processes', 'department', departmentId ?? ''],
    });
    void queryClient.invalidateQueries({
      queryKey: ['projects', 'department', departmentId ?? ''],
    });
  };

  const handleEditSuccess = () => {
    invalidateContexts();
    setEditTarget(null);
    notifications.show({
      title: 'Gespeichert',
      message: 'Name wurde aktualisiert.',
      color: 'green',
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    const endpoint = deleteTarget.type === 'process' ? '/api/v1/processes' : '/api/v1/projects';
    try {
      const res = await apiFetch(`${endpoint}/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.status === 204) {
        invalidateContexts();
        setDeleteTarget(null);
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

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'processes', label: 'Prozesse' },
    { value: 'projects', label: 'Projekte' },
    { value: 'documents', label: 'Dokumente' },
  ];

  const [activeTab, setActiveTab] = useState(tabs[0].value);
  const processes = processesData ?? [];
  const projects = projectsData ?? [];
  const processesPreview = processes.slice(0, 5);
  const projectsPreview = projects.slice(0, 5);

  if (!departmentId) return null;
  if (departmentPending)
    return (
      <Text size="sm" c="dimmed">
        Loading…
      </Text>
    );
  if (departmentError || !department)
    return (
      <Text size="sm" c="red">
        Department not found.
      </Text>
    );

  return (
    <>
      <PageWithTabs
        title={department.name}
        description="Kontexte und Inhalte der Abteilung."
        actions={
          departmentId && canManage ? (
            <Button variant="light" size="sm" onClick={openModal}>
              Create
            </Button>
          ) : null
        }
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <RecentItemsCard items={recentItems} />

            <Card withBorder padding="md">
              <Stack gap="xs">
                <Text fw={600} size="sm">
                  Prozesse
                </Text>
                {processesPreview.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    Noch keine Prozesse.
                  </Text>
                ) : (
                  <Stack gap={4}>
                    {processesPreview.map((p) => (
                      <Link
                        key={p.id}
                        to={`/processes/${p.id}`}
                        style={{ fontSize: 'var(--mantine-font-size-sm)' }}
                      >
                        {p.name}
                      </Link>
                    ))}
                  </Stack>
                )}
                <Group justify="flex-end" mt="xs">
                  <Button variant="subtle" size="xs" onClick={() => setActiveTab('processes')}>
                    View more
                  </Button>
                </Group>
              </Stack>
            </Card>

            <Card withBorder padding="md">
              <Stack gap="xs">
                <Text fw={600} size="sm">
                  Projekte
                </Text>
                {projectsPreview.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    Noch keine Projekte.
                  </Text>
                ) : (
                  <Stack gap={4}>
                    {projectsPreview.map((p) => (
                      <Link
                        key={p.id}
                        to={`/projects/${p.id}`}
                        style={{ fontSize: 'var(--mantine-font-size-sm)' }}
                      >
                        {p.name}
                      </Link>
                    ))}
                  </Stack>
                )}
                <Group justify="flex-end" mt="xs">
                  <Button variant="subtle" size="xs" onClick={() => setActiveTab('projects')}>
                    View more
                  </Button>
                </Group>
              </Stack>
            </Card>

            <Card withBorder padding="md">
              <Stack gap="xs">
                <Text fw={600} size="sm">
                  Dokumente
                </Text>
                <Text size="sm" c="dimmed">
                  Dokumente – Inhalte folgen in §12.
                </Text>
                <Group justify="flex-end" mt="xs">
                  <Button variant="subtle" size="xs" onClick={() => setActiveTab('documents')}>
                    View more
                  </Button>
                </Group>
              </Stack>
            </Card>
          </SimpleGrid>
        </Stack>
        {processesPending ? (
          <Card withBorder padding="md">
            <Text size="sm" c="dimmed">
              Prozesse werden geladen…
            </Text>
          </Card>
        ) : processes.length === 0 ? (
          <Card withBorder padding="md">
            <Text size="sm" c="dimmed">
              Noch keine Prozesse. Über „Create“ anlegen.
            </Text>
          </Card>
        ) : (
          <ContextGrid>
            {processes.map((p) => (
              <ContextCard
                key={p.id}
                title={p.name}
                type="process"
                href={`/processes/${p.id}`}
                canManage={canManage}
                onEdit={() => setEditTarget({ id: p.id, name: p.name, type: 'process' })}
                onDelete={() => setDeleteTarget({ id: p.id, type: 'process' })}
              />
            ))}
          </ContextGrid>
        )}
        {projectsPending ? (
          <Card withBorder padding="md">
            <Text size="sm" c="dimmed">
              Projekte werden geladen…
            </Text>
          </Card>
        ) : projects.length === 0 ? (
          <Card withBorder padding="md">
            <Text size="sm" c="dimmed">
              Noch keine Projekte. Über „Create“ anlegen.
            </Text>
          </Card>
        ) : (
          <ContextGrid>
            {projects.map((p) => (
              <ContextCard
                key={p.id}
                title={p.name}
                type="project"
                href={`/projects/${p.id}`}
                canManage={canManage}
                onEdit={() => setEditTarget({ id: p.id, name: p.name, type: 'project' })}
                onDelete={() => setDeleteTarget({ id: p.id, type: 'project' })}
              />
            ))}
          </ContextGrid>
        )}
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            Dokumente – Inhalte folgen in §12.
          </Text>
        </Card>
      </PageWithTabs>

      {departmentId != null && (
        <NewContextModal
          opened={modalOpened}
          onClose={closeModal}
          scope={{ type: 'department', departmentId }}
          onSuccess={invalidateContexts}
        />
      )}

      {editTarget != null && (
        <EditContextNameModal
          opened
          onClose={() => setEditTarget(null)}
          type={editTarget.type}
          contextId={editTarget.id}
          currentName={editTarget.name}
          onSuccess={handleEditSuccess}
        />
      )}

      <Modal
        opened={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        title="Kontext löschen"
        centered
      >
        <Text size="sm" c="dimmed" mb="md">
          Dieser Kontext und zugehörige Daten werden unwiderruflich gelöscht. Fortfahren?
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={() => setDeleteTarget(null)}>
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
