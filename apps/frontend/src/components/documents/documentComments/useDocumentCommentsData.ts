import { useEffect, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { apiFetch } from '../../../api/client.js';
import type { CommentsListResponse } from './documentCommentTypes.js';
import { commentsInfiniteQueryKey, PAGE_SIZE } from './documentCommentsConstants.js';

const commentsInvalidateKey = (documentId: string) =>
  ['documents', documentId, 'comments'] as const;

type UseDocumentCommentsDataOptions = {
  documentId: string;
  panelOpen: boolean;
  onCreateSuccess?: () => void;
  onPatchSuccess?: () => void;
};

export function useDocumentCommentsData({
  documentId,
  panelOpen,
  onCreateSuccess,
  onPatchSuccess,
}: UseDocumentCommentsDataOptions) {
  const queryClient = useQueryClient();
  const onCreateSuccessRef = useRef(onCreateSuccess);
  const onPatchSuccessRef = useRef(onPatchSuccess);
  useEffect(() => {
    onCreateSuccessRef.current = onCreateSuccess;
  }, [onCreateSuccess]);
  useEffect(() => {
    onPatchSuccessRef.current = onPatchSuccess;
  }, [onPatchSuccess]);

  const listQuery = useInfiniteQuery({
    queryKey: commentsInfiniteQueryKey(documentId),
    initialPageParam: 0,
    enabled: panelOpen,
    queryFn: async ({ pageParam }): Promise<CommentsListResponse> => {
      const res = await apiFetch(
        `/api/v1/documents/${documentId}/comments?limit=${PAGE_SIZE}&offset=${pageParam}`
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to load comments');
      }
      return res.json() as Promise<CommentsListResponse>;
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.items.length, 0);
      if (loaded >= lastPage.total) return undefined;
      return loaded;
    },
  });

  const items = listQuery.data?.pages.flatMap((p) => p.items) ?? [];
  const total = listQuery.data?.pages[0]?.total ?? 0;
  const hasNextPage = listQuery.hasNextPage;
  const isFetchingNextPage = listQuery.isFetchingNextPage;

  const createMutation = useMutation({
    mutationFn: async (payload: { text: string; parentId?: string; anchorHeadingId?: string }) => {
      const res = await apiFetch(`/api/v1/documents/${documentId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to post comment');
      }
    },
    onSuccess: () => {
      onCreateSuccessRef.current?.();
      void queryClient.invalidateQueries({ queryKey: commentsInvalidateKey(documentId) });
    },
    onError: (e: Error) => {
      notifications.show({ title: 'Comment', message: e.message, color: 'red' });
    },
  });

  const patchMutation = useMutation({
    mutationFn: async (args: {
      commentId: string;
      text: string;
      anchorHeadingId?: string | null;
    }) => {
      const body: { text: string; anchorHeadingId?: string | null } = { text: args.text };
      if (args.anchorHeadingId !== undefined) body.anchorHeadingId = args.anchorHeadingId;
      const res = await apiFetch(`/api/v1/documents/${documentId}/comments/${args.commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to update comment');
      }
    },
    onSuccess: () => {
      onPatchSuccessRef.current?.();
      void queryClient.invalidateQueries({ queryKey: commentsInvalidateKey(documentId) });
    },
    onError: (e: Error) => {
      notifications.show({ title: 'Comment', message: e.message, color: 'red' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await apiFetch(`/api/v1/documents/${documentId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to delete comment');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commentsInvalidateKey(documentId) });
    },
    onError: (e: Error) => {
      notifications.show({ title: 'Comment', message: e.message, color: 'red' });
    },
  });

  return {
    listQuery,
    items,
    total,
    hasNextPage,
    isFetchingNextPage,
    createMutation,
    patchMutation,
    deleteMutation,
  };
}
