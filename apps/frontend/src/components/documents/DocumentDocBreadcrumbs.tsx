import { Anchor, Breadcrumbs, Group, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import {
  IconBriefcase,
  IconBuildingSkyscraper,
  IconChevronRight,
  IconRoute,
  IconSitemap,
  IconSubtask,
  IconUser,
  IconUsersGroup,
} from '@tabler/icons-react';
import type { RecentScope } from '../../hooks/useRecentItems';
import { scopeToLabel, scopeToUrl } from '../../lib/scopeNav';

/** Felder aus dem Document-GET, die für Scope-/Kontext-Breadcrumbs nötig sind. */
export type DocumentForDocBreadcrumbs = {
  /** API-`scope` (wird intern als RecentScope interpretiert). */
  scope: unknown;
  contextId: string | null;
  contextProcessId?: string | null;
  contextName?: string;
  contextProjectId?: string | null;
  contextProjectName?: string | null;
  subcontextId?: string | null;
  subcontextName?: string | null;
};

export type DocumentDocBreadcrumbsHistoryMode = 'link' | 'current';

export type DocumentDocBreadcrumbsProps = {
  documentId: string;
  doc: DocumentForDocBreadcrumbs;
  historyMode: DocumentDocBreadcrumbsHistoryMode;
};

function buildContextMeta(doc: DocumentForDocBreadcrumbs) {
  if (doc.contextProcessId != null) {
    return {
      name: doc.contextName ?? 'Process',
      to: `/processes/${doc.contextProcessId}`,
      icon: IconRoute,
    };
  }
  if (doc.subcontextId != null) {
    return {
      name: doc.subcontextName ?? doc.contextName ?? 'Subcontext',
      to:
        doc.contextProjectId != null
          ? `/projects/${doc.contextProjectId}/subcontexts/${doc.subcontextId}`
          : `/subcontexts/${doc.subcontextId}`,
      icon: IconSubtask,
    };
  }
  if (doc.contextProjectId != null) {
    return {
      name: doc.contextProjectName ?? doc.contextName ?? 'Project',
      to: `/projects/${doc.contextProjectId}`,
      icon: IconBriefcase,
    };
  }
  return null;
}

/**
 * Breadcrumb-Zeile wie auf der Dokumentenseite: Scope → Kontext → History.
 * `historyMode="link"`: History verlinkt auf `/documents/:id/versions`.
 * `historyMode="current"`: History als aktuelle Seite (Text).
 */
export function DocumentDocBreadcrumbs({
  documentId,
  doc,
  historyMode,
}: DocumentDocBreadcrumbsProps) {
  const scope = (doc.scope ?? null) as RecentScope | null;
  const hasNoContext = doc.contextId == null;
  const contextMeta = buildContextMeta(doc);
  const scopeWithName = doc.scope as RecentScope & { name?: string | null };
  const scopeName = scopeWithName?.name ?? (scope ? scopeToLabel(scope) : 'Overview');
  const ScopeIcon =
    scope?.type === 'company'
      ? IconBuildingSkyscraper
      : scope?.type === 'department'
        ? IconSitemap
        : scope?.type === 'team'
          ? IconUsersGroup
          : IconUser;

  return (
    <Breadcrumbs separator={<IconChevronRight size={14} color="var(--mantine-color-dimmed)" />}>
      {scope && (
        <Anchor component={Link} to={scopeToUrl(scope)} c="dimmed" size="sm">
          <Group gap={4} align="center" wrap="nowrap">
            <ScopeIcon size={14} />
            <span>{scopeName}</span>
          </Group>
        </Anchor>
      )}
      {contextMeta && (
        <Anchor component={Link} to={contextMeta.to} c="dimmed" size="sm">
          <Group gap={4} align="center" wrap="nowrap">
            <contextMeta.icon size={14} />
            <span>{contextMeta.name}</span>
          </Group>
        </Anchor>
      )}
      {hasNoContext && (
        <Text size="sm" c="dimmed">
          No context
        </Text>
      )}
      {documentId &&
        (historyMode === 'link' ? (
          <Anchor component={Link} to={`/documents/${documentId}/versions`} c="dimmed" size="sm">
            History
          </Anchor>
        ) : (
          <Text size="sm" c="dimmed">
            History
          </Text>
        ))}
    </Breadcrumbs>
  );
}
