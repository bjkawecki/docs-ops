import { Outlet } from 'react-router-dom';

/** Parent route for `/projects/:projectId/*` so index and `subcontexts/:id` share the same param segment. */
export function ProjectWorkspaceOutlet() {
  return <Outlet />;
}
