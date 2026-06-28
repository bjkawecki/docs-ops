import { describe, expect, it } from 'vitest';
import { buildCatalogDocumentListBase } from '../services/query/catalogDocumentListWhere.js';

describe('buildCatalogDocumentListBase', () => {
  const readableScope = {
    contextIds: ['ctx-1'],
    documentIdsFromGrants: [] as string[],
  };
  const writableScope = {
    contextIds: ['ctx-1'],
    documentIdsFromGrants: [] as string[],
    documentIdsFromCreator: [] as string[],
  };

  it('returns null when user has no readable scope', () => {
    expect(
      buildCatalogDocumentListBase(
        { contextIds: [], documentIdsFromGrants: [] },
        { contextIds: [], documentIdsFromGrants: [], documentIdsFromCreator: [] },
        'user-1',
        {}
      )
    ).toBeNull();
  });

  it('scoped team filter keeps draft visibility for writable contexts', () => {
    const result = buildCatalogDocumentListBase(readableScope, writableScope, 'user-1', {
      teamId: 'team-1',
    });
    expect(result).not.toBeNull();
    const andClauses = result!.baseWhere.AND;
    expect(Array.isArray(andClauses)).toBe(true);
    const draftClause = (andClauses as object[]).find(
      (c) =>
        typeof c === 'object' &&
        c != null &&
        'OR' in c &&
        Array.isArray((c as { OR: unknown[] }).OR) &&
        (c as { OR: unknown[] }).OR.some(
          (o) =>
            typeof o === 'object' &&
            o != null &&
            'contextId' in o &&
            (o as { contextId: { in: string[] } }).contextId.in.includes('ctx-1')
        )
    );
    expect(draftClause).toBeDefined();
    const scopeClause = (andClauses as object[]).find(
      (c) =>
        typeof c === 'object' &&
        c != null &&
        'OR' in c &&
        Array.isArray((c as { OR: unknown[] }).OR) &&
        (c as { OR: unknown[] }).OR.some(
          (o) => typeof o === 'object' && o != null && 'context' in o
        )
    );
    expect(scopeClause).toBeDefined();
  });
});
