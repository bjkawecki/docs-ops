import type { MeResponse } from '../api/me-types';

/**
 * Unified rule for showing write tabs (Drafts, Trash, Archive):
 * show when user is Admin or Scope-Lead (Company/Department/Team; rights flow down).
 * Use with page-specific canManage (which includes company lead for dept/team).
 */
export function canShowWriteTabs(me: MeResponse | undefined, canManage: boolean): boolean {
  return me?.user?.isAdmin === true || canManage;
}
