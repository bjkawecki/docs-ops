export type DocumentCommentItem = {
  id: string;
  documentId: string;
  authorId: string;
  authorName: string;
  text: string;
  parentId: string | null;
  anchorHeadingId?: string | null;
  /** Nur Root: gesetzt = weicher Löschvorgang, Antworten bleiben sichtbar. */
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  canDelete: boolean;
  replies?: DocumentCommentItem[];
};

export type CommentsListResponse = {
  items: DocumentCommentItem[];
  total: number;
  limit: number;
  offset: number;
};
