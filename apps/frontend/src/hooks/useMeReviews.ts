import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { useLiveEventsContext } from './liveEventsContext';

const REVIEWS_POLL_MS = 15_000;

export type ReviewSuggestionItem = {
  suggestionId: string;
  documentId: string;
  documentTitle: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'superseded';
  authorId: string;
  authorName: string | null;
  createdAt: string;
  scopeType: 'team' | 'department' | 'company' | 'personal';
  scopeId: string | null;
  scopeName: string;
  baseDraftRevision: number;
  affectedBlockSummary: string | null;
};

export type MeReviewsResponse = {
  pendingForReview: ReviewSuggestionItem[];
  mySuggestions: ReviewSuggestionItem[];
  totalPendingForReview: number;
  totalMySuggestions: number;
  limit: number;
  offset: number;
};

export type MeReviewsQueryParams = {
  limit?: number;
  offset?: number;
  status?: ReviewSuggestionItem['status'];
};

export function meReviewsQueryKey(params?: MeReviewsQueryParams): unknown[] {
  const key: unknown[] = ['me', 'reviews'];
  if (params?.limit != null) key.push('limit', params.limit);
  if (params?.offset != null) key.push('offset', params.offset);
  if (params?.status != null) key.push('status', params.status);
  return key;
}

export async function fetchMeReviews(params?: MeReviewsQueryParams): Promise<MeReviewsResponse> {
  const search = new URLSearchParams();
  if (params?.limit != null) search.set('limit', String(params.limit));
  if (params?.offset != null) search.set('offset', String(params.offset));
  if (params?.status != null) search.set('status', params.status);
  const qs = search.toString();
  const url = qs ? `/api/v1/me/reviews?${qs}` : '/api/v1/me/reviews';
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load reviews');
  return (await res.json()) as MeReviewsResponse;
}

export function useMeReviews(
  params?: MeReviewsQueryParams,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  const limit = params?.limit ?? 20;
  const offset = params?.offset ?? 0;
  const status = params?.status ?? 'pending';
  const { fallbackPollingActive } = useLiveEventsContext();
  const pollInterval =
    options?.refetchInterval !== undefined
      ? options.refetchInterval
      : fallbackPollingActive
        ? REVIEWS_POLL_MS
        : false;
  return useQuery({
    queryKey: meReviewsQueryKey({ limit, offset, status }),
    queryFn: () => fetchMeReviews({ limit, offset, status }),
    enabled: options?.enabled !== false,
    refetchInterval: pollInterval,
  });
}
