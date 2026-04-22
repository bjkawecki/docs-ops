import { TrashArchiveTabCore } from './TrashArchiveTabCore';
import type { TrashArchiveItem, TrashArchiveTabBaseProps } from './trashArchiveTypes';

export type { TrashArchiveItem };
export type TrashTabContentProps = TrashArchiveTabBaseProps;

export function TrashTabContent(props: TrashTabContentProps) {
  return <TrashArchiveTabCore variant="trash" {...props} />;
}
