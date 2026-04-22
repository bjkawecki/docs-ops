import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Card,
  Container,
  Flex,
  Group,
  Menu,
  NavLink,
  Paper,
  Stack,
  Tabs,
  Text,
  TextInput,
  MultiSelect,
} from '@mantine/core';
import { Link } from 'react-router-dom';
import type { ReactNode, RefObject } from 'react';
import {
  IconArchive,
  IconArchiveOff,
  IconPencil,
  IconTarget,
  IconTrash,
  IconCloudUpload,
  IconHistory,
  IconDotsVertical,
  IconFileText,
  IconDownload,
} from '@tabler/icons-react';
import {
  DocumentBlocksPreview,
  blockDocumentToPlainPreview,
} from '../../components/documents/DocumentBlocksPreview';
import { DocumentLeadDraftPanel } from '../../components/documents/DocumentLeadDraftPanel';
import type { DocumentLeadDraftPanelHandle } from '../../components/documents/DocumentLeadDraftPanel';
import {
  DocumentSuggestionsPanel,
  type DocumentSuggestionsPanelHandle,
} from '../../components/documents/DocumentSuggestionsPanel';
import { DocumentAccessPanel } from '../../components/documents/DocumentAccessPanel';
import { DocumentCommentsSection } from '../../components/documents/DocumentCommentsSection';
import { DocumentDocBreadcrumbs } from '../../components/documents/DocumentDocBreadcrumbs';
import { PageHeader } from '../../components/ui/PageHeader';
import type { DocumentResponse, PdfExportJobStatusResponse } from './documentPageTypes';

export type DocumentPageLoadedLayoutProps = {
  documentId: string;
  data: DocumentResponse;
  mode: 'view' | 'edit';
  editTitle: string;
  setEditTitle: (v: string) => void;
  editDescription: string;
  setEditDescription: (v: string) => void;
  editTagIds: string[];
  setEditTagIds: (v: string[]) => void;
  metadataItems: ReactNode[];
  saveLoading: boolean;
  publishLoading: boolean;
  editTab: 'draft' | 'suggestions' | 'metadata' | 'access';
  setEditTab: (v: 'draft' | 'suggestions' | 'metadata' | 'access') => void;
  leadDraftPanelRef: RefObject<DocumentLeadDraftPanelHandle | null>;
  suggestionsPanelRef: RefObject<DocumentSuggestionsPanelHandle | null>;
  leadDraftLastSynced: string | null;
  hasDraftBlocks: boolean;
  hasPublishedBlocks: boolean;
  me: { user?: { id?: string; isAdmin?: boolean } } | undefined;
  isTabVisible: boolean;
  tagOptions: { value: string; label: string }[];
  headings: { level: number; text: string; id: string }[];
  numberedHeadings: { level: number; text: string; id: string; numbering: string }[];
  setLeadDraftDirty: (dirty: boolean) => void;
  setLeadDraftLastSynced: (iso: string | null) => void;
  pdfExportLoading: boolean;
  pdfExportStatus: PdfExportJobStatusResponse | undefined;
  handleCancelEdit: () => void;
  handleSave: () => Promise<void>;
  handleEditClick: () => void;
  handlePublish: () => Promise<void>;
  handleStartPdfExport: () => Promise<void>;
  handleArchive: () => Promise<void>;
  handleUnarchive: () => Promise<void>;
  openAssignContext: () => void;
  openDelete: () => void;
  openCreateTag: () => void;
  openManageTags: () => void;
};

export function DocumentPageLoadedLayout({
  documentId,
  data,
  mode,
  editTitle,
  setEditTitle,
  editDescription,
  setEditDescription,
  editTagIds,
  setEditTagIds,
  metadataItems,
  saveLoading,
  publishLoading,
  editTab,
  setEditTab,
  leadDraftPanelRef,
  suggestionsPanelRef,
  leadDraftLastSynced,
  hasDraftBlocks,
  hasPublishedBlocks,
  me,
  isTabVisible,
  tagOptions,
  headings,
  numberedHeadings,
  setLeadDraftDirty,
  setLeadDraftLastSynced,
  pdfExportLoading,
  pdfExportStatus,
  handleCancelEdit,
  handleSave,
  handleEditClick,
  handlePublish,
  handleStartPdfExport,
  handleArchive,
  handleUnarchive,
  openAssignContext,
  openDelete,
  openCreateTag,
  openManageTags,
}: DocumentPageLoadedLayoutProps) {
  const docTitle = mode === 'edit' ? editTitle || 'Untitled' : data.title;
  const hasNoContext = data.contextId == null;
  const publishedPlainFromBlocks =
    data.publishedBlocks != null ? blockDocumentToPlainPreview(data.publishedBlocks).trim() : '';

  return (
    <Container fluid maw={1600} px="md" mb="xl">
      <Stack gap="lg" mb="xl" mt="md">
        <DocumentDocBreadcrumbs documentId={documentId} doc={data} historyMode="link" />
        <PageHeader
          title={docTitle}
          titleOrder={1}
          noBottomMargin
          titleIcon={
            data?.publishedAt ? (
              <IconFileText size={32} stroke={1.5} color="var(--mantine-color-dimmed)" />
            ) : (
              <IconPencil size={32} stroke={1.5} color="var(--mantine-color-dimmed)" />
            )
          }
          description={mode === 'view' && data.description ? data.description : undefined}
          metadata={
            metadataItems.length > 0 ? (
              <Group gap="sm" wrap="wrap" align="center">
                {metadataItems}
              </Group>
            ) : undefined
          }
          actions={
            <Group gap="xs">
              {mode === 'edit' && (
                <>
                  <Button variant="default" size="sm" onClick={handleCancelEdit}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    loading={saveLoading}
                    onClick={() =>
                      void (editTab === 'draft'
                        ? leadDraftPanelRef.current?.saveDraft()
                        : handleSave())
                    }
                  >
                    {editTab === 'draft' ? 'Save draft' : 'Save'}
                  </Button>
                  {editTab === 'draft' && leadDraftLastSynced && (
                    <Text size="xs" c="dimmed">
                      Last synced {new Date(leadDraftLastSynced).toLocaleTimeString()}
                    </Text>
                  )}
                </>
              )}
              {data.canWrite && mode === 'view' && (
                <ActionIcon
                  variant="light"
                  size="36"
                  aria-label="Edit document"
                  onClick={handleEditClick}
                >
                  <IconPencil size={18} />
                </ActionIcon>
              )}
              {mode === 'edit' && data.canPublish && !data.publishedAt && (
                <Button
                  variant="light"
                  size="sm"
                  color="green"
                  leftSection={<IconCloudUpload size={14} />}
                  loading={publishLoading}
                  onClick={() => void handlePublish()}
                >
                  Publish
                </Button>
              )}
              <Menu shadow="md" position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="default" size="36" aria-label="More actions">
                    <IconDotsVertical size={18} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {data.canWrite && (
                    <Menu.Item
                      component={Link}
                      to={`/documents/${documentId}/versions`}
                      leftSection={<IconHistory size={14} />}
                    >
                      History
                    </Menu.Item>
                  )}
                  <Menu.Item
                    leftSection={<IconDownload size={14} />}
                    disabled={pdfExportLoading}
                    onClick={() => void handleStartPdfExport()}
                  >
                    {pdfExportLoading ? 'Queuing PDF export...' : 'Export PDF (async)'}
                  </Menu.Item>
                  {pdfExportStatus?.status === 'succeeded' && pdfExportStatus.downloadUrl && (
                    <Menu.Item
                      component="a"
                      href={pdfExportStatus.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      leftSection={<IconDownload size={14} />}
                    >
                      Download exported PDF
                    </Menu.Item>
                  )}
                  {hasNoContext && data.canWrite && (
                    <Menu.Item leftSection={<IconTarget size={14} />} onClick={openAssignContext}>
                      Assign to context
                    </Menu.Item>
                  )}
                  {data.canWrite && !data.archivedAt && (
                    <Menu.Item
                      leftSection={<IconArchive size={14} />}
                      onClick={() => void handleArchive()}
                    >
                      Archive
                    </Menu.Item>
                  )}
                  {data.canWrite && data.archivedAt && (
                    <Menu.Item
                      leftSection={<IconArchiveOff size={14} />}
                      onClick={() => void handleUnarchive()}
                    >
                      Unarchive
                    </Menu.Item>
                  )}
                  {data.canDelete && <Menu.Divider />}
                  {data.canDelete && (
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      onClick={openDelete}
                    >
                      Move to trash
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            </Group>
          }
        />
      </Stack>

      <Paper withBorder={false} p="lg" radius="md">
        <Flex
          direction={{ base: 'column', lg: 'row' }}
          gap={{ base: 'xl', lg: 48 }}
          align="flex-start"
        >
          {mode === 'view' && headings.length > 0 && (
            <Box
              w={{ base: '100%', lg: 280 }}
              style={{
                flexShrink: 0,
                position: 'sticky',
                top: 'var(--mantine-spacing-xl)',
                border: '1px solid var(--mantine-color-default-border)',
                borderRadius: 'var(--mantine-radius-md)',
                padding: 'var(--mantine-spacing-sm)',
              }}
            >
              <Text
                tt="uppercase"
                fz="xs"
                fw={600}
                c="dimmed"
                mb="sm"
                style={{ paddingLeft: 'var(--mantine-spacing-xs)', letterSpacing: 1 }}
              >
                Table of Contents
              </Text>
              <Stack component="nav" gap={2}>
                {numberedHeadings.map((h) => (
                  <NavLink
                    key={h.id}
                    href={`#${h.id}`}
                    label={`${h.numbering} ${h.text}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    style={{
                      paddingLeft: `calc(var(--mantine-spacing-xs) + ${(h.level - 1) * 10}px)`,
                      paddingTop: 'var(--mantine-spacing-xs)',
                      paddingBottom: 'var(--mantine-spacing-xs)',
                      paddingRight: 'var(--mantine-spacing-xs)',
                      fontSize: h.level >= 4 ? 'var(--mantine-font-size-xs)' : undefined,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  />
                ))}
              </Stack>
            </Box>
          )}

          <Box style={{ flex: 1, minWidth: 0, width: '100%' }}>
            <Flex
              gap={{ base: 'lg', lg: 'xl' }}
              direction={{ base: 'column', lg: 'row' }}
              align="flex-start"
              wrap="nowrap"
              w="100%"
              style={{ minHeight: 0 }}
            >
              <Stack gap="lg" style={{ flex: 1, minWidth: 0 }}>
                {mode === 'view' ? (
                  <Card withBorder padding="lg" style={{ maxWidth: '75ch' }}>
                    <Box
                      style={{
                        paddingBottom: 'var(--mantine-spacing-xl)',
                        maxWidth: '100%',
                        marginLeft: 0,
                      }}
                    >
                      {data.publishedBlocks != null && data.publishedBlocks.blocks.length > 0 ? (
                        publishedPlainFromBlocks ? (
                          <DocumentBlocksPreview title="Content" doc={data.publishedBlocks} />
                        ) : (
                          <Text size="sm" c="dimmed">
                            Published blocks do not contain extractable text for this preview.
                          </Text>
                        )
                      ) : (
                        <Text size="sm" c="dimmed">
                          No published block content is available for this view. Open edit mode to
                          work on the draft, or publish once the document has blocks.
                        </Text>
                      )}
                    </Box>
                  </Card>
                ) : (
                  <Card withBorder padding="lg">
                    <Tabs
                      value={editTab}
                      onChange={(v) => setEditTab((v as typeof editTab) ?? 'draft')}
                    >
                      <Tabs.List>
                        <Tabs.Tab value="draft">Draft</Tabs.Tab>
                        <Tabs.Tab value="suggestions">Suggestions</Tabs.Tab>
                        <Tabs.Tab value="metadata">Metadata</Tabs.Tab>
                        {data.canWrite && <Tabs.Tab value="access">Access</Tabs.Tab>}
                      </Tabs.List>
                      <Tabs.Panel value="draft" pt="md">
                        {!hasDraftBlocks && !hasPublishedBlocks && (
                          <Alert
                            color="yellow"
                            variant="light"
                            mb="md"
                            title="Draft content is empty"
                          >
                            <Text size="sm">
                              No block content is currently available for this document. Save the
                              draft once to initialize it.
                            </Text>
                          </Alert>
                        )}
                        <DocumentLeadDraftPanel
                          ref={leadDraftPanelRef}
                          documentId={documentId}
                          refetchWhenVisible={isTabVisible}
                          canPublish={!!data.canPublish}
                          currentUserId={me?.user?.id}
                          isAdmin={me?.user?.isAdmin === true}
                          fallbackBlocks={data.publishedBlocks ?? null}
                          onDirtyChange={setLeadDraftDirty}
                          onLastSyncedChange={setLeadDraftLastSynced}
                        />
                      </Tabs.Panel>
                      <Tabs.Panel value="suggestions" pt="md">
                        <DocumentSuggestionsPanel
                          ref={suggestionsPanelRef}
                          documentId={documentId}
                          currentUserId={me?.user?.id}
                          canPublish={!!data.canPublish}
                          leadDraftBlocks={data.blocks ?? data.publishedBlocks ?? null}
                          refetchWhenVisible={isTabVisible}
                        />
                      </Tabs.Panel>
                      <Tabs.Panel value="metadata" pt="md">
                        <Stack gap="md">
                          <TextInput
                            label="Title"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.currentTarget.value)}
                            maxLength={500}
                          />
                          <TextInput
                            label="Description"
                            placeholder="Short description (optional)"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.currentTarget.value)}
                            maxLength={500}
                          />
                          <Group align="flex-end" gap="xs">
                            <MultiSelect
                              label="Tags"
                              placeholder="Select or add tags"
                              data={tagOptions}
                              value={editTagIds}
                              onChange={setEditTagIds}
                              searchable
                              clearable
                              style={{ flex: 1 }}
                            />
                            <Button variant="light" size="sm" onClick={openCreateTag}>
                              Create tag
                            </Button>
                            <Button variant="subtle" size="sm" onClick={openManageTags}>
                              Manage tags
                            </Button>
                          </Group>
                        </Stack>
                      </Tabs.Panel>
                      {data.canWrite && (
                        <Tabs.Panel value="access" pt="md">
                          <DocumentAccessPanel
                            documentId={documentId}
                            canEditAccess={!!data.canWrite}
                          />
                        </Tabs.Panel>
                      )}
                    </Tabs>
                  </Card>
                )}
              </Stack>

              <Box
                component="aside"
                aria-label="Comments"
                w={{ base: '100%', lg: 'auto' }}
                style={{ flexShrink: 0, alignSelf: 'stretch' }}
              >
                <DocumentCommentsSection
                  documentId={documentId}
                  currentUserId={me?.user?.id}
                  headings={headings.map(({ id, text }) => ({ id, text }))}
                  layout="rail"
                />
              </Box>
            </Flex>
          </Box>
        </Flex>
      </Paper>
    </Container>
  );
}
