import { Stack } from '@mantine/core';
import { DraftsCard } from '../../components/trashArchive';
import { ScopePeopleSummaryCard } from '../../components/scopePeople';
import { ScopedContextOverviewCards } from '../contextScope/ScopedContextOverviewCards';
import type {
  ProcessItem,
  ProjectItem,
  ScopedCatalogDocItem,
} from '../contextScope/contextScopeSharedTypes';

type Props = {
  effectiveCompanyId: string | null | undefined;
  processes: ProcessItem[];
  projects: ProjectItem[];
  processesPreview: ProcessItem[];
  projectsPreview: ProjectItem[];
  docsTotal: number;
  docsPending: boolean;
  docsPreview: ScopedCatalogDocItem[];
  setActiveTab: (tab: string) => void;
  showOrganization?: boolean;
  onOpenPeopleMenu?: () => void;
};

export function CompanyPageOverviewTab({
  effectiveCompanyId,
  processes,
  projects,
  processesPreview,
  projectsPreview,
  docsTotal,
  docsPending,
  docsPreview,
  setActiveTab,
  showOrganization = false,
  onOpenPeopleMenu,
}: Props) {
  return (
    <Stack gap="md">
      {showOrganization && effectiveCompanyId != null && onOpenPeopleMenu != null && (
        <ScopePeopleSummaryCard
          scope="company"
          scopeId={effectiveCompanyId}
          onViewAll={onOpenPeopleMenu}
        />
      )}
      <ScopedContextOverviewCards
        onGoToTab={setActiveTab}
        processesCount={processes.length}
        projectsCount={projects.length}
        processesPreview={processesPreview}
        projectsPreview={projectsPreview}
        docsTotal={docsTotal}
        noCompanySelected={effectiveCompanyId == null}
        docsPending={docsPending}
        documentRows={docsPreview}
        draftsSlot={
          effectiveCompanyId != null ? (
            <DraftsCard
              scopeParams={{ companyId: effectiveCompanyId }}
              limit={10}
              onViewMore={() => setActiveTab('drafts')}
            />
          ) : undefined
        }
      />
    </Stack>
  );
}
