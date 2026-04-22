import { TrashArchiveTabCore } from './trashArchive/TrashArchiveTabCore';
import type { TrashArchiveTabBaseProps } from './trashArchive/trashArchiveTypes';

export type ArchiveTabContentProps = TrashArchiveTabBaseProps;

export function ArchiveTabContent(props: ArchiveTabContentProps) {
  return <TrashArchiveTabCore variant="archive" {...props} />;
}
