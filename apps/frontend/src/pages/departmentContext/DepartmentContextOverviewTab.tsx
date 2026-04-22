import { DraftsCard } from '../../components/trashArchive';
import { ScopedContextOverviewCards } from '../contextScope/ScopedContextOverviewCards';
import type {
  ProcessItem,
  ProjectItem,
  ScopedCatalogDocItem,
} from '../contextScope/contextScopeSharedTypes';

type Props = {
  processes: ProcessItem[];
  projects: ProjectItem[];
  processesPreview: ProcessItem[];
  projectsPreview: ProjectItem[];
  docsTotal: number;
  departmentDocs: ScopedCatalogDocItem[];
  canWrite: boolean;
  departmentId: string | undefined;
  setActiveTab: (tab: string) => void;
};

export function DepartmentContextOverviewTab({
  processes,
  projects,
  processesPreview,
  projectsPreview,
  docsTotal,
  departmentDocs,
  canWrite,
  departmentId,
  setActiveTab,
}: Props) {
  return (
    <ScopedContextOverviewCards
      onGoToTab={setActiveTab}
      processesCount={processes.length}
      projectsCount={projects.length}
      processesPreview={processesPreview}
      projectsPreview={projectsPreview}
      docsTotal={docsTotal}
      noCompanySelected={false}
      documentRows={departmentDocs.slice(0, 5)}
      draftsSlot={
        canWrite ? (
          <DraftsCard
            scopeParams={departmentId ? { departmentId } : {}}
            limit={10}
            enabled={!!departmentId}
            onViewMore={() => setActiveTab('drafts')}
          />
        ) : undefined
      }
    />
  );
}
