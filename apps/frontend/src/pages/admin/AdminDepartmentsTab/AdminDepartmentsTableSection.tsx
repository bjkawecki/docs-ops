import { Alert, Group, Pagination, Table, Text } from '@mantine/core';
import type { DepartmentWithCompany } from './adminDepartmentsTabTypes';

export type AdminDepartmentsTableSectionProps = {
  companiesLength: number;
  allDepartmentsLength: number;
  filteredDepartmentsLength: number;
  limit: number;
  page: number;
  totalPages: number;
  pagedDepartments: DepartmentWithCompany[];
  memberCounts: Record<string, number>;
  onPageChange: (p: number) => void;
  onSelectDepartment: (d: DepartmentWithCompany) => void;
};

export function AdminDepartmentsTableSection({
  companiesLength,
  allDepartmentsLength,
  filteredDepartmentsLength,
  limit,
  page,
  totalPages,
  pagedDepartments,
  memberCounts,
  onPageChange,
  onSelectDepartment,
}: AdminDepartmentsTableSectionProps) {
  return (
    <>
      {companiesLength === 0 ? (
        <Alert color="blue">No company set up. Create a company in the Company tab first.</Alert>
      ) : (
        <>
          <Table withTableBorder withColumnBorders mb="md" className="admin-table-hover">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Department</Table.Th>
                <Table.Th>Company</Table.Th>
                <Table.Th>Leads</Table.Th>
                <Table.Th>Members</Table.Th>
                <Table.Th>Teams</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagedDepartments.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text size="sm" c="dimmed">
                      {allDepartmentsLength === 0
                        ? 'No departments yet. Create a department to get started.'
                        : 'No departments match the filter.'}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                pagedDepartments.map((d) => {
                  const leadNames = d.departmentLeads?.map((l) => l.user.name).join(', ') ?? '';
                  return (
                    <Table.Tr key={d.id}>
                      <Table.Td>
                        <Text
                          component="button"
                          type="button"
                          variant="link"
                          c="var(--mantine-primary-color-4)"
                          className="admin-link-hover"
                          size="sm"
                          style={{
                            cursor: 'pointer',
                            background: 'none',
                            border: 'none',
                            padding: 0,
                          }}
                          onClick={() => onSelectDepartment(d)}
                        >
                          {d.name}
                        </Text>
                      </Table.Td>
                      <Table.Td>{d.companyName}</Table.Td>
                      <Table.Td>{leadNames || '–'}</Table.Td>
                      <Table.Td>
                        {memberCounts[d.id] !== undefined ? String(memberCounts[d.id]) : '–'}
                      </Table.Td>
                      <Table.Td>
                        {d._count?.teams !== undefined ? String(d._count.teams) : '–'}
                      </Table.Td>
                    </Table.Tr>
                  );
                })
              )}
            </Table.Tbody>
          </Table>
        </>
      )}
      {filteredDepartmentsLength > limit && (
        <Group justify="flex-end" mt="md">
          <Pagination total={totalPages} value={page} onChange={onPageChange} size="sm" />
        </Group>
      )}
    </>
  );
}
