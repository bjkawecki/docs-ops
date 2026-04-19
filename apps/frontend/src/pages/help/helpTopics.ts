/** Stable paths and labels for the in-page help sidebar (concrete link text). */
export const HELP_TOPICS = [
  { to: '/help/overview', label: 'What is DocsOps?' },
  { to: '/help/organisation', label: 'Organisation & scopes' },
  { to: '/help/permissions', label: 'Read & write access' },
  { to: '/help/workflow', label: 'Document lifecycle' },
  { to: '/help/collaboration', label: 'Reviews & merging' },
] as const;
