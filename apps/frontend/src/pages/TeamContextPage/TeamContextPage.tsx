import { Box, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { IconUsersGroup } from '@tabler/icons-react';
import { apiFetch } from '../../api/client';
import { ArchiveTabContent } from '../../components/ArchiveTabContent';
import { DraftsTabContent } from '../../components/DraftsTabContent';
import { PageWithTabs } from '../../components/PageWithTabs';
import { TrashTabContent } from '../../components/TrashTabContent';
import { CreateContextMenu } from '../../components/contexts';
import { useMe } from '../../hooks/useMe';
import { canShowWriteTabs } from '../../lib/canShowWriteTabs';
import { TeamContextPageModals } from './TeamContextPageModals';
import { TeamDocumentsPanel } from './TeamDocumentsPanel';
import { TeamOverviewPanel } from './TeamOverviewPanel';
import { TeamProcessesPanel } from './TeamProcessesPanel';
import { TeamProjectsPanel } from './TeamProjectsPanel';
import type {
  DeleteTarget,
  EditTarget,
  ProcessItem,
  ProjectItem,
  TeamDocItem,
  TeamRes,
} from './teamContextPageTypes';

export function TeamContextPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const queryClient = useQueryClient();
  const [contextModalOpened, { open: openContextModal, close: closeContextModal }] =
    useDisclosure(false);
  const [documentModalOpened, { open: openDocumentModal, close: closeDocumentModal }] =
    useDisclosure(false);
  const [contextInitialType, setContextInitialType] = useState<'process' | 'project' | undefined>(
    undefined
  );
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { data: me, isPending: mePending } = useMe();

  const {
    data: team,
    isPending: teamPending,
    isError: teamError,
  } = useQuery({
    queryKey: ['team', teamId],
    queryFn: async (): Promise<TeamRes> => {
      if (!teamId) throw new Error('Missing teamId');
      const res = await apiFetch(`/api/v1/teams/${teamId}`);
      if (!res.ok) throw new Error('Failed to load team');
      return (await res.json()) as TeamRes;
    },
    enabled: !!teamId,
  });

  const departmentId = team?.departmentId ?? team?.department?.id;
  const companyId = team?.department?.companyId ?? team?.department?.company?.id;
  const isAdmin = me?.user?.isAdmin === true;
  const isTeamLead =
    (me?.identity?.teams?.length ?? 0) > 0 &&
    me?.identity?.teams?.some((t) => t.teamId === teamId && t.role === 'leader');
  const isDepartmentLead =
    departmentId != null &&
    (me?.identity?.departmentLeads?.length ?? 0) > 0 &&
    me?.identity?.departmentLeads?.some((d) => d.id === departmentId);
  const isCompanyLead =
    companyId != null &&
    (me?.identity?.companyLeads?.length ?? 0) > 0 &&
    me?.identity?.companyLeads?.some((c) => c.id === companyId);
  const canManage = !!(isAdmin || isTeamLead || isDepartmentLead || isCompanyLead);

  const { data: processesData, isPending: processesPending } = useQuery({
    queryKey: ['processes', 'team', teamId ?? ''],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (teamId) params.set('teamId', teamId);
      const res = await apiFetch(`/api/v1/processes?${params}`);
      if (!res.ok) throw new Error('Failed to load processes');
      const data = (await res.json()) as { items: ProcessItem[] };
      return data.items;
    },
    enabled: !!teamId,
  });

  const { data: projectsData, isPending: projectsPending } = useQuery({
    queryKey: ['projects', 'team', teamId ?? ''],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (teamId) params.set('teamId', teamId);
      const res = await apiFetch(`/api/v1/projects?${params}`);
      if (!res.ok) throw new Error('Failed to load projects');
      const data = (await res.json()) as { items: ProjectItem[] };
      return data.items;
    },
    enabled: !!teamId,
  });

  const teamScope = teamId != null ? { type: 'team' as const, id: teamId } : null;

  const [searchParams, setSearchParams] = useSearchParams();
  const docsSortBy = searchParams.get('docsSortBy') ?? 'updatedAt';
  const docsSortOrder = searchParams.get('docsSortOrder') ?? 'desc';
  const docsPage = Math.max(1, parseInt(searchParams.get('docsPage') ?? '1', 10));
  const docsLimitParam = searchParams.get('docsLimit');
  const docsLimit = docsLimitParam
    ? Math.min(100, Math.max(1, parseInt(docsLimitParam, 10) || 25))
    : 25;
  const docsOffset = (docsPage - 1) * docsLimit;
  const docsSearch = searchParams.get('docsSearch') ?? '';
  const docsContextType = searchParams.get('docsContextType') ?? '';

  const teamDocumentsParams = [
    teamId ?? '',
    String(docsLimit),
    String(docsOffset),
    docsSortBy,
    docsSortOrder,
    docsSearch,
    docsContextType,
  ];
  const { data: teamDocsRes, isPending: docsPending } = useQuery({
    queryKey: ['catalog-documents', 'team', teamDocumentsParams],
    queryFn: async () => {
      if (!teamId) throw new Error('Missing teamId');
      const params = new URLSearchParams({
        teamId,
        limit: String(docsLimit),
        offset: String(docsOffset),
        sortBy: docsSortBy,
        sortOrder: docsSortOrder,
      });
      if (docsSearch.trim()) params.set('search', docsSearch.trim());
      if (docsContextType === 'process' || docsContextType === 'project')
        params.set('contextType', docsContextType);
      const res = await apiFetch(`/api/v1/documents?${params}`);
      if (!res.ok) throw new Error('Failed to load documents');
      return (await res.json()) as { items: TeamDocItem[]; total: number };
    },
    enabled: !!teamId,
  });

  const docsTotal = teamDocsRes?.total ?? 0;
  const docsTotalPages = Math.ceil(docsTotal / docsLimit) || 1;
  const teamDocs = teamDocsRes?.items ?? [];

  const setDocsFilter = useCallback(
    (key: string, value: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
        next.delete('docsPage');
        return next;
      });
    },
    [setSearchParams]
  );

  const setDocsSort = useCallback(
    (col: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        const order = docsSortBy === col && docsSortOrder === 'desc' ? 'asc' : 'desc';
        next.set('docsSortBy', col);
        next.set('docsSortOrder', order);
        next.delete('docsPage');
        return next;
      });
    },
    [docsSortBy, docsSortOrder, setSearchParams]
  );

  const setDocsPage = useCallback(
    (p: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('docsPage', String(p));
        return next;
      });
    },
    [setSearchParams]
  );

  const setDocsLimit = useCallback(
    (value: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('docsLimit', String(value));
        next.delete('docsPage');
        return next;
      });
    },
    [setSearchParams]
  );

  const navigate = useNavigate();

  const invalidateContexts = () => {
    void queryClient.invalidateQueries({ queryKey: ['processes', 'team', teamId ?? ''] });
    void queryClient.invalidateQueries({ queryKey: ['projects', 'team', teamId ?? ''] });
    void queryClient.invalidateQueries({ queryKey: ['catalog-documents'] });
  };

  const handleEditSuccess = () => {
    invalidateContexts();
    setEditTarget(null);
    notifications.show({
      title: 'Saved',
      message: 'Name was updated.',
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
        void queryClient.invalidateQueries({ queryKey: ['me', 'trash'] });
        setDeleteTarget(null);
        notifications.show({
          title: 'Moved to trash',
          message: 'Context can be restored from the Trash tab.',
          color: 'green',
        });
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        notifications.show({
          title: 'Error',
          message: body?.error ?? res.statusText,
          color: 'red',
        });
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const canWrite = canShowWriteTabs(me, canManage);
  const baseTabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'processes', label: 'Processes' },
    { value: 'projects', label: 'Projects' },
    { value: 'documents', label: 'Documents' },
  ];
  const writeTabs = [
    { value: 'drafts', label: 'Drafts' },
    { value: 'trash', label: 'Trash' },
    { value: 'archive', label: 'Archive' },
  ];
  const tabs = [...baseTabs, ...(canWrite ? writeTabs : [])];

  const activeTab = searchParams.get('tab') || 'overview';

  const setActiveTab = useCallback(
    (tab: string) => {
      setSearchParams(
        (prev) => {
          prev.set('tab', tab);
          return prev;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    if (!canWrite && ['drafts', 'trash', 'archive'].includes(activeTab)) {
      setActiveTab('overview');
    }
  }, [canWrite, activeTab, setActiveTab]);

  const processes = processesData ?? [];
  const projects = projectsData ?? [];
  const processesPreview = processes.slice(0, 5);
  const projectsPreview = projects.slice(0, 5);

  if (!teamId) return null;
  if (teamPending || mePending)
    return (
      <Text size="sm" c="dimmed">
        Loading…
      </Text>
    );
  if (teamError || !team)
    return (
      <Text size="sm" c="red">
        Team not found.
      </Text>
    );

  return (
    <Box>
      <PageWithTabs
        title={team.name}
        titleIcon={<IconUsersGroup size={28} style={{ flexShrink: 0 }} aria-hidden />}
        description="Contexts and content for the team."
        actions={
          teamId && canManage ? (
            <CreateContextMenu
              onCreateProcess={() => {
                setContextInitialType('process');
                openContextModal();
              }}
              onCreateProject={() => {
                setContextInitialType('project');
                openContextModal();
              }}
              onCreateDraft={openDocumentModal}
            />
          ) : null
        }
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        recentScope={teamScope}
        recentViewMoreHref="/catalog"
      >
        {[
          <Fragment key="overview">
            <TeamOverviewPanel
              processesPreview={processesPreview}
              projectsPreview={projectsPreview}
              processesCount={processes.length}
              projectsCount={projects.length}
              docsTotal={docsTotal}
              teamDocs={teamDocs}
              canWrite={canWrite}
              teamId={teamId}
              onGoToTab={setActiveTab}
            />
          </Fragment>,
          <Fragment key="processes">
            <TeamProcessesPanel processesPending={processesPending} processes={processes} />
          </Fragment>,
          <Fragment key="projects">
            <TeamProjectsPanel projectsPending={projectsPending} projects={projects} />
          </Fragment>,
          <Fragment key="documents">
            <TeamDocumentsPanel
              docsPending={docsPending}
              docsSearch={docsSearch}
              docsContextType={docsContextType}
              docsSortBy={docsSortBy}
              docsSortOrder={docsSortOrder}
              docsPage={docsPage}
              docsLimit={docsLimit}
              docsTotal={docsTotal}
              docsTotalPages={docsTotalPages}
              teamDocs={teamDocs}
              teamId={teamId}
              setDocsFilter={setDocsFilter}
              setDocsSort={setDocsSort}
              setDocsPage={setDocsPage}
              setDocsLimit={setDocsLimit}
              navigate={navigate}
            />
          </Fragment>,
          ...(canWrite
            ? [
                <Fragment key="drafts">
                  <DraftsTabContent scopeParams={{ teamId }} enabled={!!teamId} />
                </Fragment>,
                <Fragment key="trash">
                  <TrashTabContent scope="team" teamId={teamId ?? undefined} />
                </Fragment>,
                <Fragment key="archive">
                  <ArchiveTabContent scope="team" teamId={teamId ?? undefined} />
                </Fragment>,
              ]
            : []),
        ]}
      </PageWithTabs>

      {teamId != null && (
        <TeamContextPageModals
          teamId={teamId}
          contextModalOpened={contextModalOpened}
          closeContextModal={closeContextModal}
          documentModalOpened={documentModalOpened}
          closeDocumentModal={closeDocumentModal}
          contextInitialType={contextInitialType}
          onInvalidateContexts={invalidateContexts}
          editTarget={editTarget}
          onCloseEdit={() => setEditTarget(null)}
          onEditSuccess={handleEditSuccess}
          deleteTarget={deleteTarget}
          onCloseDelete={() => setDeleteTarget(null)}
          deleteLoading={deleteLoading}
          onDeleteConfirm={() => {
            void handleDeleteConfirm();
          }}
        />
      )}
    </Box>
  );
}
