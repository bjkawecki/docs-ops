import { DraftsCard } from '../../components/DraftsCard';
import { ScopedContextOverviewCards } from '../contextScope/ScopedContextOverviewCards';
import type { ProcessItem, ProjectItem, TeamDocItem } from './teamContextPageTypes';

export type TeamOverviewPanelProps = {
  processesPreview: ProcessItem[];
  projectsPreview: ProjectItem[];
  processesCount: number;
  projectsCount: number;
  docsTotal: number;
  teamDocs: TeamDocItem[];
  canWrite: boolean;
  teamId: string;
  onGoToTab: (tab: string) => void;
};

export function TeamOverviewPanel({
  processesPreview,
  projectsPreview,
  processesCount,
  projectsCount,
  docsTotal,
  teamDocs,
  canWrite,
  teamId,
  onGoToTab,
}: TeamOverviewPanelProps) {
  return (
    <ScopedContextOverviewCards
      onGoToTab={onGoToTab}
      processesCount={processesCount}
      projectsCount={projectsCount}
      processesPreview={processesPreview}
      projectsPreview={projectsPreview}
      docsTotal={docsTotal}
      noCompanySelected={false}
      documentRows={teamDocs.slice(0, 5)}
      draftsSlot={
        canWrite ? (
          <DraftsCard
            scopeParams={{ teamId }}
            limit={10}
            enabled={!!teamId}
            onViewMore={() => onGoToTab('drafts')}
          />
        ) : undefined
      }
    />
  );
}
