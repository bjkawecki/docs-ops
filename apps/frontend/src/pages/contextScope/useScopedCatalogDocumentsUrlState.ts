import { useCallback } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';

export type UseScopedCatalogDocumentsUrlStateOptions = {
  /**
   * `omitFirstPage`: page 1 removes `docsPage` from the URL (CompanyPage).
   * `always`: always set `docsPage` (TeamContextPage, DepartmentContextPage).
   */
  docsPageParamMode?: 'always' | 'omitFirstPage';
};

export type ScopedCatalogDocumentsUrlState = {
  docsSortBy: string;
  docsSortOrder: string;
  docsPage: number;
  docsLimit: number;
  docsOffset: number;
  docsSearch: string;
  docsContextType: string;
  setDocsFilter: (key: string, value: string | null) => void;
  setDocsSort: (col: string) => void;
  setDocsPage: (p: number) => void;
  setDocsLimit: (value: number) => void;
};

/**
 * URL state shared by Team / Department / Company context pages for the catalog documents tab.
 */
export function useScopedCatalogDocumentsUrlState(
  searchParams: URLSearchParams,
  setSearchParams: SetURLSearchParams,
  options?: UseScopedCatalogDocumentsUrlStateOptions
): ScopedCatalogDocumentsUrlState {
  const docsPageParamMode = options?.docsPageParamMode ?? 'always';

  const docsSortBy = searchParams.get('docsSortBy') ?? 'updatedAt';
  const docsSortOrder = searchParams.get('docsSortOrder') ?? 'desc';
  const docsPage = Math.max(1, parseInt(searchParams.get('docsPage') ?? '1', 10));
  const docsLimitParam = searchParams.get('docsLimit');
  const docsLimit = docsLimitParam
    ? Math.min(100, Math.max(1, parseInt(docsLimitParam, 10) || 10))
    : 10;
  const docsOffset = (docsPage - 1) * docsLimit;
  const docsSearch = searchParams.get('docsSearch') ?? '';
  const docsContextType = searchParams.get('docsContextType') ?? '';

  const setDocsFilter = useCallback(
    (key: string, value: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
        next.delete('docsPage');
        return next;
      });
    },
    [setSearchParams]
  );

  const setDocsSort = useCallback(
    (col: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        const sortBy = prev.get('docsSortBy') ?? 'updatedAt';
        const sortOrder = prev.get('docsSortOrder') ?? 'desc';
        const order = sortBy === col && sortOrder === 'desc' ? 'asc' : 'desc';
        next.set('docsSortBy', col);
        next.set('docsSortOrder', order);
        next.delete('docsPage');
        return next;
      });
    },
    [setSearchParams]
  );

  const setDocsPage = useCallback(
    (p: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (docsPageParamMode === 'omitFirstPage') {
          if (p <= 1) next.delete('docsPage');
          else next.set('docsPage', String(p));
        } else {
          next.set('docsPage', String(p));
        }
        return next;
      });
    },
    [setSearchParams, docsPageParamMode]
  );

  const setDocsLimit = useCallback(
    (value: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('docsLimit', String(value));
        next.delete('docsPage');
        return next;
      });
    },
    [setSearchParams]
  );

  return {
    docsSortBy,
    docsSortOrder,
    docsPage,
    docsLimit,
    docsOffset,
    docsSearch,
    docsContextType,
    setDocsFilter,
    setDocsSort,
    setDocsPage,
    setDocsLimit,
  };
}
