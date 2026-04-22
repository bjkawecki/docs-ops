import { Box, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Team } from 'backend/api-types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../api/client';
import { AdminTeamDeleteModal } from './AdminTeamDeleteModal';
import { AdminTeamEditModal } from './AdminTeamEditModal';
import { AdminTeamsTableSection } from './AdminTeamsTableSection';
import { AdminTeamsToolbar } from './AdminTeamsToolbar';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  TEAMS_PAGE_SIZE_KEY,
} from './adminTeamsTabConstants';
import type {
  AdminUsersRes,
  AssignmentItem,
  AssignmentListRes,
  CompaniesRes,
  DepartmentsRes,
  TeamBatchRow,
  TeamStatsRes,
  TeamWithDept,
} from './adminTeamsTabTypes';
import { CreateTeamForm } from './CreateTeamForm';

export function AdminTeamsTab() {
  const queryClient = useQueryClient();
  const [filterText, setFilterText] = useState('');
  const [filterDepartmentId, setFilterDepartmentId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(() => {
    try {
      const raw = window.localStorage.getItem(TEAMS_PAGE_SIZE_KEY);
      if (!raw) return DEFAULT_PAGE_SIZE;
      const parsed = Number(raw);
      return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])
        ? parsed
        : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });
  const [createTeamOpened, { open: openCreateTeam, close: closeCreateTeam }] = useDisclosure(false);
  const [editingTeam, setEditingTeam] = useState<TeamWithDept | null>(null);
  const [teamCardEditing, setTeamCardEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDepartmentId, setEditDepartmentId] = useState('');
  const [editLeadIds, setEditLeadIds] = useState<string[]>([]);
  const [editMemberIds, setEditMemberIds] = useState<string[]>([]);
  const [deleteConfirmTeam, setDeleteConfirmTeam] = useState<TeamWithDept | null>(null);

  const { data: companiesData } = useQuery({
    queryKey: ['companies'],
    queryFn: async (): Promise<CompaniesRes> => {
      const res = await apiFetch('/api/v1/companies?limit=100');
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as CompaniesRes;
    },
  });

  const companyId = companiesData?.items?.[0]?.id ?? null;

  const { data: departmentsData } = useQuery({
    queryKey: ['companies', companyId, 'departments'],
    queryFn: async (): Promise<DepartmentsRes> => {
      const res = await apiFetch(`/api/v1/companies/${companyId}/departments?limit=100`);
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as DepartmentsRes;
    },
    enabled: !!companyId,
  });

  const departments = useMemo(() => departmentsData?.items ?? [], [departmentsData?.items]);

  const allTeams = useMemo(
    (): TeamWithDept[] =>
      departments.flatMap((d) =>
        (d.teams ?? []).map((t) => ({
          ...t,
          departmentId: d.id,
          departmentName: d.name,
        }))
      ),
    [departments]
  );

  const filteredTeams = useMemo(() => {
    let list = allTeams;
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      list = list.filter(
        (t) => t.name.toLowerCase().includes(q) || t.departmentName.toLowerCase().includes(q)
      );
    }
    if (filterDepartmentId) {
      list = list.filter((t) => t.departmentId === filterDepartmentId);
    }
    return list;
  }, [allTeams, filterText, filterDepartmentId]);
  const totalPages = Math.max(1, Math.ceil(filteredTeams.length / limit));
  const pagedTeams = useMemo(() => {
    const start = (page - 1) * limit;
    return filteredTeams.slice(start, start + limit);
  }, [filteredTeams, page, limit]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const { data: leadsForEditData, isPending: leadsForEditPending } = useQuery({
    queryKey: ['teams', editingTeam?.id, 'team-leads'],
    queryFn: async (): Promise<AssignmentListRes> => {
      const res = await apiFetch(`/api/v1/teams/${editingTeam!.id}/team-leads?limit=100`);
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as AssignmentListRes;
    },
    enabled: !!editingTeam?.id,
  });
  const leadsForEdit = useMemo(() => leadsForEditData?.items ?? [], [leadsForEditData?.items]);

  const { data: membersForEditData, isPending: membersForEditPending } = useQuery({
    queryKey: ['admin', 'teams', editingTeam?.id, 'members'],
    queryFn: async (): Promise<AssignmentListRes> => {
      const res = await apiFetch(`/api/v1/admin/teams/${editingTeam!.id}/members?limit=500`);
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as AssignmentListRes;
    },
    enabled: !!editingTeam?.id,
  });
  const membersForEdit = useMemo(
    () => membersForEditData?.items ?? [],
    [membersForEditData?.items]
  );

  useEffect(() => {
    const members = membersForEditData?.items ?? [];
    if (teamCardEditing && editingTeam?.id && members.length > 0 && editMemberIds.length === 0) {
      setEditMemberIds(members.map((m) => m.id));
    }
  }, [teamCardEditing, editingTeam?.id, membersForEditData, editMemberIds.length]);

  const { data: adminUsersData } = useQuery({
    queryKey: ['admin', 'users', 'list'],
    queryFn: async (): Promise<AdminUsersRes> => {
      const res = await apiFetch('/api/v1/admin/users?limit=200&includeDeactivated=false');
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as AdminUsersRes;
    },
    enabled: !!editingTeam?.id,
  });
  const userOptions = useMemo(
    () => (adminUsersData?.items ?? []).map((u) => ({ value: u.id, label: u.name })),
    [adminUsersData?.items]
  );

  const { data: teamStatsData, isPending: teamStatsPending } = useQuery({
    queryKey: ['admin', 'teams', editingTeam?.id, 'stats'],
    queryFn: async (): Promise<TeamStatsRes> => {
      const res = await apiFetch(`/api/v1/admin/teams/${editingTeam!.id}/stats`);
      if (!res.ok) throw new Error('Failed to load stats');
      return (await res.json()) as TeamStatsRes;
    },
    enabled: !!editingTeam?.id,
  });

  const teamIdsForBatch = useMemo(() => filteredTeams.map((t) => t.id), [filteredTeams]);
  const { data: teamBatchData } = useQuery({
    queryKey: ['teams', 'batch', [...teamIdsForBatch].sort().join(',')],
    queryFn: async (): Promise<Record<string, TeamBatchRow>> => {
      const entries = await Promise.all(
        teamIdsForBatch.map(async (tid) => {
          const [statsRes, leadRes] = await Promise.all([
            apiFetch(`/api/v1/admin/teams/${tid}/stats`),
            apiFetch(`/api/v1/teams/${tid}/team-leads?limit=100`),
          ]);
          const statsData = statsRes.ok ? ((await statsRes.json()) as TeamStatsRes) : null;
          const leadData = leadRes.ok
            ? ((await leadRes.json()) as AssignmentListRes)
            : { items: [] as AssignmentItem[] };
          const memberCount = statsData?.memberCount ?? 0;
          const leadNames = leadData.items.map((l) => l.name);
          return [tid, { memberCount, leadNames }] as const;
        })
      );
      return Object.fromEntries(entries);
    },
    enabled: teamIdsForBatch.length > 0,
  });

  const invalidateAssignments = useCallback(
    (tid?: string) => {
      if (tid) {
        void queryClient.invalidateQueries({ queryKey: ['teams', tid, 'members'] });
        void queryClient.invalidateQueries({ queryKey: ['admin', 'teams', tid, 'members'] });
        void queryClient.invalidateQueries({ queryKey: ['teams', tid, 'team-leads'] });
      }
      void queryClient.invalidateQueries({ queryKey: ['teams', 'batch'] });
    },
    [queryClient]
  );

  const invalidateDepartments = useCallback(
    (cid?: string | null) => {
      if (cid) void queryClient.invalidateQueries({ queryKey: ['companies', cid, 'departments'] });
      else if (companyId)
        void queryClient.invalidateQueries({ queryKey: ['companies', companyId, 'departments'] });
    },
    [companyId, queryClient]
  );

  const createTeam = useMutation({
    mutationFn: async ({ name, departmentId: did }: { name: string; departmentId: string }) => {
      const res = await apiFetch(`/api/v1/departments/${did}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      return (await res.json()) as Team;
    },
    onSuccess: (_, variables) => {
      const dept = departments.find((d) => d.id === variables.departmentId);
      invalidateDepartments(dept?.companyId ?? companyId);
      closeCreateTeam();
      notifications.show({
        title: 'Team created',
        message: 'The team has been created.',
        color: 'green',
      });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const updateTeam = useMutation({
    mutationFn: async ({
      teamId: tid,
      name,
      departmentId: did,
    }: {
      teamId: string;
      name: string;
      departmentId: string;
    }) => {
      const res = await apiFetch(`/api/v1/teams/${tid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, departmentId: did }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      return (await res.json()) as Team;
    },
    onSuccess: (_, variables) => {
      const dept = departments.find((d) => d.id === variables.departmentId);
      invalidateDepartments(dept?.companyId ?? companyId);
      setEditingTeam(null);
      notifications.show({
        title: 'Team updated',
        message: 'The team has been updated.',
        color: 'green',
      });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const deleteTeam = useMutation({
    mutationFn: async (tid: string) => {
      const res = await apiFetch(`/api/v1/teams/${tid}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: (_, tid) => {
      const team = allTeams.find((t) => t.id === tid);
      const dept = team ? departments.find((d) => d.id === team.departmentId) : undefined;
      invalidateDepartments(dept?.companyId ?? companyId);
      setDeleteConfirmTeam(null);
      notifications.show({
        title: 'Team deleted',
        message: 'The team has been deleted.',
        color: 'green',
      });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const addLeader = useMutation({
    mutationFn: async ({ teamId: tid, userId }: { teamId: string; userId: string }) => {
      const res = await apiFetch(`/api/v1/teams/${tid}/team-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: (_, { teamId: tid }) => {
      invalidateAssignments(tid);
      notifications.show({
        title: 'Team leader added',
        message: 'The team leader has been added.',
        color: 'green',
      });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const removeLeader = useMutation({
    mutationFn: async ({ teamId: tid, userId }: { teamId: string; userId: string }) => {
      const res = await apiFetch(`/api/v1/teams/${tid}/team-leads/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: (_, { teamId: tid }) => {
      invalidateAssignments(tid);
      notifications.show({
        title: 'Team leader removed',
        message: 'The team leader has been removed.',
        color: 'green',
      });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const addMember = useMutation({
    mutationFn: async ({ teamId: tid, userId }: { teamId: string; userId: string }) => {
      const res = await apiFetch(`/api/v1/teams/${tid}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: (_, { teamId: tid }) => {
      invalidateAssignments(tid);
      notifications.show({
        title: 'Member added',
        message: 'The member has been added to the team.',
        color: 'green',
      });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const removeMember = useMutation({
    mutationFn: async ({ teamId: tid, userId }: { teamId: string; userId: string }) => {
      const res = await apiFetch(`/api/v1/teams/${tid}/members/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: (_, { teamId: tid }) => {
      invalidateAssignments(tid);
      notifications.show({
        title: 'Member removed',
        message: 'The member has been removed from the team.',
        color: 'green',
      });
    },
    onError: (err: Error) =>
      notifications.show({ title: 'Error', message: err.message, color: 'red' }),
  });

  const departmentOptions = useMemo(
    () => [
      { value: '', label: 'All departments' },
      ...departments.map((d) => ({ value: d.id, label: d.name })),
    ],
    [departments]
  );

  const handleStartEditCard = useCallback(() => {
    if (!editingTeam) return;
    setEditName(editingTeam.name);
    setEditDepartmentId(editingTeam.departmentId);
    setEditLeadIds(leadsForEdit.map((u) => u.id));
    setEditMemberIds(membersForEdit.map((m) => m.id));
    setTeamCardEditing(true);
  }, [editingTeam, leadsForEdit, membersForEdit]);

  const handleSaveTeamCard = useCallback(() => {
    const team = editingTeam;
    if (!team) return;
    const name = editName.trim();
    if (!name || !editDepartmentId) return;
    void (async () => {
      try {
        if (name !== team.name || editDepartmentId !== team.departmentId) {
          await updateTeam.mutateAsync({
            teamId: team.id,
            name,
            departmentId: editDepartmentId,
          });
        }
        const tid = team.id;
        const currentMemberIds = membersForEdit.map((m) => m.id);
        const toAddMembers = editMemberIds.filter((id) => !currentMemberIds.includes(id));
        const toRemoveMembers = currentMemberIds.filter((id) => !editMemberIds.includes(id));
        for (const userId of toRemoveMembers) {
          if (leadsForEdit.some((l) => l.id === userId)) {
            await removeLeader.mutateAsync({ teamId: tid, userId });
          }
          await removeMember.mutateAsync({ teamId: tid, userId });
        }
        for (const userId of toAddMembers) {
          await addMember.mutateAsync({ teamId: tid, userId });
        }
        const currentLeadIds = leadsForEdit.map((u) => u.id);
        const toAddLeads = editLeadIds.filter((id) => !currentLeadIds.includes(id));
        const toRemoveLeads = currentLeadIds.filter((id) => !editLeadIds.includes(id));
        await Promise.all([
          ...toAddLeads.map((userId) => addLeader.mutateAsync({ teamId: tid, userId })),
          ...toRemoveLeads.map((userId) => removeLeader.mutateAsync({ teamId: tid, userId })),
        ]);
        setEditingTeam((prev) =>
          prev && prev.id === tid
            ? {
                ...prev,
                name,
                departmentId: editDepartmentId,
                departmentName:
                  departments.find((d) => d.id === editDepartmentId)?.name ?? prev.departmentName,
              }
            : prev
        );
        invalidateAssignments(tid);
        setTeamCardEditing(false);
      } catch {
        // notifications from mutations
      }
    })();
  }, [
    editingTeam,
    editName,
    editDepartmentId,
    editLeadIds,
    editMemberIds,
    leadsForEdit,
    membersForEdit,
    departments,
    updateTeam,
    removeLeader,
    removeMember,
    addMember,
    addLeader,
    invalidateAssignments,
  ]);

  return (
    <Box>
      <AdminTeamsToolbar
        filterText={filterText}
        onFilterTextChange={(value) => {
          setFilterText(value);
          setPage(1);
        }}
        filterDepartmentId={filterDepartmentId}
        onFilterDepartmentIdChange={(value) => {
          setFilterDepartmentId(value);
          setPage(1);
        }}
        departmentOptions={departmentOptions}
        companyId={companyId}
        filteredTeamsCount={filteredTeams.length}
        limit={limit}
        onLimitChange={(next) => {
          setLimit(next);
          setPage(1);
        }}
        onOpenCreate={openCreateTeam}
        createDisabled={!companyId || departments.length === 0}
      />

      <AdminTeamsTableSection
        companyId={companyId}
        departmentsLength={departments.length}
        allTeamsLength={allTeams.length}
        filteredTeamsLength={filteredTeams.length}
        limit={limit}
        page={page}
        totalPages={totalPages}
        pagedTeams={pagedTeams}
        teamBatchData={teamBatchData}
        onPageChange={setPage}
        onSelectTeam={setEditingTeam}
      />

      <Modal opened={createTeamOpened} onClose={closeCreateTeam} title="Create team" size="sm">
        <CreateTeamForm
          departments={departments}
          onSubmit={(name, departmentId) => createTeam.mutate({ name, departmentId })}
          onCancel={closeCreateTeam}
          loading={createTeam.isPending}
        />
      </Modal>

      {editingTeam && (
        <AdminTeamEditModal
          team={editingTeam}
          onClose={() => setEditingTeam(null)}
          departments={departments}
          teamCardEditing={teamCardEditing}
          setTeamCardEditing={setTeamCardEditing}
          editName={editName}
          setEditName={setEditName}
          editDepartmentId={editDepartmentId}
          setEditDepartmentId={setEditDepartmentId}
          editLeadIds={editLeadIds}
          setEditLeadIds={setEditLeadIds}
          editMemberIds={editMemberIds}
          setEditMemberIds={setEditMemberIds}
          userOptions={userOptions}
          leadsForEdit={leadsForEdit}
          leadsForEditPending={leadsForEditPending}
          membersForEdit={membersForEdit}
          membersForEditPending={membersForEditPending}
          teamStatsData={teamStatsData}
          teamStatsPending={teamStatsPending}
          onStartEditCard={handleStartEditCard}
          onSaveCard={handleSaveTeamCard}
          saveLoading={
            updateTeam.isPending ||
            addLeader.isPending ||
            removeLeader.isPending ||
            addMember.isPending ||
            removeMember.isPending
          }
          onRequestDelete={() => setDeleteConfirmTeam(editingTeam)}
          deleteFromManageLoading={deleteTeam.isPending}
        />
      )}

      <AdminTeamDeleteModal
        opened={!!deleteConfirmTeam}
        team={deleteConfirmTeam}
        onClose={() => setDeleteConfirmTeam(null)}
        onConfirmDelete={() => {
          if (deleteConfirmTeam) deleteTeam.mutate(deleteConfirmTeam.id);
        }}
        deleteLoading={deleteTeam.isPending}
      />
    </Box>
  );
}
