import { Badge, Group, Table, Text } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { ContentLink } from '../ui/ContentLink';

export type ContextDocumentsTableRow = {
  id: string;
  title: string;
  updatedAt: string;
  documentTags: { tag: { id: string; name: string } }[];
};

export function ContextDocumentsTable({ documents }: { documents: ContextDocumentsTableRow[] }) {
  const navigate = useNavigate();

  if (documents.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No documents yet.
      </Text>
    );
  }

  return (
    <Table highlightOnHover verticalSpacing="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th style={{ width: '60%' }}>Title</Table.Th>
          <Table.Th style={{ width: '25%' }}>Tags</Table.Th>
          <Table.Th style={{ width: '15%' }}>Last updated</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {documents.map((doc) => (
          <Table.Tr
            key={doc.id}
            onClick={() => {
              void navigate(`/documents/${doc.id}`);
            }}
            style={{ cursor: 'pointer' }}
          >
            <Table.Td>
              <ContentLink to={`/documents/${doc.id}`} style={{ fontWeight: 500 }}>
                {doc.title}
              </ContentLink>
            </Table.Td>
            <Table.Td>
              <Group gap="xs">
                {doc.documentTags.map((dt) => (
                  <Badge key={dt.tag.id} size="sm" variant="light" color="gray">
                    {dt.tag.name}
                  </Badge>
                ))}
              </Group>
            </Table.Td>
            <Table.Td>
              <Text size="sm" c="dimmed">
                {new Date(doc.updatedAt).toLocaleDateString()}
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
