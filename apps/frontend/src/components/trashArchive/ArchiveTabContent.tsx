import { TrashArchiveTabCore } from './TrashArchiveTabCore';
import type { TrashArchiveTabBaseProps } from './trashArchiveTypes';

export type ArchiveTabContentProps = TrashArchiveTabBaseProps;

export function ArchiveTabContent(props: ArchiveTabContentProps) {
  return <TrashArchiveTabCore variant="archive" {...props} />;
}
