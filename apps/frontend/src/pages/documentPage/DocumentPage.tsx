import '../DocumentContent.css';
import { DocumentPageErrorView } from './DocumentPageErrorView';
import { DocumentPageLoadedLayout } from './DocumentPageLoadedLayout';
import { DocumentPageModals } from './DocumentPageModals';
import { DocumentPagePendingView } from './DocumentPagePendingView';
import { buildDocumentMetadataItems } from './buildDocumentMetadataItems';
import { useDocumentPage } from './useDocumentPage';

export function DocumentPage() {
  const vm = useDocumentPage();

  if (vm.isPending) {
    return <DocumentPagePendingView />;
  }

  if (vm.isError || !vm.data || !vm.documentId) {
    return <DocumentPageErrorView />;
  }

  const data = vm.data;
  const metadataItems = buildDocumentMetadataItems({
    data,
    mode: vm.mode,
    hasUnsavedChanges: vm.hasUnsavedChanges,
  });

  return (
    <>
      <DocumentPageLoadedLayout
        documentId={vm.documentId}
        data={data}
        mode={vm.mode}
        editTitle={vm.editTitle}
        setEditTitle={vm.setEditTitle}
        editDescription={vm.editDescription}
        setEditDescription={vm.setEditDescription}
        editTagIds={vm.editTagIds}
        setEditTagIds={vm.setEditTagIds}
        metadataItems={metadataItems}
        saveLoading={vm.saveLoading}
        publishLoading={vm.publishLoading}
        editTab={vm.editTab}
        setEditTab={vm.setEditTab}
        leadDraftPanelRef={vm.leadDraftPanelRef}
        suggestionsPanelRef={vm.suggestionsPanelRef}
        leadDraftLastSynced={vm.leadDraftLastSynced}
        hasDraftBlocks={vm.hasDraftBlocks}
        hasPublishedBlocks={vm.hasPublishedBlocks}
        me={vm.me}
        isTabVisible={vm.isTabVisible}
        tagOptions={vm.tagOptions}
        headings={vm.headings}
        numberedHeadings={vm.numberedHeadings}
        setLeadDraftDirty={vm.setLeadDraftDirty}
        setLeadDraftLastSynced={vm.setLeadDraftLastSynced}
        pdfExportLoading={vm.pdfExportLoading}
        pdfExportStatus={vm.pdfExportStatus}
        handleCancelEdit={vm.handleCancelEdit}
        handleSave={vm.handleSave}
        handleEditClick={vm.handleEditClick}
        handlePublish={vm.handlePublish}
        handleStartPdfExport={vm.handleStartPdfExport}
        handleArchive={vm.handleArchive}
        handleUnarchive={vm.handleUnarchive}
        openAssignContext={vm.openAssignContext}
        openDelete={vm.openDelete}
        openCreateTag={vm.openCreateTag}
        openManageTags={vm.openManageTags}
      />
      <DocumentPageModals
        deleteOpened={vm.deleteOpened}
        closeDelete={vm.closeDelete}
        deleteLoading={vm.deleteLoading}
        onDeleteConfirm={() => {
          void vm.handleDeleteConfirm();
        }}
        assignContextOpened={vm.assignContextOpened}
        onCloseAssignContext={vm.onCloseAssignContext}
        assignContextOptions={vm.assignContextOptions}
        assignContextId={vm.assignContextId}
        setAssignContextId={vm.setAssignContextId}
        assignContextLoading={vm.assignContextLoading}
        onAssignContext={() => {
          void vm.handleAssignContext();
        }}
        createTagOpened={vm.createTagOpened}
        closeCreateTag={vm.closeCreateTag}
        newTagName={vm.newTagName}
        setNewTagName={vm.setNewTagName}
        createTagLoading={vm.createTagLoading}
        onCreateTag={() => {
          void vm.handleCreateTag();
        }}
        manageTagsOpened={vm.manageTagsOpened}
        closeManageTags={vm.closeManageTags}
        tags={vm.tags}
        onDeleteTag={(id) => {
          void vm.handleDeleteTag(id);
        }}
      />
    </>
  );
}
