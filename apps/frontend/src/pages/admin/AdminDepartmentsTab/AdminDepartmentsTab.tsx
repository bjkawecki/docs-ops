import { Box, Loader, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Department } from 'backend/api-types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../api/client';
import { AdminDepartmentDeleteModal } from './AdminDepartmentDeleteModal';
import { AdminDepartmentEditModal } from './AdminDepartmentEditModal';
import { AdminDepartmentsTableSection } from './AdminDepartmentsTableSection';
import { AdminDepartmentsToolbar } from './AdminDepartmentsToolbar';
import {
  DEFAULT_PAGE_SIZE,
  DEPARTMENTS_PAGE_SIZE_KEY,
  PAGE_SIZE_OPTIONS,
} from './adminDepartmentsTabConstants';
import type {
  AdminUsersRes,
  AssignmentListRes,
  CompaniesRes,
  DepartmentWithCompany,
  DepartmentStatsRes,
  MemberCountsRes,
} from './adminDepartmentsTabTypes';
import { CreateDepartmentForm } from './CreateDepartmentForm';

export function AdminDepartmentsTab() {
  const queryClient = useQueryClient();
  const [filterText, setFilterText] = useState('');
  const [filterCompanyId, setFilterCompanyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(() => {
    try {
      const raw = window.localStorage.getItem(DEPARTMENTS_PAGE_SIZE_KEY);
      if (!raw) return DEFAULT_PAGE_SIZE;
      const parsed = Number(raw);
      return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])
        ? parsed
        : DEFAULT_PAGE_SIZE;
    } catch {
      return DEFAULT_PAGE_SIZE;
    }
  });
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [editingDepartment, setEditingDepartment] = useState<DepartmentWithCompany | null>(null);
  const [departmentCardEditing, setDepartmentCardEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLeadIds, setEditLeadIds] = useState<string[]>([]);
  const [deleteConfirmDepartment, setDeleteConfirmDepartment] =
    useState<DepartmentWithCompany | null>(null);

  const { data: companiesData, isPending: companiesPending } = useQuery({
    queryKey: ['companies'],
    queryFn: async (): Promise<CompaniesRes> => {
      const res = await apiFetch('/api/v1/companies?limit=100');
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as CompaniesRes;
    },
  });

  const companies = useMemo(() => companiesData?.items ?? [], [companiesData?.items]);
  const allDepartments = useMemo(
    (): DepartmentWithCompany[] =>
      companies.flatMap((c) => (c.departments ?? []).map((d) => ({ ...d, companyName: c.name }))),
    [companies]
  );

  const filteredDepartments = useMemo(() => {
    let list = allDepartments;
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      list = list.filter(
        (d) => d.name.toLowerCase().includes(q) || d.companyName.toLowerCase().includes(q)
      );
    }
    if (filterCompanyId) {
      list = list.filter((d) => d.companyId === filterCompanyId);
    }
    return list;
  }, [allDepartments, filterText, filterCompanyId]);
  const totalPages = Math.max(1, Math.ceil(filteredDepartments.length / limit));
  const pagedDepartments = useMemo(() => {
    const start = (page - 1) * limit;
    return filteredDepartments.slice(start, start + limit);
  }, [filteredDepartments, page, limit]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const departmentIdsForCounts = useMemo(() => allDepartments.map((d) => d.id), [allDepartments]);
  const { data: memberCountsData } = useQuery({
    queryKey: [
      'admin',
      'departments',
      'member-counts',
      [...departmentIdsForCounts].sort().join(','),
    ],
    queryFn: async (): Promise<MemberCountsRes> => {
      const ids = departmentIdsForCounts.length > 0 ? departmentIdsForCounts.join(',') : '';
      const url =
        ids.length > 0
          ? `/api/v1/admin/departments/member-counts?ids=${encodeURIComponent(ids)}`
          : '/api/v1/admin/departments/member-counts';
      const res = await apiFetch(url);
      if (!res.ok) throw new Error('Failed to load member counts');
      return (await res.json()) as MemberCountsRes;
    },
    enabled: departmentIdsForCounts.length > 0,
  });
  const memberCounts = memberCountsData ?? {};

  const { data: leadsForEditData, isPending: leadsForEditPending } = useQuery({
    queryKey: ['departments', editingDepartment?.id, 'department-leads'],
    queryFn: async (): Promise<AssignmentListRes> => {
      const res = await apiFetch(
        `/api/v1/departments/${editingDepartment!.id}/department-leads?limit=100`
      );
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as AssignmentListRes;
    },
    enabled: !!editingDepartment?.id,
  });
  const leadsForEdit = useMemo(() => leadsForEditData?.items ?? [], [leadsForEditData?.items]);

  const { data: adminUsersData } = useQuery({
    queryKey: ['admin', 'users', 'list'],
    queryFn: async (): Promise<AdminUsersRes> => {
      const res = await apiFetch('/api/v1/admin/users?limit=200&includeDeactivated=false');
      if (!res.ok) throw new Error('Failed to load');
      return (await res.json()) as AdminUsersRes;
    },
    enabled: !!editingDepartment?.id,
  });
  const userOptions = useMemo(
    () => (adminUsersData?.items ?? []).map((u) => ({ value: u.id, label: u.name })),
    [adminUsersData?.items]
  );

  const { data: departmentStatsData, isPending: departmentStatsPending } = useQuery({
    queryKey: ['admin', 'departments', editingDepartment?.id, 'stats'],
    queryFn: async (): Promise<DepartmentStatsRes> => {
      const res = await apiFetch(`/api/v1/admin/departments/${editingDepartment!.id}/stats`);
      if (!res.ok) throw new Error('Failed to load stats');
      return (await res.json()) as DepartmentStatsRes;
    },
    enabled: !!editingDepartment?.id,
  });

  const invalidateCompanies = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['companies'] });
  }, [queryClient]);

  const invalidateLeads = useCallback(
    (departmentId: string) => {
      void queryClient.invalidateQueries({
        queryKey: ['departments', departmentId, 'department-leads'],
      });
    },
    [queryClient]
  );

  const createDepartment = useMutation({
    mutationFn: async ({ name, companyId: cid }: { name: string; companyId: string }) => {
      const res = await apiFetch(`/api/v1/companies/${cid}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      return (await res.json()) as Department;
    },
    onSuccess: () => {
      invalidateCompanies();
      closeCreate();
      notifications.show({
        title: 'Department created',
        message: 'The department has been created.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const updateDepartment = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiFetch(`/api/v1/departments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      return (await res.json()) as Department;
    },
    onSuccess: () => {
      invalidateCompanies();
      setEditingDepartment(null);
      notifications.show({
        title: 'Department updated',
        message: 'The department has been updated.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const deleteDepartment = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/v1/departments/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: () => {
      invalidateCompanies();
      setDeleteConfirmDepartment(null);
      notifications.show({
        title: 'Department deleted',
        message: 'The department has been deleted.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const addLead = useMutation({
    mutationFn: async ({ departmentId, userId }: { departmentId: string; userId: string }) => {
      const res = await apiFetch(`/api/v1/departments/${departmentId}/department-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: (_, { departmentId }) => {
      invalidateLeads(departmentId);
      notifications.show({
        title: 'Department lead added',
        message: 'The department lead has been added.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const removeLead = useMutation({
    mutationFn: async ({ departmentId, userId }: { departmentId: string; userId: string }) => {
      const res = await apiFetch(`/api/v1/departments/${departmentId}/department-leads/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
    },
    onSuccess: (_, { departmentId }) => {
      invalidateLeads(departmentId);
      notifications.show({
        title: 'Department lead removed',
        message: 'The department lead has been removed.',
        color: 'green',
      });
    },
    onError: (e: Error) => notifications.show({ title: 'Error', message: e.message, color: 'red' }),
  });

  const companyOptions = useMemo(
    () => [
      { value: '', label: 'All companies' },
      ...companies.map((c) => ({ value: c.id, label: c.name })),
    ],
    [companies]
  );

  const handleSaveDepartmentCard = useCallback(() => {
    const dept = editingDepartment;
    if (!dept) return;
    const name = editName.trim();
    if (!name) return;
    void (async () => {
      try {
        if (name !== dept.name) {
          await updateDepartment.mutateAsync({
            id: dept.id,
            name,
          });
        }
        const currentIds = leadsForEdit.map((u) => u.id);
        const toAdd = editLeadIds.filter((id) => !currentIds.includes(id));
        const toRemove = currentIds.filter((id) => !editLeadIds.includes(id));
        await Promise.all([
          ...toAdd.map((userId) =>
            addLead.mutateAsync({
              departmentId: dept.id,
              userId,
            })
          ),
          ...toRemove.map((userId) =>
            removeLead.mutateAsync({
              departmentId: dept.id,
              userId,
            })
          ),
        ]);
        setEditingDepartment((prev) => (prev && prev.id === dept.id ? { ...prev, name } : prev));
        invalidateLeads(dept.id);
        setDepartmentCardEditing(false);
      } catch {
        // notifications from mutations
      }
    })();
  }, [
    editingDepartment,
    editName,
    editLeadIds,
    leadsForEdit,
    updateDepartment,
    addLead,
    removeLead,
    invalidateLeads,
  ]);

  const handleStartEditCard = useCallback(() => {
    if (!editingDepartment) return;
    setEditName(editingDepartment.name);
    setEditLeadIds(leadsForEdit.map((u) => u.id));
    setDepartmentCardEditing(true);
  }, [editingDepartment, leadsForEdit]);

  if (companiesPending) {
    return (
      <Box>
        <Loader size="sm" />
      </Box>
    );
  }

  return (
    <Box>
      <AdminDepartmentsToolbar
        filterText={filterText}
        onFilterTextChange={(value) => {
          setFilterText(value);
          setPage(1);
        }}
        filterCompanyId={filterCompanyId}
        onFilterCompanyIdChange={(value) => {
          setFilterCompanyId(value);
          setPage(1);
        }}
        companyOptions={companyOptions}
        filteredDepartmentsCount={filteredDepartments.length}
        limit={limit}
        onLimitChange={(next) => {
          setLimit(next);
          setPage(1);
        }}
        onOpenCreate={openCreate}
        createDisabled={companies.length === 0}
      />

      <AdminDepartmentsTableSection
        companiesLength={companies.length}
        allDepartmentsLength={allDepartments.length}
        filteredDepartmentsLength={filteredDepartments.length}
        limit={limit}
        page={page}
        totalPages={totalPages}
        pagedDepartments={pagedDepartments}
        memberCounts={memberCounts}
        onPageChange={setPage}
        onSelectDepartment={setEditingDepartment}
      />

      <Modal opened={createOpened} onClose={closeCreate} title="Create department" size="sm">
        <CreateDepartmentForm
          companies={companies}
          onSubmit={(name, companyId) => createDepartment.mutate({ name, companyId })}
          onCancel={closeCreate}
          loading={createDepartment.isPending}
        />
      </Modal>

      {editingDepartment && (
        <AdminDepartmentEditModal
          department={editingDepartment}
          onClose={() => setEditingDepartment(null)}
          departmentCardEditing={departmentCardEditing}
          setDepartmentCardEditing={setDepartmentCardEditing}
          editName={editName}
          setEditName={setEditName}
          editLeadIds={editLeadIds}
          setEditLeadIds={setEditLeadIds}
          userOptions={userOptions}
          leadsForEdit={leadsForEdit}
          leadsForEditPending={leadsForEditPending}
          departmentStatsData={departmentStatsData}
          departmentStatsPending={departmentStatsPending}
          onStartEditCard={handleStartEditCard}
          onSaveCard={handleSaveDepartmentCard}
          saveLoading={updateDepartment.isPending || addLead.isPending || removeLead.isPending}
          onRequestDelete={() => setDeleteConfirmDepartment(editingDepartment)}
          deleteFromManageLoading={deleteDepartment.isPending}
        />
      )}

      <AdminDepartmentDeleteModal
        opened={!!deleteConfirmDepartment}
        department={deleteConfirmDepartment}
        onClose={() => setDeleteConfirmDepartment(null)}
        onConfirmDelete={() => {
          if (deleteConfirmDepartment) deleteDepartment.mutate(deleteConfirmDepartment.id);
        }}
        deleteLoading={deleteDepartment.isPending}
      />
    </Box>
  );
}
