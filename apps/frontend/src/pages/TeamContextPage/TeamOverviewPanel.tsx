import { Stack } from '@mantine/core';
import { DraftsCard } from '../../components/trashArchive';
import { ScopePeopleSummaryCard } from '../../components/scopePeople';
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
  onOpenPeopleMenu: () => void;
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
  onOpenPeopleMenu,
}: TeamOverviewPanelProps) {
  return (
    <Stack gap="md">
      <ScopePeopleSummaryCard scope="team" scopeId={teamId} onViewAll={onOpenPeopleMenu} />
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
    </Stack>
  );
}
