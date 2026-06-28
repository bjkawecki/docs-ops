import { Stack } from '@mantine/core';
import { DraftsCard } from '../../components/trashArchive';
import { ScopedContextOverviewCards } from '../contextScope/ScopedContextOverviewCards';
import type { ProcessItem, ProjectItem, TeamDocItem } from './teamContextPageTypes';

export type TeamOverviewPanelProps = {
  processesPreview: ProcessItem[];
  projectsPreview: ProjectItem[];
  processesCount: number;
  projectsCount: number;
  docsTotal: number;
  teamDocs: TeamDocItem[];
  canShowDrafts: boolean;
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
  canShowDrafts,
  teamId,
  onGoToTab,
}: TeamOverviewPanelProps) {
  return (
    <Stack gap="lg">
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
          canShowDrafts ? (
            <DraftsCard
              scopeParams={{ teamId }}
              limit={10}
              enabled={!!teamId}
              onViewMore={() => onGoToTab('drafts')}
            />
          ) : undefined
        }
      />
    </Stack>
  );
}
