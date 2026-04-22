import { TrashArchiveTabCore } from './trashArchive/TrashArchiveTabCore';
import type { TrashArchiveItem, TrashArchiveTabBaseProps } from './trashArchive/trashArchiveTypes';

export type { TrashArchiveItem };
export type TrashTabContentProps = TrashArchiveTabBaseProps;

export function TrashTabContent(props: TrashTabContentProps) {
  return <TrashArchiveTabCore variant="trash" {...props} />;
}
